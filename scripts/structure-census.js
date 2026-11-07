/* ============================================================================
 * structure-census.js — 缠论结构 + 标注普查（终态口径，analyze 一次出全量结构）
 *
 * census(bars) 返回三组统计量（真实与对照两侧同法，公平对比）：
 *   结构：笔密度/笔长/笔幅、中枢频率/持续笔数/区间宽度、背驰频率/面积比
 *   标注：分型密度/确认延迟、笔确认延迟（身后两笔）、中枢确认率、标注总负载
 * 对照口径 = 收益块序重排（见 chan-stats._bootstrapPath）。
 * 终态口径含未来修正；"当时可知"口径的信号统计见 stats-run.js / chan-stats.replaySignals。
 * 作为库：require 后取 .census；直接运行：node structure-census.js [目录] [对照次数]
 * ============================================================================ */
'use strict';
const E = require('../chan-engine.js');
const St = require('./chan-stats.js');

const OPTS = { ...E.DEFAULT_OPTIONS, requireSubLevelConfirm: false };
const quantile = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;

function census(bars) {
  const r = E.analyze(bars, OPTS, null);
  const nb = bars.length, k = 1000 / nb;
  const slen = r.strokes.map(s => s.endBarIndex - s.startBarIndex + 1);
  const samp = r.strokes.map(s => Math.abs(Math.log(s.endPrice / s.startPrice)));
  const pivots = r.pivots;
  const pWidth = pivots.map(p => Math.log(p.zg / p.zd));
  const dvReal = r.divergences.filter(d => !d.warmup);
  const ar = dvReal.map(d => d.areaRatio);
  /* 标注延迟：分型确认 = confirmBarIndex − barIndex；笔确认 = stableFromBarIndex − endBarIndex（身后两笔） */
  const fDelay = r.fractals.map(f => f.confirmBarIndex - f.barIndex).filter(x => isFinite(x) && x >= 0);
  const sDelay = r.strokes.filter(s => s.isConfirmed && s.stableFromBarIndex != null).map(s => s.stableFromBarIndex - s.endBarIndex).filter(x => x >= 0);
  return {
    bars: nb,
    /* 结构 */
    strokesPer1k: r.strokes.length * k,
    slen: { mean: mean(slen), p50: quantile(slen, 0.5), p90: quantile(slen, 0.9), max: Math.max(...slen) },
    sampMed: quantile(samp, 0.5), sampP90: quantile(samp, 0.9),
    pivotsPer1k: pivots.length * k,
    pivotStrokes: { mean: mean(pivots.map(p => p.strokeCount)), max: Math.max(...pivots.map(p => p.strokeCount)) },
    pivotWidthMed: quantile(pWidth, 0.5),
    dvPer1k: dvReal.length * k,
    areaRatio: { n: ar.length, med: quantile(ar, 0.5), p90: quantile(ar, 0.9) },
    /* 标注 */
    fractalsPer1k: r.fractals.length * k,
    topFrac: mean(r.fractals.map(f => f.isTop ? 1 : 0)),
    fractalDelay: { med: quantile(fDelay, 0.5), p90: quantile(fDelay, 0.9) },
    strokeDelay: { med: quantile(sDelay, 0.5), p90: quantile(sDelay, 0.9), max: sDelay.length ? Math.max(...sDelay) : NaN },
    pivotConfirmRate: pivots.length ? pivots.filter(p => p.isConfirmed).length / pivots.length : NaN,
    marksPer1k: (r.fractals.length + r.strokes.length + pivots.length + dvReal.length) * k,
  };
}

/* ───────────────────────── CLI ───────────────────────── */
function runCLI() {
  const dir = process.argv[2] || './data/kline';
  const NPERM = +(process.argv[3] || 20);
  const Csv = require('../chan-csv.js');
  const real = Csv.loadDirSync(dir).candles;
  const C = census(real);
  console.log(`\n【真实】${C.bars} 根`);
  console.log(`  结构：笔 ${C.strokesPer1k.toFixed(1)}/千根（长 mean ${C.slen.mean.toFixed(1)} p90 ${C.slen.p90}）；笔幅 p50 ${(C.sampMed * 100).toFixed(2)}%；中枢 ${C.pivotsPer1k.toFixed(1)}/千根（持续 ${C.pivotStrokes.mean.toFixed(1)} 笔）；背驰 ${C.dvPer1k.toFixed(1)}/千根`);
  console.log(`  标注：分型 ${C.fractalsPer1k.toFixed(0)}/千根（确认延迟 p50 ${C.fractalDelay.med} p90 ${C.fractalDelay.p90}）；笔确认延迟 p50 ${C.strokeDelay.med} p90 ${C.strokeDelay.p90} max ${C.strokeDelay.max}；中枢确认率 ${(C.pivotConfirmRate * 100).toFixed(0)}%；标注负载 ${C.marksPer1k.toFixed(0)}/千根`);

  let a = 987654321; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const perms = [];
  for (let b = 0; b < NPERM; b++) perms.push(census(St._bootstrapPath(real, rnd, 10)));
  const agg = key => { const v = perms.map(p => key(p)).filter(x => isFinite(x)); return { mean: mean(v), min: Math.min(...v), max: Math.max(...v) }; };
  const fmt = (a2, d = 2, s = 1) => `${(a2.mean * s).toFixed(d)}（${(a2.min * s).toFixed(d)} ~ ${(a2.max * s).toFixed(d)}）`;
  console.log(`\n【无时序结构对照】${NPERM} 条（均值（min~max））`);
  console.log(`  笔：${fmt(agg(c => c.strokesPer1k), 1)}（真实 ${C.strokesPer1k.toFixed(1)}）；笔长 mean ${fmt(agg(c => c.slen.mean), 1)}（真实 ${C.slen.mean.toFixed(1)}）；笔幅 p50 ${fmt(agg(c => c.sampMed), 2, 100)}%（真实 ${(C.sampMed * 100).toFixed(2)}%）`);
  console.log(`  中枢：${fmt(agg(c => c.pivotsPer1k), 1)}（真实 ${C.pivotsPer1k.toFixed(1)}）；持续笔数 ${fmt(agg(c => c.pivotStrokes.mean), 2)}（真实 ${C.pivotStrokes.mean.toFixed(1)}）；背驰 ${fmt(agg(c => c.dvPer1k), 2)}（真实 ${C.dvPer1k.toFixed(1)}）`);
  console.log(`  分型：${fmt(agg(c => c.fractalsPer1k), 0)}（真实 ${C.fractalsPer1k.toFixed(0)}）；笔确认延迟 p50 ${fmt(agg(c => c.strokeDelay.med), 1)}（真实 ${C.strokeDelay.med}）；标注负载 ${fmt(agg(c => c.marksPer1k), 0)}（真实 ${C.marksPer1k.toFixed(0)}）`);
}

if (require.main === module) runCLI();

module.exports = { census, OPTS, quantile, mean };
