/* ============================================================================
 * chan-noise.js — 噪声系统（重做版）：冻结的完美行情 → 逐根K线污染
 *
 * 原则
 *   · 完美行情（本级别 + 次级别）由分支流程构造并冻结；本模块只读它，永远不改它。
 *   · 污染 = 对次级别每一根K线的确定性变换，本级别再由污染后的次级别聚合。
 *     K线根数、时间、下标与完美行情严格 1:1。
 *   · 因果：第 k 根污染结果只依赖完美行情的第 0..k 根 → 追加新K线不会改动已有K线
 *     （分支预览、回放、无未来函数都依赖这一点）。
 *   · 同一批随机数只乘强度：随机数 = hash(seed, k, slot)，与 ε 无关。
 *     ε 从 0 增大时，同一根K线连续变形；结构质变发生在可定位的 ε 上。
 *   · 一条主轴 ε（0 = 完美，1 ≈ 接近真实，待用真实数据校准）
 *     + 四个算子权重 w（可单独拉）：
 *       wick  影线外延：高低点向外延伸（制造假分型、破坏包含）
 *       body  收盘游走：均值回归的整根偏移 + 开盘贴近前收（影响实体与相邻关系）
 *       incl  制造包含：把一根本级别K线压进前一根的范围（强度连续）
 *       spike 毛刺跳跃：偶发长针，向下更常见更猛
 *
 * 对外：active / apply / aggregate / measure / fmt / sweep
 * ============================================================================ */
