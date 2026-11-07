#!/usr/bin/env node
/* ============================================================================
 * stats-run.js — 方向 2 CLI：真实行情 CSV → 信号收益统计 + 置换检验报告
 *
 * 用法：
 *   node stats-run.js --csv <本级别K线.csv> [选项]
 *   node stats-run.js --csv-dir <K线目录>  [选项]     # 适配 kline-data/spot/<SYMBOL>/<TF>/ 日度分文件，自动按文件名拼接
 * 选项：
 *   --sub-csv <低周期K线.csv>   提供次级别数据 → 启用次级别确认口径（默认无 → 降级口径）
 *   --sub-dir <低周期目录>      同上，目录形式
 *   --entry next-open|close     入场口径（默认 next-open：信号确认后下一根开盘入场）
 *   --fee-bp 10 --slip-bp 5     单边手续费/滑点（bp）；往返成本 = 2×(fee+slip)/1e4
 *   --horizons 5,10,20,60       持有根数
 *   --split 0.7                 样本内外切分（按K线序号，仅描述统计）
 *   --perm-a 2000               对照 A（随机时点）置换次数
 *   --perm-b 100                对照 B（块自助重放）次数，0 = 关闭
 *   --block 10                  对照 B 块长
 *   --seed 7                    随机种子（同参数同数据结果逐位一致）
 *   --max-bars N                只取前 N 根（长CSV快速试探用）
 *   --out report.md --json report.json   输出文件（默认仅打印 markdown 到 stdout）
 *
 * 报告只给统计量与 p 值，不给"有效/无效"的结论——结论由你自己对着数字下。
 * ============================================================================ */
'use strict';
const fs = require('fs');
const Csv = require('../chan-csv.js');
const St = require('./chan-stats.js');

/* ── 参数 ── */
function parseArgs(argv) {
  const a = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1], i++;
    else pos.push(argv[i]);
  }
  return a;
}
const num = (v, d) => (v === undefined || v === '' || isNaN(+v) ? d : +v);

const args = parseArgs(process.argv.slice(2));
if (!args.csv && !args['csv-dir']) { console.error('用法：node stats-run.js --csv <K线.csv> | --csv-dir <K线目录> [--sub-csv x.csv | --sub-dir x/] [--entry next-open] ...'); process.exit(2); }

const mainRes = args['csv-dir'] ? Csv.loadDirSync(args['csv-dir']) : Csv.loadFileSync(args.csv);
console.error(`[csv] ${args['csv-dir'] || args.csv}: ${mainRes.report.files ? mainRes.report.files + ' 个文件，' : ''}读入 ${mainRes.report.rows} 行，保留 ${mainRes.report.kept}，剔除 ${mainRes.report.dropped}`);
for (const msg of mainRes.report.issues) console.error(`[csv]   · ${msg}`);
if (mainRes.candles.length < 100) { console.error('有效K线不足 100 根，无法统计。'); process.exit(2); }

let main = mainRes.candles, sub = null;
if (args['max-bars']) main = main.slice(0, num(args['max-bars'], main.length));
if (args['sub-csv'] || args['sub-dir']) {
  const subRes = args['sub-dir'] ? Csv.loadDirSync(args['sub-dir']) : Csv.loadFileSync(args['sub-csv']);
  console.error(`[csv] ${args['sub-dir'] || args['sub-csv']}: ${subRes.report.files ? subRes.report.files + ' 个文件，' : ''}读入 ${subRes.report.rows} 行，保留 ${subRes.report.kept}，剔除 ${subRes.report.dropped}`);
  for (const msg of subRes.report.issues) console.error(`[csv]   · ${msg}`);
  sub = subRes.candles;
}

const cfg = {
  entry: args.entry === 'close' ? 'close' : 'next-open',
  feeBp: num(args['fee-bp'], St.DEFAULT_CFG.feeBp),
  slipBp: num(args['slip-bp'], St.DEFAULT_CFG.slipBp),
  horizons: String(args.horizons || '5,10,20,60').split(',').map(x => +x.trim()).filter(x => x > 0),
  split: num(args.split, St.DEFAULT_CFG.split),
  permA: num(args['perm-a'], St.DEFAULT_CFG.permA),
  permB: num(args['perm-b'], St.DEFAULT_CFG.permB),
  blockSize: num(args.block, St.DEFAULT_CFG.blockSize),
  seed: num(args.seed, St.DEFAULT_CFG.seed),
};

const report = St.analyze(main, sub, cfg);
report.meta.csv = { main: args['csv-dir'] || args.csv, sub: args['sub-dir'] || args['sub-csv'] || null, parse: mainRes.report.naiveLocalTime ? '无时区时间按本地时区解释' : '时间含时区或为纪元秒' };
report.meta.csvDropped = mainRes.report.dropped;

/* ── markdown 报告 ── */
const bp = x => x == null ? '—' : (x * 1e4).toFixed(1);
const pc = x => x == null ? '—' : (x * 100).toFixed(1) + '%';
const r2 = x => x == null ? '—' : x.toFixed(2);
const fdate = t => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);

