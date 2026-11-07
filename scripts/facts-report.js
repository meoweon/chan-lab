/* ============================================================================
 * facts-report.js — 真实行情统计特征综合报告（三组特征）
 *
 * 一、噪声统计特征（数据本身，描述性，无对照）：收益分布形态（偏度/峰度/尾部）、
 *     时序结构（收益自相关、|r| 自相关=波动率聚集、方差比）、同向游程、跳空、
 *     影线占比、整数千关口聚簇、量价相关、波动率的波动。
 * 二、缠论结构特征（终态口径）：笔/中枢/背驰的密度与分布，对照 = 收益块序重排
 *     （保留肥尾/漂移/波动聚集的边际分布，打掉块长以上的时序结构）。
 * 三、标注统计特征（当时可知口径，逐根回放）：分型/笔/中枢/背驰/信号的标注密度、
 *     分型与笔的确认延迟、信号确认延迟（结构极值→记账）、ghost 过滤构成、
 *     信号间隔（突发性），同样带对照。
 * 用法：node facts-report.js [K线目录] [对照次数=20] [--out 报告.md]
 * ============================================================================ */
'use strict';
const fs = require('fs');
const E = require('../chan-engine.js');
const Csv = require('../chan-csv.js');
const St = require('./chan-stats.js');
const { census, quantile, mean } = require('./structure-census.js');

/* ── 一、噪声统计特征 ── */
function noiseFacts(bars) {
  const r = [];
  for (let i = 1; i < bars.length; i++) r.push(Math.log(bars[i].close / bars[i - 1].close));
  const m = mean(r), sd = Math.sqrt(r.reduce((x, y) => x + (y - m) * (y - m), 0) / (r.length - 1));
  const z = r.map(x => (x - m) / sd);
  const skew = mean(z.map(x => x ** 3)), kurt = mean(z.map(x => x ** 4)) - 3;
  const tail = t => r.filter(x => Math.abs(x - m) > t * sd).length / r.length;
  const acf = (a, k2) => { const mm = mean(a); let n0 = 0, d = 0; for (let i = 0; i < a.length; i++) { d += (a[i] - mm) ** 2; if (i + k2 < a.length) n0 += (a[i] - mm) * (a[i + k2] - mm); } return n0 / d; };
  const vr = k2 => { const agg = []; for (let i = k2 - 1; i < r.length; i++) { let s = 0; for (let j = 0; j < k2; j++) s += r[i - j]; agg.push(s); } const mm = mean(agg), v = agg.reduce((x, y) => x + (y - mm) ** 2, 0) / (agg.length - 1); return v / (k2 * sd * sd); };
  /* 同向游程 */
  const rl = []; let cur = 1;
  for (let i = 2; i < bars.length; i++) { const up = bars[i].close >= bars[i - 1].close, pu = bars[i - 1].close >= bars[i - 2].close; if (up === pu) cur++; else { rl.push(cur); cur = 1; } }
  rl.push(cur);
  /* ATR / 跳空 / 影线 */
  const tr = bars.map((b, i) => i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)));
  let a14 = mean(tr.slice(0, 14)); const atr = [];
  for (let i = 14; i < bars.length; i++) { a14 = (a14 * 13 + tr[i]) / 14; atr.push(a14); }
  let gaps = 0;
  for (let i = 15; i < bars.length; i++) if (Math.abs(bars[i].open - bars[i - 1].close) > 0.5 * atr[i - 14]) gaps++;
  const wick = mean(bars.map(b => (b.high - b.low) > 0 ? (b.high - Math.max(b.open, b.close) + Math.min(b.open, b.close) - b.low) / (b.high - b.low) : 0));
  /* 整数千关口聚簇：收盘价落在 1000 的整数倍 ±0.05% 内的比例（对照基准 ≈ 0.1%） */
  const nearRound = bars.filter(b => Math.abs(b.close / 1000 - Math.round(b.close / 1000)) * 1000 / b.close < 0.0005).length / bars.length;
  /* 量价相关 */
  let volCorr = null;
  if (bars[0].volume !== undefined && bars[0].volume > 0) {
    const A = r.map(Math.abs), V = bars.slice(1).map(b => b.volume), mA = mean(A), mV = mean(V);
    const cov = A.reduce((s, x, i) => s + (x - mA) * (V[i] - mV), 0) / (A.length - 1);
    volCorr = cov / Math.sqrt(A.reduce((x, y) => x + (y - mA) ** 2, 0) / (A.length - 1) * V.reduce((x, y) => x + (y - mV) ** 2, 0) / (V.length - 1));
  }
  /* 波动率的波动：20 根滚动实现波动率的离散系数 */
  const roll = [];
  for (let i = 20; i <= r.length; i += 20) roll.push(Math.sqrt(r.slice(i - 20, i).reduce((x, y) => x + y * y, 0)));
  const rm = mean(roll), volOfVol = Math.sqrt(roll.reduce((x, y) => x + (y - rm) ** 2, 0) / (roll.length - 1)) / rm;
  return { n: bars.length, skew, kurt, tail3: tail(3), tail5: tail(5), acf1: acf(r, 1), acf3: acf(r, 3), acfAbs1: acf(r.map(Math.abs), 1), acfAbs5: acf(r.map(Math.abs), 5), acfAbs20: acf(r.map(Math.abs), 20), acfAbs60: acf(r.map(Math.abs), 60), vr2: vr(2), vr5: vr(5), vr20: vr(20), vr60: vr(60), rlMean: mean(rl), rl3: rl.filter(x => x >= 3).length / rl.length, rlMax: Math.max(...rl), gapPct: gaps / (bars.length - 15), wick, nearRound, volCorr, volOfVol };
}

