/* ============================================================================
 * chan-robust.js — 结构稳健性（M4：稳健度记分卡）
 *
 * 全局对象：ChanRobust（纯数据 + 纯函数，不碰 DOM、不依赖引擎；
 *           app.js 以 `const CR = ChanRobust` 使用）
 *
 *   scoreCase(baseCase, caseCase, upto)  单案例稳健度：0 噪声基线 vs 受污染行情
 *     → { sig, stroke, pivot, fractal, total, weights, i }
 *       sig     { base, kept, shifted, dead, extra, survival, extraRate, deadList }
 *       stroke  { base, exact, drift, miss, extra, hitRate, meanDrift }
 *       pivot   { base, matched, missing, extra, meanIou, score }
 *       fractal { base, hit, miss, extra, hitRate }
 *   grade(v)                             hi ≥85 / mid ≥60 / lo <60 / null 无数据
 *
 * 口径（与 app.js computeCaseDiff / chan-rules.js 一致，诚实标注）：
 *   · 所有匹配按"全局K线下标"就近配对：信号 ±6 根、笔端点 ±3 根、分型 ±2 根；
 *     配对容忍度与 computeCaseDiff 的信号匹配窗口同源。
 *   · 各指标衡量"结构结论在污染下的存活 / 命中比例"，不是盈利胜率。
 *   · 综合总分为工程合成的加权平均：信号 0.35 / 笔 0.25 / 中枢 0.25 / 分型 0.15；
 *     某项无基线数据时（如当前帧基线尚无信号）自动按剩余项权重归一，不假装有数据。
 *   · 中枢重合度 = 基线中枢 [ZD,ZG] 与污染行情最佳匹配中枢区间的 IoU 均值；
 *     基线中枢在污染行情中无任何重叠者记 0（消失）。
 *   · 历史说明：本文件曾含「蒙特卡洛扫描污染强度」的 runSweep / aggregate /
 *     PROFILES 等实验台接口，2026-11-05 按用户决定移除（界面实验台同步移除），
 *     只保留单案例评分。输入案例格式：{ run:{ snaps, signals, ghosts }, main }。
 * ============================================================================ */
