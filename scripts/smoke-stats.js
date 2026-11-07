/* chan-csv.js / chan-stats.js 冒烟测试：
   1 CSV 往返与脏数据如实报告  2 _fwd 口径与费用符号  3 同种子确定性
   4 无未来函数独立复核（前缀回放）  5 块自助路径合法性  6 置换检验端点行为 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Csv = require('../chan-csv.js');
const St = require('./chan-stats.js');
const G = require('../chan-generator.js');
const E = require('../chan-engine.js');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg); if (!cond) fails++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/* ── 合成数据：三段 free 场景拼接（结构由算法判定，非设计结构；拼接仅为了凑信号样本量，仅用于管线验证）── */
const segs = [1, 2, 3].map(s => G.generate({ scenario: 'free', seed: s * 11, p0: 30000, amp: 0.5, factor: 5, lenScale: 2.5 }).main);
const main = [];
segs.forEach((seg, si) => {
  const shift = si ? main[main.length - 1].time + 300 - seg[0].time : 0;
  for (const b of seg) main.push({ ...b, time: b.time + shift });
});
ok(main.length >= 900, `合成K线 ${main.length} 根足够`);

/* ── 1. CSV 往返 ── */
const csvText = ['open_time,open,high,low,close,volume',
  ...main.map(b => `${b.time * 1000},${b.open},${b.high},${b.low},${b.close},123.5`),
  '', 'not,a,valid,row', `${main[0].time * 1000},1,0.5,2,1,0`,        // high<low → 剔除
  `${main[0].time * 1000},1,2,0.5,1,0`,                                // 与首行时间重复 → 剔除
].join('\n');
const parsed = Csv.parse(csvText);
ok(parsed.candles.length === main.length, `往返根数一致 ${parsed.candles.length} === ${main.length}`);
ok(parsed.candles.every((c, i) => near(c.time, main[i].time) && near(c.open, main[i].open) && near(c.high, main[i].high) && near(c.low, main[i].low) && near(c.close, main[i].close)), '往返 OHLC 逐位一致（1e-6）');
ok(parsed.report.dropped === 3 && parsed.report.issues.length >= 2, `脏数据剔除 ${parsed.report.dropped} 行并如实记录 ${parsed.report.issues.length} 条 issue`);
ok(parsed.report.baseSec === 300, `中位K线间隔 ${parsed.report.baseSec}s`);

/* 无表头 + 秒级时间 + ISO 时间 */
const headless = Csv.parse(`${main[0].time},${main[0].open},${main[0].high},${main[0].low},${main[0].close}\n${main[1].time},${main[1].open},${main[1].high},${main[1].low},${main[1].close}\n`);
ok(headless.candles.length === 2 && near(headless.candles[1].close, main[1].close), '无表头按位置解析 OK');
const iso = Csv.parse(`2026-01-01 00:00:00,1,2,0.5,1.5\n2026-01-01 01:00:00,1.5,2.5,1,2\n`);
ok(iso.candles.length === 2 && iso.candles[1].time - iso.candles[0].time === 3600, 'ISO 时间解析 OK');

/* 目录合并加载：kline-data/spot/<SYMBOL>/<TF>/YYYY-MM-DD.csv 布局（无表头、毫秒时间、6列）*/
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cts-dircsv-'));
const b = (t, o, h, l, c, v) => `${t * 1000},${o.toFixed(8)},${h.toFixed(8)},${l.toFixed(8)},${c.toFixed(8)},${v.toFixed(8)}`;
const T0 = 1577836800;   // 2020-01-01 纪元秒
const day1 = [b(T0, 100, 101, 99, 100.5, 1), b(T0 + 60, 100.5, 102, 100, 101, 2), b(T0 + 120, 101, 103, 100.5, 102, 3)];
const day2 = [b(T0 + 120, 101, 103, 100.5, 102, 3), b(T0 + 180, 102, 104, 101, 103, 4), b(T0 + 240, 103, 105, 102, 104, 5)];   // 首行与 day1 末行重复
fs.writeFileSync(path.join(tmpDir, '2020-01-01.csv'), day1.join('\n') + '\n');
fs.writeFileSync(path.join(tmpDir, '2020-01-02.csv'), day2.join('\n') + '\n');
fs.writeFileSync(path.join(tmpDir, '.DS_Store'), 'junk');
const dirRes = Csv.loadDirSync(tmpDir);
ok(dirRes.report.files === 2, `目录加载扫到 ${dirRes.report.files} 个 csv（.DS_Store 被忽略）`);
ok(dirRes.candles.length === 5 && dirRes.report.dropped === 1, `跨文件去重：保留 ${dirRes.candles.length} 根、剔除 ${dirRes.report.dropped} 根重复`);
ok(dirRes.candles.every((c, i) => i === 0 || c.time > dirRes.candles[i - 1].time), '目录合并后时间严格递增');
fs.rmSync(tmpDir, { recursive: true, force: true });

