/* ============================================================================
 * chan-state.js — 状态机与状态转移网络（V0.3，需求书第七节）
 *
 * 全局对象：ChanState（纯数据 + 纯函数，不碰 DOM）
 *
 *   MACHINES            三台状态机定义：笔 / 中枢 / 买卖点
 *     states[]          { id, name, def, enter, exit, fn, theory, verify }
 *     transitions[]     { from, to, label, cond, fn, theory, verify, arc? }
 *   LAYOUT              面板 SVG 的静态布局（纯数据；app.js 负责渲染）
 *   track(snaps, i, signals, ghosts)
 *     由逐根回放快照推导"当前实例"的状态、走过的路径与合法后续转移：
 *     → { stroke: Info, pivot: Info, signal: Info }
 *     Info = { cur, inst, path, visited, legal, detail }
 *       cur      当前状态 id（signal 无实例时为 null）
 *       inst     当前实例的一句话描述
 *       path     该实例已走过的状态 id 序列（含当前）
 *       visited  各状态首次进入的回放帧（近似值见注释）
 *       legal    当前时点的合法后续状态 id 集合（含自环）
 *
 * 核验口径（与 chan-rules.js 一致）：
 *   confirmed   状态/转移直接对应源码判定（ChanStrokeBuilder / ChanPivotDetector / ChanSignals）
 *   provisional 源码不显式输出、由每帧快照推导（候选 / 待定 / 失效 / 候选期起点等）
 *
 * 与污染模型的呼应：结构污染会把锚点笔修正掉，使「条件待定 → 失效 / 不可达」，
 * 面板以三态着色如实呈现（已成立=当前，条件待定=合法后续，不可达=其余）。
 * ============================================================================ */