var ChanRobust = (function () {
'use strict';

const WEIGHTS = { sig: 0.35, stroke: 0.25, pivot: 0.25, fractal: 0.15 };
const TOL = { sig: 6, stroke: 3, fractal: 2 };

/* ───────────────────────── 单案例评分 ───────────────────────── */

/* 取某案例截至全局K线 upto 的窗口结果（与 computeCaseDiff 同一取数口径） */
function snapAt(c, upto) {
  const run = c.run;
  const i = Math.min(upto == null ? run.snaps.length - 1 : upto, run.snaps.length - 1);
  return {
    i,
    res: run.snaps[i].res,
    off: run.snaps[i].off,
    sigs: run.signals.filter(x => x.gConfirm <= i),
    ghosts: run.ghosts.filter(x => x.gConfirm <= i),
  };
}

/* 1. 信号稳健度：基线信号 保留 / 推迟 / 破坏（被过滤或消失）/ 污染额外诱发 */
function scoreSig(b, n) {
  let kept = 0, shifted = 0, dead = 0;
  const deadList = [];
  for (const bs of b.sigs) {
    const m = n.sigs.find(x => x.kind === bs.kind && Math.abs(x.gRef - bs.gRef) <= TOL.sig);
    const g = n.ghosts.find(x => x.kind === bs.kind && Math.abs(x.gRef - bs.gRef) <= TOL.sig);
    if (m) { if (m.gConfirm === bs.gConfirm) kept++; else shifted++; }
    else { dead++; deadList.push(g ? { kind: bs.kind, gRef: bs.gRef, how: 'ghost' } : { kind: bs.kind, gRef: bs.gRef, how: 'lost' }); }
  }
  const extra = n.sigs.filter(ns => !b.sigs.some(bs => bs.kind === ns.kind && Math.abs(bs.gRef - ns.gRef) <= TOL.sig));
  const base = b.sigs.length;
  return {
    base, kept, shifted, dead, extra: extra.length,
    survival: base ? (kept + shifted) / base : null,
    extraRate: extra.length / Math.max(1, base),
    deadList,
  };
}

/* 2. 笔端点命中率：同向就近配对；端点一致 / 漂移≤3根 / 错位或消失；未配对的实际笔=碎折返 */
function scoreStroke(b, n) {
  const bS = b.res.strokes, nS = n.res.strokes;
  const used = new Set();
  let exact = 0, drift = 0, miss = 0, driftSum = 0, driftN = 0;
  for (const bs of bS) {
    let best = -1, bd = TOL.stroke + 1;
    for (let k = 0; k < nS.length; k++) {
      if (used.has(k)) continue;
      const ns = nS[k];
      if (ns.isUp !== bs.isUp) continue;
      const d = Math.abs(ns.endBarIndex - bs.endBarIndex);
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) {
      used.add(best);
      if (bd === 0) exact++; else { drift++; driftSum += bd; driftN++; }
    } else miss++;
  }
  const base = bS.length;
  return {
    base, exact, drift, miss, extra: nS.length - used.size,
    hitRate: base ? (exact + drift) / base : null,
    meanDrift: driftN ? driftSum / driftN : 0,
  };
}

/* 价格区间 IoU */
function iou(a1, a2, b1, b2) {
  const lo = Math.max(a1, b1), hi = Math.min(a2, b2);
  if (hi <= lo) return 0;
  const u = Math.max(a2, b2) - Math.min(a1, b1);
  return u > 0 ? (hi - lo) / u : 0;
}

/* 3. 中枢重合度：每个基线中枢取与污染行情中枢 [ZD,ZG] 的最佳 IoU，求均值 */
function scorePivot(b, n) {
  const bP = b.res.pivots, nP = n.res.pivots;
  const scores = bP.map(bp => nP.reduce((acc, np) => Math.max(acc, iou(bp.zd, bp.zg, np.zd, np.zg)), 0));
  const matched = scores.filter(s => s > 0.5).length;
  return {
    base: bP.length,
    matched,
    missing: bP.length - matched,
    extra: Math.max(0, nP.length - bP.length),
    meanIou: scores.length ? scores.reduce((a, c) => a + c, 0) / scores.length : null,
    score: scores.length ? scores.reduce((a, c) => a + c, 0) / scores.length : null,
  };
}

/* 4. 分型命中率：同类型（顶/底）就近配对，位置一致或位移≤2根算命中 */
function scoreFractal(b, n) {
  const bF = b.res.fractals, nF = n.res.fractals;
  const used = new Set();
  let hit = 0;
  for (const bf of bF) {
    for (let k = 0; k < nF.length; k++) {
      if (used.has(k)) continue;
      const nf = nF[k];
      if (nf.isTop !== bf.isTop) continue;
      if (Math.abs(nf.barIndex - bf.barIndex) <= TOL.fractal) { used.add(k); hit++; break; }
    }
  }
  const base = bF.length;
  return { base, hit, miss: base - hit, extra: nF.length - used.size, hitRate: base ? hit / base : null };
}

/* 综合评分：有数据的项按权重归一合成；全无数据返回 null（不假装有分数） */
function scoreCase(baseCase, caseCase, upto) {
  const b = snapAt(baseCase, upto), n = snapAt(caseCase, upto);
  const sig = scoreSig(b, n), stroke = scoreStroke(b, n), pivot = scorePivot(b, n), fractal = scoreFractal(b, n);
  const parts = [];
  if (sig.survival != null) parts.push([WEIGHTS.sig, sig.survival]);
  if (stroke.hitRate != null) parts.push([WEIGHTS.stroke, stroke.hitRate]);
  if (pivot.score != null) parts.push([WEIGHTS.pivot, pivot.score]);
  if (fractal.hitRate != null) parts.push([WEIGHTS.fractal, fractal.hitRate]);
  const wSum = parts.reduce((a, p) => a + p[0], 0);
  const total = wSum ? Math.round(100 * parts.reduce((a, p) => a + p[0] * p[1], 0) / wSum) : null;
  return { sig, stroke, pivot, fractal, total, weights: WEIGHTS, i: n.i };
}

/* 等级：hi ≥85 / mid ≥60 / lo <60 / null 无数据 */
function grade(v) { return v == null ? null : v >= 85 ? 'hi' : v >= 60 ? 'mid' : 'lo'; }

const api = { scoreCase, grade, WEIGHTS, TOL };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
return api;
})();