/* ── 2. _fwd 口径与费用符号 ── */
const tiny = [
  { time: 0, open: 100, high: 101, low: 99, close: 100 },
  { time: 60, open: 100, high: 102, low: 99, close: 101 },
  { time: 120, open: 101, high: 103, low: 100, close: 102 },
  { time: 180, open: 102, high: 104, low: 101, close: 103 },
  { time: 240, open: 103, high: 105, low: 102, close: 104 },
];
const cfg0 = { entry: 'close', feeBp: 0, slipBp: 0 };
ok(near(St._fwd(tiny, 0, 1, 2, cfg0), 102 / 100 - 1), `close 入场 H=2 多头 = ${(102 / 100 - 1).toFixed(4)}`);
ok(near(St._fwd(tiny, 0, -1, 2, cfg0), -(102 / 100 - 1)), '空头取负号');
ok(near(St._fwd(tiny, 0, 1, 2, { entry: 'next-open', feeBp: 0, slipBp: 0 }), 102 / 100 - 1), 'next-open 入场：entry=100（第1根开）exit=close[2]');
ok(St._fwd(tiny, 3, 1, 2, cfg0) === null, '凑不满持有期 → censored（null）');
const rFree = St._fwd(tiny, 0, 1, 2, { entry: 'close', feeBp: 0, slipBp: 0 });
const rFee = St._fwd(tiny, 0, 1, 2, { entry: 'close', feeBp: 100, slipBp: 0 });
ok(near(rFree - rFee, 0.02, 1e-12), `费用符号：fee 100bp 单边 → 往返恰降 0.02（${(rFree - rFee).toFixed(6)}）`);
ok(St._sideOf({ kind: '1买' }) === 1 && St._sideOf({ kind: '2卖' }) === -1, '方向派生：买 +1 / 卖 −1');

/* ── 3+4. 统计主流程：确定性 + 无未来函数复核 ── */
const statCfg = { horizons: [5, 10], permA: 300, permB: 8, seed: 7, entry: 'next-open' };
const rep1 = St.analyze(main, null, statCfg);
const rep2 = St.analyze(main, null, statCfg);
delete rep1.timing; delete rep2.timing;
delete rep1.controlB.timing; delete rep2.controlB.timing;   // 耗时字段不参与确定性比对
ok(JSON.stringify(rep1) === JSON.stringify(rep2), '同种子同数据报告逐位一致（确定性）');
ok(rep1.meta.requireSubLevelConfirm === false && rep1.meta.note.includes('降级'), '无次级别 → 降级口径已注明');
ok(rep1.controlB && rep1.controlB.runs === 8, `对照 B 跑了 ${rep1.controlB.runs} 次`);
console.log(`  INFO 合成数据：信号 ${rep1.events.total} 个（${Object.entries(rep1.events.byKind).map(([k, v]) => k + '×' + v).join('、')}），ghost ${rep1.ghosts.total}（${Object.entries(rep1.ghosts.byReason).map(([k, v]) => k + '×' + v).join('、')}）`);
console.log(`  INFO 随机路径信号数均值 ${rep1.controlB.counts.mean.toFixed(1)}（min ${rep1.controlB.counts.min} max ${rep1.controlB.counts.max}）`);

