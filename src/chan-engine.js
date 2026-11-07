/* ============================================================================
 * chan-engine.js — 缠论算法内核（移植自 Mdk.Api.Analysis.Chan 的 C# 源码）
 *
 * 全局对象：ChanEngine（app.js 以 `const E = ChanEngine` 使用）
 *
 * 对外接口
 *   DEFAULT_OPTIONS            默认参数（与 ChanOptions.cs 一致）
 *   STRUCT                     Set，"结构类事件"类型（逐结构播放用）
 *   analyze(candles, opts, subCandles)      单窗口分析（= ChanAnalyzer.Analyze）
 *   replay(main, sub, opts)                 逐根回放（= ChanBackfill.ReplayPoints）
 *        → { snaps, signals, ghosts }   ；snaps.length === main.length
 *        snap = { i, off, res:{merged,fractals,strokes,pivots,divergences}, sig:[], gh:[] }
 *          · res 内所有下标是"窗口内下标"，全局K线下标 = 下标 + off
 *          · sig / gh 为"本根K线收盘时新发出 / 新被过滤"的信号（已是全局下标）
 *        signal/ghost = { kind, side, time, price, refPrice, stopPrice, areaRatio, note,
 *                         gRef(结构极值所在K线), gConfirm(记账K线), reason(仅 ghost),
 *                         subConfirm(仅次级别确认过的：命中的那根次级别笔) }
 *   diffEvents(prevSnap, curSnap)           相邻两帧 → 事件数组 {t, text}
 *   以及各步骤原语（inclusion/fractals/strokes/pivots/macd/atr…）便于单测
 *
 * K线格式：{ time(秒), open, high, low, close }
 *
 * 与 C# 源码的对应：
 *   mergeInclusion   ← ChanInclusion.Merge
 *   detectFractals   ← ChanFractalDetector.Detect
 *   buildStrokes     ← ChanStrokeBuilder.Build
 *   detectPivots     ← ChanPivotDetector.Detect
 *   checkDivergence  ← ChanDivergenceDetector.Check / Area
 *   detectSignals    ← ChanSignals.Detect（另外产出 ghosts，见下）
 *   subLevelMatches  ← ChanAnalyzer.SubLevelMatches
 *   macd / ema       ← Macd.cs / Averages.cs
 *   atr              ← 源码未上传，常规 Wilder ATR（TR 种子取 SMA）——待核对
 *
 * 【工程约定（非 C# 原有，不改变任何"已发出信号"的判定）】
 *   E1  ghosts：把被暖机隔离 / 次级别未确认 / 不可交易过滤掉的"结构上成立"信号也记录下来，
 *       仅用于展示；真实信号集合与 C# 完全一致。
 *   E2  窗口不足时：C# 回填要求凑满 AnalysisBars 才开始；实验室的案例通常更短，
 *       故用"扩展窗口"——窗口 = max(0, i+1-analysisBars) .. i（案例起点即窗口起点）。
 *   E3  divergences 列表：C# 没有单独输出，这里把 Signals 里 1 类判定用到的背驰结构一并返回
 *       （含处于暖机区者，带 warmup 标记）。
 *   E4  C# 备注里的 "{AreaRatio:0.00m}" 末尾的 m 疑为笔误，这里不输出。
 * ============================================================================ */
