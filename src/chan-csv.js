/* ============================================================================
 * chan-csv.js — 真实行情 CSV 导入（方向 2：零假设对照的真实数据入口）
 *
 * 职责：把外部 CSV 解析成引擎可用的K线数组 {time,open,high,low,close[,volume]}，
 *       并如实报告每一处不合规数据（缺列 / 非数 / 高低错乱 / 时间乱序 / 重复），
 *       绝不静默丢弃或修正后假装无事发生。
 *
 * 兼容格式：
 *   · Binance K线导出（含表头 open_time,open,high,low,close,volume,...）——按表头列名映射；
 *   · 无表头：按位置取第 0..4 列为 time,open,high,low,close，第 5 列（若有）为 volume；
 *   · 时间：数值（≥1e12 视为毫秒、≥1e9 视为秒）或 ISO / "YYYY-MM-DD HH:MM:SS" 字符串；
 *     无时区字样的时间按本地时区解释（报告 meta 中注明）。
 *
 * 对外：parse(text) → { candles, report } / loadFileSync(path)（仅 Node）
 * report = { rows, kept, dropped, issues[], naiveLocalTime, baseSec, timeRange }
 * ============================================================================ */
var ChanCsv = (function () {
'use strict';

const MAX_ISSUES = 20;   // issues 列表最多保留条数（超出只计数）

const TIME_KEYS = /^($|open_?time|timestamp|date(time)?|datetime)$/i;
const OPEN_KEYS = /^(open|open_?price)$/i;
const HIGH_KEYS = /^(high|high_?price)$/i;
const LOW_KEYS  = /^(low|low_?price)$/i;
const CLOSE_KEYS = /^(close|close_?price|price|last)$/i;
const VOL_KEYS  = /^(volume|vol|base_?volume|qty)$/i;

function toTime(v) {
  if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(v)) {
    const n = +v;
    if (!isFinite(n)) return null;
    if (n >= 1e15) return Math.round(n / 1e6);           // 微秒 → 秒
    if (n >= 1e12) return Math.round(n / 1000);          // 毫秒 → 秒
    if (n >= 1e9) return Math.round(n);                  // 秒
    return null;                                          // 太小不可能是 2001 年后的纪元秒
  }
  const s = String(v).trim().replace(/^"|"$/g, '');
  if (!s) return null;
  const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
  if (!isFinite(t)) return null;
  return Math.round(t / 1000);
}

function parse(text) {
  const report = { rows: 0, kept: 0, dropped: 0, issues: [], naiveLocalTime: false, baseSec: null, timeRange: null };
  const issues = report.issues;
  const note = msg => { if (issues.length < MAX_ISSUES) issues.push(msg); };
  const lines = String(text).split(/\r\n|\r|\n/);
  let map = null;                     // 列索引映射 {time,open,high,low,close,volume}
  const raw = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    const cells = line.split(',');
    if (map === null) {
      const looksHeader = cells.some(c => /[a-zA-Z]/.test(c) && !/^\s*-?\d/.test(c));
      if (looksHeader && cells.some(c => CLOSE_KEYS.test(c.trim()))) {
        map = {};
        cells.forEach((c, i) => {
          const k = c.trim();
          if (TIME_KEYS.test(k) && map.time === undefined) map.time = i;
          else if (OPEN_KEYS.test(k) && map.open === undefined) map.open = i;
          else if (HIGH_KEYS.test(k) && map.high === undefined) map.high = i;
          else if (LOW_KEYS.test(k) && map.low === undefined) map.low = i;
          else if (CLOSE_KEYS.test(k) && map.close === undefined) map.close = i;
          else if (VOL_KEYS.test(k) && map.volume === undefined) map.volume = i;
        });
        continue;                        // 表头行本身不计入 rows
      }
      map = { time: 0, open: 1, high: 2, low: 3, close: 4, volume: cells.length > 5 ? 5 : undefined };
    }
    report.rows++;
    if (cells.length < 5) { report.dropped++; note(`第 ${li + 1} 行：仅 ${cells.length} 列（少于 5）`); continue; }
    const t = toTime(cells[map.time]);
    if (t === null) { report.dropped++; note(`第 ${li + 1} 行：时间无法解析「${cells[map.time]}」`); continue; }
    if (map.time !== undefined && !/^-?\d+(\.\d+)?$/.test(cells[map.time].trim())) {
      const s = cells[map.time].trim();
      if (s && !s.includes('T') && !/Z|[+\-]\d{2}:?\d{2}$/.test(s)) report.naiveLocalTime = true;
    }
    const g = i => { const x = parseFloat(cells[i]); return isFinite(x) ? x : null; };
    const o = g(map.open), h = g(map.high), l = g(map.low), c = g(map.close), v = map.volume === undefined ? undefined : g(map.volume);
    if (o === null || h === null || l === null || c === null) { report.dropped++; note(`第 ${li + 1} 行：OHLC 含非数`); continue; }
    if (c <= 0 || o <= 0 || h <= 0 || l <= 0) { report.dropped++; note(`第 ${li + 1} 行：出现非正价格`); continue; }
    if (h < l) { report.dropped++; note(`第 ${li + 1} 行：high < low`); continue; }
    if (h < Math.max(o, c) - 1e-9 || l > Math.min(o, c) + 1e-9) { report.dropped++; note(`第 ${li + 1} 行：开收盘价越出高低区间`); continue; }
    raw.push({ time: t, open: o, high: h, low: l, close: c, volume: v === undefined || v === null ? undefined : v });
  }

  raw.sort((a, b) => a.time - b.time);
  const candles = [];
  for (let i = 0; i < raw.length; i++) {
    if (i > 0 && raw[i].time === raw[i - 1].time) { report.dropped++; note(`时间 ${raw[i].time} 重复（同时间戳仅保留首条）`); continue; }
    candles.push(raw[i]);
  }
  report.kept = candles.length;
  if (candles.length > 1) {
    const dts = [];
    for (let i = 1; i < candles.length; i++) dts.push(candles[i].time - candles[i - 1].time);
    dts.sort((a, b) => a - b);
    report.baseSec = dts[Math.floor(dts.length / 2)];
    report.timeRange = [candles[0].time, candles[candles.length - 1].time];
  }
  return { candles, report };
}