/* ── 三、标注统计特征（当时可知口径）── */
function labelFacts(bars) {
  const run = St.replaySignals(bars, null, { ...E.DEFAULT_OPTIONS, requireSubLevelConfirm: false });
  const k = 1000 / bars.length;
  const delays = run.signals.map(s => s.gConfirm - s.gRef).filter(x => x >= 0);
  const spacing = [];
  for (let i = 1; i < run.signals.length; i++) spacing.push(run.signals[i].gConfirm - run.signals[i - 1].gConfirm);
  const byKind = {}, byReason = {};
  for (const s of run.signals) byKind[s.kind] = (byKind[s.kind] || 0) + 1;
  for (const g of run.ghosts) byReason[g.reason || 'unknown'] = (byReason[g.reason || 'unknown'] || 0) + 1;
  return {
    sigPer1k: run.signals.length * k, nSig: run.signals.length, byKind,
    ghostPer1k: run.ghosts.length * k, nGhost: run.ghosts.length, byReason,
    filterRate: (run.signals.length + run.ghosts.length) ? run.ghosts.length / (run.signals.length + run.ghosts.length) : NaN,
    delay: { med: quantile(delays, 0.5), p90: quantile(delays, 0.9) },
    spacingMed: quantile(spacing, 0.5),
  };
}

/* ── 汇总与渲染 ── */
const aggOf = (perms, key) => { const v = perms.map(key).filter(x => isFinite(x)); return v.length ? { mean: mean(v), min: Math.min(...v), max: Math.max(...v) } : null; };
const fmt = (a, d = 2, s = 1) => a ? `${(a.mean * s).toFixed(d)}（${(a.min * s).toFixed(d)} ~ ${(a.max * s).toFixed(d)}）` : '—';
const inRange = (v, a) => a ? (v >= a.min && v <= a.max ? '区间内' : (v > a.max ? '**高于上缘**' : '**低于下缘**')) : '—';