var ChanEngine = (function () {
'use strict';

const DEFAULT_OPTIONS = {
  enabled: true,
  divergenceAreaRatio: 0.9,
  maxPoints: 50,
  warmupBars: 30,
  analysisBars: 700,
  requireSubLevelConfirm: true,
  subLevelConfirmWindowBars: 30,   // 与 mdk appsettings Chan:SubLevelConfirmWindowBars 对齐
};
const MIN_MERGED_BARS_BETWEEN = 2;   // 新笔：两分型间至少 2 根独立合并K线
const STABILITY_MARGIN_STROKES = 2;  // 身后至少 2 笔才视为不可修正
const SUB_WINDOW_BARS = 300;         // 次级别取最近 300 根（与 C# 回填一致）

/* ───────────────────────── 指标 ───────────────────────── */
function ema(values, period) {
  const n = values.length, out = new Array(n).fill(null);
  if (period < 1 || n < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let e = sum / period;
  out[period - 1] = e;
  const a = 2 / (period + 1);
  for (let i = period; i < n; i++) { e += a * (values[i] - e); out[i] = e; }
  return out;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  const n = closes.length;
  const dif = new Array(n).fill(null), dea = new Array(n).fill(null), hist = new Array(n).fill(null);
  if (n < slow) return { dif, dea, hist };
  const ef = ema(closes, fast), es = ema(closes, slow);
  const start = slow - 1;
  for (let i = start; i < n; i++) dif[i] = ef[i] - es[i];
  if (n - start >= signal) {
    let sum = 0;
    for (let i = start; i < start + signal; i++) sum += dif[i];
    let d = sum / signal;
    const ds = start + signal - 1;
    dea[ds] = d;
    const a = 2 / (signal + 1);
    for (let i = ds + 1; i < n; i++) { d += a * (dif[i] - d); dea[i] = d; }
    for (let i = ds; i < n; i++) hist[i] = dif[i] - dea[i];
  }
  return { dif, dea, hist };
}

/** Wilder 平滑：种子 = 前 period 个值的 SMA，之后 (prev*(n-1)+x)/n */
function rma(values, period) {
  const n = values.length, out = new Array(n).fill(null);
  if (period < 1 || n < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ma = sum / period;
  out[period - 1] = ma;
  const w = (period - 1) / period;
  for (let i = period; i < n; i++) { ma = ma * w + values[i] / period; out[i] = ma; }
  return out;
}

function atr(highs, lows, closes, period = 14) {
  const n = closes.length, tr = new Array(n);
  for (let i = 0; i < n; i++) {
    tr[i] = i === 0 ? highs[0] - lows[0]
      : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  return rma(tr, period);
}

/* ───────────────────────── 1. 包含处理 ───────────────────────── */
function mergeInclusion(candles) {
  const merged = [];
  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];
    if (!merged.length) { merged.push({ startIndex: i, endIndex: i, high: bar.high, low: bar.low, isUp: true }); continue; }
    const last = merged[merged.length - 1];
    const contains = (bar.high <= last.high && bar.low >= last.low) || (bar.high >= last.high && bar.low <= last.low);
    if (contains) {
      let high, low;
      if (last.isUp) { high = Math.max(last.high, bar.high); low = Math.max(last.low, bar.low); }
      else { high = Math.min(last.high, bar.high); low = Math.min(last.low, bar.low); }
      merged[merged.length - 1] = { startIndex: last.startIndex, endIndex: i, high, low, isUp: last.isUp };
      continue;
    }
    merged.push({ startIndex: i, endIndex: i, high: bar.high, low: bar.low, isUp: bar.high > last.high });
  }
  return merged;
}

/* ───────────────────────── 2. 分型 ───────────────────────── */
function extremeBarIndex(candles, mc, isTop) {
  let best = mc.startIndex;
  for (let i = mc.startIndex; i <= mc.endIndex && i < candles.length; i++) {
    if (isTop ? candles[i].high > candles[best].high : candles[i].low < candles[best].low) best = i;
  }
  return best;
}

function detectFractals(merged, candles) {
  const raw = [];
  for (let i = 1; i < merged.length - 1; i++) {
    const prev = merged[i - 1], mid = merged[i], next = merged[i + 1];
    const isTop = mid.high > prev.high && mid.high > next.high && mid.low > prev.low && mid.low > next.low;
    const isBottom = mid.low < prev.low && mid.low < next.low && mid.high < prev.high && mid.high < next.high;
    if (!isTop && !isBottom) continue;
    raw.push({
      mergedIndex: i,
      barIndex: extremeBarIndex(candles, mid, isTop),
      price: isTop ? mid.high : mid.low,
      isTop,
      confirmBarIndex: next.endIndex,
    });
  }
  const result = [];
  for (const f of raw) {
    if (result.length && result[result.length - 1].isTop === f.isTop) {
      const last = result[result.length - 1];
      if (f.isTop ? f.price > last.price : f.price < last.price) result[result.length - 1] = f;
      continue;
    }
    result.push(f);
  }
  return result;
}

/* ───────────────────────── 3. 笔（新笔） ───────────────────────── */
const isMoreExtreme = (c, r) => c.isTop ? c.price > r.price : c.price < r.price;
const gapOk = (a, b, minGap) => b.mergedIndex - a.mergedIndex - 1 >= minGap;

function enforceGapBackwards(pts, minGap) {
  while (pts.length >= 2 && !gapOk(pts[pts.length - 2], pts[pts.length - 1], minGap)) {
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    pts.splice(pts.length - 2, 2);
    if (pts.length === 0) pts.push(isMoreExtreme(last, prev) ? last : prev);
    else if (isMoreExtreme(last, pts[pts.length - 1])) pts[pts.length - 1] = last;
  }
}

function buildAlternating(fractals, minGap) {
  const pts = [];
  for (const f of fractals) {
    if (!pts.length) { pts.push(f); continue; }
    const tail = pts[pts.length - 1];
    if (tail.isTop === f.isTop) {
      if (isMoreExtreme(f, tail)) { pts[pts.length - 1] = f; enforceGapBackwards(pts, minGap); }
      continue;
    }
    if (gapOk(tail, f, minGap)) { pts.push(f); continue; }
    if (pts.length >= 2) {
      const prev = pts[pts.length - 2];
      if (isMoreExtreme(f, prev)) {
        pts.splice(pts.length - 2, 2);
        pts.push(f);
        enforceGapBackwards(pts, minGap);
      }
    }
  }
  return pts;
}

function buildStrokes(fractals, minGap = MIN_MERGED_BARS_BETWEEN, margin = STABILITY_MARGIN_STROKES) {
  const pts = buildAlternating(fractals, minGap);
  const strokes = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const isUp = !a.isTop;
    const ssi = i - 1, lastIndex = pts.length - 2;
    const isConfirmed = ssi + margin <= lastIndex;
    const stableFrom = isConfirmed ? pts[ssi + margin + 1].confirmBarIndex : null;
    strokes.push({
      startBarIndex: a.barIndex, startPrice: a.price,
      endBarIndex: b.barIndex, endPrice: b.price,
      isUp, isConfirmed, stableFromBarIndex: stableFrom,
      high: Math.max(a.price, b.price), low: Math.min(a.price, b.price),
    });
  }
  return strokes;
}

/* ───────────────────────── 4. 笔中枢 ───────────────────────── */
function detectPivots(strokes) {
  const pivots = [];
  const inside = (s, zd, zg) => s.endPrice >= zd && s.endPrice <= zg;
  let i = 0;
  while (i + 2 < strokes.length) {
    const zg = Math.min(strokes[i].high, strokes[i + 1].high, strokes[i + 2].high);
    const zd = Math.max(strokes[i].low, strokes[i + 1].low, strokes[i + 2].low);
    if (zg <= zd) { i++; continue; }
    let end = i + 2, leaving = null;
    while (end + 1 < strokes.length) {
      if (inside(strokes[end + 1], zd, zg)) { end++; continue; }
      if (end + 2 < strokes.length && inside(strokes[end + 2], zd, zg)) { end += 2; continue; }
      leaving = end + 1;
      break;
    }
    pivots.push({
      zg, zd, startStrokeIndex: i, endStrokeIndex: end, strokeCount: end - i + 1,
      isConfirmed: leaving !== null, leavingStrokeIndex: leaving,
    });
    i = leaving !== null ? leaving : end + 1;
  }
  return pivots;
}

/* ───────────────────────── 5. 背驰（MACD 面积） ───────────────────────── */
function strokeArea(strokes, idx, hist) {
  if (idx < 0 || idx >= strokes.length) return 0;
  const s = strokes[idx];
  const from = Math.max(0, Math.min(s.startBarIndex, s.endBarIndex));
  const to = Math.min(hist.length - 1, Math.max(s.startBarIndex, s.endBarIndex));
  let sum = 0;
  for (let i = from; i <= to; i++) if (hist[i] != null) sum += Math.abs(hist[i]);
  return sum;
}

function findEnterStroke(strokes, leaveIndex) {
  for (let j = leaveIndex - 1; j >= 0; j--) if (strokes[j].isUp === strokes[leaveIndex].isUp) return j;
  return null;
}

function checkDivergence(strokes, pivot, hist, thr) {
  const leaveIndex = pivot.leavingStrokeIndex;
  if (leaveIndex == null) return null;
  const enter = findEnterStroke(strokes, leaveIndex);
  if (enter == null) return null;
  const es = strokes[enter], ls = strokes[leaveIndex];
  if (es.isUp !== ls.isUp) return null;
  const newExtreme = ls.isUp ? ls.high > es.high : ls.low < es.low;
  if (!newExtreme) return null;
  const enterArea = strokeArea(strokes, enter, hist);
  const leaveArea = strokeArea(strokes, leaveIndex, hist);
  if (enterArea <= 0) return null;
  const ratio = leaveArea / enterArea;
  if (ratio >= thr) return null;
  return { isUp: ls.isUp, areaRatio: ratio, enterArea, leaveArea, enterIndex: enter };
}

/* ───────────────────────── 次级别确认 ───────────────────────── */
function subLevelMatches(subCandles, subStrokes, refTime, acctTime, side, windowBars, strict) {
  let barSeconds = 0;
  if (subCandles.length >= 2) barSeconds = Math.max(1, subCandles[1].time - subCandles[0].time);
  const deadline = windowBars > 0 && barSeconds > 0 ? refTime + windowBars * barSeconds : acctTime;
  for (const s of subStrokes) {
    if (!s.isConfirmed || s.stableFromBarIndex == null) continue;
    const bar = s.stableFromBarIndex;
    if (bar < 0 || bar >= subCandles.length) continue;
    const t = subCandles[bar].time;
    if (t < refTime || t > acctTime || t > deadline) continue;
    if (strict && (s.endBarIndex == null || subCandles[s.endBarIndex].time < refTime)) continue;   // 严格：确认笔必须在参考点之后完成
    if (side === 'buy' ? s.isUp : !s.isUp) return s;
  }
  return null;
}

/* ───────────────────────── 6. 1/2/3 类买卖点 ───────────────────────── */
const fmt2 = x => String(+(+x).toFixed(2));   // 对应 C# 的 0.##

function signalTime(strokes, anchor, candles) {
  if (anchor < 0 || anchor >= strokes.length) return 0;
  const s = strokes[anchor];
  if (!s.isConfirmed || s.stableFromBarIndex == null) return 0;
  const b = s.stableFromBarIndex;
  return b >= 0 && b < candles.length ? candles[b].time : 0;
}

function isContaminated(pivot, strokes, warmupBars) {
  if (warmupBars <= 0) return false;
  if (pivot.startStrokeIndex < 0 || pivot.startStrokeIndex >= strokes.length) return true;
  return strokes[pivot.startStrokeIndex].startBarIndex < warmupBars;
}

function detectSignals(candles, strokes, pivots, hist, atrArr, ratioThr, warmupBars, subConfirm) {
  const real = [], ghosts = [], divergences = [];
  const buyAnchors = new Map(), sellAnchors = new Map();   // 1 类锚点：笔序号 → 是否处于暖机区

  const subOk = (anchor, side) => {
    if (!subConfirm) return true;
    if (anchor < 0 || anchor >= strokes.length) return false;
    const st = strokes[anchor];
    const refTime = st.endBarIndex >= 0 && st.endBarIndex < candles.length ? candles[st.endBarIndex].time : 0;
    const acct = signalTime(strokes, anchor, candles);
    if (refTime === 0 || acct === 0) return null;
    return subConfirm(refTime, acct, side);
  };

  // 落点：只接受不可修正的笔；时间/价格取稳定时点那根K线的收盘
  const make = (anchor, kind, side, ref, area, note) => {
    if (anchor < 0 || anchor >= strokes.length) return null;
    const st = strokes[anchor];
    if (!st.isConfirmed || st.stableFromBarIndex == null) return null;
    const sb = st.stableFromBarIndex;
    if (sb < 0 || sb >= candles.length) return null;
    const bar = candles[sb];
    const a = sb < atrArr.length && atrArr[sb] != null && atrArr[sb] > 0 ? atrArr[sb] : bar.close * 0.01;
    const stop = side === 'buy' ? ref - 0.5 * a : ref + 0.5 * a;
    const tradable = side === 'buy' ? stop < bar.close : stop > bar.close;
    return {
      tradable,
      p: { kind, side, time: bar.time, price: bar.close, referencePrice: ref, referenceBarIndex: st.endBarIndex,
           stopPrice: stop, areaRatio: area, note },
    };
  };

  // 过滤顺序：暖机 → 次级别 → 可交易性。返回 'real' | 'ghost' | null（锚点笔尚未稳定）
  const emit = (contam, anchor, kind, side, ref, area, note, extra) => {
    const c = make(anchor, kind, side, ref, area, note);
    if (!c) return null;
    if (extra) Object.assign(c.p, extra);
    if (contam) { ghosts.push({ ...c.p, reason: 'warmup' }); return 'ghost'; }
    const sub = subOk(anchor, side);
    if (!sub) { ghosts.push({ ...c.p, reason: 'sublevel' }); return 'ghost'; }
    if (sub !== true) c.p.subConfirm = sub;
    if (!c.tradable) { ghosts.push({ ...c.p, reason: 'untradable' }); return 'ghost'; }
    real.push(c.p);
    return 'real';
  };

  // 1 类
  pivots.forEach((pivot, pi) => {
    const contam = isContaminated(pivot, strokes, warmupBars);
    const dv = checkDivergence(strokes, pivot, hist, ratioThr);
    if (!dv) return;
    const leaveIndex = pivot.leavingStrokeIndex;
    divergences.push({
      pivotIndex: pi, leaveIndex, enterIndex: dv.enterIndex, isUp: dv.isUp,
      areaRatio: dv.areaRatio, enterArea: dv.enterArea, leaveArea: dv.leaveArea, warmup: contam,
    });
    const stroke = strokes[leaveIndex];
    const isUp = dv.isUp;
    const kind = isUp ? '1卖' : '1买', side = isUp ? 'sell' : 'buy';
    const reference = isUp ? stroke.high : stroke.low;
    const note = `MACD 面积背驰 ${dv.areaRatio.toFixed(2)}，参考${isUp ? '高点' : '低点'} ${fmt2(reference)}`;
    (isUp ? sellAnchors : buyAnchors).set(leaveIndex, contam);
    const en = strokes[dv.enterIndex];
    emit(contam, leaveIndex, kind, side, reference, dv.areaRatio, note, {
      cmp: { kind: 'div',
        a: { b0: en.startBarIndex, b1: en.endBarIndex, price: isUp ? en.high : en.low, area: dv.enterArea, label: '进入笔' },
        b: { b0: stroke.startBarIndex, b1: stroke.endBarIndex, price: reference, area: dv.leaveArea, label: '离开笔' } },
    });
  });

  // 2 类：1 类之后的首次回抽不破
  for (const [k, contam] of buyAnchors) {
    if (k + 2 >= strokes.length) continue;
    const a = strokes[k], b = strokes[k + 1], c = strokes[k + 2];
    if (a.isUp || !b.isUp || c.isUp) continue;
    if (c.low <= a.low) continue;
    emit(contam, k + 2, '2买', 'buy', c.low, null, `1买后回抽不破前低 ${fmt2(a.low)}，回抽低点 ${fmt2(c.low)}`, {
      cmp: { kind: 'pull', a: { b0: a.startBarIndex, b1: a.endBarIndex, price: a.low, label: '前低（1买结构低点）' }, b: { b0: c.startBarIndex, b1: c.endBarIndex, price: c.low, label: '回抽低点' } },
    });
  }
  for (const [k, contam] of sellAnchors) {
    if (k + 2 >= strokes.length) continue;
    const a = strokes[k], b = strokes[k + 1], c = strokes[k + 2];
    if (!a.isUp || b.isUp || !c.isUp) continue;
    if (c.high >= a.high) continue;
    emit(contam, k + 2, '2卖', 'sell', c.high, null, `1卖后回抽不破前高 ${fmt2(a.high)}，回抽高点 ${fmt2(c.high)}`, {
      cmp: { kind: 'pull', a: { b0: a.startBarIndex, b1: a.endBarIndex, price: a.high, label: '前高（1卖结构高点）' }, b: { b0: c.startBarIndex, b1: c.endBarIndex, price: c.high, label: '反抽高点' } },
    });
  }

  // 3 类：突破中枢后回抽不回中枢（每个中枢每侧只取首个真实信号）
  for (const pivot of pivots) {
    if (!pivot.isConfirmed) continue;
    const contam = isContaminated(pivot, strokes, warmupBars);
    let buyDone = false, sellDone = false;
    for (let i = pivot.endStrokeIndex + 1; i + 1 < strokes.length && !(buyDone && sellDone); i++) {
      const leave = strokes[i], pull = strokes[i + 1];
      if (!buyDone && leave.isUp && leave.high > pivot.zg && !pull.isUp && pull.low > pivot.zg) {
        const r = emit(contam, i + 1, '3买', 'buy', pull.low, null,
          `突破中枢上沿 ${fmt2(pivot.zg)} 后回抽不回中枢，回抽低点 ${fmt2(pull.low)}`,
          { refPivot: { zg: pivot.zg, zd: pivot.zd },
            cmp: { kind: 'level', level: pivot.zg, levelLabel: 'ZG', a: { b0: pull.startBarIndex, b1: pull.endBarIndex, price: pull.low, label: '回抽笔低点' } } });
        if (r === 'real' || (contam && r === 'ghost')) buyDone = true;
      }
      if (!sellDone && !leave.isUp && leave.low < pivot.zd && pull.isUp && pull.high < pivot.zd) {
        const r = emit(contam, i + 1, '3卖', 'sell', pull.high, null,
          `跌破中枢下沿 ${fmt2(pivot.zd)} 后回抽不回中枢，回抽高点 ${fmt2(pull.high)}`,
          { refPivot: { zg: pivot.zg, zd: pivot.zd },
            cmp: { kind: 'level', level: pivot.zd, levelLabel: 'ZD', a: { b0: pull.startBarIndex, b1: pull.endBarIndex, price: pull.high, label: '反抽笔高点' } } });
        if (r === 'real' || (contam && r === 'ghost')) sellDone = true;
      }
    }
  }

  // 同一笔上至多保留一个信号（优先 1 类），按时间排序
  const key = p => p.referenceBarIndex + '|' + p.side;
  const dedupe = list => {
    const groups = new Map();
    for (const p of list) { const g = groups.get(key(p)); if (!g || p.kind < g.kind) groups.set(key(p), p); }
    return [...groups.values()].sort((a, b) => a.time - b.time);
  };
  const points = dedupe(real);
  const realKeys = new Set(points.map(key));
  return { points, ghosts: dedupe(ghosts.filter(g => !realKeys.has(key(g)))), divergences };
}

/* ───────────────────────── 单窗口分析 ───────────────────────── */
function takeLast(items, max) { return items.length <= max ? items : items.slice(items.length - max); }

function analyze(candles, userOpts, subCandles) {
  const o = { ...DEFAULT_OPTIONS, ...userOpts };
  const n = candles.length;
  const closes = new Array(n), highs = new Array(n), lows = new Array(n);
  for (let k = 0; k < n; k++) { closes[k] = candles[k].close; highs[k] = candles[k].high; lows[k] = candles[k].low; }
  const hist = macd(closes).hist;
  const atrArr = atr(highs, lows, closes, 14);

  const merged = mergeInclusion(candles);
  const fractals = detectFractals(merged, candles);
  const strokes = buildStrokes(fractals);
  const pivots = detectPivots(strokes);

  let subConfirm = null;
  if (o.enabled && o.requireSubLevelConfirm && subCandles && subCandles.length > 50) {
    const sm = mergeInclusion(subCandles);
    const sf = detectFractals(sm, subCandles);
    const ss = buildStrokes(sf);
    const winBars = Math.max(1, o.subLevelConfirmWindowBars);
    const barSec = subCandles.length >= 2 ? Math.max(1, subCandles[1].time - subCandles[0].time) : 0;
    subConfirm = (refTime, acctTime, side) => {
      const st = subLevelMatches(subCandles, ss, refTime, acctTime, side, winBars);
      if (!st) return null;
      const stableTime = subCandles[st.stableFromBarIndex].time;
      return {
        isUp: st.isUp,
        startTime: subCandles[st.startBarIndex].time, endTime: subCandles[st.endBarIndex].time,
        startPrice: st.startPrice, endPrice: st.endPrice,
        stableTime,                          /* 次级别笔变成“不可再改”的那根次级别K线 */
        stableAfterBars: barSec ? Math.round((stableTime - refTime) / barSec) : null,
        windowBars: winBars,
      };
    };
  }

  const sig = o.enabled
    ? detectSignals(candles, strokes, pivots, hist, atrArr, o.divergenceAreaRatio, o.warmupBars, subConfirm)
    : { points: [], ghosts: [], divergences: [] };

  return {
    merged, fractals, strokes, pivots,
    divergences: sig.divergences,
    points: takeLast(sig.points, o.maxPoints),
    ghosts: sig.ghosts,
  };
}

/* ───────────────────────── 逐根回放 ───────────────────────── */
/**
 * main：本级别K线；sub：次级别K线（可为 null，按时间升序）。
 * 第 i 帧只使用 main[0..i] 与 time ≤ main[i].time 的 sub（无未来函数）。
 * 只收录"记账时间 == 当前K线"的信号——与 ChanBackfill 一致。
 */
function replay(main, sub, userOpts) {
  const o = { ...DEFAULT_OPTIONS, ...userOpts };
  const W = Math.max(120, o.analysisBars);
  const snaps = [], signals = [], ghosts = [];
  const seenSig = new Map();   // kind|side|锚定笔 → 1=已按真实信号记过 / 0=已按 ghost 记过
  let subEnd = 0;

  for (let i = 0; i < main.length; i++) {
    const barTime = main[i].time;
    const off = Math.max(0, i + 1 - W);                      // 工程约定 E2：扩展窗口
    const win = main.slice(off, i + 1);

    let subWin = null;
    if (sub && sub.length) {
      while (subEnd < sub.length && sub[subEnd].time <= barTime) subEnd++;
      if (subEnd > 60) subWin = sub.slice(Math.max(0, subEnd - SUB_WINDOW_BARS), subEnd);
    }

    const r = analyze(win, o, subWin);
    const conv = (p, reason) => {
      const s = {
        kind: p.kind, side: p.side, time: p.time, price: p.price,
        refPrice: p.referencePrice, stopPrice: p.stopPrice, areaRatio: p.areaRatio, note: p.note,
        gRef: p.referenceBarIndex + off, gConfirm: i,
      };
      if (p.subConfirm) s.subConfirm = p.subConfirm;
      if (p.refPivot) s.refPivot = p.refPivot;
      if (p.cmp) {
        const c = { ...p.cmp };
        for (const k of ['a', 'b']) if (c[k]) c[k] = { ...c[k], b0: c[k].b0 + off, b1: c[k].b1 + off };
        s.cmp = c;
      }
      if (reason) s.reason = reason;
      return s;
    };
    /* 同一结构（kind|side|锚定笔）只记一次：稳定时点会随 pts[ssi+3] 被替换而后移，
       早期实现会在每个新时点把同一笔重发一遍，图上就出现“两个二买、同一个极值”。 */
    const seenKey = p => p.kind + '|' + p.side + '|' + (p.referenceBarIndex + off);
    const sig = [], gh = [];
    for (const p of r.points) {
      if (p.time !== barTime) continue;
      const k = seenKey(p);
      if (seenSig.get(k) === 1) continue;        // 已经按真实信号记过；ghost→real 允许升级
      seenSig.set(k, 1);
      sig.push(conv(p));
    }
    for (const p of r.ghosts) {
      if (p.time !== barTime) continue;
      const k = seenKey(p);
      if (seenSig.has(k)) continue;              // real / ghost 都只保留最早一次
      seenSig.set(k, 0);
      gh.push(conv(p, p.reason));
    }
    signals.push(...sig);
    ghosts.push(...gh);

    snaps.push({
      i, off,
      res: { merged: r.merged, fractals: r.fractals, strokes: r.strokes, pivots: r.pivots, divergences: r.divergences },
      sig, gh,
    });
  }
  return { snaps, signals, ghosts };
}

/* ───────────────────────── 事件差分 ───────────────────────── */
const STRUCT = new Set(['fractal', 'stroke', 'pivot', 'pivotLeave', 'divergence', 'signal', 'ghost']);
const EMPTY = { merged: [], fractals: [], strokes: [], pivots: [], divergences: [] };
const fm = x => x == null ? '-' : (+x).toFixed(2);
const REASON = { warmup: '暖机隔离', sublevel: '次级别未确认', untradable: '不可交易（止损在入场价反侧）' };

function diffEvents(prev, cur) {
  const ev = [];
  if (!cur) return ev;
  const i = cur.i, co = cur.off, cr = cur.res;
  const po = prev ? prev.off : 0, pr = prev ? prev.res : EMPTY;

  // 包含：当前K线并入了前一根合并K线
  const lm = cr.merged[cr.merged.length - 1];
  if (lm) {
    const gs = lm.startIndex + co, ge = lm.endIndex + co;
    if (ge === i && gs < ge) {
      ev.push({ t: 'merge', text: `#${i} 与 #${gs}${ge - gs > 1 ? '…#' + (ge - 1) : ''} 存在包含关系，合并为一根（${lm.isUp ? '向上取高高' : '向下取低低'}）：高 ${fm(lm.high)} 低 ${fm(lm.low)}` });
    }
  }

  // 分型：出现 / 被修正
  const fk = (f, o) => `${f.barIndex + o}|${f.isTop ? 1 : 0}`;
  const prevF = new Set(pr.fractals.map(f => fk(f, po)));
  const curF = new Set(cr.fractals.map(f => fk(f, co)));
  for (const f of cr.fractals) {
    if (prevF.has(fk(f, co))) continue;
    const gb = f.barIndex + co, gc = f.confirmBarIndex + co;
    ev.push({ t: 'fractal', text: `${f.isTop ? '顶' : '底'}分型 @#${gb}（${fm(f.price)}），可知于 #${gc}（发生→确认 ${gc - gb} 根）` });
  }
  for (const f of pr.fractals) {
    if (f.barIndex + po < co || curF.has(fk(f, po))) continue;
    ev.push({ t: 'fractal-', text: `${f.isTop ? '顶' : '底'}分型 @#${f.barIndex + po} 被修正（后续K线并入或被更极端者取代）` });
  }

  // 笔：新增 / 修正 / 稳定 / 撤销（按起点或终点匹配新旧笔）
  const sKey = (s, o) => `${s.startBarIndex + o}|${s.isUp ? 1 : 0}`;
  const eKey = (s, o) => `${s.endBarIndex + o}|${s.isUp ? 1 : 0}`;
  const pStart = new Map(pr.strokes.map(s => [sKey(s, po), s]));
  const pEnd = new Map(pr.strokes.map(s => [eKey(s, po), s]));
  const cStart = new Set(cr.strokes.map(s => sKey(s, co)));
  const cEnd = new Set(cr.strokes.map(s => eKey(s, co)));
  for (const s of cr.strokes) {
    const gs = s.startBarIndex + co, ge = s.endBarIndex + co, arrow = s.isUp ? '↑' : '↓';
    const old = pStart.get(sKey(s, co)) || pEnd.get(eKey(s, co));
    if (!old) {
      ev.push({ t: 'stroke', text: `新笔 ${arrow} #${gs}→#${ge}（${fm(s.startPrice)}→${fm(s.endPrice)}）` });
      continue;
    }
    const og = old.startBarIndex + po, oe = old.endBarIndex + po;
    if (og !== gs || oe !== ge) {
      ev.push({ t: 'stroke~', text: `笔 ${arrow} 修正：#${og}→#${oe} 变为 #${gs}→#${ge}（${fm(old.endPrice)}→${fm(s.endPrice)}）` });
    }
    if (s.isConfirmed && !old.isConfirmed) {
      ev.push({ t: 'stable', text: `笔 ${arrow} #${gs}→#${ge} 稳定：身后已有 ≥2 笔，自 #${s.stableFromBarIndex + co} 起不可再被修正` });
    }
  }
  for (const s of pr.strokes) {
    if (s.startBarIndex + po < co) continue;
    if (cStart.has(sKey(s, po)) || cEnd.has(eKey(s, po))) continue;
    ev.push({ t: 'stroke~', text: `笔 ${s.isUp ? '↑' : '↓'} #${s.startBarIndex + po}→#${s.endBarIndex + po} 被撤销（并入更长的笔或结构重构）` });
  }

  // 中枢：形成 / 延伸 / 区间修正 / 离开
  const pvKey = (p, r, o) => { const a = r.strokes[p.startStrokeIndex]; return a ? a.startBarIndex + o : -1; };
  const pm = new Map(pr.pivots.map(p => [pvKey(p, pr, po), p]));
  for (const p of cr.pivots) {
    const old = pm.get(pvKey(p, cr, co));
    if (!old) {
      ev.push({ t: 'pivot', text: `中枢形成 ZD ${fm(p.zd)} – ZG ${fm(p.zg)}，${p.strokeCount} 笔（笔 ${p.startStrokeIndex}–${p.endStrokeIndex}）` });
      continue;
    }
    if (old.zg !== p.zg || old.zd !== p.zd) {
      ev.push({ t: 'pivot~', text: `中枢区间修正：[${fm(old.zd)}, ${fm(old.zg)}] → [${fm(p.zd)}, ${fm(p.zg)}]` });
    }
    if (p.strokeCount > old.strokeCount) {
      ev.push({ t: 'pivot~', text: `中枢延伸至 ${p.strokeCount} 笔（ZD ${fm(p.zd)} – ZG ${fm(p.zg)}）` });
    }
    if (!old.isConfirmed && p.isConfirmed) {
      const ls = cr.strokes[p.leavingStrokeIndex];
      ev.push({ t: 'pivotLeave', text: `中枢离开：笔 ${p.leavingStrokeIndex}${ls ? '（' + (ls.isUp ? '向上' : '向下') + '，终点 ' + fm(ls.endPrice) + '）' : ''} 离开 [${fm(p.zd)}, ${fm(p.zg)}]` });
    }
  }

  // 背驰
  const dKey = (d, r, o) => { const s = r.strokes[d.leaveIndex]; return s ? `${s.endBarIndex + o}|${d.isUp ? 1 : 0}` : ''; };
  const pd = new Set(pr.divergences.map(d => dKey(d, pr, po)));
  for (const d of cr.divergences) {
    if (pd.has(dKey(d, cr, co))) continue;
    ev.push({ t: 'divergence', text: `${d.isUp ? '顶' : '底'}背驰：离开段面积 ${fm(d.leaveArea)} / 进入段 ${fm(d.enterArea)} = ${d.areaRatio.toFixed(2)}${d.warmup ? '（位于暖机区，不出信号）' : ''}` });
  }

  // 买卖点 / 被过滤
  for (const s of cur.sig || []) {
    ev.push({ t: 'signal', text: `${s.kind}（${s.side === 'buy' ? '买' : '卖'}）记账 @${fm(s.price)}；结构极值 #${s.gRef}（${fm(s.refPrice)}）→ 确认 #${s.gConfirm}，延迟 ${s.gConfirm - s.gRef} 根；止损参考 ${fm(s.stopPrice)}；${s.note}` });
  }
  for (const s of cur.gh || []) {
    ev.push({ t: 'ghost', text: `${s.kind}（${s.side === 'buy' ? '买' : '卖'}）结构成立但被过滤：${REASON[s.reason] || s.reason}；结构极值 #${s.gRef}（${fm(s.refPrice)}）→ #${s.gConfirm}；${s.note}` });
  }
  return ev;
}

const api = {
  DEFAULT_OPTIONS, STRUCT, REASON,
  analyze, replay, diffEvents, subLevelMatches,
  ema, macd, rma, atr,
  mergeInclusion, detectFractals, buildStrokes, detectPivots, checkDivergence, detectSignals,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
return api;
})();