var ChanNoise = (function () {
'use strict';
const E = (typeof ChanEngine !== 'undefined') ? ChanEngine : require('./chan-engine.js');

const NAMES = ['wick', 'body', 'incl', 'spike'];
const PHI = 0.9;                       // 收盘游走的均值回归系数（相关长度 ≈ 10 根次级别）
const r6 = v => Math.round(v * 1e6) / 1e6;

/* ───────────────────────── 无状态随机：hash(seed, k, slot) ───────────────────────── */
function h32(a, b, c) {
  let x = (a | 0) ^ Math.imul((b | 0) + 0x632BE5AB, 0x9E3779B1) ^ Math.imul((c | 0) + 0x1B873593, 0x85EBCA6B);
  x = Math.imul(x ^ (x >>> 16), 0x7FEB352D);
  x = Math.imul(x ^ (x >>> 15), 0x846CA68B);
  x ^= x >>> 16;
  x = Math.imul(x, 0x2C1B3C6D);
  x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
}
const unif = (s, k, t) => Math.min(1 - 1e-9, Math.max(1e-9, h32(s, k, t)));
const gauss = (s, k, t) => Math.sqrt(-2 * Math.log(unif(s, k, t))) * Math.cos(2 * Math.PI * unif(s, k, t + 997));
const expo = (s, k, t) => -Math.log(1 - unif(s, k, t));

const wOf = (np, k) => (np.w && np.w[k] != null ? +np.w[k] : 1);
const active = np => !!np && np.eps > 0 && NAMES.some(k => wOf(np, k) > 0);

/* ───────────────────────── 污染 ───────────────────────── */
/**
 * clean：完美次级别K线数组；F：每根本级别K线含多少根次级别K线；np：{eps, seed, w:{...}}
 * 返回 { sub, main }：污染后的次级别与由它聚合的本级别（根数与 clean 一致）。
 */
function apply(clean, F, np) {
  F = Math.max(1, F | 0);
  const n = clean.length, sub = new Array(n), seed = np.seed | 0, e = +np.eps || 0;
  const aW = e * wOf(np, 'wick'), aB = e * wOf(np, 'body'), aI = e * wOf(np, 'incl'), aS = e * wOf(np, 'spike');
  const sd0 = Math.sqrt(1 - PHI * PHI);
  let sc = 0, off = 0, prevC = null;

  for (let g0 = 0; g0 < n; g0 += F) {
    const g1 = Math.min(n, g0 + F);

    /* 逐根算子：只读完美行情的第 k 根及之前（尺度 sc 取完美K线振幅的指数均值） */
    for (let k = g0; k < g1; k++) {
      const c = clean[k], rng = c.high - c.low;
      sc = k === 0 ? rng : sc + 0.05 * (rng - sc);
      const s = Math.max(sc, Math.abs(c.close) * 1e-6);
      off = PHI * off + 1.5 * s * aB * sd0 * gauss(seed, k, 1);          // 收盘游走：整根平移
      let o = c.open + off, cl = c.close + off, h = c.high + off, l = c.low + off;
      if (prevC !== null) o += Math.min(1, aB) * (prevC - o);            // 开盘贴近前收
      h = Math.max(h, o, cl) + 0.8 * s * aW * expo(seed, k, 2);          // 影线外延
      l = Math.min(l, o, cl) - 0.8 * s * aW * expo(seed, k, 3);
      if (aS > 0 && unif(seed, k, 4) < Math.min(0.5, 0.03 * aS)) {       // 毛刺：下跌针更常见
        const m = (2 + 3 * unif(seed, k, 5)) * s * Math.min(1.5, aS);
        if (unif(seed, k, 6) < 0.6) l -= m; else h += m;
      }
      sub[k] = { time: c.time, open: r6(o), high: r6(h), low: r6(l), close: r6(cl) };
      prevC = cl;
    }

    /* 整根本级别K线算子：制造包含（只依赖前一根污染后的本级别K线） */
    const j = g0 / F;
    if (aI > 0 && j >= 1 && g1 - g0 === F && unif(seed, j, 10) < Math.min(0.9, 0.4 * aI)) {
      let Lp = Infinity, Hp = -Infinity, gl = Infinity, gh = -Infinity;
      for (let k = g0 - F; k < g0; k++) { if (sub[k].low < Lp) Lp = sub[k].low; if (sub[k].high > Hp) Hp = sub[k].high; }
      for (let k = g0; k < g1; k++) { if (sub[k].low < gl) gl = sub[k].low; if (sub[k].high > gh) gh = sub[k].high; }
      const d = Hp - Lp, gd = gh - gl;
      if (d > 0 && gd > 0) {
        const tl = Lp + 0.1 * d, th = Hp - 0.1 * d;
        const r = Math.min(1, (th - tl) / gd), half = r * gd / 2, cg = (gl + gh) / 2;
        const cn = Math.min(th - half, Math.max(tl + half, cg));
        const t = Math.min(1, aI * (0.35 + 0.65 * unif(seed, j, 11)));   // 强度连续：t<1 为部分压缩
        const mp = v => v + t * ((cn + r * (v - cg)) - v);
        for (let k = g0; k < g1; k++) {
          const b = sub[k];
          sub[k] = { time: b.time, open: r6(mp(b.open)), high: r6(mp(b.high)), low: r6(mp(b.low)), close: r6(mp(b.close)) };
        }
      }
    }
    prevC = sub[g1 - 1].close;
  }
  return { sub, main: aggregate(sub, F) };
}

function aggregate(sub, F) {
  const main = [];
  for (let j = 0; j + F <= sub.length; j += F) {
    let hi = -Infinity, lo = Infinity;
    for (let k = j; k < j + F; k++) { hi = Math.max(hi, sub[k].high); lo = Math.min(lo, sub[k].low); }
    main.push({ time: sub[j].time, open: sub[j].open, high: hi, low: lo, close: sub[j + F - 1].close });
  }
  return main;
}

/* ───────────────────────── 形态统计（校准 ε 用：同一套指标可量真实行情） ───────────────────────── */
function measure(c) {
  const n = c ? c.length : 0;
  if (n < 20) return null;
  let body = 0;
  for (const b of c) { const r = b.high - b.low; if (r > 0) body += Math.abs(b.close - b.open) / r; }
  const merged = E.mergeInclusion(c), fr = E.detectFractals(merged, c), st = E.buildStrokes(fr);
  const rets = [];
  for (let i = 1; i < n; i++) rets.push(Math.log(c[i].close / c[i - 1].close));
  const mu = rets.reduce((a, x) => a + x, 0) / rets.length;
  let v2 = 0, v4 = 0;
  for (const x of rets) { const d = x - mu; v2 += d * d; v4 += d * d * d * d; }
  v2 /= rets.length; v4 /= rets.length;
  return {
    n, body: body / n, incl: 1 - merged.length / n, frac: fr.length / n,
    strokePer100: st.length / n * 100,
    strokeLen: st.length ? st.reduce((a, s) => a + Math.abs(s.endBarIndex - s.startBarIndex), 0) / st.length : 0,
    kurt: v2 > 0 ? v4 / (v2 * v2) - 3 : 0,
  };
}
const fmt = m => m ? `实体占比 ${m.body.toFixed(2)} · 包含率 ${(m.incl * 100).toFixed(1)}% · 分型密度 ${m.frac.toFixed(3)} · 每百根笔数 ${m.strokePer100.toFixed(1)} · 平均笔长 ${m.strokeLen.toFixed(1)} 根 · 超额峰度 ${m.kurt.toFixed(1)}` : '数据不足';

/* ───────────────────────── 临界点扫描 ─────────────────────────
 * 在冻结的完美行情上，把 ε 从 0 扫到 cfg.max，逐档只做「终局窗口」的单次分析（不逐帧回放，便宜），
 * 找出每个结构质变第一次出现的 ε。所有对比都以 ε=0 的完美行情为基线。
 * 返回 { grid, events, base, max, steps }；events = [{ eps, type, text }]，按 ε 升序。 */
const LABEL = { strokes: '笔数', pivots: '中枢数', merged: '包含合并K线数', fractals: '分型数', signals: '信号数', ghosts: 'ghost 数' };
const HINT = {
  strokes: d => d < 0 ? '（有笔被合并 / 吞并）' : '（有笔被劈成多笔）',
  pivots: d => d < 0 ? '（中枢合并或消失）' : '（出现新中枢 / 中枢被分裂）',
  merged: d => d > 0 ? '（包含关系增多）' : '（包含关系减少）',
};
function iou(a1, a2, b1, b2) {
  const lo = Math.max(a1, b1), hi = Math.min(a2, b2);
  if (hi <= lo) return 0;
  const u = Math.max(a2, b2) - Math.min(a1, b1);
  return u > 0 ? (hi - lo) / u : 0;
}
function sweep(clean, np, o, cfg) {
  cfg = cfg || {};
  const F = clean.spec.factor || 1, max = cfg.max || 1.5, steps = cfg.steps || 30;
  const nMain = clean.main.length, W = Math.max(120, (o && o.analysisBars) || 700), off = Math.max(0, nMain - W);
  const run = eps => {
    const pol = eps > 0 && clean.sub && clean.sub.length ? apply(clean.sub, F, { ...np, eps }) : { main: clean.main, sub: clean.sub };
    const end = (nMain - 1) * F + 1;                                   // 与 replay 末帧一致：次级别只到末根本级别K线的首根
    const subWin = pol.sub && pol.sub.length > 60 ? pol.sub.slice(Math.max(0, end - 300), end) : null;
    return E.analyze(pol.main.slice(off), o, subWin);
  };
  const sum = r => ({
    strokes: r.strokes.length, pivots: r.pivots.length, fractals: r.fractals.length,
    merged: r.merged.filter(m => m.endIndex > m.startIndex).length, signals: r.points.length, ghosts: r.ghosts.length,
  });
  const r0 = run(0), base = sum(r0), grid = [Object.assign({ eps: 0 }, base)], ev = [];
  const seenM = {}, seenS = new Set(), seenSt = new Set(), seenP = new Set();
  for (let k = 1; k <= steps; k++) {
    const eps = +(max * k / steps).toFixed(4), res = run(eps), m = sum(res);
    grid.push(Object.assign({ eps }, m));
    for (const key of Object.keys(LABEL)) {
      if (m[key] === base[key] || seenM[key]) continue;
      seenM[key] = 1;
      ev.push({ eps, type: 'count', text: `${LABEL[key]} ${base[key]} → ${m[key]}${HINT[key] ? HINT[key](m[key] - base[key]) : ''}` });
    }
    r0.points.forEach((bp, bi) => {
      if (seenS.has(bi)) return;
      const ref = bp.referenceBarIndex;
      if (res.points.some(p => p.kind === bp.kind && Math.abs(p.referenceBarIndex - ref) <= 6)) return;
      seenS.add(bi);
      const gh = res.ghosts.some(p => p.kind === bp.kind && Math.abs(p.referenceBarIndex - ref) <= 6);
      ev.push({ eps, type: 'signal', text: `${bp.kind} @#${ref + off} ${gh ? '退化为 ghost（被过滤）' : '消失'}` });
    });
    r0.strokes.forEach((bs, bi) => {
      if (seenSt.has(bi)) return;
      if (res.strokes.some(s => s.isUp === bs.isUp && Math.abs(s.endBarIndex - bs.endBarIndex) <= 3 && Math.abs(s.startBarIndex - bs.startBarIndex) <= 3)) return;
      seenSt.add(bi);
      ev.push({ eps, type: 'stroke', text: `基线笔 ${bs.isUp ? '↑' : '↓'} #${bs.startBarIndex + off}→#${bs.endBarIndex + off} 首次失配（端点位移 &gt; 3 根，或被合并 / 劈开）` });
    });
    r0.pivots.forEach((bp, bi) => {
      if (seenP.has(bi)) return;
      const best = res.pivots.reduce((a, p) => Math.max(a, iou(bp.zd, bp.zg, p.zd, p.zg)), 0);
      if (best >= 0.5) return;
      seenP.add(bi);
      ev.push({ eps, type: 'pivot', text: `基线中枢 [${bp.zd.toFixed(2)}, ${bp.zg.toFixed(2)}] 首次失配（合并 / 分裂 / 消失）` });
    });
  }
  ev.sort((a, b) => a.eps - b.eps);
  return { grid, events: ev.slice(0, 80), base, max, steps };
}

const api = { NAMES, active, apply, aggregate, measure, fmt, sweep };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
return api;
})();
