/* ============================================================================
 * chan-generator.js — 理想行情生成器（"圆规"）
 *
 * 分工：生成器只造价格；结构由 ChanEngine 逐根回放判定；界面只负责展示。
 *   · 场景 = 一条"骨架"：本级别的折线腿 [目标价位, 根数]（价位单位 = 波动幅度 amp%）。
 *   · 每条腿被展开成"次级别K线"：顺势 S 根、逆势 R 根的规则锯齿（次级别结构），
 *     因此本级别的每一笔都由次级别走势构成，次级别确认才有意义。
 *   · 每 factor 根次级别聚合为 1 根本级别K线（本级别 time = 其首根次级别 time）。
 *   · 污染（噪声）分四层，全部走同一种子随机流，同参数同种子结果完全一致：
 *       A 路径噪声：均匀 / 高斯 / OU 均值回归游走（有相关长度），强度 = noise × 0.05（amp 单位）；
 *         ——加在价格水平上，偏差被骨架拉回，不会累积（教学用，非真实口径）；
 *       B 形态噪声：影线长短、实体比例随机，偶发跳空（shapeNoise，0 = K线形状规则）；
 *       C 结构污染：随机毛刺 / 意外包含 / 端点抖动（pollute），可能制造假分型、笔修正、
 *         被过滤信号，甚至打断场景目标结构——此时校验循环照常换 variant 重试，失败如实标 ok=false；
 *       D 真实噪声：加在收益上的 GARCH(1,1) 波动状态 + 高斯/跳跃混合创新 + AR(1) 持久偏离
 *         （realNoise，>0 时替代 A 层）。偏差跨腿累积（今天的偏差是明天的起点），
 *         靶形对齐真实 BTCUSDT 1h（stylized-facts.js 验收）：肥尾/波动聚集/VR≈0.95；
 *         同时对次级别锯齿叠加逐腿桥噪声（腿端点钉死、内部随机化），打破固定 S/R 模式，
 *         让"次级别确认"不再近乎必然成立。
 *     三项全为 0 → 完全确定的完美骨架；任意一项 > 0 时种子才起作用。
 *   · 生成后用引擎回放校验目标结构；未成立则按 variant 逐个换骨架参数重试，
 *     仍不成立就如实展示第一个案例并标记 ok=false（绝不强行绘制结构）。
 *
 * 对外：SCENARIOS / generate(spec, opts) / analyzeCase(cs, opts)
 * case = { spec, main, sub, run:{snaps,signals,ghosts}, report }
 * ============================================================================ */