var ChanState = (function () {
'use strict';

const MACHINES = {
  /* ───────────────────────── 笔 ───────────────────────── */
  stroke: {
    title: '笔',
    states: [
      { id: 'candidate', name: '候选',
        def: '起始分型已确认，反向分型尚未确认（或两分型间隔不足 2 根独立合并K线），笔尚未成立。',
        enter: '一个新分型被确认，与最近异型分型构成潜在端点对',
        exit: '反向分型确认且间隔达标 → 成立；起点被同型更极端分型取代 → 仍在候选（顺延）',
        fn: 'ChanFractalDetector.Detect + ChanStrokeBuilder.BuildAlternatingSequence',
        theory: '新笔口径：两分型之间至少间隔 2 根独立合并K线（MinMergedBarsBetween=2）',
        verify: 'provisional' },
      { id: 'active', name: '成立·未稳定', short: '未稳定',
        def: '笔已成立（端点分型交替、间隔达标），但身后不足 2 笔，端点仍可被后续K线修正。',
        enter: '反向分型确认且间隔达标，交替序列新增一个端点',
        exit: '身后累积 2 笔 → 稳定；端点被同型更极端分型取代 → 修正（仍在未稳定）；回退合并 → 撤销',
        fn: 'ChanStrokeBuilder.Build',
        theory: '尾部两笔仍可能被后续数据修订（缠论的笔延伸/破坏），故只有身后 ≥2 笔才标记 IsConfirmed',
        verify: 'confirmed' },
      { id: 'stable', name: '稳定',
        def: '身后已有 ≥2 笔，自 StableFromBarIndex 所在K线起不可再被修正。',
        enter: '身后新增满 2 笔；稳定时点 = 倒数第 3 个端点分型的确认K线（ConfirmBarIndex）',
        exit: '（终态）源码口径下稳定笔不再变化',
        fn: 'ChanStrokeBuilder.Build（StabilityMarginStrokes=2）',
        theory: '只有不可修正的笔才能产生信号（ChanSignals 记账口径）',
        verify: 'confirmed' },
      { id: 'terminated', name: '终结·被撤销', short: '终结',
        def: '未稳定的笔在间隔回退合并中被吞掉，并入更长的笔，实例结束。',
        enter: 'EnforceGapBackwards：收窄后与更早分型间隔不足，末尾分型对被合并',
        exit: '（终态）',
        fn: 'ChanStrokeBuilder.EnforceGapBackwards',
        theory: '严格交替约束的回退：去掉末两个端点，与新的末尾同型取更极端者',
        verify: 'confirmed' },
    ],
    transitions: [
      { from: 'candidate', to: 'active', label: '成立', cond: '反向分型确认，且两分型间独立合并K线 ≥ 2 根', fn: 'BuildAlternatingSequence', theory: '新笔口径（唯一口径，不可切换）', verify: 'confirmed' },
      { from: 'candidate', to: 'candidate', label: '顺延', arc: 'self', cond: '起点分型被同向更极端分型取代', fn: 'BuildAlternatingSequence（同型取更极端）', theory: '同型分型只保留更极端者', verify: 'confirmed' },
      { from: 'active', to: 'active', label: '修正', arc: 'self', cond: '同型更极端分型取代端点（笔延伸/收窄），终点位置改变', fn: 'BuildAlternatingSequence', theory: '同型分型只保留更极端者', verify: 'confirmed' },
      { from: 'active', to: 'stable', label: '稳定', cond: '身后新增 2 笔；稳定时点 = pts[i+margin+1].ConfirmBarIndex', fn: 'ChanStrokeBuilder.Build', theory: '无未来函数：稳定时点之前该信息不可知', verify: 'confirmed' },
      { from: 'active', to: 'terminated', label: '撤销', arc: 'down', cond: '间隔回退合并吞掉该笔（并入更长的笔）', fn: 'EnforceGapBackwards', theory: '严格交替约束的回退', verify: 'confirmed' },
    ],
  },

  /* ───────────────────────── 中枢 ───────────────────────── */
  pivot: {
    title: '中枢',
    states: [
      { id: 'candidate', name: '候选',
        def: '已有连续两笔，第三笔（进行中）尚未使三笔产生共同重叠区间；或第三笔尚未出现。',
        enter: '最近两笔形成（笔严格交替、首尾相连）',
        exit: '第三笔使 min(三笔高点) > max(三笔低点) → 形成；笔被修正 → 仍在候选',
        fn: 'ChanPivotDetector.Detect（三笔窗口右移）',
        theory: '中枢 = 连续三笔的重叠区间：Zg=三笔高点最小值，Zd=三笔低点最大值，要求 Zg>Zd',
        verify: 'provisional' },
      { id: 'formed', name: '形成（三笔）', short: '形成',
        def: '连续三笔存在共同重叠 [ZD, ZG]，中枢成立，尚未出现离开笔。',
        enter: '三笔重叠判定 Zg>Zd 通过',
        exit: '下一笔终点仍在区间内 → 延伸；某笔终点离开且再下一笔未回 → 离开；构成笔被修正 → 重构',
        fn: 'ChanPivotDetector.Detect',
        theory: '笔中枢口径（源码无线段中枢）',
        verify: 'confirmed' },
      { id: 'extending', name: '延伸',
        def: '第 4 笔起终点仍在 [ZD, ZG] 内，或短暂离开一笔后下一笔立即返回区间，中枢笔数递增。',
        enter: '后续笔终点仍在 [ZD, ZG]（EndInside）；或离开一笔后下一笔回到区间',
        exit: '某笔终点离开且再下一笔未回 → 离开；构成笔被修正 → 重构',
        fn: 'ChanPivotDetector.Detect（EndInside，end++/end+=2）',
        theory: '源码口径：离开一笔后下一笔回到区间视为震荡继续（无「返回」状态，如实呈现）',
        verify: 'confirmed' },
      { id: 'left', name: '离开（已确认）', short: '离开',
        def: '某笔终点离开 [ZD, ZG] 且再下一笔未回到区间：该笔为离开笔，中枢被确认结束，方向由离开笔给出。',
        enter: 'EndInside 连续两笔失败，LeavingStrokeIndex 落定，IsConfirmed=true',
        exit: '实例生命周期关闭 → 终结（其后各笔进入新中枢候选）',
        fn: 'ChanPivotDetector.Detect（leaving=end+1）',
        theory: '中枢须被离开笔确认才不再延伸；1/3 类买卖点都以已确认中枢为前提',
        verify: 'confirmed' },
      { id: 'terminated', name: '终结',
        def: '中枢生命周期关闭：离开后该实例不再演化（新中枢另起）；或构成笔被修正导致中枢重构/消失。',
        enter: '离开确认后实例关闭；或未离开时构成笔被修订、三笔重叠不再成立',
        exit: '（终态）',
        fn: 'ChanPivotDetector.Detect（i=leaving ?? end+1，旧实例不再回访）',
        theory: '一个中枢实例离开即终结；原著「中枢新生」源码未实现（M2 目录已标待实现）',
        verify: 'provisional' },
    ],
    transitions: [
      { from: 'candidate', to: 'formed', label: '重叠成枢', cond: '连续三笔满足 Zg = min(三高) > Zd = max(三低)', fn: 'ChanPivotDetector.Detect', theory: '中枢定义', verify: 'confirmed' },
      { from: 'formed', to: 'extending', label: '延伸', cond: '下一笔终点仍在 [ZD, ZG] 内（或离开一笔后下一笔返回）', fn: 'EndInside → end++/end+=2', theory: '延伸使 StrokeCount 递增', verify: 'confirmed' },
      { from: 'extending', to: 'extending', label: '继续延伸', arc: 'self', cond: '再一笔终点仍在区间内', fn: 'EndInside', theory: '同上', verify: 'confirmed' },
      { from: 'formed', to: 'left', label: '离开确认', arc: 'up', cond: '某笔终点离开区间，且再下一笔未回到区间', fn: 'ChanPivotDetector.Detect', theory: '离开笔确认后中枢结束', verify: 'confirmed' },
      { from: 'extending', to: 'left', label: '离开确认', cond: '同上：终点离开 + 下一笔未回', fn: 'ChanPivotDetector.Detect', theory: '同上', verify: 'confirmed' },
      { from: 'formed', to: 'terminated', label: '重构消失', arc: 'down', tdx: -14, cond: '构成笔（未稳定）被修正，三笔重叠不再成立', fn: '（快照推导：同一首笔锚点的中枢从列表消失）', theory: '笔未稳定则中枢亦可变', verify: 'provisional' },
      { from: 'extending', to: 'terminated', label: '重构消失', arc: 'down', cond: '同上', fn: '同上', theory: '同上', verify: 'provisional' },
      { from: 'left', to: 'terminated', label: '关闭', arc: 'down', tdx: 14, cond: '离开确认后实例关闭，后续笔进入新中枢候选', fn: 'ChanPivotDetector.Detect（窗口越过 leaving）', theory: '走势终完美：旧中枢关闭，新结构另起', verify: 'confirmed' },
    ],
  },

  /* ───────────────────────── 买卖点 ───────────────────────── */
  signal: {
    title: '买卖点',
    states: [
      { id: 'prereq', name: '前置聚齐',
        def: '结构前提已满足：1类=中枢已离开且离开笔相对进入段背驰（MACD 面积比 < 阈值）；2类=1类锚点后形成「回抽不破」三笔形态；3类=已确认中枢后形成「突破 + 回抽不回中枢」两笔。',
        enter: '对应结构形态在回放帧上成立',
        exit: '锚点笔稳定时点到达 → 发出 / 被过滤；前提结构在稳定前被修正 → 失效',
        fn: 'ChanSignals.Detect（1/2/3 类形态判定）+ ChanDivergenceDetector.Check',
        theory: '2类只依赖 1类的结构形态，不受其可交易性影响（buyAnchors/sellAnchors）',
        verify: 'confirmed' },
      { id: 'pending', name: '条件待定',
        def: '锚点笔已成立但尚未稳定（StableFromBarIndex 未到），信号不可记账；能否发出需等稳定时点。',
        enter: '前置聚齐且锚点笔 IsConfirmed=false',
        exit: '稳定时点到达：三关全过 → 发出；任一关失败 → 被过滤；前提被修正 → 失效',
        fn: 'ChanSignals.SignalTime（未稳定返回 0，不产生信号）',
        theory: '记账口径（严格无未来函数）：只有不可修正的笔才能产生信号',
        verify: 'provisional' },
      { id: 'emitted', name: '已发出',
        def: '锚点笔稳定时点到达，且通过暖机隔离、次级别确认、可交易性三关；信号按稳定时点K线收盘记账。',
        enter: '稳定时点所在K线收盘：三关全过',
        exit: '（终态）',
        fn: 'ChanSignals.Detect → Add（SubLevelOk + 可交易性校验）',
        theory: '信号时间=稳定时点K线，价格=该K线收盘；结构参考极值只出现在说明里',
        verify: 'confirmed' },
      { id: 'filtered', name: '被过滤',
        def: '结构成立但被过滤：暖机隔离 / 次级别未确认 / 止损落在入场价反侧（附原因，即 ghost，工程约定 E1）。',
        enter: '稳定时点到达，但三关之一失败',
        exit: '（终态）',
        fn: 'ChanSignals（IsBoundaryContaminated / SubLevelOk / Add 的可交易性校验）',
        theory: '被过滤者结构上成立，只是不可交易或不可信；实验室以 ghost 如实记录（不改真实信号集合）',
        verify: 'confirmed' },
      { id: 'invalid', name: '失效',
        def: '锚点笔稳定之前前提结构被修正（背驰消失 / 形态破坏），该信号实例不再可能发出。',
        enter: '稳定时点之前，背驰或形态因笔修正而瓦解',
        exit: '（终态）',
        fn: '（快照推导：前提在锚点稳定前消失）',
        theory: '与污染模型呼应：结构污染把待定的前提修正掉，信号胎死腹中',
        verify: 'provisional' },
    ],
    transitions: [
      { from: 'prereq', to: 'pending', label: '等稳定', cond: '锚点笔已成立但 IsConfirmed=false，等待稳定时点', fn: 'ChanSignals.SignalTime', theory: '记账口径', verify: 'provisional' },
      { from: 'prereq', to: 'emitted', label: '直发', arc: 'up', cond: '前提成立时锚点笔本帧已稳定，且三关全过', fn: 'ChanSignals.Detect → Add', theory: '稳定与前提同帧到达', verify: 'confirmed' },
      { from: 'prereq', to: 'filtered', label: '直滤', arc: 'down', fsx: 10, ldx: -25, cond: '前提成立时锚点笔已稳定，但三关之一失败', fn: '同上', theory: '同上', verify: 'confirmed' },
      { from: 'prereq', to: 'invalid', label: '瓦解', arc: 'down', fsx: 22, dip: 130, ldx: 29, ldy: 214, cond: '前提结构在稳定前被修正（背驰/形态消失）', fn: '（快照推导）', theory: '笔未稳定则前提可变', verify: 'provisional' },
      { from: 'pending', to: 'emitted', label: '发出', cond: '稳定时点到达：暖机隔离通过 + 次级别确认 + 可交易（止损在入场价正侧）', fn: 'ChanSignals.Detect → Add + SubLevelMatches', theory: '三关全过才记账', verify: 'confirmed' },
      { from: 'pending', to: 'filtered', label: '过滤', cond: '稳定时点到达，但暖机隔离 / 次级别未确认 / 不可交易', fn: '同上（ghost 记录原因）', theory: '工程约定 E1：被过滤者如实记录', verify: 'confirmed' },
      { from: 'pending', to: 'invalid', label: '瓦解', cond: '稳定时点之前锚点笔被修正，前提消失', fn: '（快照推导）', theory: '同上', verify: 'provisional' },
    ],
  },
};

/* 面板静态布局（纯数据）：节点 = [x, y] 左上角，节点尺寸 68×30。
 * 三台机器横排共享四条水平带：标题 y=20 · 主行 y=64 · 次行 y=140 · 深弧带 y≈202。
 * 间距按边标签宽度定：同机 40–44px，机间 ≥36px；viewBox 压到 1090×224（原 1350×210），
 * 在典型窗口宽度下节点文字可读（缩放比 ~0.87，原 ~0.66）。 */
const NW = 68, NH = 30;
const LAYOUT = {
  vb: [1090, 224],
  order: ['stroke', 'pivot', 'signal'],
  stroke: {
    title: '① 笔', tx: 14, ty: 20,
    nodes: { candidate: [14, 64], active: [122, 64], stable: [230, 64], terminated: [122, 140] },
  },
  pivot: {
    title: '② 中枢', tx: 334, ty: 20,
    nodes: { candidate: [334, 64], formed: [446, 64], extending: [558, 64], left: [670, 64], terminated: [558, 140] },
  },
  signal: {
    title: '③ 买卖点', tx: 782, ty: 20,
    nodes: { prereq: [782, 64], pending: [894, 64], emitted: [1006, 64], filtered: [894, 140], invalid: [1006, 140] },
  },
};

/* ───────────────────────── 快照推导（纯函数） ───────────────────────── */
const fm2 = x => x == null ? '-' : (+x).toFixed(2);
const gk = (s, off) => (s.startBarIndex + off) + '|' + (s.isUp ? 1 : 0);

/* 某笔（按 起点+方向 锚定）首次出现的帧 */
function firstStrokeFrame(snaps, i, stroke, off) {
  const key = gk(stroke, off);
  for (let j = 0; j <= i; j++) {
    const oj = snaps[j].off;
    if (snaps[j].res.strokes.some(x => gk(x, oj) === key)) return j;
  }
  return null;
}

/* 某背驰（离开笔终点全局下标 + 方向）首次出现的帧 */
function findDivFrame(snaps, i, gRefGlobal, isUp) {
  for (let j = 0; j <= i; j++) {
    const rj = snaps[j].res, oj = snaps[j].off;
    for (const d of rj.divergences) {
      const s = rj.strokes[d.leaveIndex];
      if (s && s.endBarIndex + oj === gRefGlobal && d.isUp === isUp) return j;
    }
  }
  return null;
}

/* 笔实例：跟踪当前最后一笔（发展中/刚稳定的那笔） */
function trackStroke(snaps, i) {
  const r = snaps[i].res, off = snaps[i].off;
  const visited = {}, path = [];
  let corrections = 0;
  if (!r.strokes.length) {
    visited.candidate = 0;
    return { cur: 'candidate', inst: '尚无笔：等待分型交替、间隔达标', path: ['candidate'], visited, legal: ['active'], corrections, detail: null };
  }
  const li = r.strokes.length - 1, s = r.strokes[li], key = gk(s, off);
  let birth = null, stableF = null, prevEnd = null;
  for (let j = 0; j <= i; j++) {
    const oj = snaps[j].off;
    const hit = snaps[j].res.strokes.find(x => gk(x, oj) === key);
    if (!hit) continue;
    if (birth == null) birth = j;
    const ge = hit.endBarIndex + oj;
    if (prevEnd != null && prevEnd !== ge) corrections++;   // 端点被修正（自环转移的次数）
    prevEnd = ge;
    if (hit.isConfirmed && stableF == null) stableF = j;
  }
  /* 候选期起点（近似）：起始分型首次被确认的帧 */
  let candF = null;
  const gStart = s.startBarIndex + off, startIsTop = !s.isUp;
  for (let j = 0; j <= (birth == null ? i : birth); j++) {
    const oj = snaps[j].off;
    const f = snaps[j].res.fractals.find(f => f.barIndex + oj === gStart && f.isTop === startIsTop);
    if (f && (candF == null || f.confirmBarIndex + oj < candF)) candF = f.confirmBarIndex + oj;
  }
  if (birth == null) birth = i;
  if (candF != null && candF < birth) { visited.candidate = candF; path.push('candidate'); }
  visited.active = birth; path.push('active');
  const cur = s.isConfirmed ? 'stable' : 'active';
  if (cur === 'stable') { visited.stable = stableF == null ? i : stableF; path.push('stable'); }
  const legal = cur === 'active' ? ['active', 'stable', 'terminated'] : [];
  const inst = `笔 ${li} ${s.isUp ? '↑' : '↓'} #${s.startBarIndex + off}→#${s.endBarIndex + off}`
    + (corrections ? `（修正 ${corrections} 次）` : '')
    + (cur === 'stable' ? ` · 稳定自 #${s.stableFromBarIndex + off}` : ' · 未稳定');
  return { cur, inst, path, visited, legal, corrections, detail: { index: li, s, off } };
}

/* 中枢实例：跟踪当前最后一个中枢（以首笔起点全局下标为实例锚） */
function trackPivot(snaps, i) {
  const r = snaps[i].res, off = snaps[i].off;
  const visited = {}, path = [];
  if (!r.pivots.length) {
    const st = r.strokes;
    let inst = '尚无中枢：';
    if (st.length >= 3) {
      const a = st[st.length - 3], b = st[st.length - 2], c = st[st.length - 1];
      const zg = Math.min(a.high, b.high, c.high), zd = Math.max(a.low, b.low, c.low);
      inst += zg > zd ? '最近三笔有重叠（等待算法收录）' : `最近三笔无共同重叠（ZG ${fm2(zg)} ≤ ZD ${fm2(zd)}）`;
    } else inst += st.length ? `已有 ${st.length} 笔，至少还需 ${3 - st.length} 笔` : '等待成笔';
    visited.candidate = 0;
    return { cur: 'candidate', inst, path: ['candidate'], visited, legal: ['formed'], detail: null };
  }
  const p = r.pivots[r.pivots.length - 1];
  const a0 = r.strokes[p.startStrokeIndex];
  const key = a0.startBarIndex + off;
  let birth = null, extF = null, leftF = null, prevSig = null, revises = 0;
  for (let j = 0; j <= i; j++) {
    const rj = snaps[j].res, oj = snaps[j].off;
    for (const q of rj.pivots) {
      const qa = rj.strokes[q.startStrokeIndex];
      if (!qa || qa.startBarIndex + oj !== key) continue;
      if (birth == null) birth = j;
      const sig = q.zg + '|' + q.zd;
      if (prevSig != null && prevSig !== sig) revises++;      // 区间修正（延伸另由 extF 记录）
      prevSig = sig;
      if (q.strokeCount > 3 && extF == null) extF = j;
      if (q.isConfirmed && leftF == null) leftF = j;
    }
  }
  if (birth == null) birth = i;
  if (birth > 0) { visited.candidate = birth - 1; path.push('candidate'); }  // 候选期起点（近似）
  visited.formed = birth; path.push('formed');
  const cur = p.isConfirmed ? 'left' : (p.strokeCount > 3 ? 'extending' : 'formed');
  if (cur !== 'formed' && extF != null) { visited.extending = extF; path.push('extending'); }
  if (cur === 'left') { visited.left = leftF == null ? i : leftF; path.push('left'); }
  const legal = cur === 'formed' ? ['extending', 'left', 'terminated']
    : cur === 'extending' ? ['extending', 'left', 'terminated']
    : ['terminated'];
  const ls = cur === 'left' && p.leavingStrokeIndex != null ? r.strokes[p.leavingStrokeIndex] : null;
  const inst = `中枢 [${fm2(p.zd)} – ${fm2(p.zg)}] ${p.strokeCount} 笔（笔 ${p.startStrokeIndex}–${p.endStrokeIndex}）`
    + (revises ? `（区间修正 ${revises} 次）` : '')
    + (cur === 'left' ? ` · 离开笔 ${p.leavingStrokeIndex}${ls ? (ls.isUp ? ' 向上' : ' 向下') : ''}` : ' · 未离开');
  return { cur, inst, path, visited, legal, detail: { p, off } };
}

/* 买卖点实例：优先取「条件待定」（最近的未稳定锚点），否则取最近已记账（发出/被过滤） */
function trackSignal(snaps, i, signals, ghosts) {
  const r = snaps[i].res, off = snaps[i].off;
  const done = [];
  (signals || []).forEach(x => { if (x.gConfirm <= i) done.push({ x, filtered: false }); });
  (ghosts || []).forEach(x => { if (x.gConfirm <= i) done.push({ x, filtered: true }); });
  done.sort((a, b) => a.x.gConfirm - b.x.gConfirm);
  const doneHas = (kind, gRef) => done.some(d => d.x.kind === kind && d.x.gRef === gRef);

  /* 待定探测：镜像 ChanSignals 口径的只读重推（不重复判定，只为呈现状态） */
  const pend = [];
  r.divergences.forEach(d => {                       // 1 类：背驰锚点笔未稳定
    const a = r.strokes[d.leaveIndex]; if (!a || a.isConfirmed) return;
    const kind = d.isUp ? '1卖' : '1买', gRef = a.endBarIndex + off;
    if (doneHas(kind, gRef)) return;
    pend.push({ kind, gRef, pre: findDivFrame(snaps, i, gRef, d.isUp),
      why: `中枢离开笔 ${d.leaveIndex} 背驰（面积比 ${d.areaRatio.toFixed(2)}），锚点笔未稳定` });
  });
  r.divergences.forEach(d => {                       // 2 类：1类锚点后「回抽不破」形态已成、锚笔未稳定
    const k = d.leaveIndex;
    if (k + 2 >= r.strokes.length) return;
    const a = r.strokes[k], b = r.strokes[k + 1], c = r.strokes[k + 2];
    if (!a || !b || !c || c.isConfirmed) return;
    let kind = null;
    if (!d.isUp && !a.isUp && b.isUp && !c.isUp && c.low > a.low) kind = '2买';
    if (d.isUp && a.isUp && !b.isUp && c.isUp && c.high < a.high) kind = '2卖';
    if (!kind) return;
    const gRef = c.endBarIndex + off;
    if (doneHas(kind, gRef)) return;
    pend.push({ kind, gRef, pre: firstStrokeFrame(snaps, i, c, off),
      why: `1类锚点笔 ${k} 后回抽不破形态已成，回抽笔 ${k + 2} 未稳定` });
  });
  r.pivots.forEach(p => {                            // 3 类：已确认中枢后「突破+回抽不回」，回抽笔未稳定
    if (!p.isConfirmed) return;
    for (let k = p.endStrokeIndex + 1; k + 1 < r.strokes.length; k++) {
      const leave = r.strokes[k], pull = r.strokes[k + 1];
      const buy = leave.isUp && leave.high > p.zg && !pull.isUp && pull.low > p.zg;
      const sell = !leave.isUp && leave.low < p.zd && pull.isUp && pull.high < p.zd;
      if ((!buy && !sell) || pull.isConfirmed) continue;
      const kind = buy ? '3买' : '3卖', gRef = pull.endBarIndex + off;
      if (doneHas(kind, gRef)) continue;
      pend.push({ kind, gRef, pre: firstStrokeFrame(snaps, i, pull, off),
        why: `${buy ? `突破 ZG ${fm2(p.zg)}` : `跌破 ZD ${fm2(p.zd)}`}后回抽不回中枢，回抽笔 ${k + 1} 未稳定` });
    }
  });

  if (pend.length) {
    pend.sort((a, b) => b.gRef - a.gRef);
    const p0 = pend[0];
    const pre = p0.pre == null ? i : p0.pre;
    return { cur: 'pending', inst: `${p0.kind} 待定：${p0.why}`, path: ['prereq', 'pending'],
      visited: { prereq: pre, pending: pre }, legal: ['emitted', 'filtered', 'invalid'], detail: p0 };
  }
  if (done.length) {
    const d = done[done.length - 1], x = d.x;
    const cur = d.filtered ? 'filtered' : 'emitted';
    let pre = /^1/.test(x.kind) ? findDivFrame(snaps, i, x.gRef, x.side === 'sell') : null;
    if (pre == null) {                               // 2/3 类：锚点笔出现帧（近似）
      const anchor = r.strokes.find(s => s.endBarIndex + off === x.gRef);
      if (anchor) pre = firstStrokeFrame(snaps, i, anchor, off);
    }
    if (pre == null) pre = x.gRef;
    const visited = { prereq: pre, pending: pre };
    visited[cur] = x.gConfirm;
    const inst = `${x.kind} ${d.filtered ? '被过滤' : '已发出'}：极值 #${x.gRef}（${fm2(x.refPrice)}）→ 记账 #${x.gConfirm} @${fm2(x.price)}`
      + (d.filtered && x.reason ? `（${x.reason}）` : '');
    return { cur, inst, path: ['prereq', 'pending', cur], visited, legal: [], detail: { x, filtered: d.filtered } };
  }
  return { cur: null, inst: '尚无买卖点实例：等待前置聚齐（中枢离开+背驰 / 回抽形态 / 突破回抽）',
    path: [], visited: {}, legal: ['prereq'], detail: null };
}

function track(snaps, i, signals, ghosts) {
  return {
    stroke: trackStroke(snaps, i),
    pivot: trackPivot(snaps, i),
    signal: trackSignal(snaps, i, signals, ghosts),
  };
}

const api = { MACHINES, LAYOUT, NW, NH, track, _firstStrokeFrame: firstStrokeFrame, _findDivFrame: findDivFrame };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
return api;
})();
