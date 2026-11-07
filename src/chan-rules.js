/* ============================================================================
 * chan-rules.js — 理论规则注册表（M2：结构解剖室 + 理论显微镜）
 *
 * 分层：本文件只放"知识"与"由知识驱动的步骤构造"，不碰 DOM / 画布。
 *   chan-microscope.js 负责显微镜的渲染与交互；app.js 负责目录与选中态。
 *
 * 每条结构必须显式标注实现状态，禁止把"源码没有"的东西画成结果：
 *   impl    源码已有（可直接在当前案例中展示）
 *   partial 源码部分实现（有口径差异或只实现了一部分）
 *   todo    源码未实现（只能看原著概念与缺口，结果/生成模式禁用）
 *
 * 状态的判定依据是 Mdk.Api/Analysis/Chan/*.cs（2026-09-30 精简后的版本）：
 *   已实现：包含、合并K线、分型、笔（仅新笔）、笔中枢（形成/延伸/离开）、
 *           笔级背驰（MACD 面积）、1/2/3 类买卖点（简化）、次级别确认、级别叠加。
 *   未实现：线段/特征序列、走势类型、多级别递归/区间套、中枢扩展/新生/升级。
 * ============================================================================ */
var ChanRules = (function () {
'use strict';
const E = (typeof ChanEngine !== 'undefined') ? ChanEngine : require('./chan-engine.js');

/* 目录分组（顺序即左侧树顺序） */
const GROUPS = [
  { id: 'basic', name: '基础结构' },
  { id: 'stroke', name: '笔与线段' },
  { id: 'pivot', name: '中枢' },
  { id: 'trend', name: '走势类型' },
  { id: 'level', name: '多级别' },
  { id: 'div', name: '背驰' },
  { id: 'bs', name: '买卖点' },
];

const ITEMS = [
  /* ───────────────────────── A. 基础结构 ───────────────────────── */
  {
    id: 'kbar', name: '原始K线', group: 'basic', status: 'impl', kind: 'raw',
    brief: '分析的唯一输入：每根K线的 OHLC 与时间。',
    def: '原始K线是行情的最小观测单位，包含开盘、最高、最低、收盘与时间。缠论的包含处理、分型、笔都在它的基础上被判定。',
    math: 'Candle = { time, open, high, low, close }',
    need: ['时间递增且无重复', '高 ≥ max(开, 收)，低 ≤ min(开, 收)'],
    suff: [],
    pre: [],
    drop: [],
    near: [['merge', '包含关系直接在原始K线上判定']],
    counter: '',
    origin: '行情数据本身，非缠论结构；原著只把它作为走势的原材料。',
    src: 'Mdk.Api.Models.Candle（输入模型）', srcFn: '—',
    note: '实验室由生成器按固定周期合成K线；生成器只造价格，结构由引擎判定。',
    link: ['merge', 'fractal-top', 'fractal-bottom'],
  },
  {
    id: 'merge', name: '包含关系', group: 'basic', status: 'impl', kind: 'merge',
    brief: '一根K线的高低完全覆盖另一根（含等高/等低平台）。',
    def: '相邻两根K线，若其中一根的最高价不低于另一根、最低价不高于另一根，则存在包含关系。包含关系使K线序列无法直接用于分型，必须先合并。',
    math: '(B.high ≤ A.high 且 B.low ≥ A.low) 或 (B.high ≥ A.high 且 B.low ≤ A.low)',
    need: ['两根K线相邻', '一端的高低价完全落入另一端（平台/等高也算）'],
    suff: ['按上一根合并K线的方向合并：向上取高高，向下取低低'],
    pre: ['前序K线已完成合并，合并序列的最后一根带有方向 isUp'],
    drop: ['不完全覆盖（普通的高低交错）→ 不合并，直接成为新的合并K线'],
    near: [['merged-kbar', '包含关系是判定，合并K线是结果'], ['fractal-top', '分型只在合并后的序列上识别']],
    counter: '两根K线只是收盘价接近、但高低区间交错——不构成包含，不应合并。',
    origin: '《教你炒股票》K线包含处理（课次待核对）。',
    src: 'ChanInclusion.Merge', srcFn: 'ChanInclusion.cs',
    note: '方向取"上一根合并K线的 isUp"；序列第一根默认 isUp=true。等高/等低按包含处理（源码注释明确包含平台）。',
    link: ['merged-kbar', 'fractal-top', 'fractal-bottom'],
  },
  {
    id: 'merged-kbar', name: '合并K线', group: 'basic', status: 'impl', kind: 'merged',
    brief: '包含处理后的新K线：带高低区间与原始下标范围。',
    def: '把存在包含关系的连续K线合并为一根，合并K线保留起始/结束的原始K线下标、合并后的最高价与最低价。后续分型与笔全部在合并K线序列上运行。',
    math: 'MergedCandle = { startIndex, endIndex, high, low, isUp }',
    need: ['由至少一根原始K线构成'],
    suff: [],
    pre: ['已完成包含处理'],
    drop: [],
    near: [['merge', '包含关系'], ['fractal-top', '顶分型在中间合并K线上判定']],
    counter: '',
    origin: '《教你炒股票》K线包含处理（课次待核对）。',
    src: 'ChanInclusion.Merge', srcFn: 'ChanInclusion.cs',
    note: '合并K线的 endIndex 是分型确认时点的来源：分型的 ConfirmBarIndex = 右邻合并K线的 endIndex。',
    link: ['merge', 'fractal-top', 'fractal-bottom'],
  },
  {
    id: 'fractal-top', name: '顶分型', group: 'basic', status: 'impl', kind: 'fractal',
    brief: '中间合并K线的高、低都严格高于左右两根。',
    def: '在合并K线序列上，若中间一根的最高价与最低价都严格高于左右两根，则构成顶分型。顶分型的极值取中间合并K线覆盖区间内最高价所在的那根原始K线。',
    math: 'mid.high > prev.high 且 mid.high > next.high 且 mid.low > prev.low 且 mid.low > next.low',
    need: ['连续三根合并K线', '中间根的 high、low 均严格大于两侧（等号不成立）'],
    suff: ['取中间根覆盖的原始K线中 high 最大者作为极值K线'],
    pre: ['已完成包含处理'],
    drop: ['中间根只创新高但低点不高于两侧 → 不是顶分型（可能是包含关系未处理干净）'],
    near: [['fractal-bottom', '底分型条件完全镜像'], ['stroke', '顶分型是笔的候选端点']],
    counter: '三根合并K线中间一根创了新高，但低点低于两侧——按源码不是顶分型。',
    origin: '《教你炒股票》分型定义（第62课《分型、笔与线段》，课次待核对）。',
    src: 'ChanFractalDetector.Detect', srcFn: 'ChanFractalDetector.cs',
    note: 'ConfirmBarIndex = 右侧合并K线的 endIndex：分型只有在右邻合并K线完成后才可知。连续同型分型只保留更极端者。',
    link: ['fractal-bottom', 'stroke', 'merged-kbar'],
  },
  {
    id: 'fractal-bottom', name: '底分型', group: 'basic', status: 'impl', kind: 'fractal',
    brief: '中间合并K线的高、低都严格低于左右两根。',
    def: '顶分型的镜像：中间合并K线的最低价与最高价都严格低于左右两根，极值取中间合并K线覆盖区间内最低价所在的原始K线。',
    math: 'mid.low < prev.low 且 mid.low < next.low 且 mid.high < prev.high 且 mid.high < next.high',
    need: ['连续三根合并K线', '中间根的 high、low 均严格小于两侧'],
    suff: ['取中间根覆盖的原始K线中 low 最小者作为极值K线'],
    pre: ['已完成包含处理'],
    drop: ['中间根只创新低但高点不低于两侧 → 不是底分型'],
    near: [['fractal-top', '顶分型条件完全镜像'], ['stroke', '底→顶为向上笔']],
    counter: '一根长下影线单独创新低，但右邻合并K线更低——中间根不是三根中的最低，不构成底分型。',
    origin: '《教你炒股票》分型定义（第62课《分型、笔与线段》，课次待核对）。',
    src: 'ChanFractalDetector.Detect', srcFn: 'ChanFractalDetector.cs',
    note: '与顶分型共用同一函数；连续同型只保留更低者。',
    link: ['fractal-top', 'stroke', 'merged-kbar'],
  },
  /* ───────────────────────── B. 笔与线段 ───────────────────────── */
  {
    id: 'stroke', name: '笔（新笔）', group: 'stroke', status: 'impl', kind: 'stroke',
    brief: '顶底分型交替连接，中间至少隔 2 根独立合并K线。',
    def: '笔由相邻的顶分型与底分型连接而成：底→顶为向上笔，顶→底为向下笔。本项目只采用"新笔"口径：两个分型之间的合并K线，除两端外至少要间隔 2 根独立合并K线。',
    math: 'b.mergedIndex − a.mergedIndex − 1 ≥ 2；且 a、b 类型相反（顶底交替）',
    need: ['两端是方向相反的分型', '两分型间的独立合并K线 ≥ 2 根', '序列保持顶底严格交替'],
    suff: ['同型分型只保留更极端者；间隔不足时用更极端者收窄或丢弃'],
    pre: ['分型已在合并K线序列上识别完成'],
    drop: ['两分型间隔不足且新分型不比上一个同型分型更极端 → 丢弃', '不满足顶底交替 → 不成立'],
    near: [['stroke-stable', '笔成立后仍可能被后续行情修正'], ['segment', '线段由至少三笔构成，但源码未实现线段']],
    counter: '底分型后只隔一根合并K线就出现顶分型——按新笔口径不是笔，只是分型之间的噪声。',
    origin: '《教你炒股票》笔的定义（第62/65课，课次待核对）；新笔/老笔属流派分歧。',
    src: 'ChanStrokeBuilder.Build', srcFn: 'ChanStrokeBuilder.cs',
    note: '源码移除 StrokeMode 旋钮，只保留新笔（2026-09-30 用户拍板）。画笔时若间隔不足，会回退合并，保持严格交替。',
    link: ['fractal-top', 'fractal-bottom', 'stroke-stable', 'pivot'],
  },
  {
    id: 'stroke-stable', name: '笔的稳定（不可修正）', group: 'stroke', status: 'impl', kind: 'stroke',
    brief: '身后至少 2 笔，当前笔才被标记为不可修正。',
    def: '笔在形成后仍可能被后续K线延伸或破坏。源码不把"当前最后一笔"当作确定结构：只有当前笔身后已经积累至少 2 笔，才标记 IsConfirmed=true，并记录稳定时点。',
    math: 'isConfirmed = (strokeIndex + 2 ≤ lastStrokeIndex)；StableFromBarIndex = pts[strokeIndex + 3].ConfirmBarIndex',
    need: ['当前笔之后又形成至少 2 笔', '稳定时点所在K线已经收盘'],
    suff: ['稳定时点 = 第 2 笔终点分型的确认K线'],
    pre: ['笔已成立'],
    drop: ['尾部笔（身后不足 2 笔）→ 未稳定，不产生买卖点'],
    near: [['stroke', '笔的成立不等于笔的稳定'], ['buy1', '只有稳定笔才能记账']],
    counter: '看到最后一笔刚拐头就判定背驰/买点——该笔未稳定，源码不会据此记账。',
    origin: '工程约定：为满足无未来函数，源码以 StabilityMarginStrokes=2 兜底（C# 注释明确）。',
    src: 'ChanStroke.IsConfirmed / StableFromBarIndex', srcFn: 'ChanStrokeBuilder.cs',
    note: '这是"无未来函数"的核心实现：画布上虚线笔=未稳定，实线笔=稳定。',
    link: ['stroke', 'buy1', 'buy2', 'buy3'],
  },
  {
    id: 'segment', name: '线段', group: 'stroke', status: 'todo', kind: 'todo',
    brief: '至少三笔构成，前三笔必须有重叠；源码已移除。',
    def: '线段由至少三笔构成，且前三笔必须有重叠区间；线段的方向由起点与终点分型确定。线段只能被线段破坏，不能被单笔破坏。',
    math: '线段 = 至少 3 笔；前三笔的高低价区间交集非空',
    need: ['至少三笔', '前三笔存在重叠', '端点分型方向一致'],
    suff: [],
    pre: ['笔序列稳定'],
    drop: ['不足三笔', '前三笔无重叠'],
    near: [['segment-break', '线段破坏是线段结束的判定'], ['feature-seq', '特征序列用于判定线段破坏'], ['stroke', '笔是线段的构成单位']],
    counter: '三笔连续创新高但没有任何重叠——按原著不构成线段。',
    origin: '《教你炒股票》第62/65/67课（线段定义与划分标准，课次待核对）。',
    src: '无（2026-09-30 从源码移除）', srcFn: '—',
    note: '源码精简后统一以笔为最小单位；本实验室不伪造线段，相关图层与计算结果全部标记为待实现。',
    link: ['stroke', 'segment-break', 'feature-seq'],
  },
  {
    id: 'segment-break', name: '线段破坏', group: 'stroke', status: 'todo', kind: 'todo',
    brief: '由反向线段的确立来确认，而不是某一笔越过端点。',
    def: '线段的结束（破坏）由反向线段的确立来确认。原著按特征序列分型分两种情形：破坏笔与前一笔之间有无缺口，处理方式不同。单笔越过线段端点不构成线段破坏。',
    math: '特征序列出现有效分型 → 反向线段成立 → 原线段结束',
    need: ['原线段已成立', '反向走势形成线段（至少三笔）', '特征序列满足对应情形的分型条件'],
    suff: [],
    pre: ['线段划分完成'],
    drop: ['仅一笔越过端点', '反向走势未构成线段'],
    near: [['segment', '线段本身'], ['feature-seq', '判定工具'], ['stroke', '笔破坏 ≠ 线段破坏']],
    counter: '一笔快速跌破线段起点，但随后没有形成反向线段——原著口径下原线段未被破坏（可能只是线段延伸）。',
    origin: '《教你炒股票》第67课《线段划分标准的再分辨》（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现；当前案例无法展示线段破坏。',
    link: ['segment', 'feature-seq'],
  },
  {
    id: 'feature-seq', name: '特征序列', group: 'stroke', status: 'todo', kind: 'todo',
    brief: '线段内部与线段方向相反的笔构成的序列。',
    def: '特征序列是线段内部与线段方向相反的笔构成的序列：向上线段的特征序列取向下笔，向下线段取向上笔。特征序列的分型用于判定线段是否被破坏。',
    math: '向上线段：特征序列 = 段内向下笔；向下线段：特征序列 = 段内向上笔',
    need: ['线段已成立', '按线段方向取反向笔'],
    suff: [],
    pre: ['线段划分完成'],
    drop: ['线段尚未成立时不存在特征序列'],
    near: [['segment', '所属线段'], ['segment-break', '特征序列分型是破坏判据']],
    counter: '把线段内部同向的笔当作特征序列——方向取反了。',
    origin: '《教你炒股票》第67课（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现。',
    link: ['segment', 'segment-break'],
  },
  /* ───────────────────────── C. 中枢 ───────────────────────── */
  {
    id: 'pivot', name: '中枢定义 / 区间', group: 'pivot', status: 'impl', kind: 'pivot',
    brief: '连续三笔的重叠区间：ZG = 三笔高点最小值，ZD = 三笔低点最大值。',
    def: '中枢是连续三笔的重叠区间：上沿 ZG 取三笔高点的最小值，下沿 ZD 取三笔低点的最大值，并要求 ZG > ZD。区间 [ZD, ZG] 即中枢的震荡范围。',
    math: 'ZG = min(h₁, h₂, h₃)，ZD = max(l₁, l₂, l₃)，成立条件 ZG > ZD',
    need: ['连续三笔', '三笔价格区间存在公共交集（ZG > ZD）'],
    suff: ['从满足条件的第一笔开始，后续笔按延伸/离开规则演化'],
    pre: ['笔序列已成立'],
    drop: ['三笔无重叠（ZG ≤ ZD）→ 窗口右移，不构成中枢'],
    near: [['pivot-form', '定义与形成是同一判定的两面'], ['pivot-extend', '成立后先进入延伸状态'], ['pivot-leave', '结束由离开笔确认']],
    counter: '三笔逐级抬升且互不重叠——按源码不是中枢，只是单边走势。',
    origin: '《教你炒股票》走势中枢定义（课次待核对；原著"中枢"由次级别走势类型构成，源码以笔为最小单位做笔中枢近似）。',
    src: 'ChanPivotDetector.Detect', srcFn: 'ChanPivotDetector.cs',
    note: '这是"笔中枢"，不是原著严格意义上的走势中枢：源码精简后以笔为最小单位。',
    link: ['stroke', 'pivot-form', 'pivot-extend', 'pivot-leave'],
  },
  {
    id: 'pivot-form', name: '中枢形成', group: 'pivot', status: 'impl', kind: 'pivot',
    brief: '从某笔起连续三笔满足 ZG > ZD，中枢即成立。',
    def: '从笔序列的某个位置起，取连续三笔计算 ZG/ZD；若 ZG > ZD，则中枢在该位置形成。否则窗口右移一笔重新尝试。',
    math: 'ZG > ZD → 形成；StartStrokeIndex = i，EndStrokeIndex = i+2（初始）',
    need: ['连续三笔', 'ZG > ZD'],
    suff: [],
    pre: ['至少已形成三笔'],
    drop: ['ZG ≤ ZD → 不形成，i 右移'],
    near: [['pivot', '中枢区间'], ['pivot-extend', '形成后立即检查延伸']],
    counter: '把任意三笔都当中枢——源码明确要求 ZG > ZD。',
    origin: '源码实现口径（C# 注释"连续三笔存在重叠区间即构成中枢"）。',
    src: 'ChanPivotDetector.Detect', srcFn: 'ChanPivotDetector.cs',
    note: '源码没有"候选中枢"的独立状态；形成与后续延伸在同一次扫描中完成。',
    link: ['pivot', 'pivot-extend'],
  },
  {
    id: 'pivot-extend', name: '中枢延伸', group: 'pivot', status: 'impl', kind: 'pivot',
    brief: '后续笔的终点仍在 [ZD, ZG] 内，就并入中枢并累加笔数。',
    def: '中枢成立后，若下一笔的终点仍落在 [ZD, ZG] 内，该笔并入中枢，EndStrokeIndex 后移、StrokeCount 递增。延伸不改变 ZG/ZD。',
    math: 'ZD ≤ stroke.EndPrice ≤ ZG → end++，StrokeCount = end − start + 1',
    need: ['中枢已形成', '后续笔终点落在区间内'],
    suff: [],
    pre: ['中枢区间已确定'],
    drop: ['终点离开区间 → 转入离开判定'],
    near: [['pivot-leave', '延伸的反面'], ['pivot-return', '离开后返回仍按延伸处理']],
    counter: '用"整笔范围是否与中枢相交"判断延伸——源码明确禁止：笔首尾相连，离开笔必然相交。判据只看笔的终点。',
    origin: '源码实现口径（C# 注释：延伸看终点，不看整笔范围）。',
    src: 'ChanPivotDetector.Detect', srcFn: 'ChanPivotDetector.cs',
    note: '延伸可以无限持续；"九段以上升级"等规则源码没有实现。',
    link: ['pivot', 'pivot-leave', 'pivot-return'],
  },
  {
    id: 'pivot-leave', name: '中枢离开', group: 'pivot', status: 'impl', kind: 'pivot',
    brief: '某笔终点离开区间，且再下一笔也未回到区间内 → 该笔为离开笔。',
    def: '若某笔终点离开 [ZD, ZG]，且再下一笔的终点也没有回到区间内，则中枢结束：该笔被记为离开笔（LeavingStrokeIndex），IsConfirmed=true。',
    math: 'EndPrice ∉ [ZD, ZG] 且 下一笔 EndPrice ∉ [ZD, ZG] → leaving = end + 1',
    need: ['中枢已形成', '离开笔终点在区间外', '再下一笔也未回到区间'],
    suff: ['中枢被确认结束，不再延伸'],
    pre: ['中枢处于延伸状态'],
    drop: ['再下一笔回到区间内 → 视为震荡继续，按延伸处理（+2 继续）'],
    near: [['pivot-extend', '延伸'], ['pivot-return', '源码没有独立返回状态'], ['divergence', '离开笔是背驰的判定对象']],
    counter: '离开笔刚越过 ZG、下一笔又回到区间内——源码不记离开，中枢继续延伸。',
    origin: '源码实现口径（C# 注释：离开看终点，且下一笔不回区间）。',
    src: 'ChanPivotDetector.Detect', srcFn: 'ChanPivotDetector.cs',
    note: '离开笔的终点是背驰比较的锚点之一；中枢确认后才能出现 3 类买卖点。',
    link: ['pivot', 'pivot-return', 'divergence', 'buy3'],
  },
  {
    id: 'pivot-return', name: '中枢返回', group: 'pivot', status: 'partial', kind: 'pivot',
    brief: '离开后下一笔又回到区间——源码按"延伸"处理，没有独立状态。',
    def: '价格离开中枢区间后又回到区间内，理论上可视为"中枢返回"。源码没有单独的返回状态：若下一笔终点回到 [ZD, ZG]，则直接把它并入延伸（end += 2），中枢继续。',
    math: '离开笔 EndPrice ∉ [ZD, ZG] 且 下一笔 EndPrice ∈ [ZD, ZG] → end += 2（延伸）',
    need: ['已出现离开区间的笔', '再下一笔终点回到区间内'],
    suff: [],
    pre: ['中枢处于延伸/离开判定中'],
    drop: ['下一笔未回到区间 → 确认离开'],
    near: [['pivot-extend', '源码把返回并入延伸'], ['pivot-leave', '返回的反面']],
    counter: '把"离开后返回"当作中枢结束——源码口径下它不算离开，中枢只是延伸。',
    origin: '源码实现口径；原著中"中枢返回"与"中枢延伸/扩展"的边界存在解释空间（待核对）。',
    src: 'ChanPivotDetector.Detect（无独立字段）', srcFn: 'ChanPivotDetector.cs',
    note: '本实验室如实展示：返回没有独立状态，不能给用户编造一个"返回状态"字段。',
    link: ['pivot-extend', 'pivot-leave', 'pivot-expand'],
  },
  {
    id: 'pivot-expand', name: '中枢扩展', group: 'pivot', status: 'todo', kind: 'todo',
    brief: '相邻同级中枢区间重叠、合并为更大级别中枢；源码未实现。',
    def: '中枢扩展（也称扩张，原著用词存在分歧）指同级别相邻两个中枢的波动区间有重叠，可视为更大级别中枢正在形成。源码没有扩展/升级判定。',
    math: '两个相邻同级中枢 [ZD₁, ZG₁] 与 [ZD₂, ZG₂] 的价格区间相交 → 可构成更大级别中枢',
    need: ['两个同级别中枢', '区间价格相交', '级别归属已确认'],
    suff: [],
    pre: ['中枢划分与级别归属已完成'],
    drop: ['两中枢区间不重叠 → 更接近中枢新生/趋势'],
    near: [['pivot-new', '不重叠时是新生'], ['pivot-relation', '中枢之间的关系'], ['level-recursion', '级别递归']],
    counter: '把同一中枢的延伸误称为扩展——延伸是同一个中枢笔数增加，扩展涉及两个中枢。',
    origin: '《教你炒股票》中枢扩展/扩张论述（课次与用词待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现；本实验室不生成扩展区间，也不做级别升级判定。',
    link: ['pivot-new', 'pivot-relation', 'level-recursion'],
  },
  {
    id: 'pivot-new', name: '中枢新生', group: 'pivot', status: 'todo', kind: 'todo',
    brief: '离开原中枢后，在新价格区间形成新的同级别中枢。',
    def: '中枢新生指离开原中枢后，在新价格区间形成新的同级别中枢，且与原中枢区间不重叠。趋势正是由依次同向、互不重叠的中枢构成。',
    math: '新中枢 [ZD₂, ZG₂] 与旧中枢 [ZD₁, ZG₁] 不重叠，且方向同向（上移或下移）',
    need: ['原中枢已结束', '新中枢成立', '两区间不重叠'],
    suff: [],
    pre: ['至少两个中枢已划分'],
    drop: ['区间重叠 → 属于延伸/扩展，不是新生'],
    near: [['pivot-expand', '重叠时是扩展'], ['trend', '新生中枢是趋势的构成单位']],
    counter: '两个中枢价格区间重叠却称为"趋势中的新生中枢"——按原著应归入扩展/更大级别中枢。',
    origin: '《教你炒股票》走势中枢与趋势构成（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现中枢分类，只能按笔序号观察中枢序列（无法自动标注新生）。',
    link: ['pivot-expand', 'trend', 'pivot-relation'],
  },
  {
    id: 'pivot-relation', name: '中枢之间的关系', group: 'pivot', status: 'partial', kind: 'pivot',
    brief: '源码按笔序号输出中枢；可观察上移/下移/重叠，但没有级别归属分类。',
    def: '中枢之间可能存在依次上移、依次下移、区间重叠、扩展、新生等关系。源码只按笔序号顺序输出中枢列表，没有自动分类或级别归属字段。',
    math: '相邻中枢：ZD₂ > ZG₁ → 上移；ZG₂ < ZD₁ → 下移；区间相交 → 重叠',
    need: ['至少两个中枢'],
    suff: [],
    pre: ['中枢划分完成'],
    drop: ['只有一个中枢 → 无关系可判定'],
    near: [['pivot-expand', '重叠时的理论后果'], ['pivot-new', '不重叠时的理论后果'], ['trend', '关系构成走势类型']],
    counter: '看到两个中枢上移就断言"上涨趋势"——源码没有走势类型判定，只能描述中枢序列。',
    origin: '原著走势类型论述（课次待核对）。',
    src: 'ChanPivotDetector.Detect（仅输出顺序列表）', srcFn: 'ChanPivotDetector.cs',
    note: '部分实现：中枢序列可观察，扩展/新生/级别归属不可判定。',
    link: ['pivot-expand', 'pivot-new', 'trend'],
  },
  /* ───────────────────────── D. 走势类型 ───────────────────────── */
  {
    id: 'trend', name: '上涨 / 下跌（趋势）', group: 'trend', status: 'todo', kind: 'todo',
    brief: '至少两个依次同向、互不重叠的中枢构成的走势。',
    def: '趋势是至少两个依次同向且价格区间不重叠的中枢构成的走势：中枢依次上移为上涨，依次下移为下跌。源码没有走势类型判定，只输出中枢列表。',
    math: '上涨：ZD₂ > ZG₁；下跌：ZG₂ < ZD₁（至少两个中枢）',
    need: ['至少两个同级别中枢', '相邻中枢同向且不重叠'],
    suff: [],
    pre: ['中枢划分与级别归属完成'],
    drop: ['只有一个中枢 → 盘整，不是趋势'],
    near: [['range', '盘整只有一个中枢'], ['pivot-new', '新生中枢构成趋势'], ['trend-connect', '走势连接']],
    counter: '两个中枢区间重叠却标为上涨趋势——按原著应先处理扩展/更大级别中枢。',
    origin: '《教你炒股票》走势类型定义（课次待核对）。',
    src: '无', srcFn: '—',
    note: '实验室的"上涨/下跌"场景只验证两个中枢的序列关系，不是走势类型判定；页面会明确标注。',
    link: ['range', 'pivot-relation', 'trend-connect', 'trend-complete'],
  },
  {
    id: 'range', name: '盘整', group: 'trend', status: 'todo', kind: 'todo',
    brief: '只包含一个中枢的走势类型。',
    def: '盘整是只包含一个中枢的走势类型。中枢延伸时间很长、价格反复回到区间，是盘整的典型形态，但"盘整"的正式判定需要走势类型分解，源码没有实现。',
    math: '盘整 = 仅含一个同级别中枢的走势',
    need: ['一个中枢', '走势在此中枢内完成'],
    suff: [],
    pre: ['走势类型分解完成'],
    drop: ['出现第二个同向不重叠中枢 → 转为趋势'],
    near: [['trend', '趋势至少两个中枢'], ['pivot-extend', '盘整常表现为长期延伸']],
    counter: '把"中枢笔数很多"直接等同于盘整——笔数只是延伸，不是走势类型定义。',
    origin: '《教你炒股票》走势类型定义（课次待核对）。',
    src: '无', srcFn: '—',
    note: '"盘整"场景只验证中枢长期延伸（StrokeCount ≥ 8），不判定走势类型。',
    link: ['trend', 'pivot-extend'],
  },
  {
    id: 'trend-connect', name: '走势连接', group: 'trend', status: 'todo', kind: 'todo',
    brief: '同级别走势类型之间的边界与过渡。',
    def: '走势连接指同级别走势类型之间的边界与过渡。原著以"走势终完美"和同级别分解给出划分原则，但具体连接判据存在解释空间，源码未实现。',
    math: '走势₁ + 连接 + 走势₂（同级别口径）',
    need: ['前后两个同级别走势类型已划分'],
    suff: [],
    pre: ['走势类型分解完成'],
    drop: ['级别不同 → 不能直接连接为同级别走势'],
    near: [['trend-decompose', '连接是分解的产物'], ['same-level-decomp', '同级别分解']],
    counter: '把不同级别的两段走势直接拼接成同级别连接——级别口径不一致。',
    origin: '《教你炒股票》走势必完美相关论述（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现。',
    link: ['trend-decompose', 'same-level-decomp', 'trend'],
  },
  {
    id: 'trend-decompose', name: '走势分解', group: 'trend', status: 'todo', kind: 'todo',
    brief: '把走势按级别拆成盘整/趋势的组合。',
    def: '走势分解是把一段走势按同一级别拆分为盘整/趋势的组合，使每段都满足走势类型的定义，并能递归到次级别。源码未实现。',
    math: '走势 = 走势类型₁ + 走势类型₂ + …（同级别）',
    need: ['级别口径已确定', '每段满足走势类型定义'],
    suff: [],
    pre: ['走势类型判定可用'],
    drop: ['无法保证每段同级别 → 分解不成立'],
    near: [['same-level-decomp', '分解的口径'], ['trend-connect', '分解后的边界']],
    counter: '按视觉高低点随意切分——切出的段不是走势类型。',
    origin: '《教你炒股票》走势分解论述（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现。',
    link: ['same-level-decomp', 'trend-connect'],
  },
  {
    id: 'trend-complete', name: '走势完成', group: 'trend', status: 'todo', kind: 'todo',
    brief: '走势类型走完其内部结构（原著"走势必完美"）。',
    def: '走势完成指一个走势类型走完其内部结构：趋势以最后一个中枢被离开、并出现反向走势为完成标志。原著"走势必完美"是其理论基础；源码未实现完成判定。',
    math: '趋势完成 ≈ 末中枢离开 + 反向走势类型成立',
    need: ['走势类型已划分', '末中枢已离开', '反向走势成立'],
    suff: [],
    pre: ['走势类型与背驰判定可用'],
    drop: ['仅出现背驰 → 不必然完成（背驰不等于反转）'],
    near: [['trend-divergence', '背驰是完成的重要信号之一'], ['trend', '走势类型']],
    counter: '一出现背驰就宣布走势完成——原著也要求后续走势确认。',
    origin: '《教你炒股票》"走势必完美"（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现；本实验室不会用背驰替代走势完成判定。',
    link: ['trend', 'trend-divergence'],
  },
  {
    id: 'same-level-decomp', name: '同级别分解', group: 'trend', status: 'todo', kind: 'todo',
    brief: '按同一级别把走势切成互不重叠的走势类型。',
    def: '同级别分解是按同一级别把走势切成互不重叠的走势类型，并要求切出的每一段都保持同级别。它是走势连接、走势完成判定的前提。源码未实现。',
    math: '走势 = Σ 同级别走势类型（段与段不重叠、级别一致）',
    need: ['级别定义可用', '每段为同级别走势类型'],
    suff: [],
    pre: ['走势类型判定可用'],
    drop: ['出现跨级别拼接 → 分解失败'],
    near: [['trend-decompose', '分解'], ['level-def', '级别定义']],
    counter: '把本级别笔直接当作次级别走势类型——需要级别映射，不是同级别分解。',
    origin: '《教你炒股票》同级别分解论述（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现。',
    link: ['trend-decompose', 'level-def'],
  },
  /* ───────────────────────── E. 多级别 ───────────────────────── */
  {
    id: 'level-def', name: '级别定义', group: 'level', status: 'todo', kind: 'todo',
    brief: '级别由走势类型递归构成，不是K线周期本身。',
    def: '级别是缠论的骨架：本级别的一个走势类型约当次级别的一段走势。级别由结构递归定义，K线周期只是近似观察窗口，二者不能直接等同。源码未实现级别定义。',
    math: 'Level(n) 的走势类型 ≈ Level(n−1) 的走势类型序列',
    need: ['走势类型判定可用', '递归口径明确'],
    suff: [],
    pre: ['线段/走势类型划分完成'],
    drop: ['直接把 1 小时=本级别、5 分钟=次级别 → 只是周期近似'],
    near: [['level-recursion', '递归定义级别'], ['multi-level', '源码只做周期叠加']],
    counter: '把周期切换当成级别递归——周期近似不等于级别构成关系。',
    origin: '《教你炒股票》级别与走势类型论述（课次待核对）。',
    src: '无（ChanLevelMapper 明确自述"非递归"）', srcFn: 'ChanLevelMapper.cs',
    note: '源码只有按周期的时间/价格叠加，没有级别定义。',
    link: ['level-recursion', 'level-compose', 'multi-level'],
  },
  {
    id: 'level-recursion', name: '级别递归', group: 'level', status: 'todo', kind: 'todo',
    brief: '本级别中枢由次级别走势类型构成，逐层递归。',
    def: '级别递归指本级别中枢由次级别走势类型构成，次级别走势类型又由更次级别的结构构成。递归是"级别"存在的根本，也是区间套的前提。源码未实现。',
    math: '本级别中枢 = 次级别走势类型的重叠区间',
    need: ['次级别走势类型可判定', '重叠关系可计算'],
    suff: [],
    pre: ['走势类型与级别定义可用'],
    drop: ['以笔中枢直接当走势中枢 → 缺少次级别构成'],
    near: [['level-compose', '构成关系'], ['interval-nesting', '区间套'], ['pivot', '源码的笔中枢只是近似']],
    counter: '把笔中枢标成"本级别中枢由次级别构成"——源码的笔中枢并没有次级别走势类型参与。',
    origin: '《教你炒股票》级别递归论述（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现；本实验室不伪造递归关系。',
    link: ['level-def', 'level-compose', 'interval-nesting'],
  },
  {
    id: 'level-compose', name: '级别构成关系', group: 'level', status: 'todo', kind: 'todo',
    brief: '高低级别之间的构成与对应关系。',
    def: '级别构成关系描述本级别结构与次级别结构的对应：本级别一笔/线段约当次级别一段走势，本级别中枢约当次级别走势类型的重叠。原著口径与笔中枢实现存在差异，源码未实现。',
    math: 'Level(n) 结构 ↔ Level(n−1) 走势类型序列',
    need: ['两个级别都能独立划分', '对应关系可验证'],
    suff: [],
    pre: ['级别递归可用'],
    drop: ['只有周期叠加 → 无法验证构成关系'],
    near: [['level-recursion', '递归'], ['multi-level', '周期叠加的近似']],
    counter: '用次级别K线数量推断级别构成——数量不是结构对应。',
    origin: '《教你炒股票》级别与走势类型（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现。',
    link: ['level-recursion', 'multi-level'],
  },
  {
    id: 'level-link', name: '级别联立', group: 'level', status: 'todo', kind: 'todo',
    brief: '同一时点多个级别同时观察：大级别定方向，本级别定结构，次级别定入场。',
    def: '级别联立是在同一时点同时观察多个级别：大级别确定方向与结构位置，本级别确定中枢/买卖点，次级别确定入场时机。源码未实现联立判定。',
    math: '大级别方向 ∧ 本级别结构 ∧ 次级别确认 → 交易级别结论',
    need: ['多级别结构同时可用', '级别间关系可判定'],
    suff: [],
    pre: ['级别递归与构成关系可用'],
    drop: ['只用单一周期 → 不构成联立'],
    near: [['multi-level', '源码的叠加显示'], ['level-compose', '构成关系']],
    counter: '把三个周期的信号简单"共振"计数——不是级别联立。',
    origin: '《教你炒股票》多级别联立论述（课次待核对）。',
    src: '无（源码只有次级别确认与高周期共振标签）', srcFn: 'ChanAnalyzer.cs / ConfluenceTagger.cs',
    note: '源码未实现级别联立。唯一的多周期痕迹是两处单点用法：次级别确认（ChanAnalyzer.SubLevelMatches，只判断一笔是否及时同向转向）与高周期共振标签（ConfluenceTagger，只标注、源码自述无统计优势）；它们都不是"大级别定方向 + 本级别定结构 + 次级别定入场"的联立判定。',
    link: ['level-compose', 'multi-level', 'interval-nesting'],
  },
  {
    id: 'interval-nesting', name: '区间套', group: 'level', status: 'todo', kind: 'todo',
    brief: '用大级别背驰段套住次级别背驰段，逐层收缩定位买卖点。',
    def: '区间套是利用大级别背驰段套住次级别背驰段，再套更次级别，逐层收缩定位精确买卖点。要求各级别同向且同时进入背驰。源码未实现。',
    math: '大级别背驰段 ⊃ 次级别背驰段 ⊃ … → 精确买卖区间',
    need: ['多级别背驰可判定', '级别包含关系可验证'],
    suff: [],
    pre: ['级别递归与背驰判定可用'],
    drop: ['只有单级别背驰 → 无区间套'],
    near: [['trend-divergence', '趋势背驰'], ['level-recursion', '级别递归'], ['buy1', '精确一买']],
    counter: '把同一级别的两段背驰误作区间套——区间套必须跨级别。',
    origin: '《教你炒股票》区间套论述（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现。',
    link: ['level-recursion', 'trend-divergence', 'buy1'],
  },
  {
    id: 'multi-level', name: '多级别叠加（周期近似）', group: 'level', status: 'partial', kind: 'todo',
    brief: '源码用三路周期各司其职：本级别出结构，次级别做确认，高周期只打共振标签；三级别中枢叠加只是周期近似。',
    def: '源码把不同周期分成三种角色：① 本级别（必需）——包含、分型、笔、中枢、背驰、买卖点全部由它计算；② 次级别（可选）——只在买卖点判定时确认"次级别是否在参考点之后及时同向转向"；③ 高周期（可选）——只给本级别信号贴"共振 / 逆向共振 / 无共振"标签，源码自述该标签无统计优势、不得用于过滤。ChanLevelMapper 的高/本/次三级别中枢叠加是"时间相交 + 价格相交"的展示，源码明确自述不是级别递归构成。',
    math: '本级别：结构判定；次级别：SubLevelMatches(方向, 时间窗)；高周期：ConfluenceTagger.Tag(窗口内同向/反向信号)',
    need: ['本级别数据（必需）', '次级别数据（仅在开启次级别确认时需要）', '高周期数据（仅用于共振标签；缺失不影响信号去留）'],
    suff: [],
    pre: ['本级别结构分析（必需）', '次级别 / 高周期数据（可选）'],
    drop: ['只有单级别数据 → 次级别确认无法启用、无共振标签；结构判定本身不受影响', '把三级别叠加当作递归构成 → 误读'],
    near: [['level-recursion', '严格递归（未实现）'], ['level-link', '联立（未实现）']],
    counter: '把 InsideHigher=true 解读为"本级别中枢由大级别构成"——源码只是区间叠加；也不能把高周期共振标签当成信号过滤条件。',
    origin: '源码实现口径（ChanLevelMapper 注释明确"不是级别递归构成"；ConfluenceTagger 注释明确共振无统计优势）。',
    src: 'ChanAnalyzer.SubLevelMatches / ChanBackfill（ConfluenceTagger.Tag）/ ChanLevelMapper.ToPivotInfos', srcFn: 'ChanAnalyzer.cs / ChanBackfill.cs / ConfluenceTagger.cs / ChanLevelMapper.cs',
    note: '当前实验室：内置案例生成主级别 + 次级别两路（次级别确认默认开启）；高周期共振标签与三级别叠加未接入。上传 CSV 只有单级别 → 自动关闭并禁用次级别确认：结构上成立、原本会被"次级别未确认"过滤的点会直接成为信号（暖机、不可交易两道闸门仍在），因此上传案例的信号数通常多于内置案例；次级别副图也不会出现。',
    link: ['level-recursion', 'level-link', 'pivot'],
  },
  /* ───────────────────────── F. 背驰 ───────────────────────── */
  {
    id: 'divergence', name: '背驰（笔级 MACD 面积）', group: 'div', status: 'impl', kind: 'div',
    brief: '离开段创新极值，但 MACD 面积比进入段明显缩小。',
    def: '背驰是力度比较，不是价格新高/新低本身。源码对中枢的离开笔与"进入段"分别累加 MACD 柱面积（Σ|hist|），当离开笔创新极值、面积比小于阈值时判定背驰。',
    math: 'newExtreme ∧ enterArea > 0 ∧ leaveArea / enterArea < divergenceAreaRatio（默认 0.90）',
    need: ['中枢已有离开笔', '进入段与离开笔同向', '离开笔创新低/新高', '面积比 < 阈值'],
    suff: [],
    pre: ['中枢已确认离开', 'MACD 柱可用'],
    drop: ['未创新极值', '面积比 ≥ 阈值', '进入段面积为 0', '没有离开笔'],
    near: [['consolidation-divergence', '源码实际口径接近盘整背驰'], ['trend-divergence', '趋势背驰需要走势类型判定（未实现）'], ['buy1', '底背驰是一买的构成条件']],
    counter: '价格创新低但 MACD 面积同步放大——不是背驰，是力度延续。',
    origin: '《教你炒股票》第24课《MACD对背驰的辅助判断》（课次待核对）；原著强调同级别、同向、可比。',
    src: 'ChanDivergenceDetector.Check / Area', srcFn: 'ChanDivergenceDetector.cs',
    note: '这是笔级背驰，不是严格意义的趋势背驰；MACD 实现源码未上传，用常规 12/26/9（SMA 起算 EMA），待核对。显微镜索引中的背驰包含暖机区内的判定（标「暖机」），而源码不单独输出背驰列表——这是工程约定 E3，只影响展示，不影响真实信号。',
    link: ['macd', 'divergence-compare', 'divergence-conditions', 'consolidation-divergence', 'buy1'],
  },
  {
    id: 'consolidation-divergence', name: '盘整背驰', group: 'div', status: 'partial', kind: 'div',
    brief: '源码的比较对象实际落在中枢内，更接近盘整背驰口径。',
    def: '盘整背驰发生在只有一个中枢的盘整走势中：离开中枢的同向段与进入中枢的同向段比较力度。源码的"进入段"取离开笔之前最近一笔同向笔，因笔严格交替，实际恒为 leave−2，落在中枢内，因此更接近盘整背驰。',
    math: 'enter = 最近同向笔（实际 = leave − 2）；ratio = leaveArea / enterArea',
    need: ['中枢', '同向进出段', '创新极值且面积缩小'],
    suff: [],
    pre: ['中枢与离开笔可用'],
    drop: ['进入段位于中枢之外且跨趋势 → 更接近趋势背驰，源码不区分'],
    near: [['divergence', '源码的背驰实现'], ['trend-divergence', '需要趋势判定']],
    counter: '把源码的笔级背驰直接称为"趋势背驰"——源码没有趋势分类，比较对象也不是跨中枢的进入段。',
    origin: '《教你炒股票》盘整背驰论述（课次待核对）。',
    src: 'ChanDivergenceDetector.FindEnterStroke', srcFn: 'ChanDivergenceDetector.cs',
    note: '源码注释称"若中枢之前存在同向笔则即为进入段，否则退化为中枢内同向笔"；但 FindEnterStroke 取最近同向笔，实际恒为 leave−2（已在 CAP 中注明）。',
    link: ['divergence', 'trend-divergence', 'divergence-compare'],
  },
  {
    id: 'trend-divergence', name: '趋势背驰', group: 'div', status: 'todo', kind: 'todo',
    brief: '趋势末段与前一中枢同向段比较力度；源码未实现。',
    def: '趋势背驰发生在至少两个同向中枢构成的趋势末端：把趋势最后一段与前一中枢的同向段比较力度，要求创新极值且力度衰减。源码没有走势类型判定，无法区分趋势背驰与盘整背驰。',
    math: '趋势末段 vs 前一中枢同向段：新极值 ∧ 面积/斜率衰减',
    need: ['趋势已判定（至少两个同向不重叠中枢）', '同级别同向可比段'],
    suff: [],
    pre: ['走势类型判定可用'],
    drop: ['只有一个中枢 → 只能是盘整背驰'],
    near: [['trend', '趋势判定未实现'], ['divergence', '源码的笔级背驰'], ['consolidation-divergence', '盘整口径']],
    counter: '把源码的单中枢比较结果标成"趋势背驰"——缺少趋势结构前提。',
    origin: '《教你炒股票》趋势背驰论述（课次待核对）。',
    src: '无', srcFn: '—',
    note: '源码未实现；本实验室不会把盘整背驰冒充趋势背驰。',
    link: ['trend', 'divergence', 'consolidation-divergence'],
  },
  {
    id: 'macd', name: 'MACD 辅助判断', group: 'div', status: 'impl', kind: 'div',
    brief: '用 MACD 柱面积 Σ|hist| 作为力度的代理指标。',
    def: 'MACD 不是背驰的定义，而是力度的代理：源码把一笔区间内 MACD 柱的绝对值累加作为该段力度。MACD 参数与起算方式会改变面积，从而改变背驰结论。',
    math: 'Area(i) = Σ_{bar∈[start,end]} |hist[bar]|；hist = DIF − DEA（12/26/9）',
    need: ['收盘价序列足够长', '笔的起止K线下标有效'],
    suff: [],
    pre: ['K线数量 ≥ 26 + 9（MACD 起算）'],
    drop: ['hist 为 null 的区间跳过（不计入面积）'],
    near: [['divergence', '背驰判定'], ['divergence-compare', '面积比'], ['divergence-conditions', '成立条件']],
    counter: '用不同 MACD 参数算出的面积直接互相比较——口径不一致。',
    origin: '《教你炒股票》第24课（MACD 辅助背驰判断，课次待核对）。',
    src: 'Macd.cs 未上传；实验室 macd() 为常规实现', srcFn: 'chan-engine.js · macd',
    note: '源码未上传 MACD，本实验室用 SMA 起算 EMA 的常规实现，与 TradingView 口径可能有差异，待核对。',
    link: ['divergence', 'divergence-compare'],
  },
  {
    id: 'divergence-compare', name: '比较对象', group: 'div', status: 'impl', kind: 'div',
    brief: '离开笔与"最近一笔同向笔"比较；实际恒为 leave − 2。',
    def: '背驰要求同向、同级别、可比的进出段。源码用 FindEnterStroke 向前寻找最近一笔同向笔；由于笔严格交替，它恒等于 leave − 2，即中枢内的上一同向笔。',
    math: 'enter = max{ j < leave | strokes[j].isUp == strokes[leave].isUp } = leave − 2',
    need: ['离开笔之前存在同向笔'],
    suff: [],
    pre: ['至少形成 leave−2 笔'],
    drop: ['找不到同向笔 → 不判定'],
    near: [['divergence', '背驰'], ['consolidation-divergence', '口径后果']],
    counter: '把中枢之前的同向笔当作进入段——源码实际取的是最近同向笔。',
    origin: '源码实现口径。',
    src: 'ChanDivergenceDetector.FindEnterStroke', srcFn: 'ChanDivergenceDetector.cs',
    note: '这是源码与注释不一致的地方，已在能力清单"算法疑点"中列明，本实验室按源码实际行为展示。',
    link: ['divergence', 'consolidation-divergence'],
  },
  {
    id: 'divergence-conditions', name: '背驰成立条件', group: 'div', status: 'impl', kind: 'div',
    brief: '同向 + 创新极值 + 进入段面积 > 0 + 面积比 < 阈值。',
    def: '源码的背驰成立条件可以完整枚举：存在离开笔；进入段与离开笔同向；离开笔创出比进入段更极端的低点/高点；进入段面积大于 0；面积比严格小于阈值。任一不满足即不成立。',
    math: 'ratio < thr（严格小于）；newExtreme = leave.high > enter.high（向上）或 leave.low < enter.low（向下）',
    need: ['五个条件全部满足'],
    suff: ['五条同时满足即可判定'],
    pre: ['中枢离开笔存在'],
    drop: ['任一条件失败 → 返回 null'],
    near: [['divergence-fail', '不成立的情况'], ['divergence', '总述']],
    counter: '面积缩小但价格没有创新低——按源码不是背驰。',
    origin: '源码实现口径；原著定义见第24课（课次待核对）。',
    src: 'ChanDivergenceDetector.Check', srcFn: 'ChanDivergenceDetector.cs',
    note: '阈值可在左侧调整（默认 0.90），改动会实时重算。',
    link: ['divergence', 'divergence-fail', 'divergence-compare'],
  },
  {
    id: 'divergence-fail', name: '背驰失效 / 不成立', group: 'div', status: 'impl', kind: 'div',
    brief: '未创新极值、面积比不达标、进入段面积为 0、没有离开笔。',
    def: '背驰不成立有明确的反例清单：离开笔没有创出比进入段更极端的价位；面积比 ≥ 阈值；进入段面积为 0；中枢尚未离开。此外背驰成立也不等于反转，趋势可能继续延伸。',
    math: 'ratio ≥ thr ∨ ¬newExtreme ∨ enterArea ≤ 0 ∨ leaving == null → 无背驰',
    need: [],
    suff: [],
    pre: [],
    drop: ['满足任一失效条件 → 不记录背驰，也不产生一买/一卖'],
    near: [['divergence-conditions', '成立条件'], ['trend-complete', '背驰不等于走势完成']],
    counter: '把"背驰后价格又创新低"当作算法错误——背驰只描述力度衰减，不保证反转。',
    origin: '源码实现口径；原著对背驰与反转的区分（课次待核对）。',
    src: 'ChanDivergenceDetector.Check', srcFn: 'ChanDivergenceDetector.cs',
    note: '实验室不会把"背驰"显示成"反转"；信号仍需稳定、次级别与可交易性过滤。',
    link: ['divergence', 'divergence-conditions', 'buy1'],
  },
  /* ───────────────────────── G. 买卖点 ───────────────────────── */
  {
    id: 'buy1', name: '一买', group: 'bs', status: 'impl', kind: 'signal', sigKind: '1买',
    brief: '向下离开中枢且底背驰，结构极值 = 该笔低点。',
    def: '第一类买点出现在下跌末端的底背驰处：向下笔离开中枢、相对进入段背驰，参考价为该笔低点。源码是简化版：只要求"中枢离开笔为向下 + 背驰"，不要求趋势结构与次级别走势类型。',
    math: 'kind = 1买 ⇔ leave.isUp = false ∧ checkDivergence(pivot).isUp = false',
    need: ['中枢已有离开笔', '离开笔向下', 'MACD 面积比 < 阈值', '锚点笔已稳定', '次级别确认（可关闭）', '可交易性通过'],
    suff: ['四步过滤全部通过后记账'],
    pre: ['中枢确认离开', '底背驰成立'],
    drop: ['暖机隔离', '次级别未确认', '止损落到入场价反侧（不可交易）'],
    near: [['buy2', '一买之后的首次回抽'], ['divergence', '构成条件'], ['stroke-stable', '必须稳定']],
    counter: '看到底背驰就当一买——源码还要过稳定、次级别与可交易性三关；被过滤者只以空心 ghost 标出。',
    origin: '《教你炒股票》第一类买点定义（课次待核对）；源码为简化 v1。',
    src: 'ChanSignals.Detect（1 类分支）', srcFn: 'ChanSignals.cs',
    note: '记账口径严格无未来函数：时间/价格取"稳定时点"K线收盘，而非结构极值。ghost 为工程约定（E1），不影响真实信号集合。',
    link: ['divergence', 'pivot-leave', 'buy2', 'bs-relation'],
  },
  {
    id: 'buy2', name: '二买', group: 'bs', status: 'impl', kind: 'signal', sigKind: '2买',
    brief: '一买之后首次回抽不破一买低点。',
    def: '第二类买点出现在一买之后：向下笔（一买）→ 向上笔 → 向下笔回抽，若回抽低点高于一买低点，则构成二买。源码只按笔结构判定，不要求"次级别回抽"这一更严格的走势类型条件。',
    math: 'strokes[k]↓ ∧ strokes[k+1]↑ ∧ strokes[k+2]↓ ∧ strokes[k+2].low > strokes[k].low',
    need: ['存在一买锚点', '一买后完成向上笔', '回抽向下笔不破一买低点', '锚点笔稳定'],
    suff: ['结构形态成立后仍要过滤'],
    pre: ['一买锚点存在（即使一买被过滤，锚点仍保留）'],
    drop: ['回抽低点 ≤ 一买低点', '锚点笔未稳定', '次级别未确认', '不可交易'],
    near: [['buy1', '前置锚点'], ['buy3', '中枢突破后的买点']],
    counter: '回抽略破一买低点仍标二买——按源码这是失败形态，不是二买。',
    origin: '《教你炒股票》第二类买点定义（课次待核对）。',
    src: 'ChanSignals.Detect（2 类分支）', srcFn: 'ChanSignals.cs',
    note: '源码的锚点集合不受一买可交易性影响：一买被过滤也能派生二买，这是原算法口径。',
    link: ['buy1', 'stroke-stable', 'bs-relation'],
  },
  {
    id: 'buy3', name: '三买', group: 'bs', status: 'impl', kind: 'signal', sigKind: '3买',
    brief: '向上突破中枢上沿后，回抽低点仍在 ZG 上方。',
    def: '第三类买点出现在向上离开中枢之后：某向上笔高点突破 ZG，其后的向下笔回抽低点仍高于 ZG（没有回到中枢）。源码要求中枢已确认，并在每个中枢每侧只取首个满足条件者。',
    math: 'leave.isUp ∧ leave.high > ZG ∧ next.isUp = false ∧ next.low > ZG',
    need: ['中枢已确认（有离开笔）', '向上笔突破 ZG', '回抽不进入中枢', '锚点笔稳定'],
    suff: ['每中枢每侧只取首个'],
    pre: ['中枢确认'],
    drop: ['回抽回到中枢内', '锚点笔未稳定', '次级别未确认', '不可交易'],
    near: [['pivot-leave', '中枢离开'], ['buy1', '一买'], ['buy2', '二买']],
    counter: '把"突破 ZG 的笔"本身当三买——源码要求突破后的回抽确认。',
    origin: '《教你炒股票》第三类买点定义（课次待核对）。',
    src: 'ChanSignals.Detect（3 类分支）', srcFn: 'ChanSignals.cs',
    note: '源码的 3 买扫描从 EndStrokeIndex+1 开始，只接受已确认中枢；回抽不回中枢是简化判据。',
    link: ['pivot-leave', 'buy1', 'bs-prereq', 'bs-relation'],
  },
  {
    id: 'sell1', name: '一卖', group: 'bs', status: 'impl', kind: 'signal', sigKind: '1卖',
    brief: '向上离开中枢且顶背驰，结构极值 = 该笔高点。',
    def: '第一类卖点是一买的镜像：向上笔离开中枢、相对进入段顶背驰，参考价为该笔高点。',
    math: 'kind = 1卖 ⇔ leave.isUp = true ∧ checkDivergence(pivot).isUp = true',
    need: ['中枢离开笔向上', '顶背驰', '锚点笔稳定', '次级别确认', '可交易性'],
    suff: [],
    pre: ['中枢确认离开', '顶背驰成立'],
    drop: ['暖机隔离', '次级别未确认', '不可交易'],
    near: [['buy1', '镜像'], ['sell2', '后续卖点'], ['divergence', '顶背驰']],
    counter: '把顶背驰直接当一卖——同样要过稳定/次级别/可交易性过滤。',
    origin: '《教你炒股票》第一类卖点定义（课次待核对）。',
    src: 'ChanSignals.Detect（1 类分支，镜像）', srcFn: 'ChanSignals.cs',
    note: '与一买共用同一段代码，仅 side/kind 取反。',
    link: ['buy1', 'divergence', 'sell2'],
  },
  {
    id: 'sell2', name: '二卖', group: 'bs', status: 'impl', kind: 'signal', sigKind: '2卖',
    brief: '一卖之后首次回抽不破一卖高点。',
    def: '第二类卖点是一卖的镜像：向下笔（一卖）→ 向上笔 → 向下笔回抽，回抽高点低于一卖高点时构成二卖。',
    math: 'strokes[k]↑ ∧ strokes[k+1]↓ ∧ strokes[k+2]↑ ∧ strokes[k+2].high < strokes[k].high',
    need: ['存在一卖锚点', '回抽不破一卖高点', '锚点笔稳定'],
    suff: [],
    pre: ['一卖锚点存在'],
    drop: ['回抽高点 ≥ 一卖高点', '未稳定', '次级别未确认', '不可交易'],
    near: [['sell1', '前置锚点'], ['sell3', '中枢跌破后的卖点']],
    counter: '回抽略破一卖高点仍标二卖——失败形态。',
    origin: '《教你炒股票》第二类卖点定义（课次待核对）。',
    src: 'ChanSignals.Detect（2 类分支，镜像）', srcFn: 'ChanSignals.cs',
    note: '与二买共用代码。',
    link: ['sell1', 'buy2', 'bs-relation'],
  },
  {
    id: 'sell3', name: '三卖', group: 'bs', status: 'impl', kind: 'signal', sigKind: '3卖',
    brief: '向下跌破中枢下沿后，回抽高点仍在 ZD 下方。',
    def: '第三类卖点是三买的镜像：向下笔跌破 ZD，其后的向上笔回抽高点仍低于 ZD（没有回到中枢）。',
    math: 'leave.isUp = false ∧ leave.low < ZD ∧ next.isUp ∧ next.high < ZD',
    need: ['中枢已确认', '向下笔跌破 ZD', '回抽不进入中枢', '锚点笔稳定'],
    suff: ['每中枢每侧只取首个'],
    pre: ['中枢确认'],
    drop: ['回抽回到中枢内', '未稳定', '次级别未确认', '不可交易'],
    near: [['pivot-leave', '中枢离开'], ['buy3', '镜像']],
    counter: '跌破 ZD 的笔本身就是三卖——缺少回抽确认。',
    origin: '《教你炒股票》第三类卖点定义（课次待核对）。',
    src: 'ChanSignals.Detect（3 类分支，镜像）', srcFn: 'ChanSignals.cs',
    note: '与三买共用代码。',
    link: ['buy3', 'pivot-leave', 'bs-prereq'],
  },
  {
    id: 'bs-prereq', name: '买卖点的前置结构', group: 'bs', status: 'impl', kind: 'signal', sigKind: null,
    brief: '一买←背驰；二买←一买锚点；三买←中枢离开与回抽。',
    def: '三类买卖点各有前置结构：一买需要中枢离开笔 + 背驰；二买需要一买锚点 + 首次回抽不破；三买需要已确认中枢 + 突破 ZG/ZD 后回抽不回中枢。前置结构不成立，后续信号不会出现。',
    math: '1买 = 背驰；2买 = 1买锚点 + 回抽；3买 = 中枢确认 + 突破 + 回抽',
    need: ['对应前置结构成立', '锚点笔稳定'],
    suff: [],
    pre: ['中枢与背驰判定可用'],
    drop: ['前置结构缺失 → 无信号'],
    near: [['buy1', '一买'], ['buy2', '二买'], ['buy3', '三买'], ['bs-relation', '关系']],
    counter: '孤立看待某根K线的买卖点，不看它依赖的中枢/背驰结构。',
    origin: '《教你炒股票》三类买卖点定义（课次待核对）。',
    src: 'ChanSignals.Detect（全流程）', srcFn: 'ChanSignals.cs',
    note: '本条目用于汇总前置结构；结果模式展示当前案例最近一个信号与它的前置链。',
    link: ['buy1', 'buy2', 'buy3', 'bs-relation'],
  },
  {
    id: 'bs-relation', name: '买卖点之间的关系', group: 'bs', status: 'partial', kind: 'signal', sigKind: null,
    brief: '1→2→3 的派生关系；3 类可独立出现，2 类依赖 1 类锚点。',
    def: '三类买卖点不是并列的形态：二买由一买派生（一买后的首次回抽），三买由中枢突破派生，可以独立于一买出现。源码保留了"一买锚点"集合，即使一买被过滤，二买仍可派生。',
    math: '2买 ⊂ 1买派生；3买 ⊂ 中枢派生（与 1买无必然依赖）',
    need: ['至少一类信号已出现'],
    suff: [],
    pre: ['信号判定可用'],
    drop: ['无信号 → 无关系可展示'],
    near: [['buy1', '一买'], ['buy2', '二买'], ['buy3', '三买']],
    counter: '认为三买必须在一买之后——三买只依赖中枢突破与回抽，不依赖一买。',
    origin: '《教你炒股票》三类买卖点关系（课次待核对）。',
    src: 'ChanSignals.Detect（锚点集合）', srcFn: 'ChanSignals.cs',
    note: '部分实现：源码只实现派生关系与去重（同一笔同侧只留一个，优先 1 类），没有买卖点级别联立。',
    link: ['buy1', 'buy2', 'buy3', 'bs-prereq'],
  },
  /*__ITEMS_END__*/
];

const BY_ID = Object.fromEntries(ITEMS.map(x => [x.id, x]));

/* ───────────────────────── 选中态解析 ───────────────────────── */
function ctxOf(cs, i, opts) {
  const snap = cs.run.snaps[Math.max(0, Math.min(i, cs.run.snaps.length - 1))];
  return {
    cs, snap, i, res: snap.res, off: snap.off, main: cs.main, sub: cs.sub, opts,
  };
}

/** 找到一个条目在当前案例中的默认选中对象 */
function pickLast(c, item) {
  const r = c.res, k = item.kind;
  if (k === 'raw') return { kind: 'raw', index: c.i };
  if (k === 'stroke') return r.strokes.length ? { kind: 'stroke', index: r.strokes.length - 1 } : null;
  if (k === 'fractal') {
    const want = item.id === 'fractal-top';
    for (let j = r.fractals.length - 1; j >= 0; j--) if (r.fractals[j].isTop === want) return { kind: 'fractal', index: j };
    return null;   // 没有该类型分型就如实返回空，不能拿另一类型冒充（名称与数据会对不上）
  }
  if (k === 'merge' || k === 'merged') {
    for (let j = r.merged.length - 1; j >= 0; j--) if (r.merged[j].endIndex > r.merged[j].startIndex) return { kind: 'merged', index: j };
    return r.merged.length ? { kind: 'merged', index: r.merged.length - 1 } : null;
  }
  if (k === 'pivot') {
    if (!r.pivots.length) return null;
    for (let j = r.pivots.length - 1; j >= 0; j--) if (r.pivots[j].isConfirmed) return { kind: 'pivot', index: j };
    return { kind: 'pivot', index: r.pivots.length - 1 };
  }
  if (k === 'div') {
    if (!r.divergences.length) return null;
    return { kind: 'div', index: r.divergences.length - 1 };
  }
  if (k === 'signal') {
    const want = item.sigKind;
    const ok = x => x.gConfirm <= c.i && (!want || x.kind === want);
    const sg = (c.cs.run.signals || []).filter(ok);
    if (sg.length) { const x = sg[sg.length - 1]; return { kind: 'signal', index: (c.cs.run.signals || []).indexOf(x), ghost: false }; }
    const gh = (c.cs.run.ghosts || []).filter(ok);
    if (gh.length) { const x = gh[gh.length - 1]; return { kind: 'signal', index: (c.cs.run.ghosts || []).indexOf(x), ghost: true }; }
    return null;
  }
  return null;
}

/** 把任意选中对象规整成显微镜可用的上下文；选中对象与条目类型不匹配时回退默认 */
function resolveSel(c, item, sel) {
  const r = c.res;
  if (sel) {
    if (item.kind === 'stroke' && sel.kind === 'stroke' && r.strokes[sel.index]) return sel;
    if (item.kind === 'raw' && sel.kind === 'raw') return sel;
    if (item.kind === 'fractal' && sel.kind === 'fractal' && r.fractals[sel.index] && (item.id === 'fractal-top') === !!r.fractals[sel.index].isTop) return sel;
    if ((item.kind === 'merge' || item.kind === 'merged') && sel.kind === 'merged' && r.merged[sel.index]) return sel;
    if (item.kind === 'pivot' && sel.kind === 'pivot' && r.pivots[sel.index]) return sel;
    if (item.kind === 'div' && sel.kind === 'div' && r.divergences[sel.index]) return sel;
    if (item.kind === 'signal' && sel.kind === 'signal') {
      const list = sel.ghost ? (c.cs.run.ghosts || []) : (c.cs.run.signals || []);
      const x = list[sel.index];
      if (x && (!item.sigKind || x.kind === item.sigKind)) return sel;
    }
  }
  return pickLast(c, item);
}

/* ───────────────────────── 几何：全局K线下标窗口 ───────────────────────── */
function geom(c, item, sel) {
  const r = c.res, o = c.off, i = c.i, g = {};
  const S = k => { const s = r.strokes[k]; return s ? { a: s.startBarIndex + o, b: s.endBarIndex + o } : null; };
  if (!sel) return null;
  if (sel.kind === 'raw') { g.a = Math.max(0, i - 30); g.b = i; g.bars = [i]; return g; }
  if (sel.kind === 'stroke') {
    const s = r.strokes[sel.index];
    if (!s) return null;
    const prev = r.strokes[sel.index - 1], next = r.strokes[sel.index + 1];
    g.a = (prev ? prev.endBarIndex : s.startBarIndex) + o;
    g.b = (next ? next.endBarIndex : s.endBarIndex) + o;
    g.stroke = sel.index;
  } else if (sel.kind === 'fractal') {
    const f = r.fractals[sel.index];
    if (!f) return null;
    g.a = f.barIndex + o - 4; g.b = f.confirmBarIndex + o + 4; g.fractal = sel.index;
  } else if (sel.kind === 'merged') {
    const m = r.merged[sel.index];
    if (!m) return null;
    g.a = m.startIndex + o - 4; g.b = m.endIndex + o + 4; g.merge = sel.index;
  } else if (sel.kind === 'pivot') {
    const p = r.pivots[sel.index];
    if (!p) return null;
    const a = r.strokes[p.startStrokeIndex], b = r.strokes[p.endStrokeIndex];
    if (!a || !b) return null;
    g.a = a.startBarIndex + o - 2; g.b = b.endBarIndex + o + 4; g.pivot = sel.index;
  } else if (sel.kind === 'div') {
    const d = r.divergences[sel.index];
    if (!d) return null;
    const en = r.strokes[d.enterIndex], lv = r.strokes[d.leaveIndex];
    if (!en || !lv) return null;
    g.a = en.startBarIndex + o - 2; g.b = lv.endBarIndex + o + 4; g.div = sel.index;
  } else if (sel.kind === 'signal') {
    const list = sel.ghost ? (c.cs.run.ghosts || []) : (c.cs.run.signals || []);
    const x = list[sel.index];
    if (!x) return null;
    g.a = Math.min(x.gRef, x.gConfirm) - 6;
    g.b = Math.max(x.gRef, x.gConfirm) + 6;
    g.sig = x; g.ghost = !!sel.ghost;
  }
  if (g.a == null) return null;
  const pad = Math.max(6, Math.round((g.b - g.a) * 0.12));
  g.a = Math.min(g.a - pad, i);
  g.b = Math.min(g.b + pad, i);
  if (g.b - g.a < 16) { g.a = Math.max(0, Math.min(g.a, g.b - 16)); g.b = Math.max(g.b, g.a + 16); }
  g.a = Math.max(0, Math.min(g.a, i));
  if (g.b <= g.a) g.b = Math.min(i, g.a + 1);
  return g;
}

/* ───────────────────────── 生成步骤（三态显微镜的"生成模式"） ───────────────────────── */
const STAGE = {
  raw: { raw: 1 },
  merged: { raw: 1, merged: 1 },
  fractal: { raw: 1, merged: 1, fractal: 1 },
  stroke: { raw: 1, merged: 1, fractal: 1, stroke: 1 },
  pivot: { raw: 1, merged: 1, stroke: 1, pivot: 1 },
  div: { raw: 1, merged: 1, stroke: 1, pivot: 1, div: 1 },
  signal: { raw: 1, merged: 1, stroke: 1, sig: 1 },
};

const mergedIdxOf = (res, bar) => res.merged.findIndex(m => bar >= m.startIndex && bar <= m.endIndex);
function barOf(c, r) { return r + c.off; }
function pct(x) { return (x * 100).toFixed(0) + '%'; }

function steps(c, item, sel) {
  const k = item.kind;
  if (k === 'raw') return rawSteps(c);
  if (k === 'merge' || k === 'merged') return mergeSteps(c, sel);
  if (k === 'fractal') return fractalSteps(c, item, sel);
  if (k === 'stroke') return strokeSteps(c, sel);
  if (k === 'pivot') return pivotSteps(c, sel);
  if (k === 'div') return divSteps(c, sel);
  if (k === 'signal') return signalSteps(c, item, sel);
  return [];
}

function rawSteps(c) {
  const b = c.main[c.i];
  return [
    { t: '本根K线', d: `第 #${c.i} 根：开 ${b.open}、高 ${b.high}、低 ${b.low}、收 ${b.close}。缠论的所有结构都从这一序列开始。`, stage: 'raw', focus: { bars: [c.i] } },
    { t: '本次回放窗口', d: `逐根回放只使用截至 #${c.i} 的K线：本次分析窗口 #${c.off}–#${c.i}（${c.i + 1 - c.off} 根，随回放增长，默认上限 700 根）。源码回填要凑满 700 根才出结论，所以极早期几帧的结构是"窗口尚短"的结果，与 C# 回填在同一根K线上可能不同。`, stage: 'raw', focus: { bars: [c.i] } },
  ];
}

function mergeSteps(c, sel) {
  const r = c.res, o = c.off;
  if (!sel) return [];
  const mi = sel.index, m = r.merged[mi];
  if (!m) return [];
  const prev = r.merged[mi - 1];
  const out = [];
  out.push({
    t: '定位合并K线', stage: 'merged',
    d: `合并K线 #${mi} 覆盖原始K线 #${m.startIndex + o}…#${m.endIndex + o}，区间 ${m.low} – ${m.high}，方向${m.isUp ? '向上' : '向下'}。`,
    focus: { merged: mi, bars: [m.startIndex + o, m.endIndex + o] },
  });
  if (prev) {
    const contains = (m.high <= prev.high && m.low >= prev.low) || (m.high >= prev.high && m.low <= prev.low);
    out.push({
      t: '检查包含关系', stage: 'merged',
      d: `前一根合并K线 #${mi - 1} 区间 ${prev.low} – ${prev.high}；本根 ${m.low} – ${m.high}。包含判定：${contains ? '成立（一端完全落入另一端，平台/等高也计入）' : '不成立'}。`,
      focus: { merged: mi, bars: [prev.startIndex + o, m.endIndex + o] },
    });
    out.push({
      t: '按方向合并', stage: 'merged',
      d: m.endIndex > m.startIndex
        ? `方向${m.isUp ? '向上 → 取高高：high 取较大者、low 取较大者' : '向下 → 取低低：high 取较小者、low 取较小者'}，合并后 ${m.low} – ${m.high}。`
        : `本根没有与相邻K线发生包含，保持原始区间 ${m.low} – ${m.high}。`,
      focus: { merged: mi },
    });
  } else {
    out.push({ t: '序列起点', stage: 'merged', d: '第一根合并K线默认方向向上，没有前一根可供比较。', focus: { merged: mi } });
  }
  return out;
}

function fractalSteps(c, item, sel) {
  const r = c.res, o = c.off;
  if (!sel) return [];
  const f = r.fractals[sel.index];
  if (!f) return [];
  const isTop = f.isTop, mi = f.mergedIndex, prev = r.merged[mi - 1], mid = r.merged[mi], next = r.merged[mi + 1];
  if (!prev || !mid || !next) return [];
  const out = [];
  out.push({
    t: '取连续三根合并K线', stage: 'merged',
    d: `#${prev.startIndex + o}–#${prev.endIndex + o}（${prev.low}–${prev.high}）｜#${mid.startIndex + o}–#${mid.endIndex + o}（${mid.low}–${mid.high}）｜#${next.startIndex + o}–#${next.endIndex + o}（${next.low}–${next.high}）。`,
    focus: { merged: mi, bars: [prev.startIndex + o, next.endIndex + o] },
  });
  const c1 = isTop ? mid.high > prev.high && mid.high > next.high : mid.low < prev.low && mid.low < next.low;
  const c2 = isTop ? mid.low > prev.low && mid.low > next.low : mid.high < prev.high && mid.high < next.high;
  out.push({
    t: isTop ? '顶分型条件' : '底分型条件', stage: 'merged',
    d: isTop
      ? `高点：${mid.high} ${c1 ? '>' : '≤'} 两侧（${prev.high} / ${next.high}）${c1 ? '成立' : '不成立'}；低点：${mid.low} ${c2 ? '>' : '≤'} 两侧（${prev.low} / ${next.low}）${c2 ? '成立' : '不成立'}。源码要求高低点同时严格成立。`
      : `低点：${mid.low} ${c1 ? '<' : '≥'} 两侧（${prev.low} / ${next.low}）${c1 ? '成立' : '不成立'}；高点：${mid.high} ${c2 ? '<' : '≥'} 两侧（${prev.high} / ${next.high}）${c2 ? '成立' : '不成立'}。源码要求高低点同时严格成立。`,
    focus: { merged: mi },
  });
  out.push({
    t: '取极值K线', stage: 'raw',
    d: `中间合并K线覆盖 #${mid.startIndex + o}–#${mid.endIndex + o}；取其中${isTop ? '最高' : '最低'}价所在的一根：#${f.barIndex + o}（${f.price}）。`,
    focus: { bars: [f.barIndex + o] },
  });
  out.push({
    t: '确认时点', stage: 'raw',
    d: `右邻合并K线的最后一根是 #${f.confirmBarIndex + o}；分型在这根K线收盘后才可知，即发生→可知延迟 ${f.confirmBarIndex - f.barIndex} 根。`,
    focus: { bars: [f.barIndex + o, f.confirmBarIndex + o] },
  });
  out.push({ t: '同类合并规则', stage: 'fractal', d: '连续两个同型分型只保留更极端者（顶取更高、底取更低）。', focus: { fractal: sel.index } });
  return out;
}


function fractAt(res, bar, isTop) {
  return res.fractals.findIndex(f => f.barIndex === bar && f.isTop === isTop);
}

function strokeSteps(c, sel) {
  const r = c.res, o = c.off;
  if (!sel) return [];
  const s = r.strokes[sel.index];
  if (!s) return [];
  const sm = mergedIdxOf(r, s.startBarIndex), em = mergedIdxOf(r, s.endBarIndex);
  const gap = em >= 0 && sm >= 0 ? em - sm - 1 : null;
  const f0 = fractAt(r, s.startBarIndex, !s.isUp);
  const f1 = fractAt(r, s.endBarIndex, s.isUp);
  const a = s.startBarIndex + o, b = s.endBarIndex + o;
  const out = [];
  out.push({
    t: '参与构成的K线', stage: 'raw',
    d: `这一笔从 #${a} 到 #${b}（${s.startPrice} → ${s.endPrice}），共 ${b - a + 1} 根原始K线。两端是方向相反的分型。`,
    focus: { bars: [a, b], stroke: sel.index },
  });
  out.push({
    t: '先做包含处理', stage: 'merged',
    d: sm >= 0 && em >= 0
      ? `两端的合并K线序号为 ${sm} 与 ${em}，中间隔 ${gap} 根独立合并K线（包含处理已经吸收了平台/包含关系）。`
      : '端点所在合并K线暂时无法定位。',
    focus: { merged: sm >= 0 ? sm : undefined, stroke: sel.index, bars: [a, b] },
  });
  out.push({
    t: '识别两端分型', stage: 'fractal',
    d: `${s.isUp ? '起点为底分型' : '起点为顶分型'} @#${a}（${s.startPrice}）；${s.isUp ? '终点为顶分型' : '终点为底分型'} @#${b}（${s.endPrice}）。${f0 >= 0 || f1 >= 0 ? '画布上高亮的是算法当前保留的分型。' : ''}`,
    focus: { stroke: sel.index, fractal: f1 >= 0 ? f1 : f0, bars: [a, b] },
  });
  out.push({
    t: '候选连接（交替 + 间隔）', stage: 'stroke',
    d: `笔序列必须顶底交替；本笔${s.isUp ? '底→顶' : '顶→底'}。间隔检查：${gap != null ? gap + ' 根独立合并K线 ' + (gap >= 2 ? '≥ 2，满足新笔口径' : '< 2，按新笔口径不成立（算法会收窄/丢弃）') : '—'}。`,
    focus: { stroke: sel.index },
  });
  out.push({
    t: '笔成立', stage: 'stroke',
    d: `满足交替与间隔后，这一段被保留为一笔：${s.isUp ? '↑' : '↓'} #${a}→#${b}，区间 ${s.low} – ${s.high}。`,
    focus: { stroke: sel.index },
  });
  out.push({
    t: '稳定状态', stage: 'stroke',
    d: s.isConfirmed
      ? `该笔身后已有 ≥ 2 笔，标记为稳定；自 #${s.stableFromBarIndex + o} 起不再被后续行情修正。`
      : '该笔位于尾部（身后不足 2 笔），仍可能被延伸或破坏，画布以虚线表示。',
    focus: { stroke: sel.index },
  });
  return out;
}

function pivotSteps(c, sel) {
  const r = c.res, o = c.off;
  if (!sel) return [];
  const p = r.pivots[sel.index];
  if (!p) return [];
  const s0 = r.strokes[p.startStrokeIndex], s1 = r.strokes[p.startStrokeIndex + 1], s2 = r.strokes[p.startStrokeIndex + 2];
  if (!s0 || !s1 || !s2) return [];
  const out = [];
  out.push({
    t: '取连续三笔', stage: 'stroke',
    d: `笔 ${p.startStrokeIndex}：${s0.isUp ? '↑' : '↓'} ${s0.low}–${s0.high}｜笔 ${p.startStrokeIndex + 1}：${s1.isUp ? '↑' : '↓'} ${s1.low}–${s1.high}｜笔 ${p.startStrokeIndex + 2}：${s2.isUp ? '↑' : '↓'} ${s2.low}–${s2.high}。`,
    focus: { pivot: sel.index, stroke: p.startStrokeIndex + 2 },
  });
  out.push({
    t: '计算 ZG / ZD', stage: 'stroke',
    d: `ZG = min(三笔高点) = ${p.zg}；ZD = max(三笔低点) = ${p.zd}。${p.zg > p.zd ? 'ZG > ZD，三笔存在公共重叠。' : 'ZG ≤ ZD，三笔无重叠。'}`,
    focus: { pivot: sel.index },
  });
  out.push({
    t: '形成中枢', stage: 'pivot',
    d: `区间 [${p.zd}, ${p.zg}] 成立，初始覆盖笔 ${p.startStrokeIndex}–${p.startStrokeIndex + 2}。若 ZG ≤ ZD，窗口会右移一笔重试。`,
    focus: { pivot: sel.index },
  });
  const ext = [], fold = [];
  for (let k = p.startStrokeIndex + 3; k <= p.endStrokeIndex; k++) {
    const s = r.strokes[k];
    if (!s) continue;
    (s.endPrice >= p.zd && s.endPrice <= p.zg ? ext : fold).push(`笔${k} 终点 ${s.endPrice}`);
  }
  const extText = ext.length ? `后续 ${ext.length} 笔的终点落在 [${p.zd}, ${p.zg}] 内（${ext.join('、')}），并入中枢` : '';
  const foldText = fold.length ? `${fold.length} 笔终点在区间外（${fold.join('、')}），但再下一笔回到了区间内，源码按"离开后返回"一并计入延伸（end += 2）` : '';
  out.push({
    t: '延伸：笔并入中枢', stage: 'pivot',
    d: [extText, foldText].filter(Boolean).join('；') ? `${[extText, foldText].filter(Boolean).join('；')}，中枢笔数增至 ${p.strokeCount}。` : '没有后续笔并入中枢，中枢未延伸。',
    focus: { pivot: sel.index },
  });
  if (p.isConfirmed && p.leavingStrokeIndex != null) {
    const lv = r.strokes[p.leavingStrokeIndex], nx = r.strokes[p.leavingStrokeIndex + 1];
    out.push({
      t: '离开判定', stage: 'pivot',
      d: `笔 ${p.leavingStrokeIndex} 的终点 ${lv.endPrice} 离开 [${p.zd}, ${p.zg}]${nx ? `；再下一笔终点 ${nx.endPrice} 也未回到区间` : ''} → 该笔为离开笔，中枢确认结束。`,
      focus: { pivot: sel.index, stroke: p.leavingStrokeIndex },
    });
    out.push({
      t: '中枢结果', stage: 'pivot',
      d: `中枢 [${p.zd}, ${p.zg}]，共 ${p.strokeCount} 笔（${p.startStrokeIndex}–${p.endStrokeIndex}），已由离开笔 ${p.leavingStrokeIndex} 确认。`,
      focus: { pivot: sel.index },
    });
  } else {
    out.push({
      t: '尚未离开', stage: 'pivot',
      d: `当前中枢 [${p.zd}, ${p.zg}] 仍未出现"终点离开且下一笔不回区间"的离开笔，因此 IsConfirmed=false，还可能继续延伸。`,
      focus: { pivot: sel.index },
    });
  }
  return out;
}


function divSteps(c, sel) {
  const r = c.res, o = c.off;
  if (!sel) return [];
  const d = r.divergences[sel.index];
  if (!d) return [];
  const p = r.pivots[d.pivotIndex], en = r.strokes[d.enterIndex], lv = r.strokes[d.leaveIndex];
  if (!p || !en || !lv) return [];
  const thr = c.opts && c.opts.divergenceAreaRatio != null ? c.opts.divergenceAreaRatio : 0.9;
  const newExt = d.isUp ? lv.high > en.high : lv.low < en.low;
  const out = [];
  out.push({
    t: '定位中枢与离开笔', stage: 'pivot',
    d: `中枢 [${p.zd}, ${p.zg}] 的离开笔为 ${d.leaveIndex}（${d.isUp ? '↑' : '↓'} ${lv.low}–${lv.high}），终点 ${lv.endPrice}。`,
    focus: { pivot: d.pivotIndex, stroke: d.leaveIndex },
  });
  out.push({
    t: '确定进入段', stage: 'stroke',
    d: `源码取离开笔之前最近的同向笔：进入段 = 笔 ${d.enterIndex}（${en.isUp ? '↑' : '↓'} ${en.low}–${en.high}）。因笔严格交替，它恒为 leave − 2，落在中枢内。`,
    focus: { stroke: d.enterIndex, div: sel.index },
  });
  out.push({
    t: '极值检查', stage: 'div',
    d: d.isUp
      ? `离开笔高点 ${lv.high} ${newExt ? '>' : '≤'} 进入段高点 ${en.high} → ${newExt ? '创出新高' : '未创新高'}。`
      : `离开笔低点 ${lv.low} ${newExt ? '<' : '≥'} 进入段低点 ${en.low} → ${newExt ? '创出新低' : '未创新低'}。`,
    focus: { div: sel.index, stroke: d.leaveIndex },
  });
  out.push({
    t: '累加 MACD 面积', stage: 'div',
    d: `进入段面积 Σ|hist| = ${d.enterArea.toFixed(2)}；离开段面积 = ${d.leaveArea.toFixed(2)}（区间内 hist 为 null 的K线跳过）。`,
    focus: { div: sel.index },
  });
  out.push({
    t: '面积比与阈值', stage: 'div',
    d: `ratio = ${d.leaveArea.toFixed(2)} / ${d.enterArea.toFixed(2)} = ${d.areaRatio.toFixed(3)}；阈值 ${thr}。判定：${d.areaRatio < thr ? 'ratio < 阈值，力度衰减' : 'ratio ≥ 阈值，不构成背驰'}。`,
    focus: { div: sel.index },
  });
  out.push({
    t: '结论', stage: 'div',
    d: `${d.isUp ? '顶' : '底'}背驰成立：${newExt ? '创新极值 + ' : ''}面积比 ${d.areaRatio.toFixed(2)} < ${thr}。${d.warmup ? '但它位于暖机区，不会产生可交易信号。' : '注意：背驰只说明力度衰减，不等于反转。'}`,
    focus: { div: sel.index },
  });
  return out;
}

function findSignal(c, item, sel) {
  const sig = c.cs.run.signals || [], gh = c.cs.run.ghosts || [];
  if (sel && sel.kind === 'signal') {
    const list = sel.ghost ? gh : sig, x = list[sel.index];
    if (x) return { x, ghost: !!sel.ghost, idx: sel.index };
  }
  const want = item.sigKind;
  const pool = [];
  sig.forEach((x, idx) => { if (x.gConfirm <= c.i && (!want || x.kind === want)) pool.push({ x, ghost: false, idx }); });
  gh.forEach((x, idx) => { if (x.gConfirm <= c.i && (!want || x.kind === want)) pool.push({ x, ghost: true, idx }); });
  if (!pool.length) return null;
  pool.sort((a, b) => a.x.gConfirm - b.x.gConfirm);
  return pool[pool.length - 1];
}

function signalSteps(c, item, sel) {
  const r = c.res, o = c.off;
  const hit = findSignal(c, item, sel);
  if (!hit) return [];
  const x = hit.x, side = x.side;
  const anchorIdx = r.strokes.findIndex(s => s.endBarIndex + o === x.gRef);
  const hasStop = x.stopPrice != null, tradable = hasStop && (side === 'buy' ? x.stopPrice < x.price : x.stopPrice > x.price);
  const out = [];
  out.push({
    t: '定位结构锚点', stage: 'stroke',
    d: `${x.kind}（${side === 'buy' ? '买' : '卖'}）的结构极值在 #${x.gRef}（${x.refPrice}）${anchorIdx >= 0 ? `，对应笔 ${anchorIdx} 的终点` : ''}。信号不是在这一根发出的，而是等结构稳定后才记账。`,
    focus: { bars: [x.gRef], stroke: anchorIdx >= 0 ? anchorIdx : undefined },
  });
  out.push({
    t: '稳定时点', stage: 'signal',
    d: `结构极值 #${x.gRef} → 记账 #${x.gConfirm}，延迟 ${x.gConfirm - x.gRef} 根；记账价 ${x.price}（稳定时点K线收盘）。`,
    focus: { bars: [x.gRef, x.gConfirm], sig: hit },
  });
  out.push({
    t: '过滤链：温暖机 / 次级别 / 可交易', stage: 'signal',
    d: hit.ghost
      ? `真实信号检查未全部通过：${x.reason === 'warmup' ? '位于暖机区' : x.reason === 'sublevel' ? '次级别未确认' : '止损落在入场价反侧（不可交易）'}。空心的 ghost 只用于展示被过滤的结构，不计入真实信号。`
      : '未被过滤：暖机隔离、次级别确认、可交易性检查均通过，因此进入真实信号集合。',
    focus: { sig: hit },
  });
  out.push({
    t: '次级别确认', stage: 'signal',
    d: !(c.sub && c.sub.length > 50)
      ? `当前案例没有可用的次级别行情（${c.sub ? c.sub.length + ' 根' : '未生成'}，不足 51 根），这一关不参与过滤：结构上成立的点不会因"次级别未确认"被拦，信号数会比双级别案例多。`
      : (c.opts && c.opts.requireSubLevelConfirm) === false
        ? '本次实验关闭了次级别确认，因此这一关不参与过滤（这是显式的实验开关）。'
        : `次级别行情（${c.sub.length} 根）需在 #${x.gRef} 到 #${x.gConfirm} 之间走出同向的一笔；未走出则记 ghost。`,
    focus: { sig: hit },
  });
  out.push({
    t: '可交易性', stage: 'signal',
    d: hasStop ? `止损参考 ${x.stopPrice}，记账价 ${x.price}；${side === 'buy' ? '买入要求止损 < 入场价' : '卖出要求止损 > 入场价'} → ${tradable ? '通过' : '不通过'}。` : '该信号没有止损参考价数据，无法复核可交易性。',
    focus: { sig: hit },
  });
  out.push({
    t: '结论', stage: 'signal',
    d: hit.ghost ? `GHOST：${x.kind} 结构成立但被过滤（${x.note}）。` : `真实信号：${x.kind} 记账 @${x.price}。${x.note}`,
    focus: { sig: hit },
  });
  return out;
}

/* ───────────────────────── 结果事实（结果模式的数据行） ───────────────────────── */
function facts(c, item, sel) {
  const r = c.res, o = c.off, rows = [], chips = [];
  const chip = (id, label, s) => chips.push({ id, label, sel: s });
  if (item.status === 'todo') {
    return { rows: [], chips: [], note: '源码未实现该结构。当前案例不展示任何计算结果；生成模式与结果模式均不可用。' };
  }
  if (!sel) return { rows: [], chips: [], note: '当前案例尚未形成该结构（可继续推进回放）。' };
  const k = item.kind;
  if (k === 'raw') {
    const b = c.main[c.i];
    rows.push(['当前K线', '#' + c.i], ['开 / 高 / 低 / 收', `${b.open} / ${b.high} / ${b.low} / ${b.close}`]);
  } else if (k === 'merge' || k === 'merged') {
    const m = r.merged[sel.index];
    if (!m) return { rows: [], chips: [], note: '该合并K线不在当前窗口。' };
    rows.push(['合并K线序号', '#' + sel.index], ['覆盖原始K线', `#${m.startIndex + o}–#${m.endIndex + o}`], ['区间', `${m.low} – ${m.high}`], ['方向', m.isUp ? '向上' : '向下'], ['合并根数', (m.endIndex - m.startIndex + 1) + ' 根']);
    chip('merge', '包含关系', { kind: 'merged', index: sel.index });
  } else if (k === 'fractal') {
    const f = r.fractals[sel.index];
    if (!f) return { rows: [], chips: [], note: '该分型不在当前窗口。' };
    rows.push(['类型', f.isTop ? '顶分型' : '底分型'], ['极值K线', '#' + (f.barIndex + o)], ['极值价格', String(f.price)], ['确认K线', '#' + (f.confirmBarIndex + o)], ['发生→可知延迟', (f.confirmBarIndex - f.barIndex) + ' 根']);
    chip(item.id === 'fractal-top' ? 'fractal-bottom' : 'fractal-top', '最新的另一种分型', null);
    const adj = r.strokes.findIndex(s => s.startBarIndex === f.barIndex || s.endBarIndex === f.barIndex);
    if (adj >= 0) chip('stroke', '以它为端点的笔', { kind: 'stroke', index: adj });
  } else if (k === 'stroke') {
    const s = r.strokes[sel.index];
    if (!s) return { rows: [], chips: [], note: '该笔不在当前窗口。' };
    const sm = mergedIdxOf(r, s.startBarIndex), em = mergedIdxOf(r, s.endBarIndex);
    rows.push(['笔序号', '#' + sel.index], ['方向', s.isUp ? '向上 ↑' : '向下 ↓'], ['起止K线', `#${s.startBarIndex + o} → #${s.endBarIndex + o}`], ['起止价格', `${s.startPrice} → ${s.endPrice}`], ['高低区间', `${s.low} – ${s.high}`], ['独立合并K线间隔', sm >= 0 && em >= 0 ? String(em - sm - 1) : '—'], ['稳定', s.isConfirmed ? '是 · 自 #' + (s.stableFromBarIndex + o) : '否（尾部笔，虚线）']);
    const f0 = fractAt(r, s.startBarIndex, !s.isUp), f1 = fractAt(r, s.endBarIndex, s.isUp);
    if (f0 >= 0) chip(s.isUp ? 'fractal-bottom' : 'fractal-top', '起点分型', { kind: 'fractal', index: f0 });
    if (f1 >= 0) chip(s.isUp ? 'fractal-top' : 'fractal-bottom', '终点分型', { kind: 'fractal', index: f1 });
    const pv = r.pivots.findIndex(p => sel.index >= p.startStrokeIndex && sel.index <= p.endStrokeIndex);
    if (pv >= 0) chip('pivot', '所属中枢', { kind: 'pivot', index: pv });
    for (let k2 = sel.index - 1; k2 <= sel.index + 1; k2 += 2) {
      if (r.strokes[k2]) chip('stroke', k2 < sel.index ? '前一笔' : '后一笔', { kind: 'stroke', index: k2 });
    }
  } else if (k === 'pivot') {
    const p = r.pivots[sel.index];
    if (!p) return { rows: [], chips: [], note: '该中枢不在当前窗口。' };
    rows.push(['中枢序号', '#' + sel.index], ['区间 ZD / ZG', `${p.zd} / ${p.zg}`], ['笔范围', `${p.startStrokeIndex} – ${p.endStrokeIndex}（${p.strokeCount} 笔）`], ['已确认', p.isConfirmed ? '是' : '否（仍可能延伸）'], ['离开笔', p.leavingStrokeIndex == null ? '—' : '#' + p.leavingStrokeIndex]);
    for (let k2 = p.startStrokeIndex; k2 <= p.endStrokeIndex && k2 < p.startStrokeIndex + 8; k2++) {
      const s = r.strokes[k2];
      if (s) chip('stroke', `笔${k2} ${s.isUp ? '↑' : '↓'}`, { kind: 'stroke', index: k2 });
    }
    const di = r.divergences.findIndex(d => d.pivotIndex === sel.index);
    if (di >= 0) chip('divergence', '本中枢的背驰', { kind: 'div', index: di });
    if (p.leavingStrokeIndex != null) chip('buy3', '三买（案例中最新的）', null);
  } else if (k === 'div') {
    const d = r.divergences[sel.index];
    if (!d) return { rows: [], chips: [], note: '该背驰不在当前窗口。' };
    rows.push(['方向', d.isUp ? '顶背驰' : '底背驰'], ['中枢', '#' + d.pivotIndex], ['进入段 / 离开笔', `${d.enterIndex} / ${d.leaveIndex}`], ['进入段面积', d.enterArea.toFixed(2)], ['离开段面积', d.leaveArea.toFixed(2)], ['面积比', d.areaRatio.toFixed(3)], ['暖机区', d.warmup ? '是（不出真实信号）' : '否']);
    chip('pivot', '所属中枢', { kind: 'pivot', index: d.pivotIndex });
    chip('stroke', '进入段', { kind: 'stroke', index: d.enterIndex });
    chip('stroke', '离开笔', { kind: 'stroke', index: d.leaveIndex });
    const lv = r.strokes[d.leaveIndex];
    if (lv) {
      const kind = d.isUp ? '1卖' : '1买', id = d.isUp ? 'sell1' : 'buy1', ref = lv.endBarIndex + o;
      const si = (c.cs.run.signals || []).findIndex(x => x.kind === kind && x.gRef === ref && x.gConfirm <= c.i);
      const gi = si >= 0 ? -1 : (c.cs.run.ghosts || []).findIndex(x => x.kind === kind && x.gRef === ref && x.gConfirm <= c.i);
      if (si >= 0) chip(id, kind + '（由此背驰产生）', { kind: 'signal', index: si, ghost: false });
      else if (gi >= 0) chip(id, kind + '（被过滤的 ghost）', { kind: 'signal', index: gi, ghost: true });
      else chip(id, kind + '（此背驰未产生该信号）', null);
    }
  } else if (k === 'signal') {
    const hit = findSignal(c, item, sel);
    if (!hit) return { rows: [], chips: [], note: item.sigKind ? `当前案例尚未出现${item.sigKind}信号（需要对应前置结构）。` : '当前案例尚未出现信号。' };
    const x = hit.x;
    rows.push(['类型 / 方向', `${x.kind} · ${x.side === 'buy' ? '买' : '卖'}`], ['记账时点', '#' + x.gConfirm], ['记账价', String(x.price)], ['结构极值', `#${x.gRef}（${x.refPrice}）`], ['止损参考', x.stopPrice == null ? '—' : String(x.stopPrice)], ['面积比', x.areaRatio == null ? '—' : x.areaRatio.toFixed(3)]);
    if (x.refPivot) rows.push(['参照中枢', `上沿 ZG ${x.refPivot.zg.toFixed(2)} / 下沿 ZD ${x.refPivot.zd.toFixed(2)}（被离开的那个已确认中枢）`]);
    if (x.subConfirm) rows.push(['次级别确认笔', `${x.subConfirm.isUp ? '↑' : '↓'} 笔 ${(+x.subConfirm.startPrice).toFixed(2)} → ${(+x.subConfirm.endPrice).toFixed(2)}，稳定于极值后 ${x.subConfirm.stableAfterBars} 根次级别（窗口 ${x.subConfirm.windowBars} 根）`]);
    rows.push(['状态', hit.ghost ? 'ghost：' + (x.reason || '被过滤') : '真实信号'], ['说明', x.note || '—']);
    const ai = r.strokes.findIndex(s => s.endBarIndex + o === x.gRef);
    if (ai >= 0) chip('stroke', '锚点笔', { kind: 'stroke', index: ai });
    chip(hit.ghost ? 'stroke-stable' : 'bs-prereq', hit.ghost ? '为什么被过滤' : '前置结构', null);
  }
  return { rows, chips };
}

const api = { GROUPS, ITEMS, BY_ID, get: id => BY_ID[id], groups, badgeLabel, ctxOf, pickLast, resolveSel, geom, steps, facts, STAGE };

function groups() {
  return GROUPS.map(g => ({ ...g, items: ITEMS.filter(x => x.group === g.id) }));
}
function badgeLabel(st) {
  return { impl: '源码已有', partial: '部分实现', todo: '待实现' }[st] || st;
}
return api;
})();
