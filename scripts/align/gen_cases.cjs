// 生成确定性的 OHLC 序列（含包含关系、跳空、长趋势、震荡）
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function series(seed, n, opts={}) {
  const rnd = mulberry32(seed);
  const out = []; let p = 100 + rnd()*20; let drift = 0; let t = 1700000000;
  const vol = opts.vol ?? 1.0;
  for (let i=0;i<n;i++){
    if (i % 37 === 0) drift = (rnd()-0.5)*0.6;
    const r = (rnd()-0.5)*2*vol + drift;
    const o = p;
    const c = Math.max(1, o + r);
    const hi = Math.max(o,c) + rnd()*vol*0.6;
    const lo = Math.min(o,c) - rnd()*vol*0.6;
    out.push([t, o.toFixed(3), hi.toFixed(3), lo.toFixed(3), c.toFixed(3)]);
    p = c; t += 1800;
  }
  return out;
}
function subSeries(seed, n, stepSec) {
  const rnd = mulberry32(seed+999);
  const out = []; let p = 100; let t = 1700000000;
  for (let i=0;i<n;i++){
    const o = p, c = Math.max(1, o + (rnd()-0.5)*1.2);
    const hi = Math.max(o,c)+rnd()*0.4, lo = Math.min(o,c)-rnd()*0.4;
    out.push([t, o.toFixed(3), hi.toFixed(3), lo.toFixed(3), c.toFixed(3)]);
    p = c; t += stepSec;
  }
  return out;
}
const cases = [];
const base = { divergenceAreaRatio: 0.9, warmupBars: 30, maxPoints: 50, analysisBars: 700, requireSubLevelConfirm: true, subLevelConfirmWindowBars: 30 };
const variants = [
  {}, {warmupBars:0}, {warmupBars:10}, {divergenceAreaRatio:0.5}, {divergenceAreaRatio:1.2},
  {maxPoints:5}, {requireSubLevelConfirm:false}, {subLevelConfirmWindowBars:5}, {subLevelConfirmWindowBars:120},
];
const N = +(process.argv[2] || 40);
for (let k=0;k<N;k++){
  const v = variants[k % variants.length];
  if (k % 17 === 5) {   // 平坦行情 / 极端重复
    const flat = []; for (let i=0;i<200;i++) flat.push([1700000000+i*1800, '100.00','100.50','99.50','100.00']);
    cases.push({ candles: flat, opts: {...base, ...v} }); continue;
  }
  if (k % 19 === 9) {   // 大跳空
    const g = series(k+5, 240, {vol: 3.5});
    cases.push({ candles: g, opts: {...base, ...v} }); continue;
  }
  let n = 150 + Math.floor(mulberry32(k*7+1)()*550);
  if (k % 13 === 7) n = 20 + (k % 40);   // 短序列边界
  const c = { candles: series(k+1, n, { vol: 0.4 + mulberry32(k+3)()*1.6 }), opts: {...base, ...v} };
  if ((k % 2 === 1) || c.opts.requireSubLevelConfirm) c.sub = subSeries(k+1, Math.max(60, Math.floor(n*6)), 300);
  cases.push(c);
}
process.stdout.write(JSON.stringify({cases}));
