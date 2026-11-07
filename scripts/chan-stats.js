/* ============================================================================
 * chan-stats.js — 真实行情信号统计与置换检验（方向 2 核心）
 *
 * 问题：缠论 1/2/3 类买卖点信号在真实行情上有没有超出随机的信息量？
 * 方法：把真实K线交给 ChanEngine 逐根回放（无未来函数），信号在确认K线 i 记账，
 *       统计其后 H 根的方向化远期收益（买 +1 / 卖 −1），扣除手续费与滑点，
 *       与两类随机对照比较：
 *   对照 A（随机时点，默认开）：给每个真实信号配一个随机时点、同方向、同口径的
 *       远期收益；对「信号均值 − 对照均值」做标签置换检验，得双侧 p 值。
 *       开销 ≈ 0，是第一道过滤。
 *   对照 B（块自助重放，默认 100 次）：按块打乱对数收益重建价格路径（保留单根收益的
 *       边际分布——肥尾、漂移、波动聚集的原料——打掉时序结构），重新过引擎出信号再统计。
 *       检验「信号判定本身」在无时序结构数据下的表现，
 *       顺带回答方向 1 的问题：这种随机行情里这些信号出现得多频繁。
 *       所有打乱/置换用固定种子（mulberry32），同参数同数据结果逐位一致。
 *
 * 口径（现实有摩擦）：
 *   · 入场 entry='next-open'：信号 i 根收盘确认，i+1 根开盘价成交（默认，含入场滞后）；
 *     entry='close'：i 根收盘价成交。
 *   · 出场统一为 close[i+H]（两种入场口径同为一根，H = 持有根数）。
 *   · 成本 = 2×(feeBp + slipBp) / 1e4，双向计。
 *   · 末端信号凑不满 H 根 → 剔除并按 horizon 如实计数（censored）。
 *   · 样本内外按K线序号切分（split，默认 0.7）；p 值只在全样本上算（折半后 n
 *     太小，样本内外仅作描述统计）。
 *   · 无次级别数据时 requireSubLevelConfirm=false（降级口径），报告 meta 注明。
 *
 * 对外：analyze(main, sub, cfg) → report；DEFAULT_CFG；_fwd/_descStats/_permDiff（测试用）
 * ============================================================================ */
