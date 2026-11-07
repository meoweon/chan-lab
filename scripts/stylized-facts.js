/* ============================================================================
 * stylized-facts.js — 真实行情 vs 生成器输出的风格化事实对比（生成器验收靶）
 *
 * 真实行情侧：全量K线一次计算。
 * 生成器侧：20 条独立短段（lenScale=4，腿 24~52 根 ≈ 真实笔尺度 2~4 倍），
 *   · 分布类指标（偏度/峰度/尾部）：合并全部段的收益池统一计算（重尾下逐段估计
 *     方差过大，会追着个别跳跃K线跑）；
 *   · 序列类指标（自相关/方差比/游程/跳空/影线）：逐段计算后取均值。
 * RN 环境变量 = 生成器 realNoise 强度（0 = 旧版薄尾骨架）。
 * 用法：node stylized-facts.js [真实CSV目录]
 * ============================================================================ */
'use strict';
const Csv = require('../chan-csv.js');
const G = require('../chan-generator.js');

function logReturns(bars) { const r = []; for (let i = 1; i < bars.length; i++) r.push(Math.log(bars[i].close / bars[i - 1].close)); return r; }
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
function acf(a, k) { const m = mean(a); let n0 = 0, d = 0; for (let i = 0; i < a.length; i++) { d += (a[i] - m) ** 2; if (i + k < a.length) n0 += (a[i] - m) * (a[i + k] - m); } return n0 / d; }
function varianceRatio(r, k) {
  const agg = [];
  for (let i = k - 1; i < r.length; i++) { let s = 0; for (let j = 0; j < k; j++) s += r[i - j]; agg.push(s); }
  const m = mean(agg), v = agg.reduce((x, y) => x + (y - m) ** 2, 0) / (agg.length - 1);
  const m1 = mean(r), v1 = r.reduce((x, y) => x + (y - m1) ** 2, 0) / (r.length - 1);
  return v / (k * v1);
}
function runsOf(bars) {
  const out = []; let cur = 1;
  for (let i = 2; i < bars.length; i++) { const up = bars[i].close >= bars[i - 1].close, pu = bars[i - 1].close >= bars[i - 2].close; if (up === pu) cur++; else { out.push(cur); cur = 1; } }
  out.push(cur); return out;
}
function atr14(bars) {
  const tr = bars.map((b, i) => i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)));
  const out = []; let a = mean(tr.slice(0, 14));
  for (let i = 14; i < bars.length; i++) { a = (a * 13 + tr[i]) / 14; out.push(a); }
  return out;
}

/* 逐段序列类指标 + 供合并的收益池 */
function serialFacts(bars) {
  const r = logReturns(bars);
  const rl = runsOf(bars);
  const a = atr14(bars);
  let gaps = 0;
  for (let i = 15; i < bars.length; i++) if (Math.abs(bars[i].open - bars[i - 1].close) > 0.5 * a[i - 14]) gaps++;
  const wick = mean(bars.map(b => (b.high - b.low) > 0 ? (b.high - Math.max(b.open, b.close) + Math.min(b.open, b.close) - b.low) / (b.high - b.low) : 0));
  return {
    n: bars.length, r,
    acf1: acf(r, 1), acf2: acf(r, 2), acf3: acf(r, 3),
    acfAbs1: acf(r.map(Math.abs), 1), acfAbs5: acf(r.map(Math.abs), 5), acfAbs20: acf(r.map(Math.abs), 20), acfAbs60: acf(r.map(Math.abs), 60),
    vr2: varianceRatio(r, 2), vr5: varianceRatio(r, 5), vr20: varianceRatio(r, 20), vr60: varianceRatio(r, 60),
    rlMean: mean(rl), rl3: rl.filter(x => x >= 3).length / rl.length, rlMax: Math.max(...rl),
    gapPct: gaps / Math.max(1, bars.length - 15), wick,
  };
}
/* 合并收益池的分布类指标 */
function distFacts(allR) {
  const m = mean(allR), sd = Math.sqrt(allR.reduce((x, y) => x + (y - m) ** 2, 0) / (allR.length - 1));
  const z = allR.map(x => (x - m) / sd);
  return {
    skew: mean(z.map(x => x ** 3)), kurt: mean(z.map(x => x ** 4)) - 3,
    tail3: z.filter(x => Math.abs(x) > 3).length / z.length, tail5: z.filter(x => Math.abs(x) > 5).length / z.length,
  };
}