var ChanGen = (function () {
'use strict';
const E = (typeof ChanEngine !== 'undefined') ? ChanEngine : require('./chan-engine.js');

/* ───────────────────────── 随机数 / 腿展开 ───────────────────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const RHO = 0.35;   // 腿内逆势回撤占顺势进程的比例

/**
 * 一条腿的 N 根次级别累计位移（相对起点，最后一根恰为 delta）。
 * 块结构：顺势(S+余数) → [逆势 R → 顺势 S] × nc —— 始终以顺势开头和结尾，
 * 保证本腿的端点就是本腿的极值（不会在转折处多走一截）。
 */
function legSteps(delta, N, S, R) {
  const dir = delta < 0 ? -1 : 1, D = Math.abs(delta);
  const nc = Math.max(0, Math.floor((N - S) / (S + R)));
  const out = new Array(N);
  if (nc === 0) { for (let k = 0; k < N; k++) out[k] = delta * (k + 1) / N; return out; }
  const e = N - (nc * (S + R) + S);
  const sumW = (nc + 1) * S + e;
  const a = D / ((1 - RHO) * sumW);
  const b = RHO * sumW * a / (nc * R);
  let pos = 0, k = 0;
  const push = st => { pos += dir * st; out[k++] = pos; };
  for (let i = 0; i < S + e; i++) push(a);
  for (let c = 0; c < nc; c++) { for (let i = 0; i < R; i++) push(-b); for (let i = 0; i < S; i++) push(a); }
  out[N - 1] = delta;
  return out;
}

/* ───────────────────────── 污染（噪声） ───────────────────────── */
// Box-Muller 高斯；避免 log(0)
function gauss(rnd) {
  let u = 0; while (u === 0) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/* A. 路径噪声：抖每根次级别K线的中心价（水平域，被骨架拉回，偏差不累积——教学口径） */
function applyPathNoise(centers, spec, rnd) {
  const s = spec.noise * 0.05;
  if (spec.noiseType === 'ou') {          // OU 均值回归：x ← φ·x + ε，稳态方差 = s²，相关长度 ≈ 1/(1−φ) 根
    const phi = 0.85, se = s * Math.sqrt(1 - phi * phi);
    let x = 0;
    for (let k = 0; k < centers.length; k++) { x = phi * x + gauss(rnd) * se; centers[k] += x; }
  } else if (spec.noiseType === 'gauss') {
    for (let k = 0; k < centers.length; k++) centers[k] += gauss(rnd) * s;
  } else {                                // uniform：独立均匀白噪声
    for (let k = 0; k < centers.length; k++) centers[k] += (rnd() * 2 - 1) * s;
  }
}

/* D. 真实噪声（收益域）：对数随机波动（log-AR(1)，衰减慢 → |r| 自相关高且长尾）
      + 高斯/跳跃混合创新 + AR(1) 持久偏离。
      与 A 层的本质区别：偏差加在收益上、跨腿累积（今天的偏差是明天的起点）；
      靶形对齐真实 BTCUSDT 1h：acfAbs(1/60)≈0.30/0.175、峰度≈55、|r|>3σ≈1.8%、VR≈0.95。 */
function applyRealNoise(centers, spec, rnd) {
  const s0 = spec.realNoise * 0.16;    // 每根次级别收益基准 σ（amp 单位）
  const phi = 0.997;                    // 偏差 AR(1) 持续性（半衰期 ≈231 根次级别）
  const PSI = 0.992, SETA = 0.10;       // log-AR(1) 波动状态：ln v ← ψ·ln v + η（衰减形态对齐真实 acfAbs）
  const PJ = 0.04, JLO = 2, JHI = 5, JSKEW = 1.4; // 跳跃概率/倍数区间；负向（崩跌）加成 JSKEW → 偏度为负；参数由网格搜索对齐真实靶（stylized-facts.js）
  let dev = 0, lv = 0;
  for (let k = 0; k < centers.length; k++) {
    let eps = gauss(rnd);
    if (rnd() < PJ) eps *= (JLO + rnd() * (JHI - JLO)) * (eps < 0 ? JSKEW : 1);
    lv = PSI * lv + SETA * gauss(rnd);
    dev = phi * dev + s0 * Math.exp(lv) * eps;
    centers[k] += dev;
  }
}
/* 把第 g 根本级别K线（F 根次级别）压缩进前一根的范围内（意外包含 / 场景 inside 共用） */
function squeezeBar(centers, g, F, dir) {
  const pv = (g - 1) * F;
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < F; k++) { lo = Math.min(lo, centers[pv + k]); hi = Math.max(hi, centers[pv + k]); }
  const H = hi + HX, L = lo - HX, mid = (H + L) / 2, span = Math.max(0, H - L - 2 * HX);
  const dl = dir * span * 0.25 / F;
  for (let k = 0; k < F; k++) centers[g * F + k] = mid + dl * (k - (F - 1) / 2);
}

/* C. 结构污染：期望事件数 = pollute × 次级别根数 / 20 */
function applyPollution(centers, spec, rnd) {
  const F = spec.factor, nMain = Math.floor(centers.length / F), p = spec.pollute;
  const ev = Math.round(p * centers.length / 20);
  for (let e = 0; e < ev; e++) {
    const t = rnd();
    if (t < 0.4) {                        // 毛刺：单根次级别极值针，聚合后在本级别留下长影线 → 假分型候选
      const k = Math.floor(rnd() * centers.length);
      centers[k] += (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 1.2) * p * 0.5;
    } else if (t < 0.7) {                 // 意外包含：随机一根本级别K线被前一根包含
      if (nMain < 3) continue;
      const g = 1 + Math.floor(rnd() * (nMain - 2));
      squeezeBar(centers, g, F, centers[g * F] >= centers[g * F - 1] ? 1 : -1);
    } else {                              // 端点抖动：边界分型扰动（幅度小，专打临界位置）
      const k = Math.floor(rnd() * centers.length);
      centers[k] += (rnd() * 2 - 1) * 0.35 * p;
    }
  }
}

/* ───────────────────────── 骨架 → K线 ───────────────────────── */
const HX = 0.06;   // 次级别K线半幅（单位：amp）

function compile(legs, spec, t) {
  const F = spec.factor, U = spec.p0 * spec.amp / 100;
  const S = Math.max(4, F), R = Math.max(3, Math.round(S * 0.6));
  const rnd = mulberry32((spec.seed | 0) * 7919 + t * 104729 + 12345);
  const centers = [];
  let cur = 0;

  for (const leg of legs) {
    const n = leg.fixed ? leg.n : Math.max(6, Math.round(leg.n * spec.lenScale)), N = n * F;
    const offs = legSteps(leg.x - cur, N, S, R);
    const base = centers.length;
    for (let k = 0; k < N; k++) centers.push(cur + offs[k]);

    // 包含关系演示：把指定的本级别K线压缩进前一根的范围内
    for (const j0 of leg.inside || []) {
      const j = Math.min(j0, n - 2);
      if (j < 1) continue;
      squeezeBar(centers, base / F + j, F, leg.x - cur < 0 ? -1 : 1);
    }
    cur = leg.x;
  }

  // 四层污染：先弯路径（D 收益域 / A 水平域，二者互斥），再插结构事件；消耗随机流的顺序固定以保证确定性
  if (spec.realNoise > 0) applyRealNoise(centers, spec, rnd);
  else if (spec.noise > 0) applyPathNoise(centers, spec, rnd);
  if (spec.pollute > 0) applyPollution(centers, spec, rnd);

  const px = v => Math.round((spec.p0 + U * v) * 1e6) / 1e6;
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const hx = U * HX, sh = spec.shapeNoise > 0 ? spec.shapeNoise : 0;
  const sub = [];
  let prev = 0;
  for (let k = 0; k < centers.length; k++) {
    const m = centers[k], dir = m >= prev ? 1 : -1, c = px(m) - 0;
    // 真实噪声模式：K线随实际位移缩放（he 单位与 hx 同为价格，故乘 U），
    // open 锚定前一根收盘（币安 24/7 连续交易，开收盘间无跳空），
    // 影线/实体比例对齐真实（真实影线占比≈0.57）；realNoise=0 时走旧版分支，逐位一致
    const he = (spec.realNoise > 0 && k > 0) ? Math.max(hx, Math.abs(m - prev) * 0.45 * U) : hx;
    let open, close, wu, wl;
    if (spec.realNoise > 0) {
      open = k > 0 ? sub[k - 1].close : c - 0.45 * he;
      close = c;
      wu = 1.4 * he; wl = 1.4 * he;
    } else {
      open = c - dir * 0.6 * he; close = c + dir * 0.6 * he; wu = 0.4 * he; wl = 0.4 * he;
    }
    if (sh) {
      // B. 形态噪声：影线长短不一、实体比例随机、偶发跳空（sh=0 时与规则形状完全一致）；
      // 真实噪声模式下 open 已锚定前收盘，只抖影线、不叠加跳空
      wu *= Math.max(0.15, 1 + sh * (rnd() * 2 - 1));
      wl *= Math.max(0.15, 1 + sh * (rnd() * 2 - 1));
      if (spec.realNoise <= 0) {
        const bd = Math.min(1, Math.max(0.05, 0.6 + sh * 0.5 * (rnd() * 2 - 1)));
        open = c - dir * bd * he; close = c + dir * bd * he;
        if (rnd() < Math.min(0.08 * sh, 0.5)) open += (rnd() * 2 - 1) * he * sh;   // 跳空
      }
    }
    sub.push({
      time: spec.t0 + k * spec.baseSec,
      open: r6(open),
      high: r6(Math.max(open, close) + wu),
      low: r6(Math.min(open, close) - wl),
      close: r6(close),
    });
    prev = m;
  }

  const main = [];
  for (let j = 0; j + F <= sub.length; j += F) {
    let hi = -Infinity, lo = Infinity;
    for (let k = j; k < j + F; k++) { hi = Math.max(hi, sub[k].high); lo = Math.min(lo, sub[k].low); }
    main.push({ time: sub[j].time, open: sub[j].open, high: hi, low: lo, close: sub[j + F - 1].close });
  }
  return { main, sub };
}

/* ───────────────────────── 分支单位（单根K线 / 最小分型 / 最小笔） ─────────────────────────
 * 路径驱动的最小构造单位：每步只造恰好一个缠论单位。
 *   bar = 单根K线；fx = 最小分型；bi = 最小笔；legacy = 旧存档的 7 根理想腿。
 * 事件驱动的最短前缀：先试「分叉根本身就是极值」的短脚本，不成立再退回完整脚本；
 * 全部腿 fixed，走势长度已折算成根数，避免被 compile 的 lenScale 二次拉伸。 */
const UNIT_LABEL = { bar: '单根K线', fx: '最小分型', bi: '最小笔', legacy: '旧版一笔' };
const UNIT_TXT = {
  bar: { up: '阳线', down: '阴线' },
  fx: { up: '顶分型', down: '底分型' },
  bi: { up: '向上笔', down: '向下笔' },
  legacy: { up: '向上', down: '向下' },
};
const UNIT_OPT = {
  bar: { up: '下一根 · 阳线', down: '下一根 · 阴线' },
  fx: { up: '下一分型 · 顶', down: '下一分型 · 底' },
  bi: { up: '下一笔 · 向上', down: '下一笔 · 向下' },
};
const unitStretch = ls => Math.max(1, Math.min(3, Math.round(ls > 0 ? ls : 1)));
const fixedLeg = x => ({ x, n: 1, fixed: true });
function runLevels(start, total, n, sign) {
  const cnt = Math.max(1, Math.round(n)), out = [];
  for (let j = 1; j <= cnt; j++) out.push(start + sign * total * j / cnt);
  return out;
}
function levelsOf(runs) {
  let x = 0; const lv = [];
  for (const r of runs) { const a = runLevels(x, r.total, r.n, r.sign); lv.push(...a); x = a[a.length - 1]; }
  return [fixedLeg(0)].concat(lv.map(fixedLeg));
}
/* 候选脚本 = 从短到长的确定性价格脚本；buildUnit 逐个编译并做结构检查，命中即停。 */
function unitCandidates(unit, dir, F, lenScale) {
  const s = dir === 'down' ? -1 : 1;
  if (unit === 'legacy') return [{ legs: [[s * 2.2, 7]] }];
  const S = Math.max(0.9, 0.14 * F), k = unitStretch(lenScale);
  const dB = Math.max(1, Math.round(1.2 * k));
  if (unit === 'bar') return [{ legs: levelsOf([{ total: S, n: 1, sign: s }]) }];
  if (unit === 'fx') return [
    { legs: levelsOf([{ total: 1.2 * S, n: 1, sign: -s }]) },   // 分叉根就是极值：一根反向K线即可确认
    { legs: levelsOf([{ total: 2 * S, n: 2 * k, sign: s }, { total: 1.2 * S, n: dB, sign: -s }]) },
  ];
  return [
    { legs: levelsOf([{ total: 3 * S, n: 3 * k, sign: s }, { total: 1.2 * S, n: dB, sign: -s }]) },   // 分叉根已是起点分型
    { legs: levelsOf([{ total: 3 * S, n: 3 * k, sign: -s }, { total: 1.2 * S, n: dB, sign: s },
      { total: 2 * S, n: 2 * k, sign: s }, { total: 1.2 * S, n: dB, sign: -s }]) },
  ];
}
/* 追加：复制父前缀到分叉点 → 同一份 v 骨架编译追加腿。legs 支持旧数组 [x,n] 与 fixed 对象。 */
function appendBars(chain, legsV, F, bar) {
  const spec = chain.spec, close = chain.main[bar].close, sc = spec.p0 / close;
  const contSpec = { ...spec, p0: close, t0: spec.t0 + bar * F * spec.baseSec };
  const cont = compile(legsV.map(l => Array.isArray(l)
    ? { x: l[0] * sc, n: l[1] }
    : { x: l.x * sc, n: l.n, fixed: !!l.fixed, inside: l.inside }), contSpec, 0);
  const main = chain.main.slice(0, bar + 1).concat(cont.main.slice(1));
  const sub = chain.sub.slice(0, (bar + 1) * F).concat(cont.sub.slice(F));
  return { spec, main, sub };
}
function appendChain(chain, legsV, F, bar, o) {
  const cs = appendBars(chain, legsV, F, bar);
  cs.run = E.replay(cs.main, cs.sub, o);
  return cs;
}
/* 只看尾部窗口的最后一帧：单位检查只需要最新结构，避免预览时整链回放。 */
function tailRes(main, o) {
  const W = Math.max(120, (o && o.analysisBars) || 700), off = Math.max(0, main.length - W);
  return { res: E.analyze(main.slice(off), o), off };
}
function unitHit(unit, dir, tail, fromBar) {
  if (!tail) return true;
  const { res, off } = tail;
  if (unit === 'fx') {
    const f = res.fractals[res.fractals.length - 1];
    return !!f && f.isTop === (dir === 'up') && f.confirmBarIndex + off > fromBar;
  }
  if (unit === 'bi') {
    const st = res.strokes[res.strokes.length - 1];
    return !!st && st.isUp === (dir === 'up') && st.endBarIndex + off > fromBar;
  }
  return true;
}
/* 纯构造：不推进任何序列号、不建基线；预览与落实共用。 */
function buildUnit(parent, bar, unit, dir, o) {
  if (!parent || !parent.main || !parent.main[bar] || (dir !== 'up' && dir !== 'down')) return null;
  const u = UNIT_TXT[unit] ? unit : 'bar';
  const cands = unitCandidates(u, dir, parent.spec.factor, parent.spec.lenScale);
  let out = null;
  for (const c of cands) {
    const cs = appendBars(parent, c.legs, parent.spec.factor, bar);
    const tail = u === 'legacy' ? null : tailRes(cs.main, o);
    out = { unit: u, dir, legs: c.legs, cs, bars: cs.main.length - 1 - bar, tail, formed: unitHit(u, dir, tail, bar) };
    if (out.formed) break;
  }
  return out;
}

/* ───────────────────────── 场景 ───────────────────────── */
const L = (x, n, inside) => (inside === 'fixed' ? { x, n, fixed: true } : inside ? { x, n, inside } : { x, n });
const lg = arr => arr.map(a => L(a[0], a[1], a[2]));
// 前导上行腿：满足暖机(30根) 与 MACD 起算(≈34根)，不随"走势长度"缩放
const PRE = [10, 34, 'fixed'];

const last = run => run.snaps[run.snaps.length - 1].res;
const hasSig = k => run => run.signals.some(s => s.kind === k);

// 1 买骨架：中枢[4.5,9]（D1 U1 D2），U2 在区间内，D3 短而浅地创新低并离开（面积小于 D2 → 背驰），
// U3 弱反弹不回中枢，D4 不破 D3 低点。注意：MACD 面积随离开笔的时长增长，所以离开笔必须短。
const divLegs = v => [PRE, [2, 12], [9, 8], [4.5, 6], [6, 8], [3.5, 4 + (v % 4)], [4.3, 5]];
const buyLegs = (v, tail) => lg([
  ...divLegs(v), [3.9, 5], [9, 10], ...(tail || []),
]);

const SCENARIO_LIST = [
  /* 基础 */
  { id: 'fractal_stroke', name: '分型 → 笔', group: '基础结构',
    desc: '逐步放大的折线：观察顶/底分型、分型确认延迟，以及笔如何由"未稳定"变为"稳定"。',
    legs: () => lg([[6, 34, 'fixed'], [2, 10], [7, 10], [1, 12], [9, 12], [3, 10], [11, 10]]),
    check: run => last(run).strokes.length >= 5 && last(run).strokes.some(s => s.isConfirmed) },
  { id: 'inclusion', name: 'K线包含处理', group: '基础结构',
    desc: '在折线中故意插入"被前一根完全包含"的K线，观察合并K线（紫色框）与方向取高高/低低。',
    legs: () => lg([[6, 34, 'fixed'], [2, 10, [3, 6]], [7, 10, [4]], [3, 10, [5]], [8, 8, [3]]]),
    check: run => last(run).merged.filter(m => m.endIndex > m.startIndex).length >= 2 },

  /* 中枢 */
  { id: 'pivot_form', name: '中枢形成', group: '中枢',
    desc: '连续三笔（下-上-下）出现重叠区间即构成中枢 [ZD, ZG]。',
    legs: () => lg([PRE, [3, 12], [8, 8], [5, 6], [7, 6]]),
    check: run => last(run).pivots.length >= 1 },
  { id: 'pivot_extend', name: '中枢延伸', group: '中枢',
    desc: '后续笔的终点仍落在 [ZD, ZG] 内，中枢笔数递增（延伸）。',
    legs: () => lg([PRE, [3, 12], [8, 8], [5, 6], [7, 6], [5.5, 6], [7.5, 6], [5.8, 6], [7, 6]]),
    check: run => last(run).pivots.some(p => p.strokeCount >= 6) },
  { id: 'pivot_leave_up', name: '中枢向上离开', group: '中枢',
    desc: '某笔终点越过 ZG，且下一笔没有回到区间内 → 中枢被离开笔确认结束。',
    legs: () => lg([PRE, [3, 12], [8, 8], [5, 6], [7, 6], [5.5, 6], [11, 8], [9, 6], [12, 6]]),
    check: run => last(run).pivots.some(p => p.isConfirmed && last(run).strokes[p.leavingStrokeIndex].isUp) },
  { id: 'pivot_leave_down', name: '中枢向下离开', group: '中枢',
    desc: '上一场景的镜像：终点跌破 ZD，下一笔未回到区间内。',
    mirror: true,
    legs: () => lg([PRE, [3, 12], [8, 8], [5, 6], [7, 6], [5.5, 6], [11, 8], [9, 6], [12, 6]]),
    check: run => last(run).pivots.some(p => p.isConfirmed && !last(run).strokes[p.leavingStrokeIndex].isUp) },
  { id: 'pivot_return', name: '离开后返回', group: '中枢',
    desc: '笔终点先离开区间、随后又回到区间内。注意：源码把它归为"延伸"，并没有单独的"返回"状态。',
    legs: () => lg([PRE, [3, 12], [8, 8], [5, 6], [7, 6], [5.5, 6], [11, 8], [7, 7], [5.5, 6], [7, 6]]),
    check: run => {
      const r = last(run);
      return r.pivots.some(p => {
        for (let k = p.startStrokeIndex; k <= p.endStrokeIndex; k++) {
          const e = r.strokes[k].endPrice;
          if (e > p.zg || e < p.zd) return true;
        }
        return false;
      });
    } },

  /* 走势（仅验证中枢序列） */
  { id: 'up_trend', name: '上涨：中枢上移', group: '走势（仅中枢序列）',
    desc: '两个依次上移、互不重叠的中枢。走势类型（趋势/盘整）判定源码中没有，这里只验证中枢序列。',
    legs: () => lg([[8, 34, 'fixed'], [3, 10], [8, 8], [5, 6], [7, 6], [5.5, 6], [12, 9], [9.5, 7], [11.5, 7], [10, 6], [11, 6], [10.2, 6], [16, 10], [13, 7]]),
    check: run => { const p = last(run).pivots; for (let k = 0; k + 1 < p.length; k++) if (p[k + 1].zd > p[k].zg) return true; return false; } },
  { id: 'down_trend', name: '下跌：中枢下移', group: '走势（仅中枢序列）',
    desc: '上涨的镜像：两个依次下移、互不重叠的中枢。',
    mirror: true,
    legs: () => lg([[8, 34, 'fixed'], [3, 10], [8, 8], [5, 6], [7, 6], [5.5, 6], [12, 9], [9.5, 7], [11.5, 7], [10, 6], [11, 6], [10.2, 6], [16, 10], [13, 7]]),
    check: run => { const p = last(run).pivots; for (let k = 0; k + 1 < p.length; k++) if (p[k + 1].zg < p[k].zd) return true; return false; } },
  { id: 'range', name: '盘整：中枢长期延伸', group: '走势（仅中枢序列）',
    desc: '价格长期在同一中枢区间内来回震荡（笔数很多）。盘整的正式判定源码中没有。',
    legs: () => lg([PRE, [3, 12], [8, 8], [5, 6], [7.5, 6], [5.3, 6], [7.7, 6], [5.2, 6], [7.6, 6], [5.4, 6], [7.4, 6], [5.5, 6], [7, 6]]),
    check: run => last(run).pivots.some(p => p.strokeCount >= 8) },

  /* 背驰与买卖点 */
  { id: 'div_down', name: '底背驰（盘整背驰口径）', group: '背驰与买卖点',
    desc: '离开笔创新低，但 MACD 面积 < 进入段面积×阈值。注意：源码"进入段"实际取离开笔前第二笔（盘整背驰口径）。',
    legs: v => lg(divLegs(v)),
    check: run => last(run).divergences.some(d => !d.isUp && !d.warmup) },
  { id: 'div_up', name: '顶背驰', group: '背驰与买卖点',
    desc: '底背驰的镜像。', mirror: true,
    legs: v => lg(divLegs(v)),
    check: run => last(run).divergences.some(d => d.isUp && !d.warmup) },
  { id: 'buy1', name: '一买', group: '背驰与买卖点',
    desc: '底背驰 + 离开笔稳定（身后再出现两笔）+ 次级别转向确认 + 可交易性校验，全部通过后才发出。',
    legs: v => buyLegs(v), check: hasSig('1买') },
  { id: 'buy2', name: '二买', group: '背驰与买卖点',
    desc: '一买所在笔之后，向上笔完成、随后的回抽向下笔不破一买低点。',
    legs: v => buyLegs(v, [[6, 6], [10, 8]]), check: hasSig('2买') },
  { id: 'buy3', name: '三买', group: '背驰与买卖点',
    desc: '向上笔突破中枢上沿 ZG 后，回抽的向下笔低点仍在 ZG 上方（不回中枢）。',
    legs: () => lg([PRE, [3, 12], [8, 8], [5, 6], [7, 6], [5.5, 6], [12, 9], [9, 7], [13, 8], [10, 6], [14, 6]]),
    check: hasSig('3买') },
  { id: 'sell1', name: '一卖', group: '背驰与买卖点', desc: '一买的镜像。', mirror: true,
    legs: v => buyLegs(v), check: hasSig('1卖') },
  { id: 'sell2', name: '二卖', group: '背驰与买卖点', desc: '二买的镜像。', mirror: true,
    legs: v => buyLegs(v, [[6, 6], [10, 8]]), check: hasSig('2卖') },
  { id: 'sell3', name: '三卖', group: '背驰与买卖点', desc: '三买的镜像。', mirror: true,
    legs: () => lg([PRE, [3, 12], [8, 8], [5, 6], [7, 6], [5.5, 6], [12, 9], [9, 7], [13, 8], [10, 6], [14, 6]]),
    check: hasSig('3卖') },

  /* 自由 */
  { id: 'free', name: '随机理想行情', group: '自由生成',
    desc: '由种子生成的随机折线腿（腿长、幅度随机）。不指定目标结构，结构完全由算法判定。',
    legs: (v, spec) => {
      const r = mulberry32((spec.seed | 0) * 31 + 7), legs = [L(8, 34, 'fixed')];
      let x = 8, up = false;
      for (let k = 0; k < 14; k++) {
        const d = 2 + r() * 5;
        x = Math.max(-6, up ? x + d : x - d);
        legs.push(L(Math.round(x * 100) / 100, 6 + Math.floor(r() * 8)));
        up = !up;
      }
      return legs;
    } },
];

const SCENARIOS = SCENARIO_LIST.map(s => ({ id: s.id, name: s.name, group: s.group, desc: s.desc }));
const BY_ID = Object.fromEntries(SCENARIO_LIST.map(s => [s.id, s]));

/* ───────────────────────── 生成 / 校验 ───────────────────────── */
const MAX_TRIES = 12;

function normSpec(spec) {
  return {
    scenario: spec.scenario in BY_ID ? spec.scenario : 'buy1',
    amp: spec.amp > 0 ? +spec.amp : 1.5,
    lenScale: spec.lenScale > 0 ? +spec.lenScale : 1,
    factor: Math.max(2, Math.round(spec.factor) || 5),
    noise: spec.noise > 0 ? +spec.noise : 0,
    realNoise: spec.realNoise > 0 ? +spec.realNoise : 0,
    noiseType: ['uniform', 'gauss', 'ou'].includes(spec.noiseType) ? spec.noiseType : 'uniform',
    shapeNoise: spec.shapeNoise > 0 ? +spec.shapeNoise : 0,
    pollute: spec.pollute > 0 ? +spec.pollute : 0,
    lockSkeleton: spec.lockSkeleton !== undefined ? !!spec.lockSkeleton : true,
    seed: spec.seed | 0,
    p0: spec.p0 > 0 ? +spec.p0 : 100,
    baseSec: spec.baseSec > 0 ? +spec.baseSec : 60,
    t0: spec.t0 || 1700000000,
  };
}

function buildCase(spec, sc, opts, t) {
  let legs = sc.legs(t, spec);
  if (sc.mirror) legs = legs.map(l => ({ ...l, x: -l.x }));
  const { main, sub } = compile(legs, spec, t);
  return { spec, variant: t, main, sub, run: E.replay(main, sub, opts) };
}

function makeReport(sc, cs, search) {
  const r = last(cs.run);
  const verifiable = !!sc.check;
  return {
    name: sc.name, desc: sc.desc, verifiable,
    ok: verifiable ? !!sc.check(cs.run) : true,
    counts: {
      bars: cs.main.length, strokes: r.strokes.length, pivots: r.pivots.length,
      divergences: r.divergences.length, signals: cs.run.signals.length, ghosts: cs.run.ghosts.length,
    },
    search,
  };
}

function attachBaseline(cs, sc, o) {
  const sp = cs.spec;
  if (sp.realNoise > 0 || sp.noise > 0 || sp.shapeNoise > 0 || sp.pollute > 0) {
    const baseSpec = { ...sp, noise: 0, realNoise: 0, shapeNoise: 0, pollute: 0 };
    cs.base = buildCase(baseSpec, sc, o, cs.variant || 0);
  } else {
    cs.base = null;
  }
}

function generate(specIn, opts) {
  const spec = normSpec(specIn), sc = BY_ID[spec.scenario];
  const o = { ...E.DEFAULT_OPTIONS, ...opts };
  let first = null, hit = null, tries = 0;
  const hasPollution = spec.realNoise > 0 || spec.noise > 0 || spec.shapeNoise > 0 || spec.pollute > 0;
  const max = sc.check && !(hasPollution && spec.lockSkeleton) ? MAX_TRIES : 1;
  for (let t = 0; t < max; t++) {
    const cs = buildCase(spec, sc, o, t);
    tries = t + 1;
    if (!first) first = cs;
    if (!sc.check || sc.check(cs.run)) { hit = cs; break; }
  }
  const cs = hit || first;
  attachBaseline(cs, sc, o);
  cs.report = makeReport(sc, cs, { found: !!hit, tries, max });
  return cs;
}

/** 改算法参数后原地重算（不重新生成行情） */
function analyzeCase(cs, opts) {
  const sc = BY_ID[cs.spec.scenario];
  const o = { ...E.DEFAULT_OPTIONS, ...opts };
  cs.run = E.replay(cs.main, cs.sub, o);
  if (cs.base) cs.base.run = E.replay(cs.base.main, cs.base.sub, o);
  cs.report = makeReport(sc, cs, cs.report.search);
  return cs;
}

const api = { SCENARIOS, generate, analyzeCase, appendChain, appendBars, buildUnit, unitCandidates,
  UNIT_LABEL, UNIT_TXT, UNIT_OPT, _compile: compile, _norm: normSpec, _legs: id => BY_ID[id].legs(0, normSpec({ scenario: id })) };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
return api;
})();