function run() {
  const dirArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
  const dir = process.argv[2] || './data/kline';
  const NPERM = +(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 20);
  const outIdx = process.argv.indexOf('--out');
  const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : null;

  const real = Csv.loadDirSync(dir).candles;
  const nf = noiseFacts(real);
  const C = census(real);
  const L = labelFacts(real);
  console.error(`[facts] 真实 ${C.bars} 根；对照 ${NPERM} 条（每条 = analyze + 逐根回放）…`);

  let a = 987654321; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const permsC = [], permsL = [];
  for (let b = 0; b < NPERM; b++) {
    const path = St._bootstrapPath(real, rnd, 10);
    permsC.push(census(path));
    permsL.push(labelFacts(path));
    if ((b + 1) % 5 === 0) console.error(`[facts]   …${b + 1}/${NPERM}`);
  }

  const pct = x => (x * 100).toFixed(2) + '%';
  let md = `# 真实行情统计特征报告\n\n- 数据：${dir}，${C.bars} 根；对照 = 收益块序重排 × ${NPERM}（块长 10，收益多重集精确保留）\n`;
  md += `- 结构为终态口径（含未来修正，两侧同法公平对比）；标注为当时可知口径（逐根回放、只记账当根）\n\n`;

  md += `## 一、噪声统计特征（数据本身，描述性）\n\n`;
  md += `| 特征 | 值 | 特征 | 值 |\n|---|---|---|---|\n`;
  md += `| 收益偏度 | ${nf.skew.toFixed(2)} | 收益峰度（超额） | **${nf.kurt.toFixed(1)}**（正态=0） |\n`;
  md += `| \\|r\\|>3σ 占比 | ${pct(nf.tail3)}（正态≈0.27%） | \\|r\\|>5σ 占比 | ${pct(nf.tail5)}（正态≈0.00006%） |\n`;
  md += `| 收益自相关 lag1/3 | ${nf.acf1.toFixed(3)} / ${nf.acf3.toFixed(3)} | \\|r\\| 自相关 lag1/5/20/60 | ${nf.acfAbs1.toFixed(2)} / ${nf.acfAbs5.toFixed(2)} / ${nf.acfAbs20.toFixed(2)} / ${nf.acfAbs60.toFixed(2)} |\n`;
  md += `| 方差比 VR(2/5/20/60) | ${nf.vr2.toFixed(2)} / ${nf.vr5.toFixed(2)} / ${nf.vr20.toFixed(2)} / ${nf.vr60.toFixed(2)} | 同向游程 mean / P(≥3) / max | ${nf.rlMean.toFixed(2)} / ${pct(nf.rl3)} / ${nf.rlMax} |\n`;
  md += `| 跳空率（>0.5·ATR） | ${pct(nf.gapPct)} | 影线占比（均值） | ${nf.wick.toFixed(3)} |\n`;
  md += `| 千关口聚簇（±0.05%） | ${pct(nf.nearRound)}（均匀基准≈0.1%） | corr(\\|r\\|, 成交量) | ${nf.volCorr == null ? '无量数据' : nf.volCorr.toFixed(3)} |\n`;
  md += `| 波动率的波动（20根滚动RV 离散系数） | ${nf.volOfVol.toFixed(2)} | | | |\n\n`;

  md += `## 二、缠论结构特征（终态口径，vs 对照）\n\n`;
  md += `| 特征 | 真实 | 对照 均值（min~max） | 判定 |\n|---|---|---|---|\n`;
  md += `| 笔密度 /千根 | ${C.strokesPer1k.toFixed(1)} | ${fmt(aggOf(permsC, c => c.strokesPer1k), 1)} | ${inRange(C.strokesPer1k, aggOf(permsC, c => c.strokesPer1k))} |\n`;
  md += `| 笔长 mean（根） | ${C.slen.mean.toFixed(1)} | ${fmt(aggOf(permsC, c => c.slen.mean), 1)} | ${inRange(C.slen.mean, aggOf(permsC, c => c.slen.mean))} |\n`;
  md += `| 笔幅 p50 | ${pct(C.sampMed)} | ${fmt(aggOf(permsC, c => c.sampMed), 2, 100)}% | ${inRange(C.sampMed, aggOf(permsC, c => c.sampMed))} |\n`;
  md += `| 中枢频率 /千根 | ${C.pivotsPer1k.toFixed(1)} | ${fmt(aggOf(permsC, c => c.pivotsPer1k), 1)} | ${inRange(C.pivotsPer1k, aggOf(permsC, c => c.pivotsPer1k))} |\n`;
  md += `| 中枢持续笔数 mean | ${C.pivotStrokes.mean.toFixed(1)} | ${fmt(aggOf(permsC, c => c.pivotStrokes.mean), 2)} | ${inRange(C.pivotStrokes.mean, aggOf(permsC, c => c.pivotStrokes.mean))} |\n`;
  md += `| 背驰频率 /千根 | ${C.dvPer1k.toFixed(1)} | ${fmt(aggOf(permsC, c => c.dvPer1k), 2)} | ${inRange(C.dvPer1k, aggOf(permsC, c => c.dvPer1k))} |\n\n`;

  md += `## 三、标注统计特征（当时可知口径，vs 对照）\n\n`;
  md += `| 特征 | 真实 | 对照 均值（min~max） | 判定 |\n|---|---|---|---|\n`;
  md += `| 分型密度 /千根 | ${C.fractalsPer1k.toFixed(0)} | ${fmt(aggOf(permsC, c => c.fractalsPer1k), 0)} | ${inRange(C.fractalsPer1k, aggOf(permsC, c => c.fractalsPer1k))} |\n`;
  md += `| 分型确认延迟 p50（根） | ${C.fractalDelay.med} | ${fmt(aggOf(permsC, c => c.fractalDelay.med), 1)} | ${inRange(C.fractalDelay.med, aggOf(permsC, c => c.fractalDelay.med))} |\n`;
  md += `| 笔确认延迟 p50（根，身后两笔） | ${C.strokeDelay.med} | ${fmt(aggOf(permsC, c => c.strokeDelay.med), 1)} | ${inRange(C.strokeDelay.med, aggOf(permsC, c => c.strokeDelay.med))} |\n`;
  md += `| 中枢确认率 | ${pct(C.pivotConfirmRate)} | ${fmt(aggOf(permsC, c => c.pivotConfirmRate), 2, 100)}% | ${inRange(C.pivotConfirmRate, aggOf(permsC, c => c.pivotConfirmRate))} |\n`;
  md += `| 确认信号密度 /千根 | ${L.sigPer1k.toFixed(1)}（n=${L.nSig}） | ${fmt(aggOf(permsL, l => l.sigPer1k), 1)} | ${inRange(L.sigPer1k, aggOf(permsL, l => l.sigPer1k))} |\n`;
  md += `| ghost 密度 /千根 | ${L.ghostPer1k.toFixed(1)}（n=${L.nGhost}） | ${fmt(aggOf(permsL, l => l.ghostPer1k), 1)} | ${inRange(L.ghostPer1k, aggOf(permsL, l => l.ghostPer1k))} |\n`;
  md += `| ghost 过滤率 | ${pct(L.filterRate)} | ${fmt(aggOf(permsL, l => l.filterRate), 2, 100)}% | ${inRange(L.filterRate, aggOf(permsL, l => l.filterRate))} |\n`;
  md += `| 信号确认延迟 p50（结构极值→记账，根） | ${L.delay.med} | ${fmt(aggOf(permsL, l => l.delay.med), 1)} | ${inRange(L.delay.med, aggOf(permsL, l => l.delay.med))} |\n`;
  md += `| 信号间隔中位（根） | ${L.spacingMed} | ${fmt(aggOf(permsL, l => l.spacingMed), 1)} | ${inRange(L.spacingMed, aggOf(permsL, l => l.spacingMed))} |\n`;
  md += `| 结构标注总负载 /千根（分型+笔+中枢+背驰） | ${C.marksPer1k.toFixed(0)} | ${fmt(aggOf(permsC, c => c.marksPer1k), 0)} | ${inRange(C.marksPer1k, aggOf(permsC, c => c.marksPer1k))} |\n\n`;

  md += `### 明细\n\n`;
  md += `- 信号构成（真实）：${Object.entries(L.byKind).map(([k2, v]) => `${k2}×${v}`).join('、') || '无'}\n`;
  md += `- ghost 构成（真实）：${Object.entries(L.byReason).map(([k2, v]) => `${k2}×${v}`).join('、') || '无'}\n\n`;

  md += `## 读法与口径（如实）\n\n`;
  md += `1. 「区间内」= 该特征的出现频率在无时序结构随机路径的波动范围内，不构成它携带信息的证据；「高于/低于」= 超出对照波动范围，值得追问机制。\n`;
  md += `2. 噪声特征是描述性的，没有对照——它们定义了这份数据"长什么样"，是生成器对齐的靶子（对照 stylized-facts.js 可与实验室生成器直接对比）。\n`;
  md += `3. 确认延迟是缠论确定性的代价：分型要等下一根、笔要等身后两笔——延迟在真实与随机路径上的对比说明这是结构定义的属性，不是行情的属性。\n`;
  md += `4. 同参数同数据逐位可复现（固定种子）；终态口径含未来修正，不可当作可交易性证据。\n`;

  process.stdout.write(md);
  if (outFile) { fs.writeFileSync(outFile, md); console.error(`[facts] 已写出 ${outFile}`); }
}

run();