/* ── 真实行情 ── */
const dir = process.argv[2] || './data/kline';
const real = Csv.loadDirSync(dir).candles;
const R = serialFacts(real);
const RD = distFacts(R.r);
let volCorr = '无量数据';
if (real[0].volume !== undefined && real[0].volume > 0) {
  const r = R.r, A = r.map(Math.abs), V = real.slice(1).map(b => b.volume), mA = mean(A), mV = mean(V);
  const cov = A.reduce((s, x, i) => s + (x - mA) * (V[i] - mV), 0) / (A.length - 1);
  volCorr = (cov / Math.sqrt(A.reduce((x, y) => x + (y - mA) ** 2, 0) / (A.length - 1) * V.reduce((x, y) => x + (y - mV) ** 2, 0) / (V.length - 1))).toFixed(3);
}

/* ── 生成器（20 段独立短路径）── */
const SEGS = 20;
const segs = [];
for (let s = 1; s <= SEGS; s++) {
  const seg = G.generate({ scenario: 'free', seed: s * 11, p0: 30000, amp: 0.5, factor: 5, lenScale: 4, realNoise: +(process.env.RN || 1) }).main;
  if (seg.length >= 100) segs.push(serialFacts(seg));
}
const avg = key => mean(segs.map(f => f[key]));
const GD = distFacts(segs.flatMap(f => f.r));

const fmtR = { tail3: 1, tail5: 1 };
const show = (name, D, S, vol) => {
  const cols = ['n', 'skew', 'kurt', 'tail3', 'tail5', 'acf1', 'acf2', 'acf3', 'acfAbs1', 'acfAbs5', 'acfAbs20', 'acfAbs60', 'vr2', 'vr5', 'vr20', 'vr60', 'rlMean', 'rl3', 'rlMax', 'gapPct', 'wick'];
  console.log('指标        ' + cols.map(c => c.padStart(9)).join(''));
  console.log((name + ' '.repeat(16)).slice(0, 16) + cols.map(c => {
    const v = D[c] !== undefined ? D[c] : S[c];
    if (v == null) return '—'.padStart(9);
    let str;
    if (fmtR[c]) str = (v * 100).toFixed(2) + '%';
    else if (c === 'n' || c === 'rlMax') str = String(Math.round(v));
    else str = v.toFixed(2);
    return str.padStart(9);
  }).join(''));
  return cols;
};
const cols = show('真实 BTCUSDT 1h', RD, R, volCorr);
const Gd = { n: mean(segs.map(f => f.n)), ...GD,
  acf1: avg('acf1'), acf2: avg('acf2'), acf3: avg('acf3'),
  acfAbs1: avg('acfAbs1'), acfAbs5: avg('acfAbs5'), acfAbs20: avg('acfAbs20'), acfAbs60: avg('acfAbs60'),
  vr2: avg('vr2'), vr5: avg('vr5'), vr20: avg('vr20'), vr60: avg('vr60'),
  rlMean: avg('rlMean'), rl3: avg('rl3'), rlMax: avg('rlMax'), gapPct: avg('gapPct'), wick: avg('wick') };
show('生成器(RN=' + (process.env.RN || 1) + ')', GD, Gd, '无量数据');
console.log(`真实: corr(|r|,vol)=${volCorr}   生成器: 无量`);
console.log(`（生成器 = ${segs.length} 条独立段：分布指标用 ${segs.reduce((s, f) => s + f.r.length, 0)} 个合并收益，序列指标取跨段均值）`);