function sigTable(tbl) {
  let s = '| 持有H根 | n | 剔除 | 均值(bp) | 中位(bp) | 胜率 | t | 样本内均值 | 样本外均值 |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const H of report.meta.cfg.horizons) {
    const a = tbl.all[H] || {}, i = tbl.in[H] || {}, o = tbl.out[H] || {};
    if (a.n === 0 && !a.mean) { s += `| ${H} | 0 | ${tbl.censored[H] || 0} | — | — | — | — | — | — |\n`; continue; }
    s += `| ${H} | ${a.n} | ${tbl.censored[H] || 0} | ${bp(a.mean)} | ${bp(a.median)} | ${pc(a.win)} | ${r2(a.t)} | ${bp(i.mean)} | ${bp(o.mean)} |\n`;
  }
  return s;
}

let md = `# 真实行情信号统计报告（置换检验）\n\n`;
md += `- 数据：${args['csv-dir'] || args.csv}${sub ? `（次级别：${args['sub-dir'] || args['sub-csv']}）` : '（无次级别数据）'}${mainRes.report.files ? `，共 ${mainRes.report.files} 个日度文件` : ''}\n`;
md += `- K线：本级别 ${report.meta.bars} 根（${fdate(report.meta.timeRange[0])} → ${fdate(report.meta.timeRange[1])}），剔除 ${report.meta.csvDropped} 行\n`;
md += `- ${report.meta.note} 入场=${report.meta.cfg.entry}；成本=双向 fee ${report.meta.cfg.feeBp}bp + 滑点 ${report.meta.cfg.slipBp}bp；种子=${report.meta.cfg.seed}\n`;
md += `- 样本内外：按K线序号 ${report.meta.cfg.split} 切分（仅描述统计；p 值在全样本上计算）\n\n`;

md += `## 信号与过滤\n\n`;
md += `确认信号 ${report.events.total} 个（${Object.entries(report.events.byKind).map(([k, v]) => `${k}×${v}`).join('、') || '无'}）；被过滤 ghost ${report.ghosts.total} 个（${Object.entries(report.ghosts.byReason).map(([k, v]) => `${k}×${v}`).join('、') || '无'}）。\n\n`;

md += `## 全部信号（pooled）远期收益\n\n` + sigTable(report.pooled) + `\n`;

if (Object.keys(report.kinds).length) {
  md += `## 分信号类型\n\n`;
  for (const [k, tbl] of Object.entries(report.kinds)) {
    md += `### ${k}（n=${tbl.n}）\n\n` + sigTable(tbl) + `\n`;
  }
}

if (report.controlA) {
  md += `## 对照 A：随机时点（同数量、同方向、同成本，标签置换检验）\n\n`;
  md += `| H | 信号均值(bp) | 随机对照均值(bp) | 差值(bp) | 双侧 p |\n|---|---|---|---|---|\n`;
  for (const H of report.meta.cfg.horizons) {
    md += `| ${H} | ${bp(report.pooled.all[H].mean)} | ${bp(report.controlA.stats[H].mean)} | ${bp(report.controlA.obsDiff[H])} | ${report.controlA.p[H] == null ? 'n太小' : report.controlA.p[H].toFixed(4)} |\n`;
  }
  md += `\n`;
} else if (report.events.total) {
  md += `\n## 对照 A：未计算\n\n确认信号少于 5 个（${report.events.total}），置换检验无意义，如实跳过。\n\n`;
}

if (report.controlB) {
  const b = report.controlB;
  md += `## 对照 B：收益块自助重放（按块打乱对数收益重建路径 × ${b.runs}，重新过引擎出信号）\n\n`;
  md += `随机路径上信号出现 ${b.counts.mean.toFixed(1)} 个/条（min ${b.counts.min}，max ${b.counts.max}）——这就是"无时序结构行情里这些信号出现得多频繁"的直接答案。耗时 ${(b.timing.ms / 1000).toFixed(1)}s。\n\n`;
  md += `| H | 真实均值(bp) | 随机均值(bp) | 随机5%~95%分位 | 单侧p(随机≥真实) | 双侧p |\n|---|---|---|---|---|---|\n`;
  for (const H of report.meta.cfg.horizons) {
    const s = b.stats[H];
    md += `| ${H} | ${bp(report.pooled.all[H].mean)} | ${bp(s.mean)} | ${bp(s.q05)} ~ ${bp(s.q95)} | ${b.pOne[H] == null ? '—' : b.pOne[H].toFixed(4)} | ${b.pTwo[H] == null ? '—' : b.pTwo[H].toFixed(4)} |\n`;
  }
  md += `\n`;
}

md += `## 读数守则（如实）\n\n`;
md += `1. p 值只在这**一份**数据、这**一组**信号上成立；多品种/多参数下要做多重比较校正，别对单次 p<0.05 过度兴奋。\n`;
md += `2. 对照 B 的零假设是"收益时序结构被打乱"（保留肥尾/漂移/波动率聚集的边际分布）——真实行情与它的差异来自时序结构本身；p 小说明信号与时序结构挂钩，**不直接等于可交易**。\n`;
md += `3. 末端凑不满持有期的信号已剔除（表中"剔除"列）；无次级别数据时为降级口径，与启用次级别确认的结果不可直接比。\n`;
md += `4. 本报告由 stats-run.js 生成，不含任何对未来的断言；同参数同数据可逐位复现（种子 ${report.meta.cfg.seed}）。\n`;

process.stdout.write(md);
if (args.out) fs.writeFileSync(args.out, md);
if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 1));
if (!report.events.total) console.error('\n[warn] 该数据上没有产生任何确认信号——统计表为空是真实结果，不是错误。');