var ChanStats = (function () {
'use strict';
const E = (typeof ChanEngine !== 'undefined') ? ChanEngine : require('../chan-engine.js');

/* ───────────────────────── 随机数 / 基础统计 ───────────────────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function descStats(arr) {
  const n = arr.length;
  if (!n) return { n: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  let out = { n, mean, median };
  if (n >= 2) {
    const v = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1);
    const std = Math.sqrt(v);
    out.std = std;
    out.win = arr.filter(x => x > 0).length / n;
    out.t = std > 0 ? mean / (std / Math.sqrt(n)) : null;
  }
  return out;
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/* 标签置换检验：obs = mean(a) − mean(b)，混合两池重贴标签，返回双侧 p */
function permDiff(a, b, perms, rnd) {
  const obs = a.reduce((x, y) => x + y, 0) / a.length - b.reduce((x, y) => x + y, 0) / b.length;
  const pool = [...a, ...b], na = a.length, n = pool.length;
  let extreme = 0;
  for (let p = 0; p < perms; p++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    let sa = 0; for (let i = 0; i < na; i++) sa += pool[i];
    const d = sa / na - (pool.reduce((x, y) => x + y, 0) - sa) / (n - na);
    if (Math.abs(d) >= Math.abs(obs) - 1e-15) extreme++;
  }
  return { obs, p: (1 + extreme) / (perms + 1) };
}

/* ───────────────────────── 口径 ───────────────────────── */
const DEFAULT_CFG = {
  entry: 'next-open',          // 'close' | 'next-open'
  feeBp: 10, slipBp: 5,        // 单边 bp；往返成本 = 2×(fee+slip)/1e4
  horizons: [5, 10, 20, 60],   // 持有根数
  split: 0.7,                  // 样本内外切分（按K线序号）
  permA: 2000,                 // 对照 A 置换次数
  permB: 100,                  // 对照 B 重放次数（0 = 关闭）
  blockSize: 10,               // 对照 B 块长（根）
  seed: 7,
  warmupBars: 30,
};

function sideOf(sig) {
  if (typeof sig.side === 'number' && sig.side !== 0) return sig.side > 0 ? 1 : -1;
  return /卖/.test(sig.kind) ? -1 : 1;
}

/* 单事件 H 根方向化远期收益；凑不满返回 null（censored） */
function _fwd(main, idx, side, H, cfg) {
  const n = main.length;
  const eIdx = cfg.entry === 'close' ? idx : idx + 1;
  const xIdx = idx + H;
  if (eIdx >= n || xIdx >= n) return null;
  const pIn = cfg.entry === 'close' ? main[idx].close : main[eIdx].open;
  const pOut = main[xIdx].close;
  const cost = 2 * (cfg.feeBp + cfg.slipBp) / 1e4;
  return side * (pOut / pIn - 1) - cost;
}

function eventsOf(run) {
  return run.signals.map(s => ({ idx: s.gConfirm, kind: s.kind, side: sideOf(s) }));
}

/* 轻量回放：逻辑镜像 ChanEngine.replay（扩展窗口 / 次级别窗口 300 根 / 记账时间过滤），
   但不保留每帧结构快照 —— 全量历史（≥6 万根）下 snaps 会吃掉数 GB 堆内存。
   与 E.replay 的信号/ghost 一致性由 smoke-stats 的 parity 用例守护（SUB_WINDOW_BARS=300
   是引擎内部常量，若引擎改动此处需同步，parity 测试会失败报警）。 */
function replaySignals(main, sub, userOpts) {
  const o = { ...E.DEFAULT_OPTIONS, ...userOpts };
  const W = Math.max(120, o.analysisBars);
  const signals = [], ghosts = [];
  let subEnd = 0;
  for (let i = 0; i < main.length; i++) {
    const barTime = main[i].time;
    const off = Math.max(0, i + 1 - W);
    const win = main.slice(off, i + 1);
    let subWin = null;
    if (sub && sub.length) {
      while (subEnd < sub.length && sub[subEnd].time <= barTime) subEnd++;
      if (subEnd > 60) subWin = sub.slice(Math.max(0, subEnd - 300), subEnd);
    }
    const r = E.analyze(win, o, subWin);
    for (const p of r.points) if (p.time === barTime) signals.push({ kind: p.kind, side: p.side, time: p.time, price: p.price, gRef: p.referenceBarIndex + off, gConfirm: i });
    for (const p of r.ghosts) if (p.time === barTime) ghosts.push({ kind: p.kind, time: p.time, price: p.price, reason: p.reason, gRef: p.referenceBarIndex + off, gConfirm: i });
  }
  return { signals, ghosts };
}

function horizonStats(main, events, H, cfg) {
  const rets = [], censored = [];
  for (const ev of events) {
    const r = _fwd(main, ev.idx, ev.side, H, cfg);
    if (r === null) censored.push(ev); else rets.push(r);
  }
  return { stats: descStats(rets), censored: censored.length };
}

function sampleSplit(events, splitIdx) {
  return { in: events.filter(e => e.idx < splitIdx), out: events.filter(e => e.idx >= splitIdx) };
}

/* ───────────────────────── 对照 A：随机时点 ───────────────────────── */
function controlA(main, events, cfg, rnd) {
  const n = main.length;
  const maxH = Math.max(...cfg.horizons);
  const lo = Math.min(cfg.warmupBars, Math.floor(n / 10));
  const hi = n - 1 - maxH;
  const ctrl = events.map(ev => ({ idx: lo + Math.floor(rnd() * Math.max(1, hi - lo + 1)), side: ev.side }));
  const stats = {}, p = {}, obsDiff = {};
  for (const H of cfg.horizons) {
    const cRe = ctrl.map(ev => _fwd(main, ev.idx, ev.side, H, cfg)).filter(r => r !== null);
    const sRe = events.map(ev => _fwd(main, ev.idx, ev.side, H, cfg)).filter(r => r !== null);
    stats[H] = descStats(cRe);
    if (sRe.length >= 5 && cRe.length >= 5) {
      const r = permDiff(sRe, cRe, cfg.permA, rnd);
      p[H] = r.p; obsDiff[H] = r.obs;
    } else { p[H] = null; obsDiff[H] = null; }
  }
  return { n: ctrl.length, stats, p, obsDiff };
}

/* ───────────────────────── 对照 B：块自助重放 ───────────────────────── */
/* 收益块序重排：把对数收益序列切成连续块、随机重排块顺序（精确置换，收益多重集逐位不变），
   从首根 close 重建路径；每根K线的 OHLC 形状按新旧价位之比等比缩放移植（close 精确对齐，
   影线/实体的相对比例不变，价位不会变负）。保留单根收益的边际分布（肥尾/漂移/波动聚集的原料），
   打掉块长以上的时序结构。旧版绝对平移移植在重建路径与原路径价位漂开后会让K线相对幅度爆炸（已废弃）。 */
function bootstrapPath(main, rnd, blockSize) {
  const n = main.length, L = Math.max(2, Math.min(blockSize, n));
  const rets = [];
  for (let i = 1; i < n; i++) rets.push(Math.log(main[i].close / main[i - 1].close));
  const m = rets.length, nb = Math.ceil(m / L);
  const order = Array.from({ length: nb }, (_, b) => b);
  for (let i = nb - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const rs = [];
  for (const b of order) for (let j = b * L; j < Math.min((b + 1) * L, m); j++) rs.push(rets[j]);
  const out = [{ ...main[0] }];
  let prevC = main[0].close;
  for (let i = 1; i < n; i++) {
    const src = main[i];
    const c = prevC * Math.exp(rs[i - 1]);
    const s = c / src.close;
    out.push({ time: src.time, open: src.open * s, high: src.high * s, low: src.low * s, close: c, volume: src.volume });
    prevC = c;
  }
  return out;
}

function controlB(main, cfg, rnd, optsNoSub, obsMeans) {
  const perH = Object.fromEntries(cfg.horizons.map(H => [H, { means: [], counts: [] }]));
  let countSum = 0, countMin = Infinity, countMax = 0;
  const t0 = Date.now();
  for (let b = 0; b < cfg.permB; b++) {
    const path = bootstrapPath(main, rnd, cfg.blockSize);
    const run = replaySignals(path, null, optsNoSub);
    const evs = eventsOf(run);
    countSum += evs.length; countMin = Math.min(countMin, evs.length); countMax = Math.max(countMax, evs.length);
    for (const H of cfg.horizons) {
      const rets = evs.map(ev => _fwd(path, ev.idx, ev.side, H, cfg)).filter(r => r !== null);
      perH[H].counts.push(evs.length);
      perH[H].means.push(rets.length ? rets.reduce((x, y) => x + y, 0) / rets.length : 0);
    }
  }
  const out = {
    runs: cfg.permB, blockSize: cfg.blockSize,
    counts: { mean: countSum / cfg.permB, min: countMin === Infinity ? 0 : countMin, max: countMax },
    timing: { ms: Date.now() - t0 },
  };
  out.stats = {}, out.pOne = {}, out.pTwo = {};
  for (const H of cfg.horizons) {
    const m = [...perH[H].means].sort((a, b) => a - b);
    out.stats[H] = { mean: perH[H].means.reduce((x, y) => x + y, 0) / cfg.permB, q05: quantile(m, 0.05), q95: quantile(m, 0.95) };
    if (obsMeans[H] !== null && obsMeans[H] !== undefined) {
      out.pOne[H] = (1 + perH[H].means.filter(x => x >= obsMeans[H]).length) / (cfg.permB + 1);
      out.pTwo[H] = (1 + perH[H].means.filter(x => Math.abs(x) >= Math.abs(obsMeans[H])).length) / (cfg.permB + 1);
    } else { out.pOne[H] = null; out.pTwo[H] = null; }
  }
  out.countsSeries = perH[cfg.horizons[0]].counts;   // 各 horizon 共用同一批重放，信号数相同
  return out;
}

/* ───────────────────────── 主入口 ───────────────────────── */
function analyze(main, sub, cfgIn) {
  const cfg = { ...DEFAULT_CFG, ...cfgIn };
  if (!main || main.length < 100) throw new Error(`K线太少（${main ? main.length : 0} < 100）：MACD 起算需 34 根、暖机 30 根，样本无意义`);
  cfg.horizons = [...new Set(cfg.horizons.map(H => Math.max(1, Math.round(H))))].sort((a, b) => a - b);
  const rnd = mulberry32(cfg.seed | 0);
  const hasSub = !!(sub && sub.length);
  const opts = { ...E.DEFAULT_OPTIONS, requireSubLevelConfirm: hasSub };

  const tRe = Date.now();
  const run = replaySignals(main, hasSub ? sub : null, opts);
  const events = eventsOf(run);
  const splitIdx = Math.floor(main.length * cfg.split);

  const byReason = {};
  for (const g of run.ghosts) byReason[g.reason || 'unknown'] = (byReason[g.reason || 'unknown'] || 0) + 1;

  const report = {
    meta: {
      bars: main.length, subBars: hasSub ? sub.length : 0,
      timeRange: [main[0].time, main[main.length - 1].time],
      requireSubLevelConfirm: hasSub,
      cfg: { ...cfg, horizons: [...cfg.horizons] },
      note: hasSub
        ? '口径：已启用次级别确认（sub 数据参与判定）。'
        : '口径：单周期数据，已降级为无次级别确认（requireSubLevelConfirm=false）。',
    },
    timing: { replayMs: Date.now() - tRe },
    ghosts: { total: run.ghosts.length, byReason },
    events: { total: events.length, byKind: events.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {}) },
  };

  /* 信号统计：pooled + 分 kind，各分样本内外 */
  const tableFor = evs => {
    const parts = sampleSplit(evs, splitIdx);
    const tbl = { n: evs.length, censored: {}, in: {}, out: {}, all: {} };
    for (const H of cfg.horizons) {
      const w = (list, key) => { const r = horizonStats(main, list, H, cfg); tbl[key][H] = r.stats; tbl.censored[H] = (tbl.censored[H] || 0) + r.censored; };
      w(parts.in, 'in'); w(parts.out, 'out'); w(evs, 'all');
    }
    return tbl;
  };
  report.pooled = tableFor(events);
  report.kinds = {};
  const byKind = {};
  for (const ev of events) (byKind[ev.kind] = byKind[ev.kind] || []).push(ev);
  for (const k of Object.keys(byKind).sort()) report.kinds[k] = tableFor(byKind[k]);

  /* 对照 A */
  if (events.length >= 5) report.controlA = controlA(main, events, cfg, rnd);

  /* 对照 B：观察均值取全样本 pooled */
  if (cfg.permB > 0) {
    const obsMeans = {};
    for (const H of cfg.horizons) {
      const rets = events.map(ev => _fwd(main, ev.idx, ev.side, H, cfg)).filter(r => r !== null);
      obsMeans[H] = rets.length ? rets.reduce((x, y) => x + y, 0) / rets.length : null;
    }
    report.controlB = controlB(main, cfg, rnd, { ...opts, requireSubLevelConfirm: false }, obsMeans);
  }
  return report;
}

const api = { DEFAULT_CFG, analyze, replaySignals, _fwd, _descStats: descStats, _permDiff: permDiff, _bootstrapPath: bootstrapPath, _sideOf: sideOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
return api;
})();