function loadFileSync(path) {
  // eslint-disable-next-line no-undef
  const fs = require('fs');
  return parse(fs.readFileSync(path, 'utf8'));
}

/* 多文件合并：把 parse() 的结果按时间排序拼接，跨文件重复时间戳只保留首条。
   报告累加行数与剔除数（重复也计入 dropped），issues 仍限量。 */
function merge(results) {
  const report = { files: results.length, rows: 0, kept: 0, dropped: 0, issues: [], naiveLocalTime: false, baseSec: null, timeRange: null };
  const candles = [];
  for (const r of results) {
    const rp = r.report || {};
    report.rows += rp.rows || 0;
    report.dropped += rp.dropped || 0;
    if (rp.naiveLocalTime) report.naiveLocalTime = true;
    for (const msg of rp.issues || []) if (report.issues.length < MAX_ISSUES) report.issues.push(msg);
    if (r.candles && r.candles.length) candles.push(...r.candles);
  }
  candles.sort((a, b) => a.time - b.time);
  const uniq = [];
  for (const c of candles) {
    if (uniq.length && c.time === uniq[uniq.length - 1].time) { report.dropped++; if (report.issues.length < MAX_ISSUES) report.issues.push(`跨文件重复时间 ${c.time}（仅保留首条）`); continue; }
    uniq.push(c);
  }
  report.kept = uniq.length;
  if (uniq.length > 1) {
    const dts = [];
    for (let i = 1; i < uniq.length; i++) dts.push(uniq[i].time - uniq[i - 1].time);
    dts.sort((a, b) => a - b);
    report.baseSec = dts[Math.floor(dts.length / 2)];
    report.timeRange = [uniq[0].time, uniq[uniq.length - 1].time];
  }
  return { candles: uniq, report };
}

/* 目录合并加载：适配 kline-data/spot/<SYMBOL>/<TF>/YYYY-MM-DD.csv 的日度分文件布局。
   按文件名（即日期）排序依次解析，合并交给 merge()。 */
function loadDirSync(dirPath) {
  // eslint-disable-next-line no-undef
  const fs = require('fs'), p = require('path');
  const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.csv')).sort();
  if (!files.length) throw new Error(`目录无 CSV 文件：${dirPath}`);
  const results = files.map(f => {
    const r = parse(fs.readFileSync(p.join(dirPath, f), 'utf8'));
    r.report.issues = r.report.issues.map(msg => `[${f}] ${msg}`);
    return r;
  });
  return merge(results);
}

const api = { parse, merge, loadFileSync, loadDirSync };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
return api;
})();
