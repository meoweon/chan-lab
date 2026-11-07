#!/usr/bin/env node
/* lab ⇄ mdk 差分校验：同一批K线分别跑 mdk 的 C# 实现与 lab 的 JS 实现，逐字段比对。
   用法：node scripts/align/run.cjs [caseCount] [--no-build]
   退出码 0 = 全等；1 = 有差异（会打印前几处）。 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const DIR = __dirname;
const DLL = path.join(DIR, 'bin/Release/net10.0/MdkProbe.dll');
const args = process.argv.slice(2);
const count = +(args.find(a => /^\d+$/.test(a)) || 120);

if (!args.includes('--no-build')) {
  execFileSync('dotnet', ['build', path.join(DIR, 'MdkProbe.csproj'), '-c', 'Release', '--nologo'],
    { stdio: ['ignore', 'ignore', 'inherit'] });
}
const node = (script, input) => JSON.parse(execFileSync('node', [path.join(DIR, script)],
  { input, maxBuffer: 1 << 28 }).toString());
const probe = (payload, kind) => JSON.parse(execFileSync('dotnet', [DLL],
  { input: JSON.stringify({ ...payload, mode: kind }), maxBuffer: 1 << 28 }).toString());

const same = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)));
function diffList(name, A, B, keys, out) {
  if (A.length !== B.length) out.push(`${name}: 条数 ${A.length} vs ${B.length}`);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const d = keys.filter(k => !same(A[i][k], B[i][k]));
    if (d.length) out.push(`${name}[${i}] ${d.map(k => `${k} ${A[i][k]} vs ${B[i][k]}`).join('; ')}`);
    if (out.length > 8) return;
  }
}

let fail = 0;
const tally = { fractals: 0, strokes: 0, pivots: 0, points: 0 };

// ── 1. 单窗口分析（= ChanAnalyzer.Analyze）──
{
  const input = execFileSync('node', [path.join(DIR, 'gen_cases.cjs'), String(count)], { maxBuffer: 1 << 28 }).toString();
  const cases = JSON.parse(input).cases;
  const lab = node('probe_lab.cjs', input);
  const mdk = probe({ cases }, 'analyze');
  let badCases = 0;
  for (let i = 0; i < cases.length; i++) {
    const out = [];
    diffList('fractals', lab[i].fractals, mdk[i].fractals, ['mergedIndex', 'barIndex', 'price', 'isTop', 'confirmBarIndex'], out);
    diffList('strokes', lab[i].strokes, mdk[i].strokes, ['startBarIndex', 'startPrice', 'endBarIndex', 'endPrice', 'isUp', 'isConfirmed', 'stableFromBarIndex'], out);
    diffList('pivots', lab[i].pivots, mdk[i].pivots, ['zg', 'zd', 'startStrokeIndex', 'endStrokeIndex', 'strokeCount', 'isConfirmed', 'leavingStrokeIndex'], out);
    diffList('points', lab[i].points, mdk[i].points, ['kind', 'side', 'time', 'price', 'referencePrice', 'referenceBarIndex', 'stopPrice', 'areaRatio'], out);
    tally.fractals += lab[i].fractals.length; tally.strokes += lab[i].strokes.length;
    tally.pivots += lab[i].pivots.length; tally.points += lab[i].points.length;
    if (out.length) { badCases++; if (badCases <= 3) console.log(`analyze case ${i}:`, out.slice(0, 5)); }
  }
  fail += badCases;
  console.log(`analyze: ${cases.length} 例 · 分型 ${tally.fractals} / 笔 ${tally.strokes} / 中枢 ${tally.pivots} / 买卖点 ${tally.points} → ${badCases ? `${badCases} 例不一致` : '全等'}`);
}

// ── 2. 逐根回放（= ChanBackfill.ReplayPoints，仅比 700 根之后的帧）──
{
  const gen = `
const fs=require('node:fs');
function r32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function series(seed,n){const r=r32(seed);const o=[];let p=100+r()*20,d=0,t=1700000000;
 for(let i=0;i<n;i++){if(i%37===0)d=(r()-0.5)*0.6;const x=(r()-0.5)*1.8+d,a=p,c=Math.max(1,a+x);
 o.push([t,a.toFixed(3),(Math.max(a,c)+r()*0.5).toFixed(3),(Math.min(a,c)-r()*0.5).toFixed(3),c.toFixed(3)]);p=c;t+=1800;}return o;}
function sub(seed,n){const r=r32(seed+99);const o=[];let p=100,t=1700000000;for(let i=0;i<n;i++){const a=p,c=Math.max(1,a+(r()-0.5)*1.1);
 o.push([t,a.toFixed(3),(Math.max(a,c)+r()*0.35).toFixed(3),(Math.min(a,c)-r()*0.35).toFixed(3),c.toFixed(3)]);p=c;t+=300;}return o;}
const base={divergenceAreaRatio:0.9,warmupBars:30,maxPoints:50,analysisBars:700,requireSubLevelConfirm:true,subLevelConfirmWindowBars:30};
const cases=[];for(let k=0;k<3;k++){const n=900+k*60;cases.push({candles:series(k+11,n),sub:sub(k+11,n*6),opts:{...base}});}
process.stdout.write(JSON.stringify({cases}));`;
  const input = execFileSync('node', ['-e', gen], { maxBuffer: 1 << 28 }).toString();
  const lab = node('probe_lab_replay.cjs', input);
  const mdk = probe({ cases: JSON.parse(input).cases }, 'replay');
  for (let i = 0; i < lab.length; i++) {
    const k = a => a.map(x => JSON.stringify(x)).sort();
    const a = k(lab[i]), b = k(mdk[i]);
    const ok = a.length === b.length && a.every((x, j) => x === b[j]);
    if (!ok) {
      fail++;
      console.log(`replay case ${i}: lab ${a.length} vs mdk ${b.length}`);
      const sb = new Set(b); const sa = new Set(a);
      console.log('  lab only:', a.filter(x => !sb.has(x)).slice(0, 3));
      console.log('  mdk only:', b.filter(x => !sa.has(x)).slice(0, 3));
    } else console.log(`replay case ${i}: ${a.length} 个信号 全等`);
  }
}

console.log(fail ? `\n✗ ${fail} 处不一致` : '\n✓ 全部一致');
process.exit(fail ? 1 : 0);