const optsNoSub = { ...E.DEFAULT_OPTIONS, requireSubLevelConfirm: false };
const full = E.replay(main, null, optsNoSub);
let checked = 0, lookaheadOk = true;
for (const s of full.signals.slice(0, 5)) {
  const prefix = main.slice(0, s.gConfirm + 1);
  const pre = E.replay(prefix, null, optsNoSub);
  const hit = pre.signals.some(x => x.kind === s.kind && x.time === s.time && x.gConfirm === s.gConfirm);
  if (!hit) { lookaheadOk = false; console.log(`  INFO 信号 ${s.kind}@${s.time} 前缀回放未复现`); }
  checked++;
}
ok(lookaheadOk && checked > 0, `无未来函数独立复核：${checked} 个信号在截断到确认K线的前缀回放中全部复现`);

/* 轻量回放 parity：replaySignals 与 E.replay 的信号/ghost 逐位一致 */
const fullRS = St.replaySignals(main, null, optsNoSub);
const sigKey = s => `${s.kind}|${s.time}|${s.gConfirm}`;
const ghKey = g => `${g.kind}|${g.time}|${g.reason || ''}`;
ok(fullRS.signals.length === full.signals.length && fullRS.signals.every((s, i) => sigKey(s) === sigKey(full.signals[i])), `parity：信号 ${fullRS.signals.length} 个逐位一致`);
ok(fullRS.ghosts.length === full.ghosts.length && fullRS.ghosts.every((g, i) => ghKey(g) === ghKey(full.ghosts[i])), `parity：ghost ${fullRS.ghosts.length} 个逐位一致`);

/* ── 5. 块自助路径合法性（收益块自助 + OHLC 平移移植）── */
const rnd = (() => { let a = 12345; return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
const bs = St._bootstrapPath(main, rnd, 10);
ok(bs.length === main.length, '自助路径长度不变');
ok(bs.every((b, i) => i === 0 || b.time > bs[i - 1].time), '自助路径时间严格递增');
ok(bs.every(b => isFinite(b.open) && isFinite(b.high) && isFinite(b.low) && isFinite(b.close) && b.high >= Math.max(b.open, b.close) - 1e-9 && b.low <= Math.min(b.open, b.close) + 1e-9), '自助路径每根K线 OHLC 自洽（平移后包含关系不变）');
const rOrig = main.slice(1).map((b, i) => Math.log(b.close / main[i].close)).sort((a, b) => a - b);
const rBs = bs.slice(1).map((b, i) => Math.log(b.close / bs[i].close)).sort((a, b) => a - b);
ok(rOrig.every((r, i) => Math.abs(r - rBs[i]) < 1e-9), '收益多重集逐位保留（边际分布不变，只打乱时序）');

/* ── 6. 置换检验端点行为 ── */
const rr = (() => { let a = 777; return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
const sep = St._permDiff([3, 4, 5, 6, 7, 8], [-8, -7, -6, -5, -4, -3], 999, rr);
ok(sep.p <= 1 / 1000, `强分离 → p=${sep.p}（≤ 1/1000）`);
const same = St._permDiff([1, 2, 3, 4], [1, 2, 3, 4], 999, rr);
ok(same.p === 1 && same.obs === 0, `完全相同 → obs=0, p=1`);

/* ── CLI 端到端（真实文件走一遍）── */
const tmp = path.join(os.tmpdir(), `cts-smoke-${process.pid}.csv`);
fs.writeFileSync(tmp, csvText);
const { execFileSync } = require('child_process');
const out = execFileSync('node', [path.join(__dirname, 'stats-run.js'), '--csv', tmp, '--perm-b', '5', '--horizons', '5,10', '--out', tmp + '.md', '--json', tmp + '.json'], { encoding: 'utf8' });
ok(out.includes('真实行情信号统计报告') && out.includes('对照 A') && out.includes('对照 B'), 'CLI 产出含三大节的 markdown 报告');
ok(fs.existsSync(tmp + '.json') && JSON.parse(fs.readFileSync(tmp + '.json', 'utf8')).meta.bars === main.length, 'CLI --json 输出可解析且根数一致');
for (const f of [tmp, tmp + '.md', tmp + '.json']) fs.unlinkSync(f);

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
