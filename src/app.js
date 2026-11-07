/* 缠论动态理论实验室 · 界面层（M2）：画布 + 播放 + 结构目录 + 检查器 + 理论显微镜入口 */
(function () {
'use strict';
const E = ChanEngine, G = ChanGen, R = ChanRules, MX = ChanMicroscope, ST = ChanState, CR = ChanRobust, $ = s => document.querySelector(s);
const fm = x => x == null ? '-' : (+x).toFixed(2);
const START = 2, LS = 'chanlab.cases';
/* 涨跌配色唯一来源：绿=涨/向上/底，红=跌/向下/顶（BTC / TradingView 国际口径）。
   画布蜡烛、顶底分型 chip、主图图例一律从这里取色；流程带方向色 GB_COL 同语义、异色阶。 */
const KLINE_COL = { up: '#30d158', down: '#ff453a' };
/* 概念 tooltip：首次接触的术语悬停即解释（与帮助浮层「术语表」同口径） */
const TAG = { merge: ['包含', '#94a3b8', '包含关系：相邻两根K线一根的高低点完全覆盖另一根。须先按方向合并（新高取高高、新低取低低），才能识别分型。'], fractal: ['分型', '#f59e0b', '分型：连续三根经包含处理的K线，中间那根高点最高（顶）或低点最低（底）。画布上三角=发生位置、圆点=算法确认时点。'], 'fractal-': ['分型修正', '#b45309', '分型修正：原分型被更极端的K线取代，或其K线并入包含合并——事件流如实记录，不抹掉历史。'], stroke: ['新笔', '#facc15', '笔：相邻顶、底分型的连线，两分型间至少 2 根独立合并K线（源码仅实现新笔）。实线=已稳定，虚线=未稳定。'], 'stroke~': ['笔修正', '#ca8a04', '笔修正：后续走势改变了笔的端点（出现更极端高低点）。端点改一次记一次，状态网络中为自环转移。'], stable: ['笔稳定', '#a3e635', '笔稳定：笔确认后身后又走满 2 笔，此后不再被修正（源码 isConfirmed 口径）。'], pivot: ['中枢形成', '#58a6ff', '中枢：至少连续三笔的重叠区间，ZG=重叠区上沿、ZD=下沿。形成后进入延伸 / 离开的演化。'], 'pivot~': ['中枢延伸', '#58a6ff', '中枢延伸：后续笔的极值仍在 [ZD, ZG] 内；离开后下一笔回到区间也按延伸处理（源码口径）。'], pivotLeave: ['中枢离开', '#38bdf8', '中枢离开：某笔极值超出 [ZD, ZG] 且不再回区间，中枢宣告结束。'], divergence: ['背驰', '#e879f9', '背驰：离开笔 MACD 柱面积 ÷ 进入笔面积 < 阈值（默认 0.9），即离开力度弱于进入。圆圈标在离开笔终点。'], signal: ['买卖点', '#22d3ee', '买卖点（简化版）：一买=下跌后中枢背驰；二买=一买后回调不创新低；三买=离开中枢后回调不回区间。镜像得卖点。'], ghost: ['被过滤', '#94a3b8', 'Ghost：结构上成立但被过滤的信号（暖机隔离 / 次级别未确认 / 不可交易）。画布空心三角+圆点，原因见事件流。'] };
const tag = t => { const [n, c, tip] = TAG[t] || [t, '#888', null]; return `<span class="tg" style="background:${c}22;color:${c};border-color:${c}66"${tip ? ` data-tip="${tip}"` : ''}>${n}</span>`; };
/* 缠师金句：用于底部轮播，保持短句，便于一眼读完 */
const QUOTES = [
  '走势终完美。',
  '没有趋势，没有背驰。',
  '离开级别，无所谓趋势。',
  '任何级别的任何走势类型终要完成。',
  '背驰是前后趋势间的比较。',
  '就在买点买，卖点卖。',
  '在任何级别买点买的，就在该级别的卖点卖。',
  '买了股票，就要从买点一直持有到至少同级别的第一卖点。',
  '没必要为券商打工。',
  '最好的当然是卖得准，但如果不能，宁愿早了，千万别晚了。',
  '买点总在恐慌的下跌中形成，但只要买点出现，就要义无反顾地买进。',
  '上涨总在不同情绪的交织中进行，要用钢铁般的意志把股票持住，决不中途被抛下车。',
  '无论哪类买点，都是在下跌或回试中形成的。',
  '不要回调不敢买，反而追高买。',
  '跌的时候，要想买点；涨的时候，要想卖点，这才是搞股票的，否则是被股票搞的。',
  '市场必然产生赢利的买卖点，只有第一、二、三类。',
  '第一类买点都是在0轴之下背驰形成的，第二类买点都是第一次上0轴后回抽确认形成的。',
  '任何非盘整性的转折性上涨，都是在某一级别的“下跌＋盘整＋下跌”后形成的。',
  '背驰只说明升势告一段落，并不承诺调整的幅度与时间。',
  '背驰后不必然出现V型反转，也可以形成盘整后再选择方向。',
  '抢反弹必须跌透，也就是至少两个以上中枢。',
  '背驰是制造底部、制造第一类买点的，而中枢扩展、延伸是制造第二、三类买点。',
  '小级别的背驰要发挥大作用，最好是在大级别走势的背驰段里。',
  '一个日线级别的调整，就必然在30分上有三段走势。',
  '中线的顶不是一天形成的。',
  '上升途中的大阴线，只会引发多头更凶猛的反扑。',
  '不要在巨量大阴线构造顶部的下跌反抽中介入。',
  '要养成绝对不追高的好习惯。',
  '最差的调整，也至少要去考验5日线甚至10日线。',
  '调整正是寻找下一次上涨好股票的时机。',
  '大盘调整时，关注逆市不跌的股票。',
  '大盘只能是参考，你要根据股票自身的走势。',
  '看技术买点，一定要综合地看。',
  '个股按图形来操作，把级别定好，但千万别太机械了。',
  '精通理论后，脑子里只有买点和卖点，没有什么涨跌。',
  '眼中有股，心中无股。',
];
const S = {
  cs: null, snaps: [], events: [], struct: [], signals: [], ghosts: [], i: 0, timer: null, tab: 'live', view: 'chart', cases: [], tf: null, path: [], pathVerdicts: [], importedRoot: null, gbUnit: 'fx',
  vp: { shift: 0, vis: 110, vz: 1 }, skipClick: false, subFold: false, cvFold: false,
  sel: null, selItem: null, selCtx: null, ltab: 'cat',
  focusBar: -1,
  layers: { sub: true, raw: true, merged: true, fractal: true, stroke: true, pivot: true, div: true, sig: true, stop: true, ghost: true, gb: true, dual: true },
  o: { divergenceAreaRatio: 0.9, warmupBars: 30, requireSubLevelConfirm: true, subLevelConfirmWindowBars: 30 },
};
const MOBILE_MQ = window.matchMedia('(max-width: 900px)');
const isMobile = () => MOBILE_MQ.matches;
const opts = () => ({ ...E.DEFAULT_OPTIONS, ...S.o });
const ctx = () => S.cs ? R.ctxOf(S.cs, S.i, opts()) : null;
/* 基线可用 = 存在同源 0 噪声链，且与主链逐根下标对齐（长度必须相等） */
const hasBase = () => !!(S.cs && S.cs.base && S.cs.base.run
  && S.cs.base.main.length === S.cs.main.length && S.cs.base.run.snaps[S.i]);

/* ───── 选中态 → 目录条目 / 显微镜 ───── */
function itemForSel(sel) {
  if (!sel) return null;
  if (sel.kind === 'stroke') return 'stroke';
  if (sel.kind === 'pivot') return 'pivot';
  if (sel.kind === 'merged') return 'merge';
  if (sel.kind === 'div') return 'divergence';
  if (sel.kind === 'fractal') {
    const f = S.snaps[S.i].res.fractals[sel.index];
    return f && f.isTop ? 'fractal-top' : 'fractal-bottom';
  }
  if (sel.kind === 'signal') {
    const list = sel.ghost ? S.ghosts : S.signals, x = list[sel.index];
    const map = { '1买': 'buy1', '2买': 'buy2', '3买': 'buy3', '1卖': 'sell1', '2卖': 'sell2', '3卖': 'sell3' };
    return x ? map[x.kind] || 'bs-prereq' : null;
  }
  return null;
}
function openSel(sel) {
  S.sel = sel; S.selItem = itemForSel(sel); S.selCtx = ctx(); renderRight();
  if (S.selItem) MX.open(S.selItem, sel, S.selCtx);
}
function openItem(id, sel, baseCtx) {
  if (!S.cs) return;
  const item = R.get(id); if (!item) return;
  let c = (sel && baseCtx) || ctx(), note = '';   // 带下标的下钻必须沿用生成该下标的窗口，否则下标会指向别的结构
  if (item.status !== 'todo' && !R.resolveSel(c, item, sel || null)) {
    const last = R.ctxOf(S.cs, S.snaps.length - 1, opts());
    if (R.resolveSel(last, item, null)) { c = last; note = `当前回放停在 #${S.i}，尚未形成${item.name}；已跳到最新窗口 #${last.i}。这是结构讲解，不代表原先 #${S.i} 时点已知。`; }
  }
  S.selItem = id; S.selCtx = c;
  S.sel = item.status === 'todo' ? null : R.resolveSel(c, item, sel || null);
  MX.open(id, S.sel, c, note);
}

/* ───── 侧栏 ───── */
const LAYERS = [
  ['sub', '次级别副图（含确认窗口）', '画布下方的次级别K线与次级别笔，横轴与主图逐根对齐；半透明色块是每个信号从“结构极值”到“记账”的确认窗口。白粗线 = 实际命中该信号的确认笔，白色竖虚线 + 空心点是这根笔变成“不可再改”的时点。点标题条名字可折叠/展开。导入的真实行情无次级别数据，此项不显示。'],
  ['raw', '原始K线', '生成器产生的本级别K线。'],
  ['merged', '包含处理后K线', '包含处理后的合并K线；紫色实线框表示两根K线确实发生了包含合并。'],
  ['fractal', '顶/底分型（含确认时点）', '三角是分型发生的位置，圆点是算法确认的时点，横线表示从发生到可知的延迟。'],
  ['stroke', '笔（实线=稳定，虚线=未稳定）', '实线笔已稳定、不再修正；虚线笔尚未稳定，后续K线仍可能把它修正。'],
  ['pivot', '中枢（虚线=尚未被离开）', '中枢区间 [ZD, ZG]，标注上下沿与笔数；虚线框表示尚未被离开笔确认结束。'],
  ['div', '背驰', '圆圈标记离开笔终点的笔级背驰，数字为 MACD 面积比（离开 ÷ 进入）。'],
  ['sig', '买卖点（实心=已发出）', '实心三角为算法已发出的买卖点，标注 ①1买/②2买 等类型；①=信号编号，与止损标签、HUD 共用，用来把买卖点、止损线、显微镜记录对上号。点选信号后 HUD 末行给事后结果：已止损（记账后任意一根触及止损线，第 12 根以后才破线也算）/ 浮盈 / 浮亏（没被止损时，按当前播放头这一根的收盘算浮动盈亏，12 根时点作参考）；刚记账那一根还没有后续K线，记「刚发出」。含 MFE/MAE。图上不改写信号。'],
  ['stop', '止损线（ATR×0.5）', '每条止损 = 锚定笔极值 ∓ 0.5×ATR14；从记账根（起点#号）向右画到 +12 根或窗口右缘（终点#号）；若 12 根之后才被破线，线延画到破线那根并整条转红。竖排 % = 记账价→止损价的幅度。标签四行：①信号编号+止损价、计算式、起止根号、百分比算式；×n = n 个信号同价重叠在同一条线上。实心信号的止损必在入场价正确一侧；空心 ghost 若是「不可交易」，说明记账时收盘已越过该止损线。'],
  ['ghost', '被过滤的信号（空心+原因）', '结构成立但被过滤的信号：空心三角 + 圆点，圆点后的一个字就是原因——暖 = 暖机隔离，次 = 次级别未确认，损 = 不可交易（记账价已越过止损）。细则见右侧「事件」或显微镜里的「状态」。'],
  ['gb', '分支预览（完全分类）', '主图画出「下一单位的两个方向」的幽灵K线（虚影，与时间轴逐根对齐，用与落实时完全相同的构造器生成）；点幽灵或底部流程带的虚框节点即落实。最小单位可在流程带头切换：单根K线 / 最小分型 / 最小笔（默认最小分型），切换只影响后续步骤；中枢、背驰、买卖点是单位序列回放后浮现的判定，不作为选项。'],
  ['dual', '上下双屏 + 差异带', '仅在污染 > 0、存在同源 0 噪声基线时生效：上屏画 0 噪声理想基线、下屏画当前受污染行情（保留完整点击选中与显微镜联动），中间 26px 差异带标出新增包含 / 分型、信号偏移与破坏，并绘制跨屏笔端点连线。取消勾选即只看当前行情的单画布。显微镜聚焦时自动让位。'],
];
const TODO = [['线段', '线段源码已于 2026-09-30 移除；M2 目录中只讲原著概念。'], ['线段特征序列', '依赖线段，暂未实现。'], ['走势类型', '趋势 / 盘整 / 完成的判定源码中没有；M2 目录已收录并标待实现。'], ['多级别递归', '源码只有周期叠加（非递归），M2 目录中标注为部分实现。']];
function initSide() {
  $('#layers').innerHTML = LAYERS.map(([k, n, tip]) => `<label class="ck" data-tip="${tip}"><input type="checkbox" data-l="${k}" ${S.layers[k] ? 'checked' : ''}> ${n}</label>`).join('')
    + `<div class="hint">待实现：${TODO.map(([n]) => n).join(' / ')}——源码未实现，无对应图层与状态机</div>`;
}
function readSpec() {
  /* 骨架恒为完美行情：旧噪声字段一律 0，污染由 ChanNoise 在骨架冻结之后施加；seed 只用于噪声 */
  return { amp: +$('#amp').value || 1.5, lenScale: +$('#len').value || 1, factor: +$('#fac').value || 5,
    noise: 0, realNoise: 0, noiseType: 'uniform', shapeNoise: 0, pollute: 0,
    lockSkeleton: true,
    seed: (+$('#seed').value) | 0, p0: 100, baseSec: 60, t0: 1700000000 };
}
const NOISE_W = ['wick', 'body', 'incl', 'spike'];
function readNoise() {
  const f = (id, d) => { const el = $('#' + id), v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? d : v; };
  return { eps: Math.max(0, f('eps', 0)), seed: (+$('#seed').value) | 0,
    w: { wick: f('w_wick', 1), body: f('w_body', 1), incl: f('w_incl', 1), spike: f('w_spike', 1) } };
}
function setNoise(n) {
  n = n || {}; const w = n.w || {};
  const set = (id, v) => { const el = $('#' + id); if (el) el.value = v; };
  set('eps', n.eps || 0);
  NOISE_W.forEach(k => set('w_' + k, w[k] != null ? w[k] : 1));
  syncSliders();
}
function setSpec(sp) {
  $('#amp').value = sp.amp; $('#len').value = sp.lenScale; $('#fac').value = sp.factor; $('#seed').value = sp.seed;
  syncSliders();
}
function readOpts() {
  const r = parseFloat($('#o_ratio').value), w = parseInt($('#o_warm').value, 10), sw = parseInt($('#o_win').value, 10);
  S.o = { divergenceAreaRatio: isNaN(r) ? 0.9 : r, warmupBars: isNaN(w) ? 30 : w, requireSubLevelConfirm: $('#o_sub').checked, subLevelConfirmWindowBars: isNaN(sw) ? 30 : sw };
}
function applyOpts(o) {
  if (!o) return;
  $('#o_ratio').value = o.divergenceAreaRatio; $('#o_warm').value = o.warmupBars;
  $('#o_win').value = o.subLevelConfirmWindowBars; $('#o_sub').checked = !!o.requireSubLevelConfirm;
  syncSliders(); readOpts();
}
/* ───── 实验控制拖动条：参数即改即算，无「生成并分析」按钮 ───── */
const SL_GEN = ['amp', 'len', 'eps', 'w_wick', 'w_body', 'w_incl', 'w_spike'], SL_ANA = ['o_ratio', 'o_warm', 'o_win'];
const sliderSync = id => { const el = $('#' + id), o = $('#' + id + '-v'); if (el && o) o.textContent = (id === 'fac' ? '×' : '') + el.value; };
const syncSliders = () => { SL_GEN.concat(SL_ANA).concat(['fac']).forEach(sliderSync); syncParamDeps(); };
/* 参数联动置灰：次级别确认关闭 → 确认窗口无效；路径噪声 0 → 噪声类型无效 */
function syncParamDeps() {
  const w = $('#o_win'), sub = $('#o_sub');
  if (w) w.disabled = sub ? !sub.checked : false;
}
/* 合帧节流：拖动时 input 事件密集，70ms 内合并为一次重算，停止后补跑最终值 */
const LIVE = { last: 0, timer: 0, fn: null };
function liveApply(fn) {
  LIVE.fn = fn;
  const run = () => { LIVE.last = Date.now(); LIVE.timer = 0; const f = LIVE.fn; LIVE.fn = null; f(); };
  if (LIVE.timer) return;
  const gap = Date.now() - LIVE.last;
  if (gap >= 70) run(); else LIVE.timer = setTimeout(run, 70 - gap);
}
/* ───── 数字输入微调：替代被 CSS 隐藏的原生 spinner ─────
 * 唯一写入口 setNum：写 DOM 值后派发 input，由输入既有的监听决定后续动作
 * （seed → liveApply(genKeepPos) 即改即算；csvmax 只在下次导入 CSV 时读取）。
 * 微调按钮与「随机」只提供新值，不自己调生成函数，避免第二条重算链路。 */
function setNum(id, v) {
  const el = $('#' + id); if (!el) return;
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function stepNum(id, dir) {
  const el = $('#' + id); if (!el) return;
  const step = +el.step || 1;
  const lo = el.min === '' ? -Infinity : +el.min, hi = el.max === '' ? Infinity : +el.max;
  const raw = parseFloat(el.value), cur = Number.isFinite(raw) ? raw : (lo === -Infinity ? 0 : lo);
  const next = Math.min(hi, Math.max(lo, cur + dir * step));
  if (next === cur) return;
  setNum(id, next);
}
function syncStepBtns() {
  document.querySelectorAll('[data-step]').forEach(b => {
    const el = $('#' + b.dataset.for); if (!el) return;
    const v = parseFloat(el.value), down = +b.dataset.step < 0;
    const lim = down ? el.min : el.max;
    b.disabled = lim !== '' && Number.isFinite(v) && (down ? v <= +lim : v >= +lim);
  });
}
/* 波动幅度探针：同种子生成「满档幅度」行情，用其价格范围作拖动时的固定 Y 参照。
   幅度是相对百分比，Y 轴逐帧自适应会让图自相似——看起来只剩坐标轴在变，故必须锁定参照系 */
function ampProbeLock(maxAmp) {
  if (!S.cs) return null;
  const sp = readSpec(); sp.amp = maxAmp;
  const m = G.generate(sp, opts()).main; let lo = Infinity, hi = -Infinity;
  for (const b of m) { if (b.low < lo) lo = b.low; if (b.high > hi) hi = b.high; }
  return isFinite(lo) && isFinite(hi) ? [lo, hi] : null;
}

/* ───── 生成 / 载入 ───── */
/* ───── 路径驱动生成：案例 = 种子根（或导入的真实行情） + 用户在分支流程里逐步落实的转移序列 ─────
 * 每步存 {m,u,dir,label}；重编译时按序 fold：replay 前缀 → 由单位算子生成确定性脚本 → 编译追加 → 逐帧核验。
 * u = bar / fx / bi（单根K线 / 最小分型 / 最小笔）；旧存档没有 u 的步骤按 legacy（7 根理想腿）回放。
 * v 空间骨架与波动幅度/次级别倍数不变量，lenScale 与噪声在编译内套用——拖滑杆即整条路径重编译。
 *
 * 同源 0 噪声基线：只要任何一层污染 > 0，整条路径就成对编译——同一个根、同一份 v 骨架、
 * 同一个分叉点 bar，仅把四项污染参数置 0。腿根数 / factor / lenScale 完全一致，
 * 因此两条链的 K 线与快照天然逐根下标对齐，对比链路不需要任何下标映射或事后补挂。 */
const polluted = sp => sp.realNoise > 0 || sp.noise > 0 || sp.shapeNoise > 0 || sp.pollute > 0;
const baseSpecOf = sp => ({ ...sp, noise: 0, realNoise: 0, shapeNoise: 0, pollute: 0, noiseType: 'uniform' });
const countsOf = cs => {
  const r = cs.run.snaps[cs.run.snaps.length - 1].res;
  return { bars: cs.main.length, strokes: r.strokes.length, pivots: r.pivots.length,
    divergences: r.divergences.length, signals: cs.run.signals.length, ghosts: cs.run.ghosts.length };
};
/* 一条链（污染链 / 基线链）的编译动作：两条链共用，禁止各自组装行情 */
function compileChain(spec, legs, o) {
  const cont = G._compile(legs, spec, 0);
  return { spec, main: cont.main, sub: cont.sub, run: E.replay(cont.main, cont.sub, o) };
}
/* 一条链的追加动作已下沉到生成器 G.appendChain：复制前缀到分叉点 → 用同一份 v 骨架编译追加腿
   → 整段重新回放；起点价格取本链自己的 close，sc 缩放保证绝对位移恒为 U·v，两链骨架严格同源。
   单位构造与旧版 7 根腿共用同一条追加路径。 */
/* 算法参数变化后的原地重放：只重算结构与计数，报告名称/描述与路径元数据原样保留；
   基线与主链用同一组算法参数重放，不借道生成器的场景口径。 */
function replayCase(cs, o) {
  cs.run = E.replay(cs.main, cs.sub, o);
  if (cs.base) cs.base.run = E.replay(cs.base.main, cs.base.sub, o);
  if (cs.report) cs.report.counts = countsOf(cs);
  return cs;
}
function seedCase(sp) {
  const spec = G._norm(sp), o = opts(), legs = [{ x: 0, n: 1, fixed: true }];
  const cs = compileChain(spec, legs, o);
  cs.base = polluted(spec) ? compileChain(baseSpecOf(spec), legs, o) : null;
  cs.imported = false;
  cs.report = { name: `路径 · ${S.path.length} 步`, desc: '行情由「分支流程」逐步构造：每一步 = 一个缠论单位（单根K线 / 最小分型 / 最小笔）的确定性脚本 + 逐帧回放核验；拖动参数即整条路径重编译并回到最前沿。', verifiable: false, ok: true,
    counts: countsOf(cs), search: { found: true, tries: 1, max: 1, branch: true } };
  return cs;
}
function buildPath(rootCs, steps) {
  let cs = rootCs, bar = rootCs.main.length - 1;
  const vs = [];
  for (let k = 0; k < (steps || []).length; k++) {
    const o = steps[k];
    const w = brMakeChild({ cs, bar, id: 'P' + k, depth: k }, { m: o.m, u: o.u || 'legacy', dir: o.dir || null, label: o.label }, opts());
    if (!w) break;   // 该步在当前参数下构造失败：如实截断，不长出伪造行情
    vs.push(stkVerdict(w, bar, o));
    cs = w.cs; bar = w.bar;
  }
  return { cs, bar, vs };
}
/* 污染 = 冻结完美行情（含次级别）上的逐根K线变换；完美链不受噪声参数影响，作为 base 原样保留 */
function pollute(clean) {
  const N = ChanNoise, np = readNoise();
  if (clean.imported || !N.active(np) || !clean.sub || !clean.sub.length) return clean;
  const F = clean.spec.factor || 1, pol = N.apply(clean.sub, F, np);
  const cs = { spec: clean.spec, main: pol.main, sub: pol.sub, imported: false, branch: clean.branch, base: clean, report: { ...clean.report } };
  cs.run = E.replay(cs.main, cs.sub, opts());
  cs.report.counts = countsOf(cs);
  return cs;
}
/* 完美链 → 污染后的本级别K线（分支幽灵预览用；不建回放） */
function pollMain(c) {
  const N = ChanNoise, np = readNoise();
  if (c.imported || !N.active(np) || !c.sub || !c.sub.length) return c.main;
  return N.apply(c.sub, c.spec.factor || 1, np).main;
}
function rebuild(keepVp) {
  readOpts();
  /* 完美骨架与噪声无关：只改噪声（含种子）时命中缓存，不重算骨架 */
  const sp = readSpec(); sp.seed = 0;
  const key = JSON.stringify([sp, S.path, S.o, S.importedRoot ? [S.importedRoot.main.length, S.importedRoot.main[0].time, S.importedRoot.report.name] : 0]);
  let b = S.cleanCache && S.cleanCache.key === key ? S.cleanCache.b : null;
  if (!b) { b = buildPath(S.importedRoot || seedCase(readSpec()), S.path); S.cleanCache = { key, b }; }
  S.pathVerdicts = b.vs; S.path = S.path.slice(0, b.vs.length);
  const vp = keepVp ? { ...S.vp } : null;
  load(pollute(b.cs)); go(b.bar);   // 每次重编译都回到最前沿：下一步的合法转移只在前沿存在
  if (vp) S.vp = vp;
}
/* 临界点扫描：在冻结的完美行情上扫 ε，列出每个结构质变第一次出现的 ε */
const scanKey = () => { const n = readNoise(); return JSON.stringify([n.w, n.seed, S.cs && S.cs.base ? S.cs.base.main.length : 0, S.o]); };
function runScan() {
  if (!hasBase()) return;
  S.scan = { key: scanKey(), res: ChanNoise.sweep(S.cs.base, readNoise(), opts(), { max: 1.5, steps: 30 }) };
  renderRight();
}
function scanHtml() {
  const sc = S.scan && S.scan.key === scanKey() ? S.scan.res : null, N = ChanNoise;
  let h = `<div class="sec">临界点扫描</div><div class="blk"><button data-scan="1">扫描 ε 0 → 1.5</button> <span class="m">在冻结的完美行情上逐档加噪，找出结构第一次发生质变的 ε；点事件行把 ε 拨到该处。</span></div>`;
  if (sc) {
    h += `<table class="tb"><tr><th>ε</th><th>事件（相对完美行情）</th></tr>`
      + (sc.events.length ? sc.events.map(e => `<tr data-seteps="${e.eps}" style="cursor:pointer"><td>${e.eps.toFixed(2)}</td><td>${e.text}</td></tr>`).join('') : '<tr><td colspan="2" class="m">0–1.5 范围内结构没有质变</td></tr>')
      + `</table>`;
    h += `<table class="tb" style="margin-top:8px"><tr><th>ε</th><th>笔</th><th>中枢</th><th>包含</th><th>分型</th><th>信号</th></tr>`
      + sc.grid.filter((g, k) => k % 5 === 0).map(g => `<tr data-seteps="${g.eps}" style="cursor:pointer"><td>${g.eps.toFixed(2)}</td><td>${g.strokes}</td><td>${g.pivots}</td><td>${g.merged}</td><td>${g.fractals}</td><td>${g.signals}</td></tr>`).join('') + `</table>`;
  }
  const ma = N.measure(S.cs.base.main), mb = N.measure(S.cs.main);
  h += `<div class="blk m" style="font-size:11px;margin-top:8px;line-height:1.7">形态统计（本级别）<br>完美：${N.fmt(ma)}<br>污染：${N.fmt(mb)}<br><span class="m">导入真实行情时，导入提示里有同口径的统计，可据此校准「ε=1 ≈ 真实」。</span></div>`;
  return h;
}
function gen() { leaveImport(); S.yLock = null; S.importedRoot = null; rebuild(false); }
function genKeepPos() { if (!S.cs) return gen(); rebuild(true); }
function load(cs) {
  stop(); MX.close();
  S.cs = cs; S.snaps = cs.run.snaps; S.signals = cs.run.signals; S.ghosts = cs.run.ghosts;
  S.sel = null; S.selItem = null; S.selCtx = null; STW.sel = null; S.focusBar = -1;
  S.events = S.snaps.map((s, k) => E.diffEvents(k ? S.snaps[k - 1] : null, s));
  S.struct = S.events.map(ev => ev.some(e => E.STRUCT.has(e.t)));
  S.i = Math.min(START, S.snaps.length - 1);
  S.vp.shift = 0; S.vp.vz = 1; S.vp.vis = 110;
  renderAll();
}
function reanalyze() {
  if (!S.cs) return; const keep = S.i; readOpts();
  replayCase(S.cs, opts());
  load(S.cs); go(keep);
}
/* ───── 真实行情 CSV 导入（解析复用 chan-csv.js；单周期 → 关闭次级别确认，如实标注） ───── */
const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fdt = t => new Date(t * 1000).toLocaleString('sv-SE').slice(0, 16);
const csvMsg = (h, bad) => { const el = $('#csvmsg'); el.innerHTML = h; el.style.color = bad ? 'var(--bad)' : ''; };
function leaveImport() {
  if (!S.cs || !S.cs.imported) return;
  const sub = $('#o_sub'); sub.disabled = false; if (S.subPrev !== undefined) sub.checked = S.subPrev;
  S.cs = Object.assign({}, S.cs, { imported: false });   // 标记已离开；随后 gen 会整体替换
  syncParamDeps();
}
function importCsv(items) {            // items: [{ name, text }]；多个文件按时间合并、重复时间戳去重
  const results = [];
  for (const it of items) {
    try { results.push(ChanCsv.parse(it.text)); }
    catch (e) { csvMsg('解析失败：' + esc(it.name) + '：' + esc(e.message), true); return; }
  }
  const r = results.length === 1 ? results[0] : ChanCsv.merge(results);
  const cr = r.report, fname = items.length === 1 ? items[0].name : `${items.length} 个文件`;
  if (r.candles.length < 100) { csvMsg(`有效K线仅 ${r.candles.length} 根（读入 ${cr.rows} 行，剔除 ${cr.dropped}），至少需要 100 根。` + (cr.issues.length ? '<br>' + cr.issues.slice(0, 3).map(esc).join('<br>') : ''), true); return; }
  const cap = Math.max(150, Math.min(3000, +$('#csvmax').value || 1000));
  const cut = Math.max(0, r.candles.length - cap), main = r.candles.slice(cut);
  stop();
  setTimeout(() => {
    try {
      if (!S.cs || !S.cs.imported) S.subPrev = $('#o_sub').checked;
      $('#o_sub').checked = false; $('#o_sub').disabled = true; syncParamDeps(); readOpts();
      const run = E.replay(main, [], opts());
      const avgR = main.reduce((a, c) => a + (c.high - c.low), 0) / main.length, p0 = main[0].close;
      const spec = { scenario: 'csv', amp: Math.max(0.3, Math.min(5, 400 * avgR / p0)), lenScale: 1, factor: 1, noise: 0, realNoise: 0, noiseType: 'uniform', shapeNoise: 0, pollute: 0, lockSkeleton: true, seed: 0, p0, baseSec: cr.baseSec || 60, t0: main[0].time };
      const cs = { spec, main, sub: [], run, base: null, imported: true,
        report: { name: 'CSV · ' + fname, desc: '外部真实行情，结构全部由算法逐根回放判定。', verifiable: false, ok: true, counts: {}, search: { found: true, tries: 1, max: 1 } } };
      cs.report.counts = countsOf(cs);
      S.path = []; S.pathVerdicts = []; S.importedRoot = cs;
      load(cs); go(START);
      const t0 = fdt(main[0].time), t1 = fdt(main[main.length - 1].time);
      csvMsg(`已导入 <b>${esc(fname)}</b>：读入 ${cr.rows} 行，保留 ${cr.kept}，剔除 ${cr.dropped}。<br>采用 ${main.length} 根（${t0} → ${t1}）${cut ? `，已丢弃更早的 ${cut} 根` : ''}。<br>单周期数据：已关闭次级别确认。<br>形态统计：${ChanNoise.fmt(ChanNoise.measure(main))}`
        + (cr.naiveLocalTime ? '<br>时间无时区，按本地时区解释。' : '')
        + (cr.issues.length ? '<br><span class="m">' + cr.issues.slice(0, 3).map(esc).join('<br>') + (cr.issues.length > 3 ? '<br>…' : '') + '</span>' : ''));
    } catch (e) { csvMsg('分析失败：' + esc(e.message), true); }
  }, 20);
}
async function readCsvFiles(list) {
  const files = Array.from(list || []).filter(f => /\.(csv|txt)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!files.length) { csvMsg('没有找到 .csv / .txt 文件。', true); return; }
  const items = [];
  for (let i = 0; i < files.length; i++) {
    if (files.length > 1) csvMsg(`正在读取 ${i + 1}/${files.length}：${esc(files[i].name)}`);
    try { items.push({ name: files[i].name, text: await files[i].text() }); }
    catch (e) { csvMsg(`读取失败：${esc(files[i].name)}：${esc(e.message)}`, true); return; }
  }
  importCsv(items);
}

/* ───── 0 噪声基线 vs 污染模型因果差分计算（方案三） ───── */
function computeCaseDiff(idx) {
  if (!hasBase()) return null;
  const i = idx != null ? idx : S.i;
  const bMain = S.cs.base.main, nMain = S.cs.main;
  const bSnap = S.cs.base.run.snaps[i], nSnap = S.snaps[i];
  const bRes = bSnap.res, nRes = nSnap.res, bo = bSnap.off, no = nSnap.off;
  const bSigs = S.cs.base.run.signals.filter(x => x.gConfirm <= i);
  const bGhosts = S.cs.base.run.ghosts.filter(x => x.gConfirm <= i);
  const nSigs = S.signals.filter(x => x.gConfirm <= i);
  const nGhosts = S.ghosts.filter(x => x.gConfirm <= i);

  const items = [];
  const barDiffs = new Array(i + 1).fill(null);

  // 1. 信号级因果账单
  for (const bs of bSigs) {
    const matchSig = nSigs.find(x => x.kind === bs.kind && Math.abs(x.gRef - bs.gRef) <= 6);
    const matchGhost = nGhosts.find(x => x.kind === bs.kind && Math.abs(x.gRef - bs.gRef) <= 6);
    if (matchSig) {
      const dBar = matchSig.gConfirm - bs.gConfirm;
      const dPrice = matchSig.refPrice - bs.refPrice;
      items.push({
        type: dBar === 0 ? 'keep' : 'shift',
        bar: matchSig.gRef,
        title: `${bs.kind} 信号保留${dBar ? `（确认偏移 ${dBar > 0 ? '+' + dBar : dBar} 根）` : '（确认时点未变）'}`,
        detail: `基线极值 #${bs.gRef} (${fm(bs.refPrice)}) → 污染后 #${matchSig.gRef} (${fm(matchSig.refPrice)}，偏差 ${dPrice >= 0 ? '+' : ''}${fm(dPrice)})`
      });
      if (matchSig.gRef <= i) barDiffs[matchSig.gRef] = 'shift';
    } else if (matchGhost) {
      const rMap = { warmup: '暖机隔离', sublevel: '次级别未确认', untradable: 'ATR止损不可交易' };
      items.push({
        type: 'break',
        bar: matchGhost.gRef,
        title: `${bs.kind} 被过滤 → 退化为空心 Ghost*`,
        detail: `原因：${rMap[matchGhost.reason] || matchGhost.reason}。基线 #${bs.gRef} 处的理想信号在 #${matchGhost.gConfirm} 未通过校验。`
      });
      if (matchGhost.gRef <= i) barDiffs[matchGhost.gRef] = 'break';
    } else {
      items.push({
        type: 'break',
        bar: bs.gRef,
        title: `${bs.kind} 信号消失`,
        detail: `基线 #${bs.gRef} (${fm(bs.refPrice)}) 处的背驰、稳定或中枢离开条件被污染打断，未产生 ${bs.kind}。`
      });
      if (bs.gRef <= i) barDiffs[bs.gRef] = 'break';
    }
  }
  for (const ns of nSigs) {
    if (!bSigs.some(bs => bs.kind === ns.kind && Math.abs(bs.gRef - ns.gRef) <= 6)) {
      items.push({
        type: 'extra',
        bar: ns.gRef,
        title: `污染额外诱发 ${ns.kind} @#${ns.gRef}`,
        detail: `0 噪声基线无此信号；污染改变了极值或面积比后在 #${ns.gConfirm} 触发。`
      });
      if (ns.gRef <= i) barDiffs[ns.gRef] = 'extra';
    }
  }

  // 2. 背驰对比
  const bDiv = bRes.divergences[bRes.divergences.length - 1];
  const nDiv = nRes.divergences[nRes.divergences.length - 1];
  if (bDiv && !nDiv) {
    const s = bRes.strokes[bDiv.leaveIndex], bar = s ? s.endBarIndex + bo : i;
    items.push({
      type: 'break', bar,
      title: `笔级背驰失效（基线面积比 ${bDiv.areaRatio.toFixed(2)}）`,
      detail: `噪声放大了离开笔 MACD 柱面积或破坏了创新极值条件，导致面积比 ≥ ${S.o.divergenceAreaRatio} 或无离开笔。`
    });
    if (bar <= i) barDiffs[bar] = 'break';
  } else if (bDiv && nDiv) {
    const s = nRes.strokes[nDiv.leaveIndex], bar = s ? s.endBarIndex + no : i;
    items.push({
      type: 'shift', bar,
      title: `背驰面积比漂移：${bDiv.areaRatio.toFixed(2)} → ${nDiv.areaRatio.toFixed(2)}`,
      detail: `进入段面积 ${fm(bDiv.enterArea)} → ${fm(nDiv.enterArea)}；离开段面积 ${fm(bDiv.leaveArea)} → ${fm(nDiv.leaveArea)}。`
    });
  }

  // 3. 中枢对比
  const bPv = bRes.pivots[0], nPv = nRes.pivots[0];
  if (bPv && nPv) {
    const s0 = nRes.strokes[nPv.startStrokeIndex], bar = s0 ? s0.startBarIndex + no : 0;
    if (bPv.zd !== nPv.zd || bPv.zg !== nPv.zg || bPv.strokeCount !== nPv.strokeCount) {
      items.push({
        type: 'shift', bar,
        title: `中枢区间变形：[${fm(bPv.zd)}, ${fm(bPv.zg)}] → [${fm(nPv.zd)}, ${fm(nPv.zg)}]`,
        detail: `笔数 ${bPv.strokeCount}笔 → ${nPv.strokeCount}笔；状态：${nPv.isConfirmed ? '已确认离开' : '未离开'}。`
      });
    }
  } else if (bPv && !nPv) {
    const s0 = bRes.strokes[bPv.startStrokeIndex], bar = s0 ? s0.startBarIndex + bo : 0;
    items.push({
      type: 'break', bar,
      title: `中枢结构瓦解（1 → 0）`,
      detail: `连续三笔重叠区间 ZG > ZD 条件被污染破坏，当前窗口未能形成中枢。`
    });
    if (bar <= i) barDiffs[bar] = 'break';
  }

  // 4. 笔数量与折返差异
  const dSt = nRes.strokes.length - bRes.strokes.length;
  if (dSt !== 0) {
    const tailS = nRes.strokes[nRes.strokes.length - 1];
    const bar = tailS ? tailS.endBarIndex + no : i;
    items.push({
      type: 'extra', bar,
      title: `笔数量变异：${bRes.strokes.length} 笔 → ${nRes.strokes.length} 笔（${dSt > 0 ? '+' + dSt + ' 笔碎折返' : dSt + ' 笔被合并'}）`,
      detail: dSt > 0
        ? `结构污染（毛刺/抖动）在单腿内部制造了多余的有效分型，把原本干净的一笔劈成了多笔。`
        : `意外包含或路径漂移抹平了原有转折分型，导致相邻笔被吞没。`
    });
  }

  // 5. 逐根包含与分型差异标记（供双屏中间差异带渲染）
  const bMergedBars = new Set();
  bRes.merged.forEach(m => { if (m.endIndex > m.startIndex) for (let k = m.startIndex + bo; k <= m.endIndex + bo; k++) bMergedBars.add(k); });
  nRes.merged.forEach(m => {
    if (m.endIndex > m.startIndex) {
      for (let k = m.startIndex + no; k <= m.endIndex + no; k++) {
        if (k <= i && !bMergedBars.has(k) && !barDiffs[k]) barDiffs[k] = 'merge';
      }
    }
  });
  const bFracBars = new Set(bRes.fractals.map(f => f.barIndex + bo));
  nRes.fractals.forEach(f => {
    const gb = f.barIndex + no;
    if (gb <= i && !bFracBars.has(gb) && !barDiffs[gb]) barDiffs[gb] = 'fractal';
  });

  return { items, barDiffs, bRes, nRes, bo, no, bSigs, nSigs, bGhosts, nGhosts, bMain, nMain };
}

/* ───── 播放 ───── */
function go(i) { { const t = Math.max(0, Math.min(S.snaps.length - 1, i)); if (MX.isOpen() && t !== MX.state().c.i) MX.close(); } const old = S.i; S.i = Math.max(0, Math.min(S.snaps.length - 1, i)); if (S.i !== old) S.vp.shift = 0; normalizeSel(); renderAll(); }
const step = d => go(S.i + d);
function nextEv() { for (let j = S.i + 1; j < S.struct.length; j++) if (S.struct[j]) { go(j); return; } go(S.snaps.length - 1); stop(); }
function prevEv() { for (let j = S.i - 1; j >= 0; j--) if (S.struct[j]) { go(j); return; } go(START); }
function stop() { if (S.timer) { clearInterval(S.timer); S.timer = null; } const b = $('#play'); if (b) b.textContent = '▶ 自动'; }
function play() {
  if (!S.cs) return;
  if (S.timer) { stop(); return; }
  if (S.i >= S.snaps.length - 1) go(START);
  $('#play').textContent = '|| 暂停';
  S.timer = setInterval(() => { step(1); if (S.i >= S.snaps.length - 1) stop(); }, +$('#spd').value);   /* 自动播放固定逐根；事件定位用 ◀◀ / ▶▶ 或 Shift+←/→ */
}

/* ───── 画布 ───── */
/* 视图窗口：shift 为视口右缘相对"当前K线+6"的偏移（≤0 表示回看历史），vz 为纵向缩放 */
function clampShift(s) { return Math.max(-S.i - 5, Math.min(0, s)); }
function resetView() { S.vp.shift = 0; S.vp.vis = 110; S.vp.vz = 1; S.yLock = null; draw(); }
function draw() { syncSplitter(); drawMain(); drawSub(); gbFlowDraw(); syncSplitter(); syncChartFold(); }
function drawMain() {
  const wrapC = $('#cvwrap'); if (wrapC) wrapC.classList.toggle('folded', S.cvFold);
  $('#cvtitle').textContent = (S.cvFold ? '▸' : '▾') + ' 本级别主图';
  $('#cvinfo').textContent = S.cs ? `${S.cs.report.name} · 第 ${S.i} / ${S.snaps.length - 1} 根` : '';
  const cv = $('#cv'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0e0e10'; g.fillRect(0, 0, W, H);
  if (!S.cs) { g.fillStyle = '#8b95a3'; g.font = '14px -apple-system, "PingFang SC", system-ui'; g.fillText('行情从种子K线起步：在左栏调参数，或点底部「分支流程」的虚框节点落实一步', 24, 40); return; }
  const m = S.cs.main, i = S.i, snap = S.snaps[i], r = snap.res, off = snap.off, FXI = fxInfo(), L = FXI ? FXI.L : S.layers;
  const cmpActive = hasBase() && S.layers.dual && !FXI;
  const bm = cmpActive ? S.cs.base.main : null, bSnap = cmpActive ? S.cs.base.run.snaps[i] : null;
  const br = bSnap ? bSnap.res : null, boff = bSnap ? bSnap.off : 0;

  const padL = 10, padR = 64, padT = 22, padB = 22, pw = W - padL - padR, ph = H - padT - padB;
  const right = i + 6 + S.vp.shift, left = right - S.vp.vis, bw = pw / S.vp.vis;
  const X = b => padL + (b - left + 0.5) * bw;
  let lo = Infinity, hi = -Infinity;                                  // 纵轴只由"已发生"的K线决定，不泄露未来
  const vEnd = Math.min(i, Math.floor(right));
  for (let b = Math.max(0, Math.floor(left)); b <= vEnd; b++) {
    if (m[b].low < lo) lo = m[b].low; if (m[b].high > hi) hi = m[b].high;
    if (bm && bm[b]) { if (bm[b].low < lo) lo = bm[b].low; if (bm[b].high > hi) hi = bm[b].high; }
  }
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  /* Y 轴锁定（拖动生成参数时）：以固定参照系显示，避免自适应缩放把幅度变化吃掉；越界只扩不缩（raw 口径） */
  if (S.yLock) { const l2 = Math.min(lo, S.yLock[0]), h2 = Math.max(hi, S.yLock[1]); S.yLock = [l2, h2]; lo = l2; hi = h2; }
  const pd = (hi - lo) * 0.1 || 1; lo -= pd; hi += pd;
  S.yRange = [lo, hi];
  const mid = (hi + lo) / 2, vz = S.vp.vz;                            // 纵向缩放：围绕视图中心
  hi = mid + (hi - mid) * vz; lo = mid - (mid - lo) * vz;
  const vis = b => b >= left - 2 && b <= right + 2;
  const line = (x1, y1, x2, y2, c, w, d) => { g.beginPath(); g.strokeStyle = c; g.lineWidth = w || 1; g.setLineDash(d || []); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); };
  const txt = (s, x, y, c, f, al) => { g.fillStyle = c; g.font = f || '11px -apple-system, "PingFang SC", system-ui'; g.textAlign = al || 'left'; g.fillText(s, x, y); g.textAlign = 'left'; };

  /* ── 分支 A：上下双屏 + 中间结构差异带（图层开关开启且有 0 噪声基线时） ── */
  if (cmpActive) {
    const stripH = 26, topH = Math.round((ph - stripH) * 0.40), botH = ph - stripH - topH;
    const topY0 = padT, stripY0 = padT + topH, botY0 = stripY0 + stripH;
    const YTop = p => topY0 + (hi - p) / (hi - lo) * topH;
    const YBot = p => botY0 + (hi - p) / (hi - lo) * botH;
    S.tf = { left, bw, padL, padT: botY0, ph: botH, lo, hi, padR };

    const stp = [5, 10, 20, 50].find(s => s * bw >= 50) || 100;
    for (let b = Math.ceil(left / stp) * stp; b <= right; b += stp) {
      if (b < 0 || b > i) continue;
      const x = X(b); line(x, padT, x, H - padB, '#18181a', 1); txt('#' + b, x, H - 6, '#8e8e93', '10px -apple-system, "PingFang SC", system-ui', 'center');
    }
    for (let k = 0; k <= 3; k++) {
      const p = lo + (hi - lo) * k / 3;
      line(padL, YTop(p), W - padR, YTop(p), '#1f1f22', 1); txt(p.toFixed(1), W - padR + 6, YTop(p) + 4, '#8e8e93');
      line(padL, YBot(p), W - padR, YBot(p), '#1f1f22', 1); txt(p.toFixed(1), W - padR + 6, YBot(p) + 4, '#8e8e93');
    }
    g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(X(i) + bw / 2, padT, W, ph);
    g.save(); g.beginPath(); g.rect(padL, padT, pw, ph); g.clip();

    if (S.focusBar >= 0 && S.focusBar <= i && vis(S.focusBar)) {
      g.fillStyle = 'rgba(76, 155, 253, 0.14)'; g.fillRect(X(S.focusBar) - Math.max(6, bw * 0.7), padT, Math.max(12, bw * 1.4), ph);
    }

    // 上屏：0 噪声理想基线
    if (L.pivot) br.pivots.forEach(p => {
      const a = br.strokes[p.startStrokeIndex], z = br.strokes[p.endStrokeIndex]; if (!a || !z) return;
      const b0 = a.startBarIndex + boff, b1 = p.isConfirmed ? z.endBarIndex + boff : i;
      if (b1 < left || b0 > right) return;
      const x0 = X(b0) - bw / 2, x1 = X(b1) + bw / 2, y0 = YTop(p.zg), y1 = YTop(p.zd);
      g.fillStyle = 'rgba(56,189,248,0.12)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = '#38bdf8'; g.lineWidth = 1; g.setLineDash(p.isConfirmed ? [] : [5, 4]); g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
    });
    if (L.raw) for (let b = Math.max(0, Math.floor(left)); b <= i; b++) {
      const c = bm[b], x = X(b), col = c.close >= c.open ? KLINE_COL.up : KLINE_COL.down;
      line(x, YTop(c.high), x, YTop(c.low), col, 1);
      const yo = YTop(c.open), yc = YTop(c.close); g.fillStyle = col; g.fillRect(x - bw * 0.28, Math.min(yo, yc), bw * 0.56, Math.max(1, Math.abs(yo - yc)));
    }
    if (L.stroke) br.strokes.forEach(s => {
      const a = s.startBarIndex + boff, b = s.endBarIndex + boff; if (b < left - 1 || a > right + 1) return;
      line(X(a), YTop(s.startPrice), X(b), YTop(s.endPrice), '#38bdf8', s.isConfirmed ? 2 : 1.4, s.isConfirmed ? [] : [5, 3]);
    });
    if (L.sig) S.cs.base.run.signals.forEach(s => {
      if (s.gConfirm > i) return;
      const xc = X(s.gConfirm), y = YTop(s.price), buy = s.side === 'buy', col = buy ? '#22d3ee' : '#f472b6';
      g.fillStyle = col; g.beginPath();
      if (buy) { g.moveTo(xc, y + 3); g.lineTo(xc - 5, y + 11); g.lineTo(xc + 5, y + 11); } else { g.moveTo(xc, y - 3); g.lineTo(xc - 5, y - 11); g.lineTo(xc + 5, y - 11); }
      g.closePath(); g.fill(); txt(s.kind, xc, buy ? y + 21 : y - 14, col, 'bold 10.5px -apple-system, "PingFang SC", system-ui', 'center');
    });
    txt('上屏 · 0 噪声完美基线（理想参照）', padL + 6, topY0 + 14, '#38bdf8', 'bold 11px -apple-system, "PingFang SC", system-ui');

    // 中间 26px：结构差异对齐带 (Diff Strip)
    const dfInfo = computeCaseDiff(i);
    g.fillStyle = '#1c1c1e'; g.fillRect(padL, stripY0, pw, stripH);
    line(padL, stripY0, W - padR, stripY0, '#2c2c2e', 1);
    line(padL, stripY0 + stripH, W - padR, stripY0 + stripH, '#2c2c2e', 1);
    txt('差异带', W - padR + 6, stripY0 + 16, '#8ec5ff', '10px -apple-system, "PingFang SC", system-ui');
    if (dfInfo) {
      const cMap = { merge: '#a78bfa', fractal: '#fbbf24', shift: '#38bdf8', break: '#f87171', extra: '#fb923c' };
      for (let b = Math.max(0, Math.floor(left)); b <= i; b++) {
        const tagType = dfInfo.barDiffs[b]; if (!tagType) continue;
        g.fillStyle = cMap[tagType] || '#fb7185';
        g.fillRect(X(b) - Math.max(2, bw * 0.35), stripY0 + 5, Math.max(4, bw * 0.7), stripH - 10);
      }
    }

    // 跨屏笔端点对应连线
    const minSt = Math.min(br.strokes.length, r.strokes.length);
    for (let k = 0; k < minSt; k++) {
      const bs = br.strokes[k], ns = r.strokes[k];
      if (bs.isUp !== ns.isUp) continue;
      const bBar = bs.endBarIndex + boff, nBar = ns.endBarIndex + off;
      if (bBar !== nBar || Math.abs(bs.endPrice - ns.endPrice) > 0.08) {
        line(X(bBar), YTop(bs.endPrice), X(nBar), YBot(ns.endPrice), 'rgba(251,113,133,0.52)', 1.2, [3, 3]);
      }
    }

    // 下屏：当前受污染行情
    drawMainLayers(g, m, i, r, off, L, left, right, bw, X, YBot, vis, line, txt, W - padR, padT + ph);
    line(X(i), padT, X(i), H - padB, 'rgba(88,166,255,0.35)', 1, [3, 3]);
    txt('下屏 · 当前受污染行情（可点击结构打开检查器/显微镜）', padL + 6, botY0 + 14, '#facc15', 'bold 11px -apple-system, "PingFang SC", system-ui');
    g.restore();
    txt(`#${i} / ${m.length - 1}　双屏对比模式（紫=新增包含 · 黄=新增分型 · 红=破坏/过滤）`, padL + 4, 14, '#8e8e93');
    return;
  }

  /* ── 分支 B：单画布 ── */
  const Y = p => padT + (hi - p) / (hi - lo) * ph;
  S.tf = { left, bw, padL, padT, ph, lo, hi, padR };

  for (let k = 0; k <= 5; k++) { const p = lo + (hi - lo) * k / 5, y = Y(p); line(padL, y, W - padR, y, '#1f1f22', 1); txt(p.toFixed(1), W - padR + 6, y + 4, '#8e8e93'); }
  const stp = [5, 10, 20, 50].find(s => s * bw >= 50) || 100;
  for (let b = Math.ceil(left / stp) * stp; b <= right; b += stp) { if (b < 0 || b > i) continue; const x = X(b); line(x, padT, x, H - padB, '#18181a', 1); txt('#' + b, x, H - 6, '#8e8e93', '10px -apple-system, "PingFang SC", system-ui', 'center'); }
  g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(X(i) + bw / 2, padT, W, ph);   // 未来区域（尚未发生）
  g.save(); g.beginPath(); g.rect(padL, padT, pw, ph); g.clip();                     // 纵向缩放时不画出绘图区

  if (S.focusBar >= 0 && S.focusBar <= i && vis(S.focusBar)) {
    g.fillStyle = 'rgba(76, 155, 253, 0.15)'; g.fillRect(X(S.focusBar) - Math.max(6, bw * 0.7), padT, Math.max(12, bw * 1.4), ph);
  }

  drawMainLayers(g, m, i, r, off, L, left, right, bw, X, Y, vis, line, txt, W - padR, padT + ph);
  line(X(i), padT, X(i), H - padB, 'rgba(88,166,255,0.35)', 1, [3, 3]);

  /* 分支预览（完全分类）：下一单位的两个方向幽灵K线（与时间轴逐根对齐，落实后即真实K线），点击即提交 */
  if (S.layers.gb && !cmpActive && !FXI) {
    gbCompute();
    if (GB.paths.length) {
      GB.paths.forEach((pts, k) => {
        const col = unitColor(GB.opts[k].u, GB.opts[k].dir);
        const cds = GB.candles[k];
        if (cds) {
          for (let j = 0; j < cds.length; j++) {
            const c = cds[j], bx = S.i + 1 + j;
            if (!vis(bx)) continue;
            const x = X(bx), yo = Y(c.open), yc = Y(c.close), yh = Y(c.high), yl = Y(c.low);
            const up = c.close >= c.open, cw = Math.max(1.5, Math.min(9, bw * 0.6));
            g.globalAlpha = 0.55; g.strokeStyle = col; g.lineWidth = 1;
            g.beginPath(); g.moveTo(x, yh); g.lineTo(x, yl); g.stroke();
            g.beginPath(); g.rect(x - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
            if (up) { g.globalAlpha = 0.22; g.fillStyle = col; g.fill(); g.globalAlpha = 0.55; }
            g.stroke();
          }
          g.globalAlpha = 1;
        }
        g.beginPath(); g.setLineDash([7, 5]); g.strokeStyle = col; g.globalAlpha = 0.4; g.lineWidth = 1.2;
        pts.forEach((p, j) => { const x = X(p.bar), y = Y(p.price); if (j) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke(); g.globalAlpha = 1; g.setLineDash([]);
        const e = pts[pts.length - 1], ex = X(e.bar), ey = Y(e.price);
        g.beginPath(); g.arc(ex, ey, 3.2, 0, 6.3); g.strokeStyle = col; g.lineWidth = 1.4; g.stroke();
        txt((k + 1) + ' ' + unitShort(GB.opts[k].u, GB.opts[k].dir), Math.min(ex + 6, W - padR - 60), ey + (k % 2 ? 15 : -11), col, '10.5px -apple-system, "PingFang SC", system-ui');
      });
      const s0 = GB.paths[0][0];
      g.beginPath(); g.arc(X(s0.bar), Y(s0.price), 4.5, 0, 6.3); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.2; g.stroke();
      txt('虚影K线 = 下一' + (G.UNIT_LABEL[GB.u] || '单位') + '的两个方向 · 点击投影或流程带落实', padL + 4, H - padB - 8, 'rgba(142,142,147,0.9)', '10.5px -apple-system, "PingFang SC", system-ui');
    }
  }

  g.restore();
  {
    const full = FXI ? `焦点 · ${FXI.item.name}${FXI.st ? '　第 ' + (FXI.M.step + 1) + ' 步：' + FXI.st.t : ''}` : captionText();
    g.font = '12px -apple-system, "PingFang SC", system-ui'; let tt = full; const maxW = pw - 110;
    while (tt.length > 6 && g.measureText(tt).width > maxW) tt = tt.slice(0, -2) + '…';
    txt(tt, padL + 4, 15, FXI ? '#64d2ff' : '#c7c7cc', '12px -apple-system, "PingFang SC", system-ui');
  }
}

/* ───── 次级别副图：与主图同一横轴；次级别笔由对次级别K线的独立分析得出（只用截至当前的数据） ───── */
function focusOf(sel, M) {
  if (!sel) return {};
  if (sel.kind === 'raw') return { bars: [M.c.i] };
  if (sel.kind === 'signal') { const list = sel.ghost ? S.ghosts : S.signals, x = list[sel.index]; return x ? { sig: { x } } : {}; }
  return { [sel.kind]: sel.index };
}
/* 焦点态：显微镜不再另开画布，而是让主图自己按“结果 / 生成步骤”聚焦 */
function fxInfo() {
  if (!MX.isOpen()) return null;
  const M = MX.state(); if (!M.item || M.item.status === 'todo' || !M.c || M.c.i !== S.i) return null;
  const st = M.mode === 'gen' ? M.steps[M.step] : null, show = st ? (R.STAGE[st.stage] || R.STAGE.raw) : null;
  const L = show ? { raw: !!show.raw, merged: !!show.merged, fractal: !!show.fractal, stroke: !!show.stroke, pivot: !!show.pivot, div: !!show.div, sig: !!show.sig, ghost: !!show.sig, stop: !!S.layers.stop }
    : { ...S.layers, merged: S.layers.merged || M.item.kind === 'merge' || M.item.kind === 'merged' };
  return { M, item: M.item, st, L, focus: st ? (st.focus || {}) : focusOf(M.sel, M) };
}
/* 画布左上角的一句话字幕：这一根K线发生了什么 + 三台状态机当前状态 */
function captionText() {
  if (!S.cs) return '';
  const strip = x => String(x).replace(/<[^>]*>/g, ''), ev = (S.events[S.i] || []).filter(e => E.STRUCT.has(e.t));
  const t = ev.length ? ev.slice(0, 2).map(e => (TAG[e.t] ? TAG[e.t][0] + '：' : '') + strip(e.text)).join('　；　') : '本根没有新结构' + (S.st ? '　·　' + stLine(S.st) : '');
  return `#${S.i} / ${S.cs.main.length - 1}　${t}`;
}
const SUBCAP = 1500;
function subAnalysis(cs, i, left) {
  const F = cs.spec.factor || 1, sub = cs.sub, end = Math.min(sub.length, (i + 1) * F);
  let start = Math.max(0, Math.floor(Math.max(0, left)) * F - 4 * F);
  start = Math.floor(Math.max(start, end - SUBCAP) / 100) * 100;   // 量化起点，拖动平移时不必逐帧重算
  const key = start + '|' + end + '|' + JSON.stringify(S.o), C = cs._sc;
  if (C && C.key === key) return C;
  let res = null;
  if (end - start >= 12) { try { res = E.analyze(sub.slice(start, end), { ...opts(), requireSubLevelConfirm: false }, null); } catch (e) { res = null; } }
  return (cs._sc = { key, res, start, end });
}
function drawSub() {
  const wrap = $('#subwrap'); if (!wrap) return;
  const on = !!(S.view === 'chart' && S.layers.sub && S.cs && S.cs.sub && S.cs.sub.length && S.tf);
  if (wrap.hidden === on) wrap.hidden = !on;
  if (!on) return;
  if (!wrap.style.getPropertyValue('--subh')) applySubFrac();   /* 副图刚出现时套用记忆的高度比例 */
  syncSplitter();
  wrap.classList.toggle('folded', S.subFold);
  const { left } = S.tf, i = S.i, F = S.cs.spec.factor || 1;
  const A = subAnalysis(S.cs, i, left), r = A.res;
  const dual = hasBase() && S.layers.dual && !fxInfo();
  const cut = Math.floor(left * F) < A.start ? ' · 仅分析最近 ' + (A.end - A.start) + ' 根' : '';
  $('#subtitle').textContent = (S.subFold ? '▸' : '▾') + ' 次级别副图';
  $('#subinfo').textContent = S.subFold
    ? `×${F}${r ? ' · ' + r.strokes.length + ' 笔' : ''} · 已折叠，点击名字展开`
    : `×${F}${r ? ' · ' + r.strokes.length + ' 笔' : ' · 数据不足'}${cut}${dual ? ' · 上下双屏（上=完美 下=污染）' : ''} · 青区 = 确认窗口`;
  const cv = $('#cvs'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (S.subFold || !W || !H) return;   /* 折叠态画布 display:none（clientHeight 为 0），只更新标题条 */
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0e0e10'; g.fillRect(0, 0, W, H);
  const PC = { cs: S.cs, sigs: S.signals, ghs: S.ghosts, A };
  if (!dual) { drawSubPanel(g, W, 0, H, PC, null, null, true); return; }
  const B = S.cs.base, hh = Math.floor(H / 2);
  const s0 = Math.max(0, Math.floor(left * F) - 1), s1 = Math.min(S.cs.sub.length, (i + 1) * F) - 1;
  let lo = Infinity, hi = -Infinity;   /* 两屏共用纵轴：偏差才看得出来 */
  for (const arr of [B.sub, S.cs.sub]) for (let k = s0; k <= s1; k++) { const b = arr[k]; if (!b) continue; if (b.low < lo) lo = b.low; if (b.high > hi) hi = b.high; }
  const pd = (hi - lo) * 0.1 || 1, yr = isFinite(lo) ? [lo - pd, hi + pd] : null;
  const PB = { cs: B, sigs: B.run.signals, ghs: B.run.ghosts, A: subAnalysis(B, i, left) };
  drawSubPanel(g, W, 0, hh, PB, { t: '上屏 · 完美次级别（冻结）', c: '#38bdf8' }, yr, false);
  drawSubPanel(g, W, hh, H - hh, PC, { t: '下屏 · 污染后的次级别', c: '#facc15' }, yr, true);
  g.fillStyle = '#2c2c2e'; g.fillRect(0, hh, W, 1);
}
/* 一屏次级别：y0/H 为该屏在画布里的位置；P = { cs, sigs, ghs, A }；yr 共用纵轴（可空） */
function drawSubPanel(g, W, y0, H, P, label, yr, legend) {
  const { left, bw, padL, padR } = S.tf, i = S.i, cs = P.cs, F = cs.spec.factor || 1, sub = cs.sub;
  const A = P.A, r = A.res, end = A.end, half = bw / F / 2;
  g.save(); g.translate(0, y0); g.beginPath(); g.rect(0, 0, W, H); g.clip();
  const txt = (t, x, y, c, f, al) => { g.fillStyle = c; g.font = f || '10.5px -apple-system, "PingFang SC", system-ui'; g.textAlign = al || 'left'; g.fillText(t, x, y); g.textAlign = 'left'; };
  const tag = (t, x, y, col, f) => {
    g.font = f || '10.5px -apple-system, "PingFang SC", system-ui';
    const w = g.measureText(t).width + 8, h = 15;
    g.beginPath(); g.moveTo(x + 3, y); g.arcTo(x + w, y, x + w, y + h, 3); g.arcTo(x + w, y + h, x, y + h, 3); g.arcTo(x, y + h, x, y, 3); g.arcTo(x, y, x + w, y, 3); g.closePath();
    g.fillStyle = 'rgba(14,14,16,0.86)'; g.fill(); g.strokeStyle = col + '88'; g.lineWidth = 1; g.stroke();
    txt(t, x + w / 2, y + 11, col, g.font, 'center');
  };
  const padT = label ? 20 : 10, padB = 6, ph = H - padT - padB, pw = W - padL - padR;
  const X = k => padL + (k / F - left + 0.5 / F) * bw, XM = b => padL + (b - left + 0.5) * bw;
  const s0 = Math.max(0, Math.floor(left * F) - 1), s1 = end - 1;
  if (s0 > s1 || ph < 20) { g.restore(); return; }
  let lo = Infinity, hi = -Infinity;
  if (yr) { lo = yr[0]; hi = yr[1]; }
  else {
    for (let k = s0; k <= s1; k++) { if (sub[k].low < lo) lo = sub[k].low; if (sub[k].high > hi) hi = sub[k].high; }
    const pd = (hi - lo) * 0.1 || 1; lo -= pd; hi += pd;
  }
  const Y = p => padT + (hi - p) / (hi - lo) * ph;
  const line = (x1, y1, x2, y2, c, w, d) => { g.beginPath(); g.strokeStyle = c; g.lineWidth = w || 1; g.setLineDash(d || []); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); };
  for (let k = 0; k <= 2; k++) { const p = lo + (hi - lo) * k / 2; line(padL, Y(p), W - padR, Y(p), '#1f1f22', 1); txt(p.toFixed(1), W - padR + 6, Y(p) + 4, '#8e8e93'); }
  g.save(); g.beginPath(); g.rect(padL, padT, pw, ph); g.clip();
  if (bw >= 10) for (let b = Math.max(0, Math.ceil(left)); b <= i + 1 && padL + (b - left) * bw <= W - padR; b++) { const x = padL + (b - left) * bw; line(x, padT, x, padT + ph, '#1c1c1e', 1); }
  const xEnd = padL + (i + 1 - left) * bw; g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(xEnd, padT, W, ph);
  const WBOX = [];   /* 窗口标签互相避让：同一段里 ghost 与信号窗口可能贴在一起 */
  const CBOX = [];   /* 确认笔标签互相避让：相邻两笔的中点常常贴得很近 */
  const TAGS = [];   /* 确认笔标签延后绘制 */
  const win = (s, ghost, allowLab) => {
    if (s.gConfirm > i) return;
    const x0 = XM(s.gRef) - bw / 2, x1 = XM(s.gConfirm) + bw / 2; if (x1 < padL || x0 > W - padR) return;
    const col = ghost ? '#8e8e93' : (s.side === 'buy' ? '#64d2ff' : '#ff6482');
    const a0 = Math.max(x0, padL), a1 = Math.min(x1, W - padR);
    g.fillStyle = col + '14'; g.fillRect(a0, padT, Math.max(2, a1 - a0), ph);
    line(a0, padT, a1, padT, col + 'aa', 2);
    line(a0, padT, a0, padT + ph, col + '55', 1, [3, 3]);
    line(a1, padT, a1, padT + ph, col + '55', 1, [3, 3]);
    if (ghost && !allowLab) return;   /* ghost 多了就只留色带，避免标签堆满顶部 */
    const lab = s.kind + (ghost ? ' ·' : '') + ' 确认窗口';
    g.font = 'bold 10.5px -apple-system, "PingFang SC", system-ui';
    let tx = Math.max(x0, padL) + 3;
    const lw2 = g.measureText(lab).width + 8;
    if (tx + lw2 > W - padR) tx = Math.max(padL + 2, W - padR - lw2);
    let ty = padT + 3;
    for (let k = 0; k < 4 && WBOX.some(b => tx < b.x + b.w && tx + lw2 > b.x && ty < b.y + b.h && ty + 15 > b.y); k++) ty += 16;
    WBOX.push({ x: tx, y: ty, w: lw2, h: 15 });
    tag(lab, tx, ty, col, 'bold 10.5px -apple-system, "PingFang SC", system-ui');
  };
  /* 与主图同口径：mdk 会把同一结构在新稳定根上重发一次，数据保留、画布只画最早一次 */
  const sigs = uniqueSig(P.sigs || []).map(x => x.s), ghs = uniqueSig(P.ghs || []).map(x => x.s);
  const sigWins = sigs.filter(s => s.gConfirm <= i).length;
  sigs.forEach(s => win(s, false)); ghs.forEach(s => win(s, true, sigWins === 0));
  /* 买卖点在副图上也标出来：记账根处一条竖线 + 顶部同号胶囊，颜色按方向
     （窗口色带左端=结构极值、右端=记账根，胶囊正落在右端，一眼看出"确认在前、信号在后"） */
  sigs.forEach((s, k) => {
    if (s.gConfirm > i) return;
    const x = XM(s.gConfirm);
    if (x < padL - 2 || x > W - padR + 2) return;
    const col = s.side === 'buy' ? '#22d3ee' : '#f472b6';
    line(x, padT + 14, x, padT + ph - 2, col + '4d', 1, [2, 4]);
    g.beginPath();   /* 底部小三角：买 ▲ / 卖 ▼ */
    if (s.side === 'buy') { g.moveTo(x, padT + ph - 2); g.lineTo(x - 4, padT + ph + 4); g.lineTo(x + 4, padT + ph + 4); }
    else { g.moveTo(x, padT + ph + 4); g.lineTo(x - 4, padT + ph - 2); g.lineTo(x + 4, padT + ph - 2); }
    g.closePath(); g.fillStyle = col; g.fill();
    const lab = sigTag(k + 1) + ' ' + s.kind;
    g.font = 'bold 10.5px -apple-system, "PingFang SC", system-ui';
    const lw3 = g.measureText(lab).width + 8;
    let tx = Math.min(Math.max(x - lw3 / 2, padL + 2), W - padR - lw3 - 2);
    let ty = padT + 3;
    const hit2 = () => WBOX.some(b => tx < b.x + b.w && tx + lw3 > b.x && ty < b.y + b.h && ty + 15 > b.y);
    for (let q = 0; q < 4 && hit2(); q++) ty += 16;
    if (hit2()) return;   /* 窄屏实在挤不下就只留竖线+三角，别把胶囊压到K线上 */
    WBOX.push({ x: tx, y: ty, w: lw3, h: 15 });
    tag(lab, tx, ty, col, 'bold 10.5px -apple-system, "PingFang SC", system-ui');
  });
  for (let k = s0; k <= s1; k++) {
    const c = sub[k], x = X(k), col = c.close >= c.open ? KLINE_COL.up : KLINE_COL.down;
    line(x, Y(c.high), x, Y(c.low), col, 1);
    const yo = Y(c.open), yc = Y(c.close); g.fillStyle = col; g.fillRect(x - Math.max(0.6, half * 0.7), Math.min(yo, yc), Math.max(1.2, half * 1.4), Math.max(1, Math.abs(yo - yc)));
  }
  if (r) {
    r.pivots.forEach(p => {
      const a = r.strokes[p.startStrokeIndex], z = r.strokes[p.endStrokeIndex]; if (!a || !z) return;
      const x0 = X(a.startBarIndex + A.start) - half, x1 = (p.isConfirmed ? X(z.endBarIndex + A.start) : X(end - 1)) + half;
      if (x1 < padL || x0 > W - padR) return;
      g.fillStyle = 'rgba(100,210,255,0.06)'; g.fillRect(x0, Y(p.zg), x1 - x0, Y(p.zd) - Y(p.zg));
      g.strokeStyle = 'rgba(100,210,255,0.42)'; g.lineWidth = 1; g.setLineDash(p.isConfirmed ? [] : [4, 3]); g.strokeRect(x0, Y(p.zg), x1 - x0, Y(p.zd) - Y(p.zg)); g.setLineDash([]);
    });
    /* 命中的“确认笔”：主图信号记 subConfirm（startTime/endTime/stableTime），按时间对上号 */
    const conf = new Map();
    for (const [list, named] of [[sigs, true], [ghs, false]]) list.forEach((s, k) => {
      if (s.gConfirm > i) return;   /* 还没发出的信号，连它的确认笔都不该提前画出来（未来函数） */
      const c = s.subConfirm; if (!c) return;
      const key = c.startTime + '|' + c.endTime;
      if (!conf.has(key)) conf.set(key, { c, no: named ? k + 1 : 0, kind: s.kind, gRef: s.gRef });
    });
    r.strokes.forEach(st => {
      const a = st.startBarIndex + A.start, b = st.endBarIndex + A.start; if (X(b) < padL - 4 || X(a) > W - padR + 4) return;
      const hit = conf.get(sub[a].time + '|' + sub[b].time) || null;
      const hitC = hit ? hit.c : null;
      const xa = X(a), xb = X(b), ya = Y(st.startPrice), yb = Y(st.endPrice);
      let ks = -1;
      if (hit) for (let k = s0; k <= s1; k++) if (sub[k].time === hitC.stableTime) { ks = k; break; }
      if (!hit) {
        g.strokeStyle = '#ffd60a'; g.lineWidth = st.isConfirmed ? 1.3 : 1.0; g.setLineDash(st.isConfirmed ? [] : [5, 3]);
        g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb); g.stroke(); g.setLineDash([]);
        return;
      }
      /* 确认笔本身是"证据"，画满粗白；判据是它的**稳定点**落在窗口内，
         所以从笔尾拉一条折线接到稳定点，标签也挂到稳定点上——避免"确认笔在窗口外"的错觉 */
      line(xa, ya, xb, yb, 'rgba(248,250,252,0.18)', 7);
      line(xa, ya, xb, yb, '#f8fafc', 2.8);
      g.fillStyle = '#f8fafc';
      g.beginPath(); g.arc(xa, ya, 2.2, 0, 6.3); g.arc(xb, yb, 2.2, 0, 6.3); g.fill();
      const xs = ks >= 0 ? X(ks) : xb, ys = ks >= 0 ? Y(sub[ks].close) : yb;
      if (ks >= 0 && (Math.abs(xs - xb) > 2 || Math.abs(ys - yb) > 2)) {
        line(xb, yb, xs, yb, 'rgba(248,250,252,0.55)', 1.2, [3, 3]);
        line(xs, yb, xs, ys, 'rgba(248,250,252,0.55)', 1.2, [3, 3]);
        const dir = ys >= yb ? 1 : -1;
        g.fillStyle = 'rgba(248,250,252,0.7)';
        g.beginPath(); g.moveTo(xs, ys - dir * 2); g.lineTo(xs - 3, ys - dir * 8); g.lineTo(xs + 3, ys - dir * 8); g.closePath(); g.fill();
      }
      /* 标签贴在**笔身**上（它才是"确认笔"这个名字指的东西）；
         稳定点只打白点+「稳定」，用折线把两者连起来 */
      const clab = hit.no ? sigTag(hit.no) + hit.kind + ' 确认笔' : '确认笔';
      g.font = 'bold 10px -apple-system, "PingFang SC", system-ui';
      const tw = g.measureText(clab).width + 8;
      let tx = (xa + xb) / 2 + 6;
      if (tx + tw > W - padR - 2) tx = Math.max(padL + 2, tx - tw - 12);
      let ty2 = Math.min(ya, yb) - 20;   /* 挂在笔的上沿，别压在笔身上 */
      const hits2 = () => CBOX.some(bx => tx < bx.x + bx.w && tx + tw > bx.x && ty2 < bx.y + bx.h && ty2 + 14 > bx.y);
      for (let q = 0; q < 3 && hits2(); q++) ty2 -= 15;
      if (ty2 > padT + 2) { CBOX.push({ x: tx, y: ty2, w: tw, h: 14 }); TAGS.push({ t: clab, x: tx, y: ty2 }); }
    });
    for (const c of conf.values()) {
      for (let k = s0; k <= s1; k++) if (sub[k].time === c.c.stableTime) {
        line(X(k), padT, X(k), padT + ph, 'rgba(248,250,252,0.30)', 1, [2, 4]);
        g.strokeStyle = 'rgba(248,250,252,0.85)'; g.lineWidth = 1.4; g.beginPath(); g.arc(X(k), Y(sub[k].close), 3, 0, 6.3); g.stroke();
        /* 稳定点才是判据：在窗口内打一个白点并标出来 */
        if (bw >= 9) txt('稳定', X(k) + 5, Y(sub[k].close) + 3, 'rgba(248,250,252,0.75)', '9px -apple-system, "PingFang SC", system-ui');
        break;
      }
    }
    for (const t of TAGS) tag(t.t, t.x, t.y, '#f8fafc', 'bold 10px -apple-system, "PingFang SC", system-ui');
  }
  line(xEnd, padT, xEnd, padT + ph, 'rgba(10,132,255,0.4)', 1, [3, 3]);
  g.restore();
  if (legend) tag('黄线 笔 · 黄虚线 未稳 · 白粗 确认笔 · 蓝框 中枢 · 青区 窗口 · 胶囊 买卖点 · 白点 稳定', padL + 6, padT + ph - 19, '#8e8e93', '10px -apple-system, "PingFang SC", system-ui');
  if (label) txt(label.t, padL + 4, 14, label.c, 'bold 11px -apple-system, "PingFang SC", system-ui');
  g.restore();
}

/* 绘制层去重：mdk 回填（ChanBackfill）会把同一结构在新稳定时点重发一次（记账价随当根收盘微调），
   数据层原样保留（对齐 mdk），画布只画最早一次，免得同一极值上叠出两个标签、两条止损线。 */
const sigKey = s => s.kind + '|' + s.side + '|' + s.gRef;
const uniqueSig = list => {
  const seen = new Set();
  return list.map((s, idx) => ({ s, idx })).filter(({ s }) => {
    const k = sigKey(s);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
};

const SIGNO = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
const sigTag = n => n > 0 ? (SIGNO[n - 1] || '(' + n + ')') : '';

function drawMainLayers(g, m, i, r, off, L, left, right, bw, X, Y, vis, line, txt, cvR, cvB) {
  const RGT = cvR || (X(right) + bw / 2);   /* 绘图区右边界（CSS px），标签与止损线都夹在这里面 */
  const PH = () => cvB || (g.canvas.height / (window.devicePixelRatio || 1));   /* 绘图区下沿：贴近它文字会翻到上方 */
  const LBOX = [];   /* 本帧已占用的标签矩形：同一价位上多个信号的标签互相避让 */
  const freeBox = (x, y, w, h) => !LBOX.some(b => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
  const putBox = (x, y, w, h) => { LBOX.push({ x, y, w, h }); };
  const FX = fxInfo(), isHot = (k, idx) => !!((S.sel && S.sel.kind === k && S.sel.index === idx) || (FX && FX.focus[k] === idx));
  /* 信号编号：三角胶囊、止损标签、HUD 共用同一个序号，避免"一条止损到底是谁的" */
  if (FX && FX.focus.bars && S.tf) for (const bb of FX.focus.bars) { if (bb < 0 || bb > i) continue; g.fillStyle = 'rgba(10,132,255,0.16)'; g.fillRect(X(bb) - bw / 2, S.tf.padT, Math.max(2, bw), S.tf.ph); }
  if (L.pivot) r.pivots.forEach((p, pi) => {
    const a = r.strokes[p.startStrokeIndex], z = r.strokes[p.endStrokeIndex]; if (!a || !z) return;
    const b0 = a.startBarIndex + off, b1 = p.isConfirmed ? z.endBarIndex + off : i;
    if (b1 < left || b0 > right) return;
    const hot = isHot('pivot', pi);
    const x0 = X(b0) - bw / 2, x1 = X(b1) + bw / 2, y0 = Y(p.zg), y1 = Y(p.zd);
    g.fillStyle = hot ? 'rgba(88,166,255,0.25)' : p.isConfirmed ? 'rgba(88,166,255,0.13)' : 'rgba(88,166,255,0.08)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = hot ? '#bfdbfe' : '#58a6ff'; g.lineWidth = hot ? 2 : 1; g.setLineDash(p.isConfirmed ? [] : [5, 4]); g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
    txt('ZG ' + fm(p.zg), x0 + 4, y0 + 12, '#8ec5ff'); txt('ZD ' + fm(p.zd) + ' · ' + p.strokeCount + '笔', x0 + 4, y1 - 4, '#8ec5ff');
  });
  if (L.merged) for (let mi = 0; mi < r.merged.length; mi++) {
    const mc = r.merged[mi];
    const a = mc.startIndex + off, b = mc.endIndex + off; if (b < left - 1 || a > right) continue;
    const x0 = X(a) - bw * 0.45, x1 = X(b) + bw * 0.45, mg = b > a, hot = isHot('merged', mi);
    g.strokeStyle = hot ? '#e9d5ff' : (mg ? '#a78bfa' : '#3a3a3c'); g.lineWidth = hot ? 2.2 : (mg ? 1.5 : 1); g.setLineDash(mg ? [] : [2, 3]); g.strokeRect(x0, Y(mc.high), x1 - x0, Y(mc.low) - Y(mc.high)); g.setLineDash([]);
  }
  if (L.raw) for (let b = Math.max(0, Math.floor(left)); b <= i; b++) {
    const c = m[b], x = X(b), col = c.close >= c.open ? KLINE_COL.up : KLINE_COL.down;
    line(x, Y(c.high), x, Y(c.low), col, 1);
    const yo = Y(c.open), yc = Y(c.close); g.fillStyle = col; g.fillRect(x - bw * 0.3, Math.min(yo, yc), bw * 0.6, Math.max(1, Math.abs(yo - yc)));
  }
  if (L.stroke) r.strokes.forEach((s, si) => {
    const a = s.startBarIndex + off, b = s.endBarIndex + off; if (b < left - 1 || a > right + 1) return;
    if (FX && FX.item.kind === 'stroke' && FX.M.mode === 'gen' && FX.focus.stroke != null && si > FX.focus.stroke) return;
    const hot = isHot('stroke', si);
    line(X(a), Y(s.startPrice), X(b), Y(s.endPrice), hot ? '#fef08a' : '#facc15', hot ? 3 : (s.isConfirmed ? 2 : 1.5), s.isConfirmed ? [] : [6, 4]);
    if (hot) { g.fillStyle = '#fef08a'; g.beginPath(); g.arc(X(a), Y(s.startPrice), 3, 0, 6.3); g.arc(X(b), Y(s.endPrice), 3, 0, 6.3); g.fill(); }
  });
  if (L.fractal) r.fractals.forEach((f, fi) => {
    const gb = f.barIndex + off; if (!vis(gb)) return;
    const x = X(gb), y = Y(f.price), c = f.isTop ? '#fb923c' : '#38bdf8', gc = f.confirmBarIndex + off;
    line(x, y, X(gc), y, c + '88', 1, [2, 3]);                      // 发生 → 可知（确认）的延迟
    g.fillStyle = c; g.beginPath();
    if (f.isTop) { g.moveTo(x, y - 3); g.lineTo(x - 5, y - 12); g.lineTo(x + 5, y - 12); } else { g.moveTo(x, y + 3); g.lineTo(x - 5, y + 12); g.lineTo(x + 5, y + 12); }
    g.closePath(); g.fill(); g.beginPath(); g.arc(X(gc), y, 2.5, 0, 6.3); g.fill();
    if (isHot('fractal', fi)) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 10, 0, 6.3); g.stroke(); }
  });
  if (L.div) r.divergences.forEach((d, di) => {
    const s = r.strokes[d.leaveIndex], b = s.endBarIndex + off; if (!vis(b)) return;
    const x = X(b), y = Y(s.endPrice), hot = isHot('div', di);
    g.strokeStyle = hot ? '#f5d0fe' : '#e879f9'; g.lineWidth = hot ? 2.5 : 1.5; g.beginPath(); g.arc(x, y, hot ? 10 : 7, 0, 6.3); g.stroke();
    if (hot) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 14, 0, 6.3); g.stroke(); }
    txt('背驰 ' + d.areaRatio.toFixed(2), x + 10, d.isUp ? y - 8 : (y + 14 < PH() - 6 ? y + 14 : y - 10), '#e879f9');
  });
  const GH = { warmup: '暖', sublevel: '次', untradable: '损' };
  /* 事后结果（只陈述事实，不改图上的信号）：止损扫描到播放头，不限 12 根；
     没被止损就按当前播放头收盘做盯市（浮盈/浮亏），12 根只是 HUD 里的参考时点。 */
  const HOLD = 12;
  /* 止损是否被触及：从记账根之后一直扫到当前播放头，不设 12 根上限。
     12 根只是参考时点，不是"此后破线就不算数"的封口：
     头寸在被打掉之前一直开着，第 13 根破线和第 3 根破线一样是止损。 */
  const stopHitBar = s => {
    if (s.stopPrice == null) return -1;
    const a = s.gConfirm, buy = s.side === 'buy';
    for (let k = a + 1; k <= i; k++) {
      const c = m[k]; if (!c) break;
      if (buy ? c.low <= s.stopPrice : c.high >= s.stopPrice) return k;
    }
    return -1;
  };
  const sigOutcome = s => {
    if (s.stopPrice == null) return null;
    const a = s.gConfirm;
    if (i <= a) return { t: '刚发出', c: '#94a3b8' };   // 记账就落在当前这根，还没有后续K线可算盈亏
    const buy = s.side === 'buy', R = Math.abs(s.price - s.stopPrice) || 1e-9;
    if (stopHitBar(s) >= 0) return { t: '已止损', c: '#f87171' };
    /* 没被止损：按当前播放头这一根的收盘做盯市（浮动盈亏），12 根只是参考时点，不再冻结结果 */
    const cur = m[Math.min(i, m.length - 1)];
    const ret = (buy ? cur.close - s.price : s.price - cur.close) / R;
    return ret >= 0 ? { t: '浮盈', c: '#4ade80' } : { t: '浮亏', c: '#fbbf24' };
  };
  const mark = (s, ghost, idx, no) => {
    if (s.gConfirm > i) return;
    const xc = X(s.gConfirm), xr = X(s.gRef), buy = s.side === 'buy', col = ghost ? '#64748b' : (buy ? '#22d3ee' : '#f472b6'), y = Y(s.price);
    const hot = !!((S.sel && S.sel.kind === 'signal' && S.sel.index === idx && S.sel.ghost === ghost) || (FX && FX.focus.sig && FX.focus.sig.x === s));
    const outcome = !ghost ? sigOutcome(s) : null;
    const stopped = outcome && outcome.t === '已止损';
    line(xr, Y(s.refPrice), xc, y, col, 1, [3, 3]);                  // 结构极值（发生）→ 确认（可知）
    g.beginPath(); g.arc(xr, Y(s.refPrice), 3, 0, 6.3); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
    /* 结构极值处标出对应的记账收盘价（全量，不止选中） */
    if (xr > X(left) - 8 && xr < RGT + 8) {
      const plab = '极 ' + (+s.refPrice).toFixed(2), lfP = '9px -apple-system, "PingFang SC", system-ui';
      g.font = lfP;
      const pw = g.measureText(plab).width + 6, phh = 11;
      let px = xr + 5, py = Y(s.refPrice) - phh / 2;                       // 圆球右侧
      if (px + pw > RGT - 1) px = Math.max(X(left) + 1, xr - pw - 5);       // 贴右边界时翻到左侧
      for (let k = 0; k < 5 && !freeBox(px, py, pw, phh); k++) py += phh + 1;
      if (py + phh < PH()) {
        putBox(px, py, pw, phh);
        g.fillStyle = 'rgba(10,12,16,0.75)'; g.fillRect(px, py, pw, phh);
        txt(plab, px + pw / 2, py + 8.5, col + 'dd', lfP, 'center');
      }
    }
    g.beginPath();
    if (buy) { g.moveTo(xc, y + 4); g.lineTo(xc - 6, y + 14); g.lineTo(xc + 6, y + 14); } else { g.moveTo(xc, y - 4); g.lineTo(xc - 6, y - 14); g.lineTo(xc + 6, y - 14); }
    g.closePath();
    if (ghost) { g.strokeStyle = col; g.stroke(); }
    else if (stopped) { g.strokeStyle = '#f87171'; g.lineWidth = 1.8; g.stroke(); }
    else { g.fillStyle = col; g.fill(); }
    if (hot) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(xc, y, 12, 0, 6.3); g.stroke(); }
    /* 三角上方/下方标出结构极值价（先占位，避免被信号胶囊挤走）；选中时 HUD 已有，不叠字 */
    if (!hot) {
      const rl = '记 ' + (+s.price).toFixed(2), lfR = '9px -apple-system, "PingFang SC", system-ui';
      g.font = lfR;
      const rw = g.measureText(rl).width + 6, rh2 = 11;
      let rx = Math.max(X(left) + 1, Math.min(xc - rw / 2, RGT - rw - 1));
      let ry = buy ? y - rh2 - 5 : y + 6;
      for (let k = 0; k < 5 && !freeBox(rx, ry, rw, rh2); k++) ry += buy ? -(rh2 + 1) : (rh2 + 1);
      if (ry > (S.tf ? S.tf.padT : 0) && ry + rh2 < PH()) {
        putBox(rx, ry, rw, rh2);
        g.fillStyle = 'rgba(10,12,16,0.72)'; g.fillRect(rx, ry, rw, rh2);
        txt(rl, rx + rw / 2, ry + 8.5, col + 'bb', lfR, 'center');
      }
    }
    const baseLabel = (ghost ? '' : sigTag(no || idx + 1) + ' ') + s.kind + (ghost ? ' · ' + (GH[s.reason] || '') : '');
    const suffix = outcome ? ' · ' + outcome.t : '';
    const lf = 'bold 12px -apple-system, "PingFang SC", system-ui';
    g.font = lf;
    const mainW = g.measureText(baseLabel).width;
    const sufW = outcome ? g.measureText(suffix).width : 0;
    const lw = mainW + sufW + 10, lh = 17;
    let lx = xc + 9;                                  // 标签放到K线右侧，避免压在实体上
    if (lx + lw > RGT - 2) lx = xc - 9 - lw;           // 右边界不够则翻到左侧
    if (lx < X(left)) lx = Math.max(X(left), Math.min(xc - lw / 2, RGT - lw - 2));
    let ly = buy ? y + 18 : y - 18 - lh;
    for (let k = 0; k < 6 && !freeBox(lx, ly, lw, lh); k++) ly += buy ? lh + 3 : -(lh + 3);
    ly = Math.max((S.tf ? S.tf.padT : 0) + 2, Math.min(PH() - lh - 2, ly));
    putBox(lx, ly, lw, lh);
    g.beginPath(); g.moveTo(lx + 4, ly); g.arcTo(lx + lw, ly, lx + lw, ly + lh, 4); g.arcTo(lx + lw, ly + lh, lx, ly + lh, 4); g.arcTo(lx, ly + lh, lx, ly, 4); g.arcTo(lx, ly, lx + lw, ly, 4); g.closePath();
    g.fillStyle = 'rgba(14,14,16,0.88)'; g.fill();
    g.strokeStyle = stopped ? '#f87171' : col; g.lineWidth = 1; g.stroke();
    txt(baseLabel, lx + 5 + mainW / 2, ly + 12.5, col, lf, 'center');
    if (outcome) txt(suffix, lx + mainW + 5 + sufW / 2, ly + 12.5, outcome.c, lf, 'center');
  };
  /* 显示编号按"去重后的顺序"连续编，避免被 mdk 的重发信号顶出空号（① ② ④） */
  const sigNo = new Map();
  { const seen = new Set(); let n = 0;
    S.signals.forEach((s, si) => { const k = sigKey(s); if (seen.has(k)) return; seen.add(k); sigNo.set(si, ++n); }); }
  if (L.sig) uniqueSig(S.signals).forEach(({ s, idx }) => mark(s, false, idx, sigNo.get(idx)));
  if (L.ghost) uniqueSig(S.ghosts).forEach(({ s, idx }) => mark(s, true, idx));
  /* 2 类：选中时把配对的 1 类标出来，并画出“前低 / 回抽低点”两条短横线 */
  const pairMark = s => {
    const col = s.side === 'buy' ? '#22d3ee' : '#f472b6', a = s.cmp.a, b = s.cmp.b;
    [[a, s.side === 'buy' ? '前低' : '前高'], [b, s.side === 'buy' ? '回抽低点' : '反抽高点']].forEach(([o, tag]) => {
      if (!vis(o.b0)) return;
      const y = Y(o.price);
      line(X(o.b0), y, X(o.b1 || o.b0), y, col + 'cc', 1.2, [3, 2]);
      txt(tag + ' ' + (+o.price).toFixed(2), X(o.b0) + 2, y - 4, col, '10px -apple-system, "PingFang SC", system-ui');
    });
    if (vis(s.gConfirm)) {                                  // 记账价水平：方便和“回抽低点”对照
      const y = Y(s.price), xa = X(Math.min(s.gConfirm, b.b1)), xb = X(s.gConfirm);
      line(xa, y, xb, y, col + '99', 1.2, [2, 2]);
      txt('记账 ' + (+s.price).toFixed(2), xb + 3, y + 3, col, '10px -apple-system, "PingFang SC", system-ui');
    }
    const k1 = s.side === 'buy' ? '1买' : '1卖';
    const p1 = (S.signals || []).concat(S.ghosts || []).find(x => x.kind === k1 && x.side === s.side && x.gRef === a.b1);
    if (!p1 || p1.gConfirm > i) return;
    const px = X(p1.gConfirm), py = Y(p1.price);
    line(px, py, X(s.gConfirm), Y(s.price), col + '66', 1, [4, 4]);
    g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.arc(px, py, 14, 0, 6.3); g.stroke();
    const lab = k1, lf = 'bold 11px -apple-system, "PingFang SC", system-ui';
    g.font = lf;
    const lw = g.measureText(lab).width + 10, lh = 16;
    let lx = px + 17;
    if (lx + lw > RGT - 2) lx = px - 17 - lw;
    let ly = py - lh - 4;
    for (let k = 0; k < 5 && !freeBox(lx, ly, lw, lh); k++) ly += lh + 2;
    ly = Math.max((S.tf ? S.tf.padT : 0) + 2, Math.min(PH() - lh - 2, ly));
    putBox(lx, ly, lw, lh);
    g.beginPath(); g.moveTo(lx + 3, ly); g.arcTo(lx + lw, ly, lx + lw, ly + lh, 3); g.arcTo(lx + lw, ly + lh, lx, ly + lh, 3); g.arcTo(lx, ly + lh, lx, ly, 3); g.arcTo(lx, ly, lx + lw, ly, 3); g.closePath();
    g.fillStyle = 'rgba(14,14,16,0.9)'; g.fill(); g.strokeStyle = col; g.lineWidth = 1; g.stroke();
    txt(lab, lx + lw / 2, ly + 12, col, lf, 'center');
  };
  {
    const selSig = (S.sel && S.sel.kind === 'signal') ? (S.sel.ghost ? S.ghosts : S.signals)[S.sel.index] : (FX && FX.focus.sig ? FX.focus.sig.x : null);
    if (selSig && selSig.cmp && selSig.cmp.kind === 'pull' && selSig.gConfirm <= i && (L.sig || L.ghost)) pairMark(selSig);
  }
  /* 3 类：把“被离开的那个中枢”描出来，避免和突破后新形成的中枢混淆 */
  if (L.sig) S.signals.forEach(s => {
    if (!s.refPivot || s.gConfirm > i) return;
    const pv = r.pivots.find(p => Math.abs(p.zg - s.refPivot.zg) < 0.005 && Math.abs(p.zd - s.refPivot.zd) < 0.005);
    if (!pv) return;
    const a = r.strokes[pv.startStrokeIndex], z = r.strokes[pv.endStrokeIndex]; if (!a || !z) return;
    const b0 = a.startBarIndex + off, b1 = pv.isConfirmed ? z.endBarIndex + off : i;
    if (b1 < left || b0 > right) return;
    const x0 = X(b0) - bw / 2, x1 = X(b1) + bw / 2, y0 = Y(pv.zg), y1 = Y(pv.zd);
    const col = s.side === 'buy' ? '#22d3ee' : '#f472b6';
    g.fillStyle = col + '12'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = col; g.lineWidth = 2; g.setLineDash([]); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const yl = (y0 - 6 > (S.tf ? S.tf.padT : 0) + 10) ? y0 - 6 : y0 + 12;
    txt('参照中枢', x0 + 4, yl, col, '10px -apple-system, "PingFang SC", system-ui');
  });
  /* 口径标注：选中/焦点信号时，把“拿什么和什么比”写在左上角，并把涉及的笔在底部标出跨度 */
  const hud = (lines) => {
    g.save(); g.font = '10.5px -apple-system, "PingFang SC", system-ui';
    const w = Math.max(...lines.map(l => g.measureText(l.t).width)) + 14, h = lines.length * 15 + 8;
    const x = X(left) + 6, y = (S.tf ? S.tf.padT : 0) + 6;
    g.fillStyle = 'rgba(10,12,16,0.86)'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.strokeRect(x, y, w, h);
    lines.forEach((l, k) => { g.fillStyle = l.c; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(l.t, x + 7, y + 5 + k * 15); });
    g.restore(); putBox(x, y, w, h);
  };
  const span = (b0, b1, cc) => { const y = PH() - 4; line(X(b0) - bw * 0.5, y, X(b1) + bw * 0.5, y, cc, 2); };
  /* 结构极值 → 稳定 → 记账：把“滞后”画出来（缠论里没有，工程实现才有） */
  const anat = (s) => {
    const buy = s.side === 'buy', col = buy ? '#22d3ee' : '#f472b6';
    const xr = X(s.gRef), xc = X(s.gConfirm);
    if (xc - xr < 24) return;
    const top = (S.tf ? S.tf.padT : 0) + 6, bot = PH() - 22;
    line(xr, top, xr, bot, col + '55', 1, [2, 4]);
    line(xc, top, xc, bot, col + '99', 1, [4, 3]);
    const lfA = '9.5px -apple-system, "PingFang SC", system-ui';
    g.font = lfA;
    const la = '极值根 #' + s.gRef, lb = '稳定根 #' + s.gConfirm;
    const wa = g.measureText(la).width, wb = g.measureText(lb).width;
    const ax = xr + 3 + wa > RGT - 2 ? xr - 3 - wa : xr + 3;
    const bx = xc + 3 + wb > RGT - 2 ? xc - 3 - wb : xc + 3;
    const overlap = ax < bx + wb && bx < ax + wa;
    txt(la, ax, top + 10, col + 'cc', lfA);
    txt(lb, bx, top + (overlap ? 23 : 10), col, lfA);
    const yP = Y(s.price);
    line(xr, yP, xc, yP, col + '77', 1, [3, 3]);
    const lag = s.gConfirm - s.gRef, dp = s.price - s.refPrice, pct = dp / s.refPrice * 100;
    const lbl = `滞后 ${lag} 根 · ${dp >= 0 ? '+' : ''}${dp.toFixed(2)}（${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%）`;
    g.font = '9.5px -apple-system, "PingFang SC", system-ui';
    const lw = g.measureText(lbl).width, mx = (xr + xc) / 2;
    g.fillStyle = 'rgba(10,12,16,0.82)'; g.fillRect(mx - lw / 2 - 4, yP - 15, lw + 8, 13);
    txt(lbl, mx, yP - 5, col, '9.5px -apple-system, "PingFang SC", system-ui', 'center');
    const st = (r.strokes || []).find(q => q.endBarIndex + off === s.gRef && (buy ? !q.isUp : q.isUp));
    if (st) {
      const a = st.startBarIndex + off, b = st.endBarIndex + off, y = PH() - 10;
      line(X(a), Y(st.startPrice), X(b), Y(st.endPrice), col + '38', 5);
      line(X(a), y, X(b), y, col + 'cc', 1);
      line(X(a), y - 3, X(a), y + 1, col + 'cc', 1); line(X(b), y - 3, X(b), y + 1, col + 'cc', 1);
      g.font = '9px -apple-system, "PingFang SC", system-ui';
      const tw = g.measureText('锚定笔').width, tx = (X(a) + X(b)) / 2 - tw / 2;
      if (freeBox(tx - 2, y - 14, tw + 4, 11)) { putBox(tx - 2, y - 14, tw + 4, 11); txt('锚定笔', tx, y - 4, col + 'cc', '9px -apple-system, "PingFang SC", system-ui'); }
    }
  };
  /* 事后结果详细版（HUD 用，含 MFE/MAE） */
  const sigOutcomeDetail = s => {
    if (s.stopPrice == null) return null;
    const a = s.gConfirm, end = Math.min(i, a + HOLD);
    if (end <= a) return null;
    const buy = s.side === 'buy', R = Math.abs(s.price - s.stopPrice) || 1e-9;
    const hit = stopHitBar(s);
    /* 触线之后头寸已了结：MFE/MAE 只统计到破线那根；未触线则统计到当前播放头 */
    const upto = hit >= 0 ? hit : i;
    let mfe = 0, mae = 0;
    for (let k = a + 1; k <= upto; k++) {
      const c = m[k]; if (!c) break;
      const fav = (buy ? c.high - s.price : s.price - c.low) / R;
      const adv = (buy ? s.price - c.low : c.high - s.price) / R;
      if (fav > mfe) mfe = fav;
      if (-adv < mae) mae = -adv;
    }
    const slots = end - a, fR = v => (v >= 0 ? '+' : '') + v.toFixed(1) + 'R';
    if (hit >= 0) {
      const late = hit > a + HOLD ? `，12 根外破线` : '';
      return { t: `结果：已止损 #${hit}（第 ${hit - a} 根${late}，−1.0R）· 止损前 MFE ${fR(mfe)}`, c: '#f87171' };
    }
    const ci = Math.min(i, m.length - 1), cur = m[ci];
    const ret = (buy ? cur.close - s.price : s.price - cur.close) / R;
    const now = `当前 ${fR(ret)}（#${ci} 收盘${end < a + HOLD ? ` · ${slots}/${HOLD} 根` : ''}）`;
    const mark12 = end >= a + HOLD ? ` · 12 根时点 ${fR((buy ? m[end].close - s.price : s.price - m[end].close) / R)}（#${end}）` : '';
    return { t: `结果：${ret >= 0 ? '浮盈' : '浮亏'} ${now}${mark12} · 至今未触止损 · MFE ${fR(mfe)} / MAE ${fR(mae)}`, c: ret >= 0 ? '#4ade80' : '#fbbf24' };
  };
  const annotSig = (s, no) => {
    const buy = s.side === 'buy', col = buy ? '#22d3ee' : '#f472b6', c = s.cmp;
    anat(s);
    const lag = s.gConfirm - s.gRef, atr = Math.abs(s.refPrice - s.stopPrice) * 2;
    const dp = s.price - s.refPrice, pct = dp / s.refPrice * 100, sp = (s.stopPrice - s.price) / s.price * 100;
    const l2 = { t: `${no ? sigTag(no) + ' ' : ''}锚定笔 #${s.gRef} 极值 ${s.refPrice.toFixed(2)} → 稳定 #${s.gConfirm}（滞后 ${lag} 根）`, c: '#94a3b8' };
    const l3 = { t: `止损 ${s.stopPrice.toFixed(2)} = 极值 ${s.refPrice.toFixed(2)} ${buy ? '−' : '+'} 0.5×ATR14 ${atr.toFixed(2)}；记账价 ${s.price.toFixed(2)}（相对极值 ${dp >= 0 ? '+' : ''}${pct.toFixed(2)}%，距记账 ${sp.toFixed(1)}%）`, c: '#94a3b8' };
    const l4 = s.subConfirm ? { t: `次级别确认笔 ${s.subConfirm.startPrice.toFixed(2)} → ${s.subConfirm.endPrice.toFixed(2)}（同向笔）· 极值后 +${s.subConfirm.stableAfterBars} 根次级别K线不再改动（窗口 ${s.subConfirm.windowBars}）→ 即「${s.kind} 的极值成立」`, c: '#94a3b8' } : null;
    const l5 = no ? sigOutcomeDetail(s) : null;   // ghost 不是"发出的信号"，不给结果
    if (c && c.kind === 'div') {
      span(c.a.b0, c.a.b1, '#f59e0b'); span(c.b.b0, c.b.b1, col);
      hud([{ t: `背驰比较：进入笔 面积 ${c.a.area.toFixed(2)} → 离开笔 面积 ${c.b.area.toFixed(2)} = ${(c.b.area / c.a.area).toFixed(2)}×（阈值 0.9）`, c: col }, l2, l3, l4, l5].filter(Boolean));
    } else if (c && c.kind === 'pull') {
      span(c.b.b0, c.b.b1, col);
      hud([{ t: `${s.kind}：${c.a.label} ${c.a.price.toFixed(2)} vs ${c.b.label} ${c.b.price.toFixed(2)} —— 没破前低`, c: col }, l2, l3, l4, l5].filter(Boolean));
    } else if (c && c.kind === 'level') {
      span(c.a.b0, c.a.b1, col);
      hud([{ t: `${s.kind}：${c.levelLabel} ${c.level.toFixed(2)}（参照中枢） vs ${c.a.label} ${c.a.price.toFixed(2)} —— 没回中枢`, c: col }, l2, l3, l4, l5].filter(Boolean));
    } else {
      hud([l2, l3, l4, l5].filter(Boolean));
    }
  };
  if (L.sig) uniqueSig(S.signals).forEach(({ s, idx }) => { if (isHot('signal', idx)) annotSig(s, sigNo.get(idx)); });
  if (L.ghost) uniqueSig(S.ghosts).forEach(({ s, idx }) => {
    const hot = (S.sel && S.sel.kind === 'signal' && S.sel.ghost && S.sel.index === idx) || (FX && FX.focus.sig && FX.focus.sig.x === s);
    if (hot) annotSig(s, 0);
  });
  /* 同价止损分组：一条可见线可能压着 n 个信号的止损，标签与线尾都要说清是几个 */
  /* 止损线横跨到哪一根：默认 +12 根；若 12 根外才被破线，延到破线那根，
     让"线断在哪儿"和"判定止于哪儿"一致。 */
  const stopCut = s => {
    const hit = stopHitBar(s);
    return hit > s.gConfirm + 12 ? Math.min(right, hit) : Math.min(right, s.gConfirm + 12);
  };
  const stopGeom = s => {   /* 与 stopMark 同一套起止/夹取口径：只统计真正画得出来的线 */
    const x0 = X(s.gConfirm);
    let x1 = X(stopCut(s));
    if (x1 - x0 < 40 && RGT > x0 + 8) x1 = Math.min(RGT - 2, x0 + 44);
    return (x0 > RGT || x1 < X(left)) ? null : { x0, x1 };
  };
  const stopTally = new Map();
  if (L.stop) uniqueSig(S.signals).forEach(({ s, idx: si }) => {
    if (s.gConfirm > i || s.stopPrice == null || !stopGeom(s)) return;
    const k = (+s.stopPrice).toFixed(2);
    let v = stopTally.get(k); if (!v) { v = { n: 0, nos: [], maxNo: 0 }; stopTally.set(k, v); }
    v.n++; const nn = sigNo.get(si); v.nos.push(nn); v.maxNo = nn;
  });
  const stopLabels = [];   // 先画完所有线/尺/×n，再统一画标签，避免后画的同价止损线横穿前面的标签
  const stopMark = (s, ghost, idx) => {
    if (s.gConfirm > i || s.stopPrice == null) return;
    const hotStop = !ghost || (S.sel && S.sel.kind === 'signal' && S.sel.ghost && S.sel.index === idx);
    const geo = stopGeom(s); if (!geo) return;
    const x0 = geo.x0, x1 = geo.x1;
    const y = Y(s.stopPrice), yp = Y(s.price), buy = s.side === 'buy', col = ghost ? '#94a3b8' : '#ff9f0a';
    const endBar = stopCut(s), hitBar = stopHitBar(s), atRight = x1 >= RGT - 2 || endBar >= right;
    const no = ghost ? 0 : sigNo.get(idx), grp = ghost ? null : stopTally.get((+s.stopPrice).toFixed(2));
    const nOver = grp ? grp.n : 0;
    const pct = (s.stopPrice - s.price) / s.price * 100, atr = Math.abs(s.refPrice - s.stopPrice) * 2;
    const pctTxt = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
    line(x0 - 3, yp, x0 + 3, yp, col + 'aa', 1);                    // 幅度尺上端 = 记账价
    line(x0 - 3, y, x0 + 3, y, col + 'aa', 1);                      // 幅度尺下端 = 止损价
    line(x0, yp, x0, y, col + '88', 1, [2, 4]);                     // 记账价 → 止损：这笔的风险幅度
    const stopCol = (!ghost && hitBar >= 0) ? '#f87171' : col;       // 被破线：止损线整条转红，线头就停在破线那根
    line(x0, y, x1, y, stopCol, ghost ? 1 : 1.4, [4, 4]);           // 止损价：从记账那根起向右延伸
    g.fillStyle = stopCol; g.beginPath(); g.arc(x1, y, 2, 0, 6.3); g.fill();
    /* 幅度百分比：竖排贴在这条竖线左侧，直接说明"这段竖线有多深"；竖线太短（<30px）时不硬挤 */
    const ruler = !ghost && Math.abs(yp - y) >= 30;
    if (ruler) {
      const mx = x0 - 6, my = (yp + y) / 2;
      g.font = '9px -apple-system, "PingFang SC", system-ui';
      const tw2 = g.measureText(pctTxt).width;
      g.save(); g.translate(mx, my); g.rotate(-Math.PI / 2);
      g.fillStyle = 'rgba(10,12,16,0.82)'; g.fillRect(-tw2 / 2 - 3, -6, tw2 + 6, 12);
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pctTxt, 0, 0.5);
      g.restore();
      putBox(mx - 6, my - tw2 / 2 - 2, 12, tw2 + 4);
    }
    /* 同价重叠：只由该组最后一根信号在末端标一次 ×n，避免把 n 条看成 1 条 */
    if (nOver > 1 && no === grp.maxNo) {
      const ot = '×' + nOver, lfO = '9px -apple-system, "PingFang SC", system-ui';
      g.font = lfO;
      const ow = g.measureText(ot).width + 8, oh = 12;
      let ox = x1 - ow - 4, oy = y - oh - 2;
      if (ox < X(left)) { ox = x1 + 3; oy = y - oh - 2; }
      if (oy < (S.tf ? S.tf.padT : 0) + 1) oy = y + 3;
      g.fillStyle = 'rgba(14,14,16,0.85)'; g.fillRect(ox, oy, ow, oh);
      g.strokeStyle = col + '66'; g.lineWidth = 1; g.strokeRect(ox + 0.5, oy + 0.5, ow - 1, oh - 1);
      txt(ot, ox + 3, oy + 9, col, lfO);
    }
    if (!hotStop) return;   /* 未选中的 ghost 只留止损线，不叠标签 */
    stopLabels.push(() => {
    const stopS = (+s.stopPrice).toFixed(2), refS = (+s.refPrice).toFixed(2);
    const pctS = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    const l1 = (no ? sigTag(no) + ' ' : '') + s.kind + ' 止损 ' + stopS + '（' + pctS + '）' + (nOver > 1 ? ' ×' + nOver : '');
    const l2 = '极' + refS + (buy ? ' − ' : ' + ') + '0.5×ATR ' + atr.toFixed(2) + ' = ' + stopS;
    const l3 = '起 #' + s.gConfirm + ' 记账根 → ' + (atRight ? '止 右缘' : '止 #' + endBar +
      (hitBar > s.gConfirm + 12 ? '（12 根外破线）' : '（+' + (endBar - s.gConfirm) + ' 根）'));
    const p3 = (+s.price).toFixed(3);   // 3 位小数：让算式本身能算出同一结果（2 位会在 -2.28/-2.29 上打架）
    const l4 = '幅度 (' + (+s.stopPrice).toFixed(3) + ' − ' + p3 + ') / ' + p3 + ' = ' + pctS;
    const f1 = 'bold 10px -apple-system, "PingFang SC", system-ui', f2 = '9px -apple-system, "PingFang SC", system-ui', f3 = '9px -apple-system, "PingFang SC", system-ui';
    g.font = f1; const w1 = g.measureText(l1).width;
    g.font = f2; const w2 = g.measureText(l2).width;
    g.font = f3; const w3 = g.measureText(l3).width;
    g.font = f3; const w4 = g.measureText(l4).width;
    const padT = (S.tf ? S.tf.padT : 0) + 2;
    const tw = Math.max(w1, w2, w3, w4) + 8, th = 43;
    const place = (w, h) => {          // 先线下、再线上；都不行就返回 null（不再 clamp 进已占用区）
      let px = x0 - w - (ruler ? 14 : 6);                          // 优先放左侧，给竖排百分比留出通道
      if (px < X(left) + 1) px = Math.min(x0 + 6, RGT - w - 2);
      if (px + w > RGT - 2) px = Math.max(X(left) + 1, RGT - w - 2);
      for (let k = 0; k < 5; k++) { const py = y + 4 + k * (h + 2); if (py >= padT && py + h <= PH() - 2 && freeBox(px, py, w, h)) return { x: px, y: py, w, h }; }
      for (let k = 0; k < 5; k++) { const py = y - 4 - h - k * (h + 2); if (py >= padT && py + h <= PH() - 2 && freeBox(px, py, w, h)) return { x: px, y: py, w, h }; }
      return null;
    };
    let spot = place(tw, th), mini = false;
    if (!spot) { spot = place(w1 + 8, 14); mini = !!spot; }   // 一屏挤不下时退回单行：只留 编号+类型+止损价
    if (!spot) return;
    putBox(spot.x, spot.y, spot.w, spot.h);
    g.fillStyle = 'rgba(14,14,16,0.86)'; g.fillRect(spot.x, spot.y, spot.w, spot.h);
    g.strokeStyle = col + '55'; g.lineWidth = 1; g.strokeRect(spot.x + 0.5, spot.y + 0.5, spot.w - 1, spot.h - 1);
    txt(l1, spot.x + 4, spot.y + 11, col, f1);
    if (!mini) {
      txt(l2, spot.x + 4, spot.y + 21, col + 'dd', f2);
      txt(l3, spot.x + 4, spot.y + 31, '#94a3b8', f3);
      txt(l4, spot.x + 4, spot.y + 41, '#94a3b8', f3);
    }
    });
  };
  if (L.stop) {
    uniqueSig(S.signals).forEach(({ s, idx }) => stopMark(s, false, idx));
    uniqueSig(S.ghosts).forEach(({ s, idx }) => stopMark(s, true, idx));
    stopLabels.forEach(fn => fn());
  }
}

/* ───── 画布命中检测（点击结构 → 检查器 / 显微镜） ───── */
function pick(px, py) {
  const t = S.tf; if (!t || !S.cs) return null;
  const snap = S.snaps[S.i], r = snap.res, off = snap.off, i = S.i;
  const X = b => t.padL + (b - t.left + 0.5) * t.bw, Y = p => t.padT + (t.hi - p) / (t.hi - t.lo) * t.ph;
  const d2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; const L = dx * dx + dy * dy || 1; let u = ((px - x1) * dx + (py - y1) * dy) / L; u = Math.max(0, Math.min(1, u)); return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy)); };
  let best = null;
  const consider = (d, sel, lim) => { if (d <= lim && (!best || d < best.d)) best = { d, sel }; };
  const scanSig = (list, ghost) => uniqueSig(list).forEach(({ s, idx }) => { if (s.gConfirm > i) return; consider(Math.hypot(px - X(s.gConfirm), py - Y(s.price)), { kind: 'signal', index: idx, ghost }, 13); });
  if (S.layers.sig) scanSig(S.signals, false);
  if (S.layers.ghost) scanSig(S.ghosts, true);
  if (best) return best.sel;
  if (S.layers.div) r.divergences.forEach((d, di) => { const s = r.strokes[d.leaveIndex]; if (!s) return; consider(Math.hypot(px - X(s.endBarIndex + off), py - Y(s.endPrice)), { kind: 'div', index: di }, 10); });
  if (best) return best.sel;
  if (S.layers.fractal) r.fractals.forEach((f, fi) => { if (f.barIndex + off > i) return; consider(Math.hypot(px - X(f.barIndex + off), py - Y(f.price)), { kind: 'fractal', index: fi }, 11); });
  if (best) return best.sel;
  if (S.layers.stroke) r.strokes.forEach((s, si) => {
    if (s.startBarIndex + off > i) return;
    consider(d2(X(s.startBarIndex + off), Y(s.startPrice), X(s.endBarIndex + off), Y(s.endPrice)), { kind: 'stroke', index: si }, 6);
  });
  if (best) return best.sel;
  if (S.layers.pivot) for (let pi = r.pivots.length - 1; pi >= 0; pi--) {
    const p = r.pivots[pi], a = r.strokes[p.startStrokeIndex], z = r.strokes[p.endStrokeIndex]; if (!a || !z) continue;
    const x0 = X(a.startBarIndex + off) - t.bw / 2, x1 = X((p.isConfirmed ? z.endBarIndex : i) + off) + t.bw / 2, y0 = Y(p.zg), y1 = Y(p.zd);
    if (px >= x0 - 3 && px <= x1 + 3 && py >= Math.min(y0, y1) - 3 && py <= Math.max(y0, y1) + 3) return { kind: 'pivot', index: pi };
  }
  if (S.layers.gb && GB.cs === S.cs && GB.i === i) {
    for (let k = 0; k < GB.paths.length; k++) {
      const pts = GB.paths[k];
      for (let j = 1; j < pts.length; j++) consider(d2(X(pts[j - 1].bar), Y(pts[j - 1].price), X(pts[j].bar), Y(pts[j].price)), { kind: 'gb', index: k }, 9);
    }
  }
  return null;
}

function normalizeSel() {
  if (!S.sel) return;
  const sel = S.sel, r = S.snaps[S.i].res;
  if (sel.kind === 'signal') {
    const list = sel.ghost ? S.ghosts : S.signals, x = list[sel.index];
    if (!x || x.gConfirm > S.i) { S.sel = null; S.selItem = null; S.selCtx = null; }
    return;
  }
  const n = { stroke: r.strokes.length, pivot: r.pivots.length, fractal: r.fractals.length, merged: r.merged.length, div: r.divergences.length }[sel.kind];
  if (n == null || sel.index >= n) { S.sel = null; S.selItem = null; S.selCtx = null; }
}

/* ───── 右侧面板 ───── */
const evHtml = e => `<div class="ev">${tag(e.t)} ${e.text}</div>`;
const HELP = `
<div class="blk"><b>这是什么</b><div class="m" style="margin-top:4px">理想行情生成器 + 移植自你 C# 源码的缠论算法 + 逐根回放可视化。它<b>不是</b>行情软件、不是回测系统、更不是预测工具；它是一个遵循缠论规则的理想数学世界，用来看结构如何从K线里长出来。核心理念：<b>不测而测</b>——不预测唯一未来，只展示当前状态下所有理论合法的发展路径。</div></div>
<div class="sec">一分钟上手</div>
<div class="blk m" style="line-height:1.8">① 顶部两种模式：<b>学习</b>（结构关系地图：概念定义、构成链与易混淆对照；点节点看六问详情）、<b>实验</b>（画布回放 + 参数 + 污染对比，底部状态机网络与分支流程带只在此模式；行情由「分支流程」逐步构造：每步选择一个缠论单位的方向（单根K线 / 最小分型 / 最小笔，默认最小分型；非上即下的二叉完全分类），结构判定由逐帧回放给出，拖动左栏参数即整条路径重编译，也可导入真实行情 CSV）；② 所有参数<b>即改即算</b>——滑杆拖动、种子输入，松手即重算，没有「生成」按钮；③ 底部播放器逐根/逐事件推进，或空格自动播放；④ 点画布上的笔 / 中枢 / 分型 / 信号 → 主图自动聚焦，画布右下弹出悬浮显微镜卡片：<b>生成 / 原理</b> 两态，「生成」含当前结构字段与逐帧形成过程（点空白处或 Esc 退出）；右栏「显微镜」页签列出当前案例全部可打开的结构；⑤ 底部状态网络看当前状态与合法后续（纯观察，悬停状态节点 / 转移边可看定义、进入退出条件与理论依据）；网络下方的分支流程带是逐个单位的二叉完全分类：头部可切换最小单位（单根K线 / 最小分型 / 最小笔，默认最小分型，切换只影响后续步骤），虚框=下一单位的两个方向（点击落实），实心节点=已落实步骤（点击回退并截断），每步标注回放判定（单位确认 · 中枢新生/延伸/离开/移位 · 背驰/信号）；图层「分支预览」在主图画出两个方向的幽灵K线，落实后即变真实K线；⑥ 拉高「噪声参数」里任一项污染滑杆 → 整条路径自动同步构造同源 0 噪声基线；「图层」里的「上下双屏 + 差异带」开关控制是否分屏对照（默认开启，取消即只看当前行情），右栏「对比」页签看污染因果账单与稳健度记分卡。</div>
<div class="sec">噪声系统（冻结完美行情 → 逐步污染）</div>
<div class="blk m" style="line-height:1.8">完美行情（本级别 + 次级别）由分支流程构造出来后即被<b>冻结</b>：噪声参数只在它的每一根K线上做逐根变换，<b>不会改动完美行情本身</b>，K线根数与下标不变。<b>污染强度 ε</b> 是主轴（0 = 完美，1 ≈ 接近真实，待校准）；同一批随机数只乘以 ε，拖动时同一根K线是连续变形的。四个算子可单独拉：<b>影线外延</b>（高低点外扩，制造假分型 / 破坏包含）· <b>收盘游走</b>（均值回归的整根偏移 + 开盘贴近前收）· <b>制造包含</b>（把一根K线压进前一根的范围，强度连续）· <b>毛刺跳跃</b>（偶发长针，向下更常见）。污染先作用在次级别K线，本级别K线再由污染后的次级别聚合，两级始终一致。ε &gt; 0 时主图与次级别副图都分成上下两屏：上屏完美、下屏污染。右栏「对比」里的<b>临界点扫描</b>列出每个结构质变（笔被合并 / 劈开、中枢合并、包含激增、信号消失）第一次出现的 ε。稳健度记分卡：结构结论在污染下的存活 / 命中比例（<b>不是盈利胜率</b>），综合总分 = 信号 35% + 笔 25% + 中枢 25% + 分型 15% 加权，某项无数据时按剩余项归一。导入的真实行情不加噪声。</div>
<div class="sec">级别与确认口径</div>
<div class="blk m" style="line-height:1.8">每 <b>次级别倍数</b> 根次级别K线聚合为 1 根本级别K线，次级别确认在更细级别上判断。<b>无未来函数</b>：任何结构只用「截至当前K线」可知的信息判定——分型的三角是发生位置、圆点是确认时点；信号表里的「延迟」就是从发生到可知的距离。<b>确认笔</b>：副图白色粗线，就是「某一号买卖点的次级别确认笔」。判据不是笔身落在窗口内，而是这笔的<b>稳定点</b>（白点，标「稳定」）落在「结构极值 → 记账根」这段窗口里、且不超过极值后 30 根次级别K线——笔可以更早发生，所以它会跑到窗口左边（那一段画成虚线，标「窗口前」）。它是信号发出前的第三道闸门（暖机 → 次级别确认 → 可交易）。<b>Ghost（空心三角）</b>：结构上成立但被过滤的信号（暖机隔离 / 次级别未确认 / 不可交易），如实展示不隐藏。<b>回放窗口</b>：源码回填要凑满 700 根才开始出结论；本实验室从案例起点用扩展窗口逐帧复算（窗口随K线增长，默认上限 700 根），所以极早期几帧是「窗口尚短」的结果，与 C# 回填在同一根K线上可能不同。</div>
<div class="blk m" style="line-height:1.8;margin-top:6px">数据依赖（与上游 C# 一致）：<b>本级别</b>是必需输入——包含、分型、笔、中枢、背驰、买卖点都只用它；<b>次级别</b>只用于买卖点确认（次级别须在参考点后及时走出同向一笔），可关闭；<b>高周期</b>只用于「共振」标签（源码自述无统计优势、不参与过滤），本实验室未接入。三级别中枢叠加只是「时间 + 价格区间相交」的周期近似，不是级别递归。<br><b>单级别数据（如上传的 CSV）</b>：没有次级别 → 次级别确认自动关闭并禁用，结构上成立、原本会被「次级别未确认」过滤的点会直接成为信号（暖机 / 不可交易仍生效），所以信号数通常比内置的双级别案例多；次级别副图也不会出现。</div>
<div class="sec">右栏页签</div>
<div class="blk m" style="line-height:1.8">实时＝本根K线触发的事件与近期结构事件 · 显微镜＝当前案例全部结构的索引（绿＝已稳定 / 已离开，黄＝未稳定 / 未离开，灰＝被过滤 / 暖机，红 / 绿＝顶 / 底分型） · 对比＝基线 vs 污染账单 + 记分卡（仅污染&gt;0 时出现）。点任意条目或画布结构 → 悬浮显微镜卡片（生成 / 原理）。图层开关在画布右上角「图层」；能力对照在本说明末尾。</div>
<div class="sec">快捷键</div>
<table class="tb"><tr><th>按键</th><th>作用</th></tr>
<tr><td>← / →</td><td>逐根前进 / 后退</td></tr><tr><td>Shift+← / →</td><td>跳到上 / 下一个结构事件</td></tr>
<tr><td>空格</td><td>自动播放 / 暂停（末帧再按从头重放）</td></tr>
<tr><td>Home / 0</td><td>回到起点 / 复位画布视图</td></tr>
<tr><td>Esc</td><td>关闭浮层（理论显微镜）</td></tr></table>
<div class="blk m" style="margin-top:6px">画布：拖拽平移 · 滚轮缩放 · Shift+滚轮纵向缩放 · 双击复位。</div>
<div class="sec">术语表（UI 里的彩色标签悬停也有同样解释）</div>
<table class="tb"><tr><th style="width:84px">概念</th><th>一句话</th></tr>
<tr><td>包含</td><td>相邻两根K线一根覆盖另一根，先按方向合并再谈分型</td></tr>
<tr><td>分型</td><td>三根合并K线中间最高（顶）/最低（底）；画布三角=发生，圆点=确认</td></tr>
<tr><td>笔</td><td>相邻顶底分型连线，中间≥2根独立合并K线；身后再走2笔才稳定</td></tr>
<tr><td>中枢</td><td>至少三笔的重叠区间 [ZD, ZG]；后续笔终点仍在区间内=延伸，终点离开且下一笔不回=离开</td></tr>
<tr><td>背驰</td><td>离开笔 MACD 面积 ÷ 进入笔面积 &lt; 阈值，离开力度弱于进入</td></tr>
<tr><td>买卖点</td><td>一买=背驰；二买=回调不创新低；三买=回调不回中枢（简化版，镜像得卖点）</td></tr>
<tr><td>Ghost</td><td>结构成立但被过滤的信号（暖机 / 次级别未确认 / 不可交易），空心如实展示</td></tr>
<tr><td>无未来函数</td><td>每根K线收盘时只知「截至当时」的信息；确认时点 ≠ 发生位置</td></tr>
<tr><td>本/次级别</td><td>每 N 根次级别K线聚合为 1 根本级别；信号确认在次级别上判断</td></tr>
<tr><td>不测而测</td><td>不预测唯一未来，只展开当前结构约束下所有理论合法的后续路径</td></tr></table>
<div class="sec">诚实边界（如实标注，不补全）</div>
<div class="blk m" style="line-height:1.8">线段 / 特征序列 / 走势类型 / 多级别递归 / 区间套 / 中枢扩展·新生·升级：源码未实现，地图中仅保留原著概念（灰色）。「候选期起点」「前置聚齐」等为快照推导（provisional），源码不显式输出。ATR 为常规 Wilder 实现（源码未上传，待核对）。真实噪声下生成器的场景目标结构可能不成立（CLI 校验如实标 ok=false）——这是特性不是缺陷；本页是路径驱动，流程带只逐帧核验并标「已达成 / 未达成」，不保证目标成立。本实验室不回答「市场是否遵循缠论」；真实行情的统计检验在仓库内 CLI 工具（chan-stats / facts-report / structure-census），不在此页。</div>
`;

const TOUR = ['① 按空格或「▶ 自动」播放：结构随K线逐根长出来，图左上角那行字实时说明每一步发生了什么。', '② 点图上任意的笔、中枢、分型或信号：图会放大聚焦，右下悬浮显微镜卡片给出 生成/原理解读；点空白处或 Esc 退出。右栏「显微镜」页签有全部可打开结构的索引。', '③ 拖左侧「噪声参数」里的污染滑杆，看完美走势被污染后结构怎么变；右上角「图层」控制显示哪些结构，「上下双屏 + 差异带」开关决定是否分屏对照 0 噪声基线，下方是次级别副图。', '④ 顶部「学习」查概念与概念之间的关系，「实验」看结构随K线生长；状态转移看底部状态网络，想试不同的后续就点流程带里的虚框节点（完全分类，不测而测；头部可切换单根K线 / 最小分型 / 最小笔）。右上角「?」随时查看说明。'];
function showTour() {
  const t = $('#tour');
  if (S.tour >= TOUR.length) { t.hidden = true; try { localStorage.setItem('chanlab.tour', '1'); } catch (e) {} return; }
  t.hidden = false; $('#tourt').textContent = TOUR[S.tour]; $('#tourn').textContent = `${S.tour + 1} / ${TOUR.length}`;
  $('#tournext').textContent = S.tour === TOUR.length - 1 ? '开始使用' : '下一步';
}
const tourStart = () => { S.tour = 0; showTour(); };
function helpOpen() { $('#hlp').hidden = false; $('#hlpbody').innerHTML = '<div class="blk"><button id="retour">▶ 重新看新手引导</button></div>' + HELP + '<div class="sec">能力对照</div>' + CAP; $('#hlpbody').scrollTop = 0; }
function helpClose() { $('#hlp').hidden = true; }

const CAP = `
<div class="blk m">图例：<span class="tg" style="color:#a3e635;border-color:#a3e63966">算法已有</span> 源自你上传的 C# 源码；<span class="tg" style="color:#f59e0b;border-color:#f59e0b66">工程约定</span> 实验室新增（不改判定）；<span class="tg" style="color:#94a3b8;border-color:#94a3b866">待实现</span> 源码中没有。</div>
<table class="tb"><tr><th>模块</th><th>状态</th><th>源码位置 / 说明</th></tr>
<tr><td>K线包含</td><td class="ok">已实现</td><td>ChanInclusion.Merge</td></tr>
<tr><td>分型</td><td class="ok">已实现</td><td>ChanFractalDetector.Detect（含 ConfirmBarIndex）</td></tr>
<tr><td>笔</td><td class="ok">已实现 · 仅新笔</td><td>ChanStrokeBuilder.Build；身后 ≥2 笔才稳定</td></tr>
<tr><td>线段 / 特征序列</td><td class="no">未实现</td><td>2026-09-30 已从源码移除</td></tr>
<tr><td>中枢</td><td class="wn">部分实现</td><td>ChanPivotDetector：笔中枢，有形成/延伸/离开（离开后回到区间按"延伸"）；无扩展、新生、升级</td></tr>
<tr><td>走势类型</td><td class="no">未实现</td><td>无趋势/盘整/完成/分解判定。"上涨/下跌/盘整"场景仅验证中枢序列</td></tr>
<tr><td>多级别递归 / 区间套</td><td class="no">未实现</td><td>ChanLevelMapper 仅按周期叠加（源码自述非递归）；本实验室未接入叠加显示</td></tr>
<tr><td>背驰</td><td class="ok">已实现</td><td>ChanDivergenceDetector：笔级，MACD 面积比 &lt; 阈值</td></tr>
<tr><td>1/2/3 类买卖点</td><td class="ok">已实现 · 简化版</td><td>ChanSignals.Detect；含暖机隔离、次级别确认、可交易性校验（被过滤者以空心标记并注明原因）。止损线 = 结构极值 ∓ 0.5×ATR(14)，可在图层「止损线（ATR×0.5）」单独开关</td></tr>
<tr><td>次级别确认</td><td class="ok">已实现</td><td>ChanAnalyzer.SubLevelMatches；次级别=生成器的底层路径</td></tr>
<tr><td>级别共振标签</td><td class="no">未接入</td><td>ConfluenceTagger（源码自述无统计优势，仅标注）</td></tr>
<tr><td>信号附加指标（ADX / ATR% / 布林带宽 / 联合打分）</td><td class="no">未接入</td><td>ChanBackfill 为绩效统计附加，不参与缠论判定；本实验室只展示结构</td></tr>
<tr><td>MACD / ATR</td><td class="wn">待核对</td><td>源码未上传，用常规实现（SMA 起算 EMA、Wilder ATR）代替，待核对</td></tr></table>
<div class="sec">算法疑点（已按原样移植，未改）</div>
<ol class="nt"><li><b>背驰"进入段"</b>：注释称取中枢之前的同向笔，但笔严格交替，FindEnterStroke 实际恒等于 leave−2（中枢内的上一同向笔），即更接近盘整背驰口径。</li>
<li><b>尾部分型可被修正</b>：分型的确认点用最后一根合并K线，后续K线可能继续并入而使其失效；源码以"笔身后 ≥2 笔才稳定"兜底。画布上虚线笔与"分型修正"事件即此现象。</li>
<li><b>默认参数</b>：与 mdk 一致——背驰面积比 0.9、暖机 30 根、次级别确认开启、确认窗口 30 根（mdk <code>appsettings.json</code> 的 <code>Chan:SubLevelConfirmWindowBars</code>）。这些过滤会挡掉很多结构上成立的信号，这是原算法口径，不是 bug。可在左侧调整观察差异。</li></ol>
<div class="sec">后续阶段（对应需求书第十三节）</div>
<div class="blk m">V0.2 结构解剖室 + 理论显微镜（第六节）已完成 · V0.3 状态机网络（第七节）已完成：底部面板：笔 / 中枢 / 买卖点三机，三色区分已成立 / 待定 / 不可达 · V0.4 分支探索（第八节）已完成：当前形态为路径驱动 + 三档缠论单位（单根K线 / 最小分型 / 最小笔，默认最小分型）；行动空间只有当前单位的两项方向，复制当前前缀 + 追加一个单位（事件驱动的最短确定性脚本）+ 逐帧回放观察结构判定，落实结果在底部流程带与主图幽灵K线中呈现，不预设目标状态、不伪造路径 · V0.5 多级别递归 / 背驰 / 买卖点扩展（源码缺失项需先补算法）</div>`;

function renderRight() {
  const el = $('#rbody'); document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.t === S.tab));
  { const hb = hasBase(); if (hb && !S.hadBase && S.view === 'chart' && !MX.isOpen()) { S.tab = 'diff'; if (!isMobile()) $('#app').classList.remove('hide-r'); if (S.syncPanes) S.syncPanes(); } S.hadBase = hb; }
  { const dt = document.querySelector('.tab[data-t="diff"]'); if (dt) dt.hidden = !hasBase(); if (S.tab === 'diff' && !hasBase()) S.tab = 'live'; document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.t === S.tab)); }
  const s = S.snaps[S.i]; if (!S.cs || !s) { el.innerHTML = '<div class="blk m">尚未生成案例</div>'; return; }
  let h = '';
  if (S.tab === 'live') {
    const c = S.cs.main[S.i], ev = S.events[S.i];
    h += `<div class="blk"><b>第 #${S.i} 根</b> <span class="m">O ${fm(c.open)} H ${fm(c.high)} L ${fm(c.low)} C ${fm(c.close)}</span></div>`;
    h += ev.length ? ev.map(evHtml).join('') : '<div class="m blk">本根K线未触发结构变化</div>';
    h += '<div class="sec">近期结构事件（点击跳转）</div>';
    let n = 0;
    for (let j = S.i - 1; j >= 0 && n < 40; j--) { if (!S.struct[j]) continue; for (const e of S.events[j]) { if (!E.STRUCT.has(e.t)) continue; h += `<div class="ev" data-j="${j}">${tag(e.t)}<span class="m">#${j}</span> ${e.text}</div>`; n++; } }
  } else if (S.tab === 'mxlist') {
    const off = s.off, r2 = s.res;
    const recent = (arr, n) => { const cut = arr.length > n ? arr.slice(arr.length - n) : arr; const base = arr.length - cut.length; return cut.map((x, k) => ({ x, i: base + k })); };
    const chip = (id, sel, label, col) => `<a class="mxchip" data-open="${id}" data-k="${sel.kind}" data-i="${sel.index}"${sel.ghost ? ' data-g="1"' : ''}${col ? ` style="background:${col}22;color:${col};border-color:${col}66"` : ''}>${label}</a>`;
    /* 排序口径（2026-11-07）：两层都「最新在前」——
       ① 组内：按该结构在全局K线上的时点倒序，与「实时」页签的近期事件流同向；
       ② 组间：按该组内最新一条的时点降序（活跃结构先出），时点相同时保持兜底顺序；
       点击跳转用的 data-k / data-i 都是原数组下标，排序不改语义。 */
    const newest = list => list.sort((a, b) => b.t - a.t);
    const grp = (name, list) => list.length ? `<div class="sec">${name} · ${list.length}</div><div class="mxchips">${list.map(e => e.html).join('')}</div>` : '';
    const stEnd = i => { const k = (r2.strokes || [])[i]; return k ? k.endBarIndex : -1; };
    const fr = newest(recent(r2.fractals || [], 60).map(({ x: f, i }) => ({ t: f.barIndex, html: chip(f.isTop ? 'fractal-top' : 'fractal-bottom', { kind: 'fractal', index: i }, `${f.isTop ? '顶' : '底'} @#${f.barIndex + off}`, f.isTop ? KLINE_COL.down : KLINE_COL.up) })));
    const st = newest((r2.strokes || []).map((k, i) => ({ t: k.endBarIndex, html: chip('stroke', { kind: 'stroke', index: i }, `${k.isUp ? '↑' : '↓'} #${k.startBarIndex + off}→#${k.endBarIndex + off}${k.isConfirmed ? ' ·已稳定' : ' ·未稳定'}`, k.isConfirmed ? '#a3e635' : '#facc15') })));
    const pv = newest((r2.pivots || []).map((p, i) => ({ t: stEnd(p.endStrokeIndex), html: chip('pivot', { kind: 'pivot', index: i }, `#${p.startStrokeIndex}–#${p.endStrokeIndex}笔 ${fm(p.zd)}–${fm(p.zg)}${p.isConfirmed ? ' ·已离开' : ' ·未离开'}`, p.isConfirmed ? '#58a6ff' : '#f59e0b') })));
    const dv = newest((r2.divergences || []).map((d, i) => ({ t: stEnd(d.leaveIndex), html: chip('divergence', { kind: 'div', index: i }, `${d.isUp ? '顶' : '底'}背驰 @#${stEnd(d.leaveIndex) >= 0 ? stEnd(d.leaveIndex) + off : '?'} · 比${(+d.areaRatio).toFixed(2)}${d.warmup ? ' ·暖机' : ''}`, d.warmup ? '#94a3b8' : '#e879f9') })));
    const upTo = arr => arr.map((x, i) => ({ x, i })).filter(({ x }) => x.gConfirm <= S.i);
    const sg = newest(upTo(S.signals).map(({ x, i }) => ({ t: x.gConfirm, html: chip(itemForSel({ kind: 'signal', index: i }), { kind: 'signal', index: i }, `${x.kind} @#${x.gRef} → 确认@#${x.gConfirm}`, '#22d3ee') })));
    const gh = newest(upTo(S.ghosts).map(({ x, i }) => ({ t: x.gConfirm, html: chip(itemForSel({ kind: 'signal', index: i, ghost: true }), { kind: 'signal', index: i, ghost: true }, `${x.kind} · ${({ warmup: '暖机', sublevel: '次级别未确认', untradable: '不可交易' })[x.reason] || x.reason} @#${x.gRef}`, '#94a3b8') })));
    const mg = newest(recent(r2.merged || [], 40).map(({ x: m, i }) => ({ t: m.endIndex, html: chip('merge', { kind: 'merged', index: i }, m.startIndex === m.endIndex ? `@#${m.startIndex + off}` : `#${m.startIndex + off}–#${m.endIndex + off}`) })));
    h += `<div class="blk m">当前案例中可点开悬浮详情的全部结构，点击即打开悬浮显微镜卡片（默认「生成」态，可切「原理」）。组与组之间也按「最近形成的结构」排序，越靠前越活跃。颜色：<span style="color:${KLINE_COL.up}">绿</span>＝涨 / 底分型 · <span style="color:${KLINE_COL.down}">红</span>＝跌 / 顶分型 · <span style="color:#a3e635">黄绿</span>＝已稳定 / 已离开 · <span style="color:#facc15">黄</span>＝未稳定 / 未离开（仍可能被修正） · <span style="color:#94a3b8">灰</span>＝被过滤 / 暖机 / 中性。</div>`;
    /* 组间活跃度：取每组最新一条（已倒序，[0] 即最新）的时点比较；Array.sort 稳定，等值仍按兜底顺序 */
    const groups = [
      ['买卖点（已发出）', sg], ['被过滤（结构成立未发出）', gh], ['背驰', dv], ['中枢', pv],
      ['笔', st], ['分型（仅最近）', fr], ['包含合并K线（仅最近）', mg],
    ].filter(g => g[1].length).sort((a, b) => b[1][0].t - a[1][0].t);
    h += groups.map(g => grp(g[0], g[1])).join('');
    h += `<div class="sec">当前K线</div><div class="mxchips"><a class="mxchip" data-open="raw">原始K线 @#${S.i}</a></div>`;
  } else if (S.tab === 'diff') {
    if (!hasBase()) {
      h += `<div class="blk"><b>完美行情 vs 污染行情对比</b></div>`
        + `<div class="blk m">当前污染强度 ε = 0：画面就是冻结的完美行情（本级别与次级别都是完美K线）。在左侧「噪声参数」拖动 ε，或点下方预设：主图与次级别副图会各自分成上下两屏，上屏永远是这条完美行情，下屏是被污染后的样子。</div>`
        + `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button data-eps="0.25">轻度 ε 0.25</button><button data-eps="0.5">中度 ε 0.5</button><button data-eps="1" data-tip="ε=1 的目标是统计上接近真实行情（待用真实数据校准）。">ε 1.0（接近真实）</button></div>`;
    } else {
      const df = computeCaseDiff(S.i);
      const { bRes, nRes, bo, no, bSigs, nSigs, bGhosts, nGhosts, items } = df;
      const bMergeCnt = bRes.merged.filter(m => m.endIndex > m.startIndex).length;
      const nMergeCnt = nRes.merged.filter(m => m.endIndex > m.startIndex).length;
      const bDiv = bRes.divergences[bRes.divergences.length - 1];
      const nDiv = nRes.divergences[nRes.divergences.length - 1];
      const sp = S.cs.spec;
      h += `<div class="blk" style="display:flex;justify-content:space-between;align-items:center;gap:6px">`
        + `<span><b>污染冲击账单</b> <span class="m">（截至 #${S.i} / ${S.snaps.length - 1}）</span></span>`
        + (S.i < S.snaps.length - 1 ? `<button data-j="${S.snaps.length - 1}" style="padding:2px 8px;font-size:11px">跳至终局 #${S.snaps.length - 1}</button>` : '')
        + `</div>`;
      const np = readNoise();
      h += `<div class="blk m" style="font-size:11.5px">当前污染：ε <b>${np.eps}</b> · 影线 <b>${np.w.wick}</b> · 收盘游走 <b>${np.w.body}</b> · 包含 <b>${np.w.incl}</b> · 毛刺 <b>${np.w.spike}</b> · 种子 <b>${np.seed}</b>；上屏是冻结的完美行情（本级别与次级别），下屏是在它每一根K线上做变换后的结果，下标 1:1 对齐。</div>`;
      h += rbScorecard(CR.scoreCase(S.cs.base, S.cs, S.i));
      h += `<div class="kgrid">`
        + `<div class="kpi"><div class="k">笔数 (0噪声 → 污染)</div><div class="v">${bRes.strokes.length} <span class="arr">→</span> <span class="${nRes.strokes.length === bRes.strokes.length ? 'ok' : 'wn'}">${nRes.strokes.length} 笔</span></div></div>`
        + `<div class="kpi"><div class="k">包含合并次数</div><div class="v">${bMergeCnt} <span class="arr">→</span> <span class="${nMergeCnt === bMergeCnt ? 'ok' : 'wn'}">${nMergeCnt} 处</span></div></div>`
        + `<div class="kpi"><div class="k">背驰 MACD 面积比</div><div class="v">${bDiv ? bDiv.areaRatio.toFixed(2) : '无'} <span class="arr">→</span> <span class="${nDiv ? 'ok' : (bDiv ? 'no' : 'm')}">${nDiv ? nDiv.areaRatio.toFixed(2) : (bDiv ? '失效' : '无')}</span></div></div>`
        + `<div class="kpi"><div class="k">发出信号 / Ghost</div><div class="v">${bSigs.length}/${bGhosts.length} <span class="arr">→</span> <span class="${nSigs.length >= bSigs.length ? 'ok' : 'no'}">${nSigs.length}/${nGhosts.length}</span></div></div>`
        + `</div>`;
      const bMap = {
        keep: ['保留', '#4ade80', '信号仍在：类型与确认时点与 0 噪声基线一致'],
        shift: ['偏移', '#38bdf8', '信号仍在，但确认时点或极值价格发生了漂移'],
        break: ['破坏', '#f87171', '基线信号消失，或退化为 Ghost（被过滤）'],
        extra: ['变异', '#fbbf24', '污染额外诱发的信号，0 噪声基线上不存在'],
      };
      h += scanHtml();
      h += `<div class="sec" id="sec-sig">结构因果差异（点击定位并高亮 #K线）</div>`;
      if (!items.length) {
        h += `<div class="blk m">截至 #${S.i}，污染尚未改变笔/中枢/信号的核心定性结论。</div>`;
      } else {
        h += items.map(it => {
          const [lbl, col, tip] = bMap[it.type] || ['变化', '#38bdf8', null];
          return `<div class="ev" data-focus="${it.bar}">`
            + `<span class="tg" style="color:${col};border-color:${col}66;background:${col}18"${tip ? ` data-tip="${tip}"` : ''}>${lbl}</span>`
            + `<b>${it.title}</b> <span class="m">@#${it.bar}</span>`
            + `<div class="m" style="font-size:11.5px;margin-top:2px">${it.detail}</div></div>`;
        }).join('');
      }
      const maxSt = Math.min(10, Math.max(bRes.strokes.length, nRes.strokes.length));
      if (maxSt > 0) {
        h += `<div class="sec" id="sec-stroke">逐笔端点对照（点击跳转）</div><table class="tb"><tr><th>#</th><th>0噪声理想笔</th><th>污染后实际笔</th><th>极值差</th></tr>`;
        for (let k = 0; k < maxSt; k++) {
          const bs = bRes.strokes[k], ns = nRes.strokes[k];
          const bTxt = bs ? `${bs.isUp ? '↑' : '↓'} #${bs.startBarIndex + bo}→#${bs.endBarIndex + bo} (${fm(bs.endPrice)})` : '—';
          const nTxt = ns ? `${ns.isUp ? '↑' : '↓'} #${ns.startBarIndex + no}→#${ns.endBarIndex + no} (${fm(ns.endPrice)})` : '—';
          const dp = (bs && ns && bs.isUp === ns.isUp) ? (ns.endPrice - bs.endPrice) : null;
          const jumpBar = ns ? ns.endBarIndex + no : (bs ? bs.endBarIndex + bo : 0);
          h += `<tr data-focus="${jumpBar}" style="cursor:pointer"><td>${k}</td><td style="color:#38bdf8">${bTxt}</td><td style="color:#facc15">${nTxt}</td>`
            + `<td class="${dp == null ? 'no' : Math.abs(dp) > 0.3 ? 'wn' : 'ok'}">${dp == null ? '错位' : (dp >= 0 ? '+' : '') + fm(dp)}</td></tr>`;
        }
        h += `</table>`;
      }
    }
  }
  el.innerHTML = h;
}
/* 顶栏标题是模板里的静态文本「缠论实验室」，不随案例名 / 种子 / 视图切换。 */
function renderPlayer() {
  const n = S.snaps.length; $('#sl').max = Math.max(0, n - 1); $('#sl').value = S.i;
  $('#pos').textContent = n ? `${S.i} / ${n - 1}` : '-';
}
function renderAll() { renderState(); draw(); renderPlayer(); renderRight(); }

/* ───── 状态机与状态转移网络（V0.3，需求书第七节） ───── */
const STW = { built: false, node: { stroke: {}, pivot: {}, signal: {} }, edge: { stroke: [], pivot: [], signal: [] }, vb: { x: 0, y: 0, w: ST.LAYOUT.vb[0], h: ST.LAYOUT.vb[1] }, sel: null, skip: false };
function stGeom(m, t) {
  const N = ST.LAYOUT[m].nodes, NW = ST.NW, NH = ST.NH;
  const a = N[t.from], b = N[t.to];
  const ax = a[0] + NW / 2, ay = a[1] + NH / 2, bx = b[0] + NW / 2 + (t.tdx || 0), by = b[1] + NH / 2;
  let d, ex, ey, ux, uy, lx, ly;
  if (t.arc === 'self') {
    const y = a[1];
    d = `M ${ax - 20} ${y} Q ${ax} ${y - 34} ${ax + 20} ${y}`;
    ex = ax + 20; ey = y; ux = 20; uy = 34; lx = ax; ly = y - 25;
  } else if (t.arc === 'up' || (t.arc === 'down' && Math.abs(bx - ax) >= 2)) {
    const up = t.arc === 'up';
    const sy = up ? a[1] : a[1] + NH, ey2 = up ? b[1] : b[1] + NH;
    const sx = ax + (up ? 0 : (t.fsx || 0));
    const cx = (sx + bx) / 2, cy = up ? Math.min(a[1], b[1]) - 46 : Math.max(a[1] + NH, b[1] + NH) + (t.dip || 30);
    d = `M ${sx} ${sy} Q ${cx} ${cy} ${bx} ${ey2}`;
    ex = bx; ey = ey2; ux = bx - cx; uy = ey2 - cy;
    /* 标签：up 弧放控制点上方（避开被跨越节点的顶部自环标签）；down 弧默认在谷底下方，可用 ldx/ldy 微调 */
    if (up) { lx = cx; ly = cy + 8; }
    else { lx = cx + (t.ldx || 0); ly = t.ldy || (sy + 2 * cy + ey2) / 4 + 9; }
  } else {
    let sx, sy;
    if (Math.abs(bx - ax) < 2) { sx = ax; sy = ay + Math.sign(by - ay) * NH / 2; ex = bx; ey = by - Math.sign(by - ay) * NH / 2; }
    else { sx = ax + Math.sign(bx - ax) * NW / 2; sy = ay; ex = bx - Math.sign(bx - ax) * NW / 2; ey = by; }
    d = `M ${sx} ${sy} L ${ex} ${ey}`; ux = ex - sx; uy = ey - sy; lx = (sx + ex) / 2; ly = (sy + ey) / 2 - 5;
  }
  return { d, ex, ey, ang: Math.atan2(uy, ux), lx, ly };
}
const applyStView = () => { const v = STW.vb; $('#stg').setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); };
/* 面板高度自适应：SVG 高度 = 容器宽 × viewBox 纵横比（限幅），铺满宽度不留上下黑边 */
function fitStHeight() {
  const w = $('#stgwrap').clientWidth; if (!w) return;
  const h = Math.round(Math.max(150, Math.min(340, w * ST.LAYOUT.vb[1] / ST.LAYOUT.vb[0])));
  $('#stg').style.height = h + 'px';
}
window.addEventListener('resize', fitStHeight);
function buildStatePanel() {
  if (STW.built) return; STW.built = true;
  const svg = $('#stg'), NS = 'http://www.w3.org/2000/svg';
  fitStHeight();
  const mk = (tg, at, p) => { const el = document.createElementNS(NS, tg); for (const k in at) el.setAttribute(k, at[k]); p.appendChild(el); return el; };
  mk('rect', { class: 'stframe', x: 0.5, y: 0.5, width: ST.LAYOUT.vb[0] - 1, height: ST.LAYOUT.vb[1] - 1, rx: 8 }, svg);
  for (const m of ST.LAYOUT.order) {
    const L = ST.LAYOUT[m], M = ST.MACHINES[m];
    const g = mk('g', {}, svg);
    const tt = mk('text', { class: 'stt', x: L.tx, y: L.ty }, g);
    tt.textContent = L.title + ' · 状态机';
    tt.addEventListener('click', () => g.classList.toggle('stg-off'));
    for (const t of M.transitions) {
      const geo = stGeom(m, t);
      const hit = mk('path', { class: 'steh', d: geo.d }, g);
      const line = mk('path', { class: 'ste dead', d: geo.d }, g);
      const aw = 7, ah = 3.6, c = Math.cos(geo.ang), s = Math.sin(geo.ang);
      const pts = `${geo.ex},${geo.ey} ${geo.ex - aw * c - ah * s},${geo.ey - aw * s + ah * c} ${geo.ex - aw * c + ah * s},${geo.ey - aw * s - ah * c}`;
      const arw = mk('polygon', { class: 'stah dead', points: pts }, g);
      const lab = mk('text', { class: 'stel', x: geo.lx, y: geo.ly }, g);
      lab.textContent = t.label;
      hit.addEventListener('mouseenter', ev => stTipHover('edge', { m, t }, ev));
      hit.addEventListener('mouseleave', stTipLeave);
      hit.addEventListener('click', ev => { ev.stopPropagation(); STW.sel = { type: 'edge', m, t }; stTipPin('edge', { m, t }, ev); renderState(); });
      STW.edge[m].push({ t, line, lab, arw });
    }
    for (const sd of M.states) {
      const [x, y] = L.nodes[sd.id];
      const gn = mk('g', { class: 'stn dead' }, g);
      mk('rect', { x, y, width: ST.NW, height: ST.NH, rx: 8 }, gn);
      const tx = mk('text', { x: x + ST.NW / 2, y: y + ST.NH / 2 + 4 }, gn);
      tx.textContent = sd.short || sd.name;
      gn.addEventListener('mouseenter', ev => stTipHover('node', { m, id: sd.id }, ev));
      gn.addEventListener('mouseleave', stTipLeave);
      gn.addEventListener('click', ev => { ev.stopPropagation(); STW.sel = { type: 'node', m, id: sd.id }; stTipPin('node', { m, id: sd.id }, ev); renderState(); });
      STW.node[m][sd.id] = gn;
    }
  }
  /* 缩放（滚轮，锚定光标）与拖动平移 */
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    if (!STTIP.pinned && STTIP.open) setStTip({ close: true });
    const k = Math.pow(1.14, Math.max(-2, Math.min(2, e.deltaY / 100))), rc = svg.getBoundingClientRect();
    const mx = STW.vb.x + (e.clientX - rc.left) / rc.width * STW.vb.w, my = STW.vb.y + (e.clientY - rc.top) / rc.height * STW.vb.h;
    const nw = Math.max(280, Math.min(1600, STW.vb.w * k)), nk = nw / STW.vb.w;
    STW.vb.x = mx - (mx - STW.vb.x) * nk; STW.vb.y = my - (my - STW.vb.y) * nk; STW.vb.w = nw; STW.vb.h = ST.LAYOUT.vb[1] * nw / ST.LAYOUT.vb[0];
    applyStView();
  }, { passive: false });
  let drag = null;
  svg.addEventListener('mousedown', e => { if (!STTIP.pinned && STTIP.open) setStTip({ close: true }); drag = { x: e.clientX, y: e.clientY, vx: STW.vb.x, vy: STW.vb.y, moved: false }; });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const rc = svg.getBoundingClientRect();
    STW.vb.x = drag.vx - dx / rc.width * STW.vb.w; STW.vb.y = drag.vy - dy / rc.height * STW.vb.h;
    applyStView();
  });
  window.addEventListener('mouseup', () => { if (drag && drag.moved) { STW.skip = true; setTimeout(() => { STW.skip = false; }, 0); } drag = null; });
  svg.addEventListener('click', () => { if (STW.skip) return; STW.sel = null; setStTip({ close: true }); renderState(); });
  let tDrag = null, tPinch = null;
  bindTouchPanZoom(svg, {
    start: () => {
      if (!STTIP.pinned && STTIP.open) setStTip({ close: true });
      tPinch = null;
      tDrag = { vx: STW.vb.x, vy: STW.vb.y, rc: svg.getBoundingClientRect() };
    },
    move: (dx, dy) => {
      if (!tDrag) return;
      STW.vb.x = tDrag.vx - dx / tDrag.rc.width * STW.vb.w;
      STW.vb.y = tDrag.vy - dy / tDrag.rc.height * STW.vb.h;
      applyStView();
    },
    pinchStart: () => {
      if (!STTIP.pinned && STTIP.open) setStTip({ close: true });
      tPinch = { x: STW.vb.x, y: STW.vb.y, w: STW.vb.w, h: STW.vb.h, rc: svg.getBoundingClientRect() };
    },
    pinch: (scale, cx, cy) => {
      if (!tPinch) return;
      const nw = Math.max(280, Math.min(1600, tPinch.w / scale)), nk = nw / tPinch.w;
      const nx = (cx - tPinch.rc.left) / tPinch.rc.width, ny = (cy - tPinch.rc.top) / tPinch.rc.height;
      const wx = tPinch.x + nx * tPinch.w, wy = tPinch.y + ny * tPinch.h;
      STW.vb = { x: wx - nx * nw, y: wy - ny * tPinch.h * nk, w: nw, h: tPinch.h * nk };
      applyStView();
    },
    end: () => { STW.skip = true; setTimeout(() => { STW.skip = false; }, 0); }
  });
  applyStView();
}
const stCur = (m, info) => { const sd = ST.MACHINES[m].states.find(x => x.id === info.cur); return sd ? (sd.short || sd.name) : '—'; };
const stLine = st => `笔 ${stCur('stroke', st.stroke)} · 中枢 ${stCur('pivot', st.pivot)} · 买卖点 ${stCur('signal', st.signal)}`;
function renderState() {
  if (!STW.built) buildStatePanel();
  gbCompute();
  const st = S.cs && S.snaps.length ? ST.track(S.snaps, S.i, S.signals, S.ghosts) : null;
  S.st = st;
  /* 头部只放三台机器的当前状态名；定义与条件由悬停节点 / 边的详情承载。
     右侧再挂一条「最近事件」：当前实例总是最新的待定，结论只闪一帧，这里留个回看入口。 */
  const ev = st ? ST.recent(S.snaps, S.i, S.signals, S.ghosts) : null;
  const evMain = ev ? (ev.sig || ev.st) : null;
  const evSub = ev && ev.sig && ev.st && ev.st.f > ev.sig.f ? ev.st : null;
  const evCol = t => t === 'ok' ? 'var(--ok)' : t === 'no' ? 'var(--bad)' : 'var(--warn)';
  const evHtml = !evMain ? '<span class="stev none">最近事件 <b>尚无结论</b></span>'
    : `<span class="stev" data-f="${evMain.f}" title="点击跳回 #${evMain.f}">最近事件 <b style="color:${evCol(evMain.tone)}">${evMain.text}</b>`
      + ` <i>${evMain.f === S.i ? '本帧' : `+${S.i - evMain.f} 根`}</i>`
      + (evSub ? ` <span class="sub">· 之后 ${evSub.text} @#${evSub.f}</span>` : '') + '</span>';
  $('#stcur').innerHTML = st ? ST.LAYOUT.order.map(m => `<span class="pill">${ST.MACHINES[m].title} <b>${stCur(m, st[m])}</b></span>`).join('') : '';
  $('#stev').innerHTML = st ? evHtml : '';
  $('#stevrow').classList.toggle('hide', !st);
  for (const m of ST.LAYOUT.order) {
    const info = st ? st[m] : { cur: null, path: [], legal: [] };
    const walked = new Set(info.path);
    for (const sid in STW.node[m]) {
      let cls = 'dead';
      if (walked.has(sid)) cls = 'walked'; else if (info.legal.includes(sid)) cls = 'pend';
      if (info.cur === sid) cls = 'cur';
      STW.node[m][sid].setAttribute('class', 'stn ' + cls + (STW.sel && STW.sel.type === 'node' && STW.sel.m === m && STW.sel.id === sid ? ' sel' : ''));
    }
    for (const e of STW.edge[m]) {
      let cls = 'dead';
      for (let k = 0; k + 1 < info.path.length; k++) if (info.path[k] === e.t.from && info.path[k + 1] === e.t.to) { cls = 'walked'; break; }
      if (cls === 'dead' && e.t.from === info.cur && info.legal.includes(e.t.to)) cls = 'pend';
      const sel = STW.sel && STW.sel.type === 'edge' && STW.sel.m === m && STW.sel.t === e.t;
      e.line.setAttribute('class', 'ste ' + cls + (sel ? ' sel' : ''));
      e.arw.setAttribute('class', 'stah ' + cls + (sel ? ' sel' : ''));
      e.lab.setAttribute('class', 'stel' + (cls === 'dead' ? '' : ' ' + cls));
    }
  }
  setStTip({ refresh: true });
}
/* ───── 状态网络详情：hover 预览 / 点击固定的可交互 tooltip ─────
 * STTIP 是详情展示的唯一事实来源：kind(node/edge) + sel + pinned + 锚点。
 * 显隐、内容、定位一律经 setStTip 单一入口；事件层只提交意图，绝不从 DOM 反推状态。
 * STW.sel 仍是「网络选中态」（高亮 / 分支联动），与 hover 预览彼此独立。 */
const STTIP = { kind: null, sel: null, pinned: false, x: 0, y: 0, rev: 0, sig: '', timer: 0, open: false };

/* 纯函数：把状态机数据翻译成详情 HTML，不碰 DOM、不读界面状态。 */
function stDetailHTML(kind, sel) {
  const st = S.st;
  const vc = v => v === 'confirmed' ? '<span class="tg" style="color:var(--ok);border-color:currentColor">算法已证实</span>' : '<span class="tg" style="color:var(--warn);border-color:currentColor">快照推导</span>';
  if (kind === 'node' && st && sel) {
    const M = ST.MACHINES[sel.m], info = st[sel.m], sd = M.states.find(x => x.id === sel.id);
    const role = info.cur === sd.id ? '<span class="tg" style="color:var(--ok);border-color:currentColor">已成立 · 当前状态</span>'
      : info.path.includes(sd.id) ? '<span class="tg" style="color:var(--ac);border-color:currentColor">已走过</span>'
      : info.legal.includes(sd.id) ? '<span class="tg" style="color:var(--warn);border-color:currentColor">条件待定 · 合法后续</span>'
      : '<span class="tg" style="color:var(--m);border-color:currentColor">不可达 · 当前实例进不来</span>';
    return `<div class="mxsec" style="margin-top:4px">${M.title} · 状态</div><div class="blk"><b>${sd.name}</b></div><div class="blk">${role} ${vc(sd.verify)}</div>`
      + `<div class="mxrow"><b>定义</b><span>${sd.def}</span></div><div class="mxrow"><b>进入条件</b><span>${sd.enter}</span></div><div class="mxrow"><b>退出条件</b><span>${sd.exit}</span></div><div class="mxrow"><b>算法函数</b><span>${sd.fn}</span></div><div class="mxrow"><b>理论依据</b><span>${sd.theory}</span></div>`;
  }
  if (kind === 'edge' && st && sel) {
    const M = ST.MACHINES[sel.m], info = st[sel.m];
    const t = sel.t, fromS = M.states.find(x => x.id === t.from), toS = M.states.find(x => x.id === t.to);
    const live = t.from === info.cur && info.legal.includes(t.to);
    return `<div class="mxsec" style="margin-top:4px">${M.title} · 状态转移</div><div class="blk"><b>${fromS.name} → ${toS.name}</b>（${t.label}）</div>`
      + `<div class="blk">${live ? '<span class="tg" style="color:var(--warn);border-color:currentColor">当前可走 · 等待条件触发</span>' : '<span class="tg" style="color:var(--m);border-color:currentColor">当前不在此转移上</span>'} ${vc(t.verify)}</div>`
      + `<div class="mxrow"><b>转移条件</b><span>${t.cond}</span></div><div class="mxrow"><b>算法函数</b><span>${t.fn}</span></div><div class="mxrow"><b>理论依据</b><span>${t.theory}</span></div>`
      + '<div class="blk m" style="font-size:11px;margin-top:6px">状态网络为纯观察视图：结构由分支流程里逐个单位的选择回放判定，不在此直接推演。</div>';
  }
  return '<div class="m" style="padding-top:8px">生成案例后，悬停状态节点 / 转移边可查看定义与条件。</div>';
}

const stTipHeader = () => `<div class="sttiphd"><span>${STTIP.pinned ? '已固定 · 点 ✕ 或 Esc 关闭' : '悬停预览 · 点击固定'}</span><span class="sttipclose" data-sttip-close aria-label="关闭">✕</span></div>`;

function placeStTip() {
  const el = $('#sttip'), w = el.offsetWidth, h = el.offsetHeight;
  let x = STTIP.x + 14, y = STTIP.y + 16;
  if (x + w > window.innerWidth - 10) x = STTIP.x - w - 14;
  if (y + h > window.innerHeight - 10) y = STTIP.y - h - 16;
  el.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
  el.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
}

/* 单一入口：合并状态 → 幂等重建内容 → 定位 → 显隐。refresh 只推进数据版本，不打断延迟关闭。 */
function setStTip(patch) {
  const el = $('#sttip');
  if (patch.refresh) STTIP.rev++;
  if (patch.defer) {
    if (STTIP.timer) clearTimeout(STTIP.timer);
    STTIP.timer = setTimeout(() => setStTip({ close: true }), patch.defer);
    return;
  }
  if (!patch.refresh && STTIP.timer) { clearTimeout(STTIP.timer); STTIP.timer = 0; }
  if (patch.close) { STTIP.kind = null; STTIP.sel = null; STTIP.pinned = false; }
  else {
    if ('kind' in patch) STTIP.kind = patch.kind;
    if ('sel' in patch) STTIP.sel = patch.sel;
    if ('pinned' in patch) STTIP.pinned = patch.pinned;
    if ('x' in patch) STTIP.x = patch.x;
    if ('y' in patch) STTIP.y = patch.y;
  }
  if (STTIP.kind === null) {
    if (STTIP.open) {
      el.style.display = 'none'; el.classList.remove('pinned');
      STTIP.open = false; STTIP.sig = '';
    }
    return;
  }
  const key = STTIP.sel ? [STTIP.sel.m, STTIP.sel.id || '', STTIP.sel.t ? STTIP.sel.t.label : ''].join('/') : '';
  const sig = [STTIP.kind, key, STTIP.rev, STTIP.pinned].join('|');
  if (sig !== STTIP.sig) { el.innerHTML = stTipHeader() + stDetailHTML(STTIP.kind, STTIP.sel); STTIP.sig = sig; }
  el.style.display = 'block';
  el.classList.toggle('pinned', STTIP.pinned);
  STTIP.open = true;
  placeStTip();
}

/* 事件层：只把用户意图翻译成 setStTip 调用 */
function stTipHover(kind, sel, ev) {
  if (STTIP.pinned) return;
  setStTip({ kind, sel, x: ev.clientX, y: ev.clientY });
}
function stTipPin(kind, sel, ev) { setStTip({ kind, sel, pinned: true, x: ev.clientX, y: ev.clientY }); }
function stTipLeave() { if (!STTIP.pinned && STTIP.open) setStTip({ defer: 220 }); }

function bindStTip() {
  const tip = $('#sttip');
  tip.addEventListener('mouseenter', () => { if (!STTIP.pinned) setStTip({}); });
  tip.addEventListener('mouseleave', stTipLeave);
  tip.addEventListener('click', ev => { if (ev.target.closest('[data-sttip-close]')) setStTip({ close: true }); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && STTIP.open) setStTip({ close: true }); });
}

/* ───── 结构关系地图（V0.2 遗留，需求书第九节） ───── */
/* 节点 = 理论注册表 45 条目；边只有两类，全部由注册表字段推导，不虚构关系：
 *   关联   link 对称化；kind 层级不同 → 带箭头（低层级 → 高层级 = 构成链方向），同级 → 无箭头
 *   易混淆 near 对称化（虚线），注记直接取自 near 数据
 * 六问详情：上游/下游/同级由 kind 层级从 link（含反向）推导；依赖 = 条目 pre 原文；状态 = 实现状态 + 状态机。 */
const RANKK = { raw: 0, merge: 1, merged: 1, fractal: 2, stroke: 3, pivot: 4, div: 5, signal: 6 };
const RMCOLOR = { basic: '#94a3b8', stroke: '#facc15', pivot: '#58a6ff', trend: '#fb923c', level: '#a78bfa', div: '#e879f9', bs: '#22d3ee' };
const RMW = 150, RMH = 34, RMX = 206, RMY = 58, RMTOP = 66, RMLEFT = 40;
const RMFIT = { w: RMLEFT + RMX * 6 + RMW + 36, h: RMTOP + RMY * 7 + RMH + 20 };
const RMG = { built: false, node: {}, edges: [], pos: {}, vb: { x: 0, y: 0, w: RMFIT.w, h: RMFIT.h }, ar: RMFIT.h / RMFIT.w, sel: null, skip: false, fold: new Set() };
function rmData() {
  const pos = {}, key = (a, b) => a < b ? a + '|' + b : b + '|' + a, all = new Map();
  R.groups().forEach((g, gi) => g.items.forEach((it, ii) => { pos[it.id] = { x: RMLEFT + gi * RMX, y: RMTOP + ii * RMY, it }; }));
  for (const it of R.ITEMS) {
    for (const t of it.link || []) {
      if (!R.BY_ID[t] || t === it.id) continue;
      const k = key(it.id, t);
      if (!all.has(k)) all.set(k, { a: k.split('|')[0], b: k.split('|')[1], link: true, near: false, notes: [] });
    }
    for (const pr of it.near || []) {
      const t = pr[0];
      if (!R.BY_ID[t] || t === it.id) continue;
      const k = key(it.id, t);
      if (!all.has(k)) all.set(k, { a: k.split('|')[0], b: k.split('|')[1], link: false, near: true, notes: [] });
      const e = all.get(k); e.near = true;
      if (pr[1] && !e.notes.includes(pr[1])) e.notes.push(pr[1]);
    }
  }
  return { pos, edges: [...all.values()] };
}
function rmGeom(pa, pb) {
  const ax = pa.x + RMW / 2, ay = pa.y + RMH / 2, bx = pb.x + RMW / 2, by = pb.y + RMH / 2;
  const dx = bx - ax, dy = by - ay;
  let sx, sy, ex, ey, c1x, c1y, c2x, c2y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const s = Math.sign(dx) || 1;
    sx = ax + s * RMW / 2; sy = ay; ex = bx - s * RMW / 2; ey = by;
    const k = (ex - sx) * 0.42;
    c1x = sx + k; c1y = sy; c2x = ex - k; c2y = ey;
  } else {
    const s = Math.sign(dy) || 1;
    sx = ax; sy = ay + s * RMH / 2; ex = bx; ey = by - s * RMH / 2;
    const k = (ey - sy) * 0.42;
    c1x = sx; c1y = sy + k; c2x = ex; c2y = ey - k;
  }
  return { d: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`, ex, ey, ang: Math.atan2(ey - c2y, ex - c2x) };
}
const applyRmView = () => { const v = RMG.vb; $('#rmg').setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); };
function rmReset() {
  const rc = $('#rmg').getBoundingClientRect();
  if (rc.width && rc.height) {
    RMG.ar = rc.height / rc.width;
    let w = RMFIT.w, h = w * RMG.ar;
    if (h < RMFIT.h) { h = RMFIT.h; w = h / RMG.ar; }
    RMG.vb = { x: (RMFIT.w - w) / 2, y: (RMFIT.h - h) / 2, w, h };
  } else RMG.vb = { x: 0, y: 0, w: RMFIT.w, h: RMFIT.h };
  applyRmView();
}
function buildMap() {
  if (RMG.built) return; RMG.built = true;
  const svg = $('#rmg'), NS = 'http://www.w3.org/2000/svg';
  const mk = (tg, at, p) => { const el = document.createElementNS(NS, tg); for (const k in at) el.setAttribute(k, at[k]); p.appendChild(el); return el; };
  const D = rmData(); RMG.pos = D.pos;
  const gE = mk('g', {}, svg), gN = mk('g', {}, svg);
  /* 边：关联（link）与易混淆（near）合并为一条；双属性边为橙色实线，仅易混淆为橙色虚线 */
  for (const e of D.edges) {
    const pa = D.pos[e.a], pb = D.pos[e.b];
    if (!pa || !pb) continue;
    /* 箭头指向高层级（构成链方向）；层级信息来自 kind，todo 条目无层级不定向 */
    const ra = RANKK[pa.it.kind], rb = RANKK[pb.it.kind];
    const dir = e.link && ra != null && rb != null && ra !== rb ? (ra < rb ? [e.a, e.b] : [e.b, e.a]) : null;
    const geo = dir && dir[0] === e.b ? rmGeom(pb, pa) : rmGeom(pa, pb);
    const hit = mk('path', { class: 'rmeh', d: geo.d }, gE);
    const line = mk('path', { class: 'rme' + (e.near ? (e.link ? ' both' : ' near') : ''), d: geo.d }, gE);
    let arw = null;
    if (dir) {
      const aw = 7, ah = 3.6, c = Math.cos(geo.ang), s = Math.sin(geo.ang);
      const pts = `${geo.ex},${geo.ey} ${geo.ex - aw * c - ah * s},${geo.ey - aw * s + ah * c} ${geo.ex - aw * c + ah * s},${geo.ey - aw * s - ah * c}`;
      arw = mk('polygon', { class: 'rmah', points: pts }, gE);
    }
    const rec = { a: e.a, b: e.b, link: e.link, near: e.near, notes: e.notes, dir, line, arw, hit };
    hit.addEventListener('click', ev => { ev.stopPropagation(); RMG.sel = { type: 'edge', e: rec }; renderMapSel(); });
    RMG.edges.push(rec);
  }
  /* 分组标题（点击折叠该列）与节点 */
  const stc = { impl: 'var(--ok)', partial: 'var(--warn)', todo: '#64748b' };
  R.groups().forEach((g, gi) => {
    const gc = mk('g', {}, gN);
    const tt = mk('text', { class: 'rmt', x: RMLEFT + gi * RMX + RMW / 2, y: 40, 'text-anchor': 'middle' }, gc);
    tt.textContent = `${g.name}（${g.items.length}）· 点击折叠`;
    tt.addEventListener('click', () => { gc.classList.toggle('rmg-off'); });
    for (const it of g.items) {
      const p = D.pos[it.id];
      const gn = mk('g', { class: 'rmn ' + it.status }, gc);
      gn.dataset.id = it.id; gn.dataset.tip = it.brief.replace(/"/g, '&quot;');
      mk('rect', { x: p.x, y: p.y, width: RMW, height: RMH, rx: 8, stroke: RMCOLOR[g.id] }, gn);
      mk('circle', { class: 'rmst', cx: p.x + RMW - 11, cy: p.y + RMH / 2, r: 3, fill: stc[it.status] }, gn);
      const tx = mk('text', { x: p.x + RMW / 2 - 4, y: p.y + RMH / 2 + 4 }, gn);
      tx.textContent = it.name;
      gn.addEventListener('click', ev => { ev.stopPropagation(); RMG.sel = { type: 'node', id: it.id }; renderMapSel(); });
      RMG.node[it.id] = gn;
    }
  });
  $('#rmstat').textContent = `${R.ITEMS.length} 概念 · ${RMG.edges.length} 条关系 · 其中 ${RMG.edges.filter(x => x.near).length} 对易混淆`;
  /* 容器尺寸变化（侧栏收放动画、窗口缩放）时保持纵向贴合：锁定缩放宽度，视野中心不变 */
  if (window.ResizeObserver) new ResizeObserver(() => {
    if ($('#mapwrap').hidden) return;
    const rc = svg.getBoundingClientRect();
    if (rc.width && rc.height) {
      RMG.ar = rc.height / rc.width;
      const nh = RMG.vb.w * RMG.ar;
      RMG.vb.y += (RMG.vb.h - nh) / 2; RMG.vb.h = nh;
      applyRmView();
    }
  }).observe($('#rmgwrap'));
  /* 缩放（滚轮，锚定光标）与拖动平移：与状态网络同一模式 */
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const k = Math.pow(1.14, Math.max(-2, Math.min(2, e.deltaY / 100))), rc = svg.getBoundingClientRect();
    const mx = RMG.vb.x + (e.clientX - rc.left) / rc.width * RMG.vb.w, my = RMG.vb.y + (e.clientY - rc.top) / rc.height * RMG.vb.h;
    const nw = Math.max(320, Math.min(2400, RMG.vb.w * k)), nk = nw / RMG.vb.w;
    RMG.vb.x = mx - (mx - RMG.vb.x) * nk; RMG.vb.y = my - (my - RMG.vb.y) * nk; RMG.vb.w = nw; RMG.vb.h = nw * RMG.ar;
    applyRmView();
  }, { passive: false });
  let drag = null;
  svg.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, vx: RMG.vb.x, vy: RMG.vb.y, moved: false }; });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const rc = svg.getBoundingClientRect();
    RMG.vb.x = drag.vx - dx / rc.width * RMG.vb.w; RMG.vb.y = drag.vy - dy / rc.height * RMG.vb.h;
    applyRmView();
  });
  window.addEventListener('mouseup', () => { if (drag && drag.moved) { RMG.skip = true; setTimeout(() => { RMG.skip = false; }, 0); } drag = null; });
  svg.addEventListener('click', () => { if (RMG.skip) return; RMG.sel = null; renderMapSel(); });
  let tDrag = null, tPinch = null;
  bindTouchPanZoom(svg, {
    start: () => { tPinch = null; tDrag = { vx: RMG.vb.x, vy: RMG.vb.y, rc: svg.getBoundingClientRect() }; },
    move: (dx, dy) => {
      if (!tDrag) return;
      RMG.vb.x = tDrag.vx - dx / tDrag.rc.width * RMG.vb.w;
      RMG.vb.y = tDrag.vy - dy / tDrag.rc.height * RMG.vb.h;
      applyRmView();
    },
    pinchStart: () => { tPinch = { x: RMG.vb.x, y: RMG.vb.y, w: RMG.vb.w, h: RMG.vb.h, rc: svg.getBoundingClientRect() }; },
    pinch: (scale, cx, cy) => {
      if (!tPinch) return;
      const nw = Math.max(320, Math.min(2400, tPinch.w / scale)), nk = nw / tPinch.w;
      const nx = (cx - tPinch.rc.left) / tPinch.rc.width, ny = (cy - tPinch.rc.top) / tPinch.rc.height;
      const wx = tPinch.x + nx * tPinch.w, wy = tPinch.y + ny * tPinch.h;
      RMG.vb = { x: wx - nx * nw, y: wy - ny * tPinch.h * nk, w: nw, h: tPinch.h * nk };
      applyRmView();
    },
    end: () => { RMG.skip = true; setTimeout(() => { RMG.skip = false; }, 0); }
  });
}
function renderMapSel() {
  const sel = RMG.sel, nb = new Set();
  if (sel && sel.type === 'node') {
    nb.add(sel.id);
    for (const e of RMG.edges) if (e.a === sel.id || e.b === sel.id) { nb.add(e.a); nb.add(e.b); }
  }
  for (const id in RMG.node) {
    const it = R.get(id);
    let cls = 'rmn ' + it.status;
    if (sel) {
      if (sel.type === 'node') cls += id === sel.id ? ' sel' : nb.has(id) ? ' nb' : ' dim';
      else cls += (sel.e.a === id || sel.e.b === id) ? ' nb' : ' dim';
    }
    RMG.node[id].setAttribute('class', cls);
  }
  for (const e of RMG.edges) {
    let cls = 'rme' + (e.near ? (e.link ? ' both' : ' near') : ''), ac = 'rmah';
    if (sel) {
      if (sel.type === 'node') { const on = e.a === sel.id || e.b === sel.id; cls += on ? ' nb' : ' dim'; ac += on ? ' nb' : ' dim'; }
      else { const on = e === sel.e; cls += on ? ' sel' : ' dim'; ac += on ? ' sel' : ' dim'; }
    }
    e.line.setAttribute('class', cls);
    if (e.arw) e.arw.setAttribute('class', ac);
  }
  renderMapSide();
}
const rmChip = id => `<a class="mxchip" data-rm="${id}">${R.get(id).name}</a>`;
function renderMapSide() {
  const el = $('#rmdetail'), sel = RMG.sel;
  if (!sel) {
    el.innerHTML = '<div class="mxsec" style="margin-top:4px">图例 · 用法</div>'
      + '<div class="blk m" style="line-height:1.8">节点 = 理论注册表条目；颜色 = 分组。边全部来自注册表数据：<b>关联</b>（link；kind 层级不同带箭头，指向被构成方）、<b>易混淆</b>（near，橙色；纯易混淆为虚线，双属性为实线）。</div>'
      + '<div class="mxchips">' + R.GROUPS.map(g => `<span class="mxchip" style="cursor:default"><i class="rmlgd" style="background:${RMCOLOR[g.id]}"></i>${g.name}</span>`).join('') + '</div>'
      + '<div class="blk m" style="line-height:1.8">状态点：<span style="color:var(--ok)">●</span>源码已有　<span style="color:var(--warn)">●</span>部分实现　<span style="color:#64748b">●</span>待实现（虚框，只看概念关系，不生成结果）</div>'
      + '<div class="blk m" style="margin-top:6px;line-height:1.8">点节点 → 六问详情（构成 / 被构成 / 依赖 / 易混淆 / 状态 / 演化）<br>点边 → 关系说明（易混淆边附原著注记）<br>点组名折叠该列 · 拖动平移 · 滚轮缩放 · 点空白取消选中</div>';
    return;
  }
  if (sel.type === 'edge') {
    const e = sel.e, A = R.get(e.a), B = R.get(e.b);
    let rel;
    if (e.near) rel = '<span class="tg" style="color:var(--warn);border-color:currentColor">易混淆</span>';
    else if (e.dir) rel = `<span class="tg" style="color:var(--ac2);border-color:currentColor">构成链：${R.get(e.dir[0]).name} → ${R.get(e.dir[1]).name}</span>`;
    else rel = '<span class="tg" style="color:var(--t2);border-color:currentColor">同级关联</span>';
    el.innerHTML = `<div class="mxsec" style="margin-top:4px">关系</div><div class="blk"><b>${A.name} ↔ ${B.name}</b></div><div class="blk">${rel}</div>`
      + (e.notes && e.notes.length ? `<div class="mxrow"><b>原著注记</b><span>${e.notes.join('；')}</span></div>` : '')
      + `<div class="mxrow"><b>${A.name}</b><span>${A.brief}</span></div><div class="mxrow"><b>${B.name}</b><span>${B.brief}</span></div>`
      + `<div class="mxchips" style="margin-top:8px">${rmChip(e.a)}${rmChip(e.b)}</div>`
      + '<div class="blk m" style="margin-top:6px">点空白处返回图例。</div>';
    return;
  }
  /* 节点：六问 */
  const it = R.get(sel.id), ri = RANKK[it.kind];
  const up = [], down = [], same = [], seen = new Set(), nearLs = [];
  const push = (oid, arr) => { if (!seen.has(oid) && oid !== it.id) { seen.add(oid); arr.push(oid); } };
  for (const e of RMG.edges) {
    let oid = null;
    if (e.a === it.id) oid = e.b; else if (e.b === it.id) oid = e.a;
    if (!oid) continue;
    const O = R.get(oid);
    if (e.near) { nearLs.push({ id: oid, notes: e.notes }); continue; }
    const ro = RANKK[O.kind];
    if (ri != null && ro != null) { if (ro < ri) push(oid, up); else if (ro > ri) push(oid, down); else push(oid, same); }
    else push(oid, same);
  }
  const mach = { stroke: 'stroke', pivot: 'pivot', signal: 'signal' }[it.kind];
  const bd = { impl: ['源码已有', 'var(--ok)'], partial: ['部分实现', 'var(--warn)'], todo: ['待实现', '#94a3b8'] }[it.status];
  const chips = arr => arr.length ? arr.map(rmChip).join('') : '<span class="m">—</span>';
  let h = `<div class="mxsec" style="margin-top:4px">概念 · ${R.GROUPS.find(g => g.id === it.group).name}</div>`
    + `<div class="blk"><b>${it.name}</b>　<span class="tg" style="color:${bd[1]};border-color:currentColor">${bd[0]}</span></div>`
    + `<div class="blk m">${it.brief}</div>`
    + `<div class="mxrow"><b>① 由什么构成</b><span>${chips(up)}</span></div>`
    + `<div class="mxrow"><b>② 参与构成什么</b><span>${chips(down)}</span></div>`
    + `<div class="mxrow"><b>③ 依赖哪些概念</b><span>${it.pre && it.pre.length ? it.pre.join('；') : (up.length ? up.map(x => R.get(x).name).join('、') : '—（最底层原料）')}</span></div>`
    + `<div class="mxrow"><b>④ 易混淆项</b><span>${nearLs.length ? nearLs.map(n => `${rmChip(n.id)}${n.notes && n.notes.length ? `<i class="m" style="font-style:normal">（${n.notes[0]}）</i>` : ''}`).join('') : '<span class="m">—</span>'}</span></div>`
    + `<div class="mxrow"><b>⑤ 有哪些状态</b><span>${mach ? ST.MACHINES[mach].states.map(s => s.name).join(' → ') : (it.status === 'todo' ? '源码未实现，不产生状态' : '本概念不设状态机')}</span></div>`
    + `<div class="mxrow"><b>⑥ 如何演化</b><span>${same.length ? chips(same) : (mach ? '见「实验」模式底部的状态机与状态转移网络' : '—')}</span></div>`
    + `<div class="mxrow"><b>源码</b><span>${it.src}${it.srcFn && it.srcFn !== '—' ? ' · ' + it.srcFn : ''}</span></div>`
    + '<div class="blk m" style="margin-top:6px">点其他概念跳转；点空白处返回图例。</div>';
  el.innerHTML = h;
}
/* ───── 分支探索（V0.4，需求书第八节）：不测而测 ─────
 * 入口 = V0.3 状态机的「合法后续转移」+ 底部流程带的幽灵节点，两条路径共用 brApply 单一落实入口。
 * 每个步骤只记录"单位 + 方向"，不记录任何结构结论：追加脚本由生成器构造，
 * 目标状态是否成立完全由逐根回放判定；理想骨架无法构造的转移不出现，也不伪造路径。 */
const BR = { seq: 0 };
const BRW = 244, BRH = 52;
const brStateName = (m, id) => { const sd = ST.MACHINES[m].states.find(x => x.id === id); return sd ? (sd.short || sd.name) : id; };

/* 行动空间 = 当前单位的两项完全分类：向上 / 向下（阳/阴 · 顶/底 · 上笔/下笔），互斥且完备。
 * 中枢新生/延伸/离开/移位、背驰、买卖点不是选项——是单位序列回放后浮现的判定。 */
function actionable() {
  const u = G.UNIT_OPT[S.gbUnit] ? S.gbUnit : 'fx';
  return ['up', 'down'].map(dir => ({ m: 'unit', u, dir, label: G.UNIT_OPT[u][dir] }));
}
/* 顶分型用红、底分型用绿；其余单位与 KLINE_COL 同口径（向上绿 / 向下红）。 */
const unitColor = (u, dir) => u === 'fx'
  ? (dir === 'up' ? GB_COL.down : GB_COL.up)
  : (dir === 'up' ? GB_COL.up : GB_COL.down);
const unitShort = (u, dir) => u === 'bar' ? (dir === 'up' ? '阳' : '阴')
  : u === 'fx' ? (dir === 'up' ? '顶' : '底')
    : u === 'bi' ? (dir === 'up' ? '上笔' : '下笔') : (dir === 'up' ? '↑' : '↓');

/* 一个单位算子：把「下一根K线 / 下一个分型 / 下一笔」的确定性脚本交给生成器，
   结构检查由 buildUnit 的事件前缀完成；构造器不定向任何目标状态，也不伪造行情。 */
function brMakeChild(parent, o, replayOpts) {
  if (!parent.cs.main[parent.bar]) return null;
  const u = G.UNIT_TXT[o.u] ? o.u : 'legacy';
  const ro = { ...E.DEFAULT_OPTIONS, ...(replayOpts || opts()) };
  const res = G.buildUnit(parent.cs, parent.bar, u, o.dir, ro);
  if (!res) return null;
  const cs = res.cs;
  cs.run = E.replay(cs.main, cs.sub, ro);
  cs.base = parent.cs.base ? G.appendChain(parent.cs.base, res.legs, parent.cs.spec.factor, parent.bar, ro) : null;
  const main = cs.main;
  cs.report = {
    name: `分支 · ${o.label}`, desc: `自 ${parent.id} 的 #${parent.bar} 分叉，追加一个${G.UNIT_LABEL[u]}（${G.UNIT_TXT[u][o.dir]}）；幽灵预览与落实由同一个 buildUnit 构造。行情由生成器产生，结构由算法逐根回放判定。`,
    verifiable: false, ok: true, counts: countsOf(cs),
    search: { found: !!res.formed, tries: 1, max: 1, branch: true },
  };
  cs.branch = true;
  return { id: 'W' + (BR.seq++), parent: parent.id, depth: parent.depth + 1, label: o.label, split: parent.bar, bar: main.length - 1, cs, unit: u, formed: !!res.formed, bars: res.bars, target: { m: o.m, u, dir: o.dir, label: o.label }, verdict: null };
}

/* 每步的回放判定：这个单位落地后发生了什么（单位本身的确认 + 中枢/背驰/信号观察）。
 * 全部是观察陈述，不是对错判定——用户只选方向，结构结论由算法回放给出。 */
function stkVerdict(w, fromBar, o) {
  const run = w.cs.run;
  const sn = run.snaps[run.snaps.length - 1], r1 = sn.res, off = sn.off;
  const r0 = run.snaps[fromBar].res;
  const u = w.unit, dir = o.dir;
  const parts = [];
  if (u === 'bar') {
    const c = w.cs.main[w.cs.main.length - 1];
    parts.push(c && c.close >= c.open ? '阳线' : '阴线');
  } else if (u === 'fx') {
    const f = r1.fractals[r1.fractals.length - 1];
    parts.push(w.formed && f ? `${f.isTop ? '顶' : '底'}分型确认 #${f.barIndex + off}` : '未确认分型');
  } else if (u === 'bi') {
    const s = r1.strokes[r1.strokes.length - 1];
    parts.push(w.formed && s ? `${s.isUp ? '向上' : '向下'}笔 #${s.startBarIndex + off}→#${s.endBarIndex + off}` : '未成笔');
  } else {
    parts.push(dir === 'up' ? '↑ 行进中' : '↓ 行进中');
  }
  if (r1.pivots.length > r0.pivots.length) {
    parts.push('中枢新生');
    if (r1.pivots.length >= 2) {
      const a = r1.pivots[r1.pivots.length - 2], b = r1.pivots[r1.pivots.length - 1];
      const ma = (a.zg + a.zd) / 2, mb = (b.zg + b.zd) / 2;
      if (mb > ma) parts.push('中枢上移'); else if (mb < ma) parts.push('中枢下移');
    }
  } else {
    const p0 = r0.pivots[r0.pivots.length - 1], p1 = r1.pivots[r1.pivots.length - 1];
    if (p0 && p1) {
      if (p1.isConfirmed && !p0.isConfirmed) parts.push('中枢离开');
      else if (p1.strokeCount > p0.strokeCount) parts.push('中枢延伸');
    }
  }
  if (r1.divergences.length > r0.divergences.length) parts.push('背驰');
  const sg = run.signals.filter(s => s.gConfirm > fromBar).length;
  if (sg > 0) parts.push(`信号×${sg}`);
  return { ok: u === 'bar' || !!w.formed, stk: u === 'legacy', unit: u, formed: !!w.formed, dir, desc: parts.join(' · ') };
}

/* 分支落实的唯一入口：把当前单位的方向追加进路径并整条重编译，回放后给出结构判定。 */
function brApply(sel) {
  if (!S.cs || !sel) return null;
  stop();
  const hit = actionable().find(o => o.dir === sel.dir && (!sel.u || o.u === sel.u));
  if (!hit) return null;
  S.path.push({ m: 'unit', u: hit.u, dir: hit.dir, label: hit.label });
  rebuild(true);
  const v = S.pathVerdicts[S.pathVerdicts.length - 1];   // 反馈由流程带节点的回放判定承载，顶栏状态胶囊已移除
  return { label: hit.label, verdict: v || null };
}
/* 两模式：学习(map)=关系地图（理论目录栏已移除，注册表信息全部由地图节点承载）；
 * 实验(chart)=参数+画布+右栏+底部状态网络与分支流程带——状态机与多世界推演都只在 K 线图下有意义。 */
const stFoldPref = () => { try { return localStorage.getItem('chanlab.stfold') === '1'; } catch (e) { return false; } }; /* 默认展开；手动折叠后才记 '1' */
function setStFold(hide, persist) {
  $('#stbody').classList.toggle('hide', hide); $('#statewrap').classList.toggle('folded', hide);
  if (hide) setStTip({ close: true });   /* 折叠网络时详情 tooltip 一并收起 */
  $('#sttitle').textContent = (hide ? '▸' : '▾') + ' 状态机与状态转移网络';
  if (persist) { try { localStorage.setItem('chanlab.stfold', hide ? '1' : '0'); } catch (e) {} }
  draw();
}
const subFoldPref = () => { try { return localStorage.getItem('chanlab.subfold') === '1'; } catch (e) { return false; } }; /* 默认展开；手动折叠后才记 '1' */
function setSubFold(fold, persist) { S.subFold = fold; if (persist) { try { localStorage.setItem('chanlab.subfold', fold ? '1' : '0'); } catch (e) {} } draw(); }
const cvFoldPref = () => { try { return localStorage.getItem('chanlab.cvfold') === '1'; } catch (e) { return false; } }; /* 默认展开；手动折叠后才记 '1' */
function setCvFold(fold, persist) { S.cvFold = fold; if (persist) { try { localStorage.setItem('chanlab.cvfold', fold ? '1' : '0'); } catch (e) {} } draw(); }
/* K线图表整组折叠：与状态网络 / 分支流程同级；组内主 / 次标题条仍各自折叠 */
const kFoldPref = () => { try { return localStorage.getItem('chanlab.kfold') === '1'; } catch (e) { return false; } }; /* 默认展开；手动折叠后才记 '1' */
function setKlineFold(fold, persist, redraw = true) {
  const cw = $('#chartwrap'); if (!cw) return;
  cw.classList.toggle('kfolded', fold);
  const t = $('#klinetitle'); if (t) t.textContent = (fold ? '▸' : '▾') + ' K线图表';
  const h = $('#klinehint'); if (h) h.textContent = fold ? '已折叠，点击标题展开' : '主级别 + 次级别';
  if (persist) { try { localStorage.setItem('chanlab.kfold', fold ? '1' : '0'); } catch (e) {} }
  if (redraw && !fold) draw();   /* 展开时画布刚从 display:none 恢复，补一次尺寸与绘制 */
}
/* 两条都折叠（或没有次级别可看）时收起整个画布容器，避免残留大块黑区 */
function syncChartFold() {
  const cw = $('#chartwrap'), sub = $('#subwrap');
  if (!cw || !sub) return;
  cw.classList.toggle('allfolded', !!(S.cvFold && (S.subFold || sub.hidden)));
}
/* 主图 / 副图分界：拖动分配高度；按占两图总高的比例记忆，窗口变化时重新夹取 */
const SPLIT_MIN_SUB = 90, SPLIT_MIN_MAIN = 120;
const subFracPref = () => { try { const v = parseFloat(localStorage.getItem('chanlab.subfrac')); return v > 0.03 && v < 0.97 ? v : null; } catch (e) { return null; } };
function splitStackH() {
  const cv = $('#cvwrap'), sub = $('#subwrap'), sp = $('#splitter');
  if (!cv || !sub) return 0;
  return cv.getBoundingClientRect().height + sub.getBoundingClientRect().height + (sp && !sp.hidden ? sp.getBoundingClientRect().height : 0);
}
function clampSubH(h) {
  const stack = splitStackH();
  if (!stack) return h;
  const sp = $('#splitter'), spH = sp && !sp.hidden ? sp.getBoundingClientRect().height : 0;
  const hi = Math.max(60, stack - SPLIT_MIN_MAIN - spH), lo = Math.min(SPLIT_MIN_SUB, hi);
  return Math.round(Math.max(lo, Math.min(hi, h)));
}
function applySubH(h) {
  const v = clampSubH(h), sub = $('#subwrap'), sp = $('#splitter');
  sub.style.setProperty('--subh', v + 'px');
  if (sp) sp.setAttribute('aria-valuenow', String(v));
  draw();
}
function persistSubFrac() {
  const stack = splitStackH(), h = $('#subwrap').getBoundingClientRect().height;
  try { if (stack > 0 && h > 0) localStorage.setItem('chanlab.subfrac', String(+(h / stack).toFixed(4))); } catch (e) {}
}
function applySubFrac() {
  const f = subFracPref(), sub = $('#subwrap'), stack = splitStackH();
  if (f == null || !sub || sub.hidden || !stack) return;
  const v = clampSubH(stack * f);
  sub.style.setProperty('--subh', v + 'px');
  const sp = $('#splitter'); if (sp) sp.setAttribute('aria-valuenow', String(v));
}
function resetSubH() {
  $('#subwrap').style.removeProperty('--subh');
  try { localStorage.removeItem('chanlab.subfrac'); } catch (e) {}
  draw();
}
function syncSplitter() {
  const sp = $('#splitter'), cv = $('#cvwrap'), sub = $('#subwrap');
  if (!sp || !cv || !sub) return;
  sp.hidden = cv.hidden || sub.hidden || S.subFold || S.cvFold;
}
function bindSplitter() {
  const sp = $('#splitter'), sub = $('#subwrap');
  if (!sp || !sub) return;
  let drag = null, raf = 0, nextH = null;
  const flush = () => { raf = 0; if (nextH != null) { const h = nextH; nextH = null; applySubH(h); } };
  const queue = h => { nextH = h; if (!raf) raf = requestAnimationFrame(flush); };
  sp.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    try { sp.setPointerCapture(e.pointerId); } catch (err) {}
    drag = { y: e.clientY, h: sub.getBoundingClientRect().height };
    sp.classList.add('dragging'); document.body.classList.add('split-drag');
  });
  sp.addEventListener('pointermove', e => { if (drag) queue(drag.h - (e.clientY - drag.y)); });
  const end = e => {
    if (!drag) return;
    drag = null;
    sp.classList.remove('dragging'); document.body.classList.remove('split-drag');
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (nextH != null) { const h = nextH; nextH = null; applySubH(h); }
    persistSubFrac();
    try { sp.releasePointerCapture(e.pointerId); } catch (err) {}
  };
  sp.addEventListener('pointerup', end);
  sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', e => { e.preventDefault(); resetSubH(); });
  sp.addEventListener('keydown', e => {
    if (sp.hidden) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      applySubH(sub.getBoundingClientRect().height + (e.key === 'ArrowUp' ? 10 : -10));
      persistSubFrac();
    } else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); resetSubH(); }
  });
}
/* 主图 + 次级别副图整组全屏：优先原生全屏；不支持元素级全屏的浏览器（如 iPhone Safari）退回页面内铺满 */
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const cvIsFs = () => { const el = $('#chartwrap'); return fsEl() === el || el.classList.contains('fs-css'); };
function syncFsBtn() {
  const on = cvIsFs(), b = $('#fsbtn');
  if (!b) return;
  b.textContent = on ? '退出' : '全屏';
  b.dataset.tip = on ? '退出全屏（Esc）' : '全屏查看主图与次级别（Esc 退出）';
  b.setAttribute('aria-label', on ? '退出全屏' : '全屏查看主图与次级别');
}
/* Safari 全屏是动画：fullscreenchange 时尺寸可能尚未落定，分几拍补画，避免画布停在中间态 */
function drawFsSettled() {
  draw();
  requestAnimationFrame(() => {
    draw();
    requestAnimationFrame(() => draw());
  });
  setTimeout(() => draw(), 160);
  setTimeout(() => draw(), 420);
}
function setCssFs(on) {
  $('#chartwrap').classList.toggle('fs-css', on);
  document.body.classList.toggle('fs-open', on);
  syncFsBtn();
  drawFsSettled();
}
function toggleCvFs() {
  const el = $('#chartwrap');
  if (cvIsFs()) {
    if (fsEl() === el) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
    } else setCssFs(false);
    return;
  }
  /* 组标题在全屏里隐藏；若整组被折叠，先展开，避免进全屏只剩标题条 */
  if ($('#chartwrap').classList.contains('kfolded')) setKlineFold(false, false);
  /* 主图折叠着进全屏时保留折叠，让次级别独占；只有次级别不可用才展开主图，避免整屏空白 */
  if (S.cvFold && $('#subwrap').hidden) setCvFold(false, false);
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) { setCssFs(true); return; }
  let p;
  try { p = req.call(el); } catch (e) { setCssFs(true); return; }
  if (p && p.catch) p.catch(() => setCssFs(true));
}
const gbFoldPref = () => { try { return localStorage.getItem('chanlab.gbfold') === '1'; } catch (e) { return false; } }; /* 默认展开；手动折叠后才记 '1' */
function setGbFold(hide, persist) {
  $('#gbwrap').classList.toggle('folded', hide);
  $('#gbftitle').textContent = (hide ? '▸' : '▾') + ' 分支流程（完全分类）';
  if (persist) { try { localStorage.setItem('chanlab.gbfold', hide ? '1' : '0'); } catch (e) {} }
  if (!hide) draw();   /* 折叠期间路径可能已变化，展开时按当前 S.path 重画 */
}
function setView(v) {
  if (STTIP.open) setStTip({ close: true });   /* 视图切换不带走上一视图的详情 */
  document.querySelectorAll('#vtabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  const map = v === 'map', exp = !map, app = $('#app'), mobile = isMobile();
  if (!exp && MX.isOpen()) MX.close();
  if (S.view === 'chart' && !exp && !mobile) S.chartPanes = [app.classList.contains('hide-l'), app.classList.contains('hide-r')];
  S.view = v; app.dataset.mode = v;
  $('#cvwrap').hidden = !exp; $('#player').hidden = !exp; $('#chartwrap').hidden = !exp; if (!exp) $('#subwrap').hidden = true;
  $('#mapwrap').hidden = !map; $('#statewrap').hidden = !exp; $('#gbwrap').hidden = !exp;
  $('#pane-exp').hidden = !exp;   /* 学习模式无左栏：概念入口全在关系地图节点 */
  const hl = mobile ? true : (exp ? (S.chartPanes ? S.chartPanes[0] : false) : true), hr = mobile ? true : (exp ? (S.chartPanes ? S.chartPanes[1] : true) : true);
  app.classList.add('noanim'); app.classList.toggle('hide-l', hl); app.classList.toggle('hide-r', hr);
  void app.offsetWidth;
  if (S.syncPanes) S.syncPanes();
  if (map) { buildMap(); rmReset(); renderMapSel(); }
  else { setStFold(stFoldPref(), false); setGbFold(gbFoldPref(), false); renderState(); }
  requestAnimationFrame(() => app.classList.remove('noanim'));
}

/* ───── 分支预览（完全分类）：实验模式主图上从当前K线向右画「下一单位的两个方向」幽灵投影 ─────
 * 幽灵与落实共用 G.buildUnit（同一个事件前缀、同一份脚本）；预览不推进序列号、不建基线。
 * 单位由流程带头的下拉决定（单根K线 / 最小分型 / 最小笔），只影响后续步骤。 */
const GB_COL = { up: '#4ade80', down: '#f87171' };   // 方向配色：与 KLINE_COL 同口径 up=绿 / down=红，仅色阶不同
const GB = { cs: null, i: -1, u: null, opts: [], paths: [], candles: [] };
function gbCompute() {
  if (!S.cs || S.view !== 'chart') { GB.cs = null; GB.i = -1; GB.u = null; GB.opts = []; GB.paths = []; GB.candles = []; return; }
  const u = G.UNIT_OPT[S.gbUnit] ? S.gbUnit : 'fx';
  if (GB.cs === S.cs && GB.i === S.i && GB.u === u) return;
  GB.cs = S.cs; GB.i = S.i; GB.u = u; GB.opts = []; GB.paths = []; GB.candles = [];
  const bar = S.i;
  if (!S.cs.main[bar]) return;
  const ro = opts(), clean = S.cs.base || S.cs;   /* 在冻结的完美行情上追加单位，再对追加结果施加同一套污染 */
  for (const o of actionable()) {
    const res = G.buildUnit(clean, bar, u, o.dir, ro);
    if (!res) continue;
    const pm = pollMain(res.cs);
    const pts = [{ bar, price: S.cs.main[bar].close }];
    for (let j = bar + 1; j < pm.length; j++) pts.push({ bar: j, price: pm[j].close });
    const candles = pm.slice(bar + 1);
    GB.opts.push(o); GB.paths.push(pts); GB.candles.push(candles.length ? candles : null);
  }
}

/* 流程带幽灵节点与状态网络转移边：两条交互路径都只经 brApply 落实，不各自组装世界 */
function gbCommit(k) { const o = GB.opts[k]; if (o) brApply(o); }

/* ───── 分支流程带：状态网络下方的流程图（只展开当前路径） ─────
 * 实心节点 = 已落实步骤（点选 = 回退到该步并截断后续）；
 * 虚框节点 = 当前状态的下一层可构造转移（点选 = 落实，主图幽灵K线同步变实）。 */
const GBFLOW = { key: null, cw: -1 };
const GB_X0 = 12;
/* 单位偏好只影响后续步骤：切换不重编译历史路径，只重算幽灵与流程带。 */
const gbUnitPref = () => { try { const u = localStorage.getItem('chanlab.gbunit'); return u === 'bar' || u === 'bi' ? u : 'fx'; } catch (e) { return 'fx'; } };
function syncGbUnitUI() {
  const u = G.UNIT_OPT[S.gbUnit] ? S.gbUnit : 'fx';
  const sel = $('#gbunit'); if (sel) sel.value = u;
  const up = $('#gbupcol'), dn = $('#gbdncol');
  if (up) up.style.color = unitColor(u, 'up');
  if (dn) dn.style.color = unitColor(u, 'down');
  const ut = $('#gbuptxt'), dt = $('#gbdntxt');
  if (ut) ut.textContent = G.UNIT_OPT[u].up;
  if (dt) dt.textContent = G.UNIT_OPT[u].down;
}
function setGbUnit(u) {
  if (!G.UNIT_OPT[u]) u = 'fx';
  if (S.gbUnit === u) return;
  S.gbUnit = u;
  try { localStorage.setItem('chanlab.gbunit', u); } catch (e) {}
  GB.cs = null; GB.i = -1; GB.u = null;
  GBFLOW.key = null;
  syncGbUnitUI();
  draw();
}
function gbFlowDraw() {
  const svg = $('#gbsvg'), sc = $('#gbscroll');
  if (!svg || !sc || $('#gbwrap').hidden || $('#gbwrap').classList.contains('folded') || S.view !== 'chart' || !S.cs || !S.tf) return;
  gbCompute();
  /* 内容键：路径/判定/选项/当前单位都不变时跳过重建（draw 逐帧调用） */
  const key = S.path.map(o => (o.u || 'legacy') + '>' + (o.dir || '')).join(',') + '|' + S.pathVerdicts.map(v => v ? (v.ok ? '+' : '-') : '?').join(',') + '|' + GB.opts.map(o => o.u + '>' + o.dir).join(',') + '|' + S.gbUnit + '|' + (S.importedRoot ? 'imp' : '') + '|' + S.path.length;
  if (key === GBFLOW.key) return;
  GBFLOW.key = key;
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tg, at, p) => { const el = document.createElementNS(NS, tg); for (const k in at) el.setAttribute(k, at[k]); p.appendChild(el); return el; };
  const Y0 = 12, GAPX = 56;
  const nAll = (S.path.length + 1) + GB.paths.length;
  const contentW = Math.max(sc.clientWidth, GB_X0 + nAll * (BRW + GAPX) + 6);
  svg.setAttribute('width', contentW); svg.setAttribute('height', 76);
  svg.replaceChildren();
  let x = GB_X0;
  const nodes = [{ root: true, cur: !S.path.length }].concat(S.path.map((o, k) => ({ o, k, cur: k === S.path.length - 1, v: S.pathVerdicts[k] })));
  nodes.forEach((n, k) => {
    if (k) { const x1 = x - GAPX, y = Y0 + BRH / 2, c = Math.max(30, GAPX * 0.5); mk('path', { class: 'bre hot', d: `M ${x1} ${y} C ${x1 + c} ${y}, ${x - c} ${y}, ${x} ${y}` }, svg); }
    const gn = mk('g', { class: 'brn' + (n.root ? ' root' : '') + (n.cur ? ' sel' : '') }, svg);
    mk('rect', { x, y: Y0, width: BRW, height: BRH, rx: 9 }, gn);
    const t1 = mk('text', { x: x + 11, y: Y0 + 20 }, gn);
    const t2 = mk('text', { class: 'brsub', x: x + 11, y: Y0 + 39 }, gn);
    if (n.root) {
      t1.textContent = '◉ ' + (S.importedRoot ? '导入行情' : '起点') + '  ·  #0';
      t2.textContent = S.importedRoot ? '真实行情 · 此后步骤为缠论单位' : '种子K线 · 点击回退到起点';
    } else {
      t1.textContent = `${n.k + 1} ${G.UNIT_TXT[n.o.u || 'legacy'][n.o.dir] || (n.o.dir === 'up' ? '向上' : '向下')}`;
      t2.textContent = n.v ? (n.v.desc || (n.v.ok ? `✓ @#${n.v.frame}` : '✗ 未达成')) : '…';
    }
    gn.addEventListener('click', ev => { ev.stopPropagation(); stop(); S.path = n.root ? [] : S.path.slice(0, n.k); rebuild(true); });
    x += BRW + GAPX;
  });
  GB.opts.forEach((o, k) => {
    const col = unitColor(o.u, o.dir);
    const x1 = x - GAPX, y = Y0 + BRH / 2, c = Math.max(30, GAPX * 0.5);
    mk('path', { class: 'bre', style: `stroke:${col};stroke-dasharray:5 4`, d: `M ${x1} ${y} C ${x1 + c} ${y}, ${x - c} ${y}, ${x} ${y}` }, svg);
    const gn = mk('g', { class: 'brn ghost' }, svg);
    const rc = mk('rect', { x, y: Y0, width: BRW, height: BRH, rx: 9 }, gn);
    rc.style.stroke = col; rc.style.strokeDasharray = '5 4';
    const t1 = mk('text', { x: x + 11, y: Y0 + 20 }, gn);
    t1.textContent = `${k + 1} ` + (o.label.length > 15 ? o.label.slice(0, 15) + '…' : o.label);
    t1.style.fill = col; t1.style.fontWeight = 'bold';
    const t2 = mk('text', { class: 'brsub', x: x + 11, y: Y0 + 39 }, gn);
    const nb = GB.candles[k] ? GB.candles[k].length : 0;
    t2.textContent = '点击落实' + (nb ? ` · ${nb} 根` : '');
    gn.addEventListener('click', ev => { ev.stopPropagation(); gbCommit(k); });
    x += BRW + GAPX;
  });
  /* 内容宽度变化时才自动滚到最右（当前节点），不打断用户回看历史 */
  if (GBFLOW.cw !== contentW) { sc.scrollLeft = contentW; GBFLOW.cw = contentW; }
}

/* ───── 案例保存 ───── */
function loadCases() { try { S.cases = JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { S.cases = []; } }
function saveCases() { try { localStorage.setItem(LS, JSON.stringify(S.cases)); } catch (e) { } }
function renderCases() { $('#cases').innerHTML = S.cases.map((c, k) => `<div class="case"><a data-k="${k}">${c.name}</a><b data-d="${k}">×</b></div>`).join('') || '<div class="m">暂无</div>'; }

/* ───── 预设案例：一键加载「行情参数 + 分支路径」，并跳到关键结构 ───── */
const PRESETS = [
 { id: 'b1', name: '一买 · 标准路径', tag: '1买', tip: '17 步全用「下一笔」，默认参数。第 14 步出现面积背驰 0.64，第 17 步锚点笔稳定后记账为一买。', spec: {"amp":1.5,"lenScale":1,"factor":2,"seed":7}, seq: [['bi','up'],['bi','down'],['bi','down'],['bi','down'],['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bi','up'],['bi','down']], focus: {"kind":"1买"} },
 { id: 'b1div', name: '一买 · 背驰已现，信号未发', tag: '背驰', tip: '同一段行情停在第 14 步：背驰已经成立，但锚点笔身后还差两笔才稳定，所以还没有一买。', spec: {"amp":1.5,"lenScale":1,"factor":2,"seed":7}, seq: [['bi','up'],['bi','down'],['bi','down'],['bi','down'],['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bi','down'],['bi','down']], focus: null },
 { id: 'b1sub', name: '一买 · 次级别没确认', tag: '×10', tip: '同一段 17 步，只把次级别倍数从 ×2 调到 ×10：30 根确认窗口只覆盖 3 根本级别，等不到确认笔，一买被过滤成灰色。', spec: {"amp":1.5,"lenScale":1,"factor":10,"seed":7}, seq: [['bi','up'],['bi','down'],['bi','down'],['bi','down'],['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bi','up'],['bi','down']], focus: {"kind":"1买","why":"sublevel","ghost":true} },
 { id: 'b1warm', name: '一买 · 暖机隔离', tag: 'ghost', tip: '结构极值落在最前面 30 根里，中枢区间会随窗口漂移、不可复现，所以信号被暖机规则挡掉。', spec: {"amp":1.8,"lenScale":1.2,"factor":2,"seed":149}, seq: [['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','down'],['bi','up'],['bar','down'],['bi','up'],['bi','down'],['fx','down'],['bar','up'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','down']], focus: {"kind":"1买","why":"warmup","ghost":true} },
 { id: 's1untrad', name: '一卖 · 止损在反侧', tag: 'ghost', tip: '结构成立，但记账那根收盘已经越过 0.5×ATR 止损 —— 按可交易性丢弃。', spec: {"amp":2,"lenScale":1.1,"factor":2,"seed":33}, seq: [['bi','down'], ['bi','down'], ['bi','up'], ['bi','down'], ['bi','up'], ['bi','down'], ['bi','up'], ['bi','down'], ['bi','down'], ['bi','down'], ['bi','up'], ['bi','down'], ['bi','up'], ['bi','up'], ['bi','down'], ['bi','up'], ['fx','down'], ['bar','down'], ['bar','up'], ['bi','up']], focus: {"kind":"1卖","why":"untradable","ghost":true} },
 { id: 'b2', name: '二买 · 回抽不破前低', tag: '2买', tip: '先出一买，随后回抽没有跌破一买的低点，二买在同一价位确认。', spec: {"amp":1.2,"lenScale":1.1,"factor":2,"seed":18}, seq: [['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','down'],['bi','down'],['fx','down'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bar','down'],['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','down']], focus: {"kind":"2买"} },
 { id: 'b3', name: '三买 · 突破中枢回抽', tag: '3买', tip: '向上离开中枢后的回抽没有回到中枢区间里，形成三买。', spec: {"amp":2.2,"lenScale":1,"factor":2,"seed":314}, seq: [['bar','down'],['fx','down'],['fx','down'],['bi','up'],['bi','up'],['bi','down'],['bi','down'],['fx','down'],['bar','down'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','down']], focus: {"kind":"3买"} },
 { id: 's3', name: '三卖 · 跌破中枢反抽', tag: '3卖', tip: '向下跌破中枢后的反抽没能回到中枢，形成三卖。', spec: {"amp":1.8,"lenScale":0.9,"factor":2,"seed":308}, seq: [['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','up'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','down'],['bi','up'],['bi','down'],['bar','down'],['bi','down'],['bar','down'],['bi','up'],['bi','down'],['bi','up']], focus: {"kind":"3卖"} },
 { id: 's1', name: '一卖 · 强背驰', tag: '1卖', tip: '上涨末段面积比只有约 0.2 的强背驰。', spec: {"amp":2,"lenScale":1.2,"factor":2,"seed":76}, seq: [['bi','down'],['bi','up'],['bi','up'],['bar','down'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bar','up'],['bi','down'],['bi','up'],['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['bi','up'],['bi','up']], focus: {"kind":"1卖"} },
 { id: 's2', name: '二卖 · 反弹不破前高', tag: '2卖', tip: '一卖之后的反弹没有创出新高，二卖确认。', spec: {"amp":1.5,"lenScale":0.9,"factor":2,"seed":370}, seq: [['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','down'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','down'],['bi','up'],['bi','down'],['bi','up'],['fx','down'],['bi','down'],['bi','down'],['bi','up'],['bar','down'],['bi','down'],['bi','up']], focus: {"kind":"2卖"} },
 { id: 'piv', name: '中枢上移', tag: '中枢', tip: '两个中枢依次抬高：103.80/98.40 → 112.42/105.32。中枢区间决定后面的类买卖点。', spec: {"amp":1.8,"lenScale":1,"factor":2,"seed":373}, seq: [['fx','down'],['bi','down'],['bi','up'],['bi','up'],['bi','up'],['bi','down'],['bi','down'],['bi','up'],['fx','up'],['bi','up'],['bi','down'],['bi','up'],['bi','up'],['bi','down'],['bi','down'],['fx','up'],['bi','up'],['bi','up'],['bi','up'],['bi','up'],['bi','down'],['bi','down']], focus: null },
 { id: 'divonly', name: '有背驰，却没有买卖点', tag: '背驰', tip: '背驰确实出现了（面积比 0.24），但它落在暖机区、且没有已稳定的锚点笔，所以既不产信号也不产 ghost。', spec: {"amp":1.5,"lenScale":0.8,"factor":2,"seed":263}, seq: [['bi','up'],['bar','down'],['bar','up'],['bi','down'],['bi','up'],['bi','down'],['bi','down'],['bi','down'],['bi','up'],['bi','up'],['bar','up'],['bi','up'],['bi','up'],['bi','down'],['bi','down'],['bar','down'],['bi','up'],['bi','up'],['bi','down'],['bi','up']], focus: null },
];
function renderPresets() {
  $('#presets').innerHTML = '<div class="plabel">预设案例 · 点一下直接加载</div>' + PRESETS.map((p, k) =>
    `<div class="pset" data-p="${k}" data-tip="${p.tip}"><span>${p.name}</span><em>${p.tag}</em></div>`).join('');
}
function applyPreset(p) {
  if (!p || !S.cs) return;
  stop(); MX.close();
  setSpec({ noise: 0, realNoise: 0, noiseType: 'uniform', shapeNoise: 0, pollute: 0, ...p.spec });
  applyOpts({ divergenceAreaRatio: 0.9, warmupBars: 30, requireSubLevelConfirm: true, subLevelConfirmWindowBars: 30 });
  setNoise(null);
  S.path = p.seq.map(([u, dir]) => ({ m: 'unit', u, dir, label: G.UNIT_OPT[u][dir] }));
  S.gbUnit = p.seq[p.seq.length - 1][0];
  S.importedRoot = null;
  gen();
  const f = p.focus;
  if (!f) return;
  const arr = f.ghost ? S.ghosts : S.signals;
  const idx = arr.findIndex(x => x.kind === f.kind && (!f.why || x.reason === f.why));
  if (idx < 0) return;
  go(Math.min(S.snaps.length - 1, arr[idx].gConfirm));
  const cs = S.cs;
  setTimeout(() => { if (S.cs === cs) openSel({ kind: 'signal', index: idx, ghost: !!f.ghost }); }, 40);
}

/* ───── 缠师金句轮播 ───── */
function initQuote() {
  const box = $('#quote'), t = $('#qtext');
  let k = Math.floor(Math.random() * QUOTES.length), timer = null;
  const paint = () => { t.textContent = '「' + QUOTES[k] + '」'; };
  const tick = () => {
    t.classList.add('fade');
    setTimeout(() => { k = (k + 1) % QUOTES.length; paint(); t.classList.remove('fade'); }, 500);
  };
  const start = () => { clearInterval(timer); timer = setInterval(tick, 9000); };
  const pause = () => { clearInterval(timer); timer = null; };
  paint(); start();
  box.addEventListener('mouseenter', pause);
  box.addEventListener('mouseleave', start);
}

/* ───── 结构稳健性（M4）：稳健度记分卡 ───── */
const rbSec = { sig: 'sec-sig', stroke: 'sec-stroke', pivot: 'sec-sig', frac: 'sec-sig' };

/* 对比页签顶部的记分卡（rob = CR.scoreCase 的结果） */
function rbScorecard(rob) {
  const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  const col = v => { const g = CR.grade(v == null ? null : v * 100); return g === 'hi' ? '#4ade80' : g === 'mid' ? '#fbbf24' : g === 'lo' ? '#f87171' : 'var(--m)'; };
  const met = [
    { id: 'sig', name: '信号存活', v: rob.sig.survival,
      tip: `基线 ${rob.sig.base} 个信号：保留 ${rob.sig.kept} · 推迟 ${rob.sig.shifted} · 破坏 ${rob.sig.dead}（被过滤或消失）· 污染额外诱发 ${rob.sig.extra} 个` },
    { id: 'stroke', name: '笔端点命中', v: rob.stroke.hitRate,
      tip: `基线 ${rob.stroke.base} 笔：端点一致 ${rob.stroke.exact} · 漂移≤3根 ${rob.stroke.drift}（均漂 ${rob.stroke.meanDrift.toFixed(1)} 根）· 错位/消失 ${rob.stroke.miss} · 碎折返 +${rob.stroke.extra}` },
    { id: 'pivot', name: '中枢重合', v: rob.pivot.score,
      tip: `基线 ${rob.pivot.base} 个中枢与污染行情 [ZD,ZG] 区间的最佳 IoU 均值；良好匹配 ${rob.pivot.matched} · 消失 ${rob.pivot.missing} · 新生 +${rob.pivot.extra}` },
    { id: 'frac', name: '分型命中', v: rob.fractal.hitRate,
      tip: `基线 ${rob.fractal.base} 个分型：命中（位移≤2根）${rob.fractal.hit} · 超位/消失 ${rob.fractal.miss} · 新增 +${rob.fractal.extra}` },
  ];
  const tg = CR.grade(rob.total);
  const bars = met.map(m => {
    const g = CR.grade(m.v == null ? null : m.v * 100);
    return `<div class="bm" data-sec="${rbSec[m.id]}" data-tip="${m.tip.replace(/"/g, '&quot;')}">`
      + `<div class="k"><span>${m.name}</span><b style="color:${col(m.v)}">${pct(m.v)}</b></div>`
      + `<div class="bar"><i class="${g || ''}" style="width:${m.v == null ? 0 : Math.round(m.v * 100)}%"></i></div></div>`;
  }).join('');
  return `<div class="rbsc">`
    + `<div class="hd"><span><b>稳健度记分卡</b> <span class="m">（截至 #${rob.i}）</span></span>`
    + `<span class="tot ${tg || ''}">${rob.total == null ? '—' : rob.total}</span>`
    + `<span class="m" style="font-size:10.5px">${rob.total == null ? '当前帧基线尚无结构结论可比' : ({ hi: '高稳健', mid: '中等', lo: '低稳健' }[tg] || '')}</span>`
    + `</div>`
    + `<div class="bars">${bars}</div>`
    + `<div class="fnote">口径：以上是<b>结构结论在污染下的存活 / 命中比例</b>，不是盈利胜率。匹配窗口：信号 ±6 根 · 笔端点 ±3 根 · 分型 ±2 根；综合总分 = 加权合成（工程约定：信号 35% / 笔 25% / 中枢 25% / 分型 15%，某项无数据时按剩余项归一）。点击指标条查看对应明细。</div>`
    + `</div>`;
}

/* ───── 触控：单指拖动 / 双指缩放（鼠标交互保持不变） ───── */
function bindTouchPanZoom(el, h) {
  let pan = null, pinch = null, multi = false;
  const pt = t => ({ x: t.clientX, y: t.clientY });
  el.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      const a = pt(e.touches[0]);
      pan = { x0: a.x, y0: a.y, moved: false }; pinch = null;
      h.start && h.start(a);
    } else if (e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1];
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1 };
      pan = null; multi = true;
      h.pinchStart && h.pinchStart();
    }
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && pan) {
      e.preventDefault();
      const t = e.touches[0], dx = t.clientX - pan.x0, dy = t.clientY - pan.y0;
      if (!pan.moved && Math.abs(dx) + Math.abs(dy) > 4) pan.moved = true;
      if (pan.moved) h.move && h.move(dx, dy);
    } else if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const a = e.touches[0], b = e.touches[1], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (d > 0) h.pinch && h.pinch(d / pinch.d, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    }
  }, { passive: false });
  const end = e => {
    if ((pan && pan.moved) || multi) { h.end && h.end(); multi = false; }
    if (!e.touches.length) { pan = null; pinch = null; }
    else if (e.touches.length === 1) {
      const t = e.touches[0];
      pan = { x0: t.clientX, y0: t.clientY, moved: false }; pinch = null;
      h.start && h.start(pt(t));
    }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

/* ───── 事件绑定 ───── */
function init() {
  initSide(); loadCases(); renderCases(); renderPresets(); initQuote();
  /* 主图颜色图例由 KLINE_COL 生成，文案与画布口径不会分叉 */
  $('#kleg').innerHTML = `<span style="color:${KLINE_COL.up}">■ 涨 / 收阳</span>　<span style="color:${KLINE_COL.down}">■ 跌 / 收阴</span>`;
  $('#csvbtn').onclick = () => $('#csvfile').click();
  $('#csvdrop').onclick = e => { if (!e.target.closest('button')) $('#csvfile').click(); };
  $('#csvfile').onchange = e => { readCsvFiles(e.target.files); e.target.value = ''; };
  {
    const dz = $('#csvdrop');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); readCsvFiles(e.dataTransfer.files); });
    const cw = $('#cvwrap');
    cw.addEventListener('dragover', e => e.preventDefault());
    cw.addEventListener('drop', e => { e.preventDefault(); readCsvFiles(e.dataTransfer.files); });
  }
  $('#dice').onclick = () => setNum('seed', Math.floor(Math.random() * 100000));
  $('#seed').addEventListener('input', () => liveApply(genKeepPos));   /* 种子即改即算，与滑杆同一套节流 */
  ['seed', 'csvmax'].forEach(id => $('#' + id).addEventListener('input', syncStepBtns));
  document.querySelectorAll('[data-step]').forEach(b => { b.onclick = () => stepNum(b.dataset.for, +b.dataset.step); });
  syncStepBtns();
  ['ntype'].forEach(id => { if ($('#' + id)) $('#' + id).onchange = genKeepPos; });
  if ($('#fac')) $('#fac').addEventListener('input', () => { sliderSync('fac'); S.yLock = null; liveApply(genKeepPos); });
  if ($('#o_sub')) $('#o_sub').onchange = () => { reanalyze(); syncParamDeps(); };
  syncParamDeps();
  /* 拖动条：generator 参数拖动即重新生成（保持回放位置），算法参数拖动即重新分析 */
  SL_GEN.forEach(id => { const el = $('#' + id); if (el) el.addEventListener('input', () => {
    sliderSync(id); syncParamDeps();
    /* 拖动开始时锁定 Y 参照系：幅度以满档探针为基准（否则自适应缩放使拖动不可见），其余参数以当前视野为基准 */
    if (!S.yLock) S.yLock = id === 'amp' ? ampProbeLock(+el.max) : (S.yRange ? S.yRange.slice() : null);
    liveApply(genKeepPos);
  }); });
  SL_ANA.forEach(id => { const el = $('#' + id); if (el) el.addEventListener('input', () => { sliderSync(id); liveApply(reanalyze); }); });
  $('#layers').onchange = e => { const k = e.target.dataset.l; if (k) { S.layers[k] = e.target.checked; draw(); } };
  $('#play').onclick = play; $('#reset').onclick = () => { stop(); go(START); };
  $('#pb').onclick = () => { stop(); step(-1); }; $('#nb').onclick = () => { stop(); step(1); };
  $('#pe').onclick = () => { stop(); prevEv(); }; $('#ne').onclick = () => { stop(); nextEv(); };
  $('#sl').oninput = e => { stop(); go(+e.target.value); };
  /* 状态面板折叠：点击标题切换（独立按钮已并入标题），状态记入 localStorage，下次打开保持 */
  $('#sttitle').onclick = () => setStFold(!$('#stbody').classList.contains('hide'), S.view === 'chart');
  $('#gbftitle').onclick = () => setGbFold(!$('#gbwrap').classList.contains('folded'), S.view === 'chart');
  /* K线图表整组折叠：标题条与状态网络 / 分支流程同级，组内主 / 次仍可各自折叠 */
  $('#klinetitle').onclick = () => setKlineFold(!$('#chartwrap').classList.contains('kfolded'), S.view === 'chart');
  S.gbUnit = gbUnitPref();
  syncGbUnitUI();
  if ($('#gbunit')) $('#gbunit').addEventListener('change', e => setGbUnit(e.target.value));
  setStFold(stFoldPref(), false);
  setKlineFold(kFoldPref(), false, false);
  /* 次级别副图折叠：点击标题条切换（与状态机面板同口径），状态记入 localStorage，下次打开保持 */
  $('#subbar').onclick = () => setSubFold(!S.subFold, true);
  setSubFold(subFoldPref(), false);
  bindSplitter();
  /* 本级别主图折叠：与次级别副图同口径；全屏里同样可折叠，把高度让给次级别 */
  $('#cvbar').onclick = () => setCvFold(!S.cvFold, true);
  setCvFold(cvFoldPref(), false);
  /* 主图全屏 */
  $('#fsbtn').onclick = () => toggleCvFs();
  syncFsBtn();
  const onFsChange = () => { syncFsBtn(); drawFsSettled(); };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (cvIsFs()) drawFsSettled(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#chartwrap').classList.contains('fs-css')) setCssFs(false); });
  $('#streset').onclick = () => { STW.vb = { x: 0, y: 0, w: ST.LAYOUT.vb[0], h: ST.LAYOUT.vb[1] }; applyStView(); };
  $('#stevrow').onclick = e => {
    const c = e.target.closest('.stev[data-f]');
    if (c) go(+c.dataset.f);
  };
  /* 结构关系地图（V0.2） */
  document.querySelectorAll('#vtabs button').forEach(b => { b.onclick = () => setView(b.dataset.v); });
  $('#rmreset').onclick = rmReset;
  $('#rmside').onclick = e => {
    const c = e.target.closest('[data-rm]');
    if (c) { RMG.sel = { type: 'node', id: c.dataset.rm }; renderMapSel(); return; }
  };
  bindStTip();   /* 状态网络详情：hover 预览 / 点击固定，事件与状态统一在 STTIP 模块内 */
  $('#spd').onchange = () => { if (S.timer) { stop(); play(); } };
  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      S.tab = t.dataset.t;
      if (S.tab === 'diff' && S.cs && S.i <= START) go(S.snaps.length - 1);
      else renderRight();
    };
  });
  $('#rbody').onclick = e => {
    const sec = e.target.closest('[data-sec]');
    if (sec) { const el = document.getElementById(sec.dataset.sec); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const ps = e.target.closest('[data-eps]');
    if (ps) { $('#eps').value = ps.dataset.eps; syncSliders(); genKeepPos(); return; }
    if (e.target.closest('[data-scan]')) { runScan(); return; }
    const se = e.target.closest('[data-seteps]');
    if (se) { $('#eps').value = se.dataset.seteps; syncSliders(); genKeepPos(); return; }
    const fc = e.target.closest('[data-focus]');
    if (fc) {
      stop();
      const targetBar = +fc.dataset.focus;
      S.focusBar = targetBar;
      if (S.i < targetBar) go(targetBar);
      else {
        if (targetBar < S.tf.left || targetBar > S.tf.left + S.vp.vis) {
          S.vp.shift = clampShift(targetBar - (S.i + 6) + Math.round(S.vp.vis / 2));
        }
        draw();
      }
      return;
    }
    const d = e.target.closest('[data-j]');
    if (d) { stop(); go(+d.dataset.j); return; }
    const o = e.target.closest('[data-open]');
    if (o) {
      const sel = o.dataset.k ? { kind: o.dataset.k, index: +o.dataset.i, ghost: o.dataset.g === '1' } : null;
      openItem(o.dataset.open, sel, S.selCtx);
    }
  };
  $('#save').onclick = () => { if (!S.cs) return; const sp = { ...S.cs.spec, seed: (+$('#seed').value) | 0 }; S.cases.unshift({ name: `${S.cs.report.name} · 种子${sp.seed}`, spec: sp, o: { ...S.o }, noise: readNoise(), path: S.importedRoot ? undefined : S.path.slice() }); S.cases = S.cases.slice(0, 30); saveCases(); renderCases(); };
  $('#pathreset').onclick = () => { if (!S.cs) return; stop(); S.path = []; rebuild(true); };
  $('#hbtn').onclick = helpOpen;
  $('#hlpclose').onclick = helpClose;
  $('#hlpbody').onclick = e => { if (e.target.id === 'retour') { helpClose(); tourStart(); } };
  $('#tournext').onclick = () => { S.tour++; showTour(); }; $('#tourskip').onclick = () => { S.tour = 99; showTour(); };
  $('#hlp').addEventListener('click', e => { if (e.target.id === 'hlp') helpClose(); });
  document.addEventListener('keydown', e => { if (!$('#hlp').hidden && e.key === 'Escape') helpClose(); });
  $('#presets').onclick = e => { const d = e.target.closest('[data-p]'); if (d) applyPreset(PRESETS[+d.dataset.p]); };
  $('#cases').onclick = e => {
    const k = e.target.dataset.k, d = e.target.dataset.d;
    if (d !== undefined) { S.cases.splice(+d, 1); saveCases(); renderCases(); return; }
    if (k !== undefined) { const c = S.cases[+k]; setSpec(c.spec); applyOpts(c.o); setNoise(c.noise || null); S.path = (c.path || []).slice(); S.importedRoot = null; gen(); }
  };
  const cv = $('#cv'), tip = $('#tip');
  cv.addEventListener('mousemove', e => {
    if (!S.cs || !S.tf) return;
    const rc = cv.getBoundingClientRect(), mx = e.clientX - rc.left, b = Math.round((mx - S.tf.padL) / S.tf.bw - 0.5 + S.tf.left);
    if (b < 0 || b > S.i) { tip.style.display = 'none'; return; }
    const c = S.cs.main[b]; tip.style.display = 'block'; tip.style.left = Math.min(rc.width - 320, mx + 12) + 'px';
    if (hasBase() && S.cs.base.main[b]) {
      const bc = S.cs.base.main[b], dc = c.close - bc.close;
      tip.textContent = `#${b}  污染 C:${fm(c.close)} (H:${fm(c.high)} L:${fm(c.low)})  |  0噪声 C:${fm(bc.close)}  偏差:${dc >= 0 ? '+' : ''}${fm(dc)}`;
    } else {
      tip.textContent = `#${b}${S.cs.imported ? '  ' + fdt(c.time) : ''}  O ${fm(c.open)}  H ${fm(c.high)}  L ${fm(c.low)}  C ${fm(c.close)}`;
    }
  });
  cv.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  /* 平移：按住画布左右拖动回看历史；位移过小仍按点击处理 */
  let drag = null;
  cv.addEventListener('mousedown', e => {
    if (!S.cs || e.button !== 0) return;
    drag = { x: e.clientX, shift: S.vp.shift, moved: false };
    cv.style.cursor = 'grabbing'; stop();
  });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 3) { drag.moved = true; tip.style.display = 'none'; }
    if (!drag.moved) return;
    S.yLock = null;
    S.vp.shift = clampShift(drag.shift - dx / (S.tf ? S.tf.bw : 1));
    draw();
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    if (drag.moved) { S.skipClick = true; setTimeout(() => { S.skipClick = false; }, 0); }
    drag = null; cv.style.cursor = 'grab';
  });
  cv.addEventListener('click', e => {
    if (S.skipClick) { S.skipClick = false; return; }
    if (!S.cs || !S.tf) return;
    const rc = cv.getBoundingClientRect();
    const sel = pick(e.clientX - rc.left, e.clientY - rc.top);
    stop();
    if (sel && sel.kind === 'gb') { gbCommit(sel.index); return; }
    if (!sel) { MX.close(); S.sel = null; S.selItem = null; S.selCtx = null; renderRight(); return; }
    openSel(sel);
  });
  cv.addEventListener('dblclick', resetView);
  MX.init();
  MX.onNav = (id, sel, c) => { S.selItem = id; S.sel = sel; S.selCtx = c; renderRight(); };
  MX.onOpen = M => {
    if (isMobile()) { $('#app').classList.add('hide-l', 'hide-r'); syncPanes(); }
    stop(); if (M.c.i !== S.i) go(M.c.i);
    if (!S.vpSaved) S.vpSaved = { ...S.vp };
    const geo = M.item.status !== 'todo' ? R.geom(M.c, M.item, M.sel) : null;
    if (geo) { const vis = Math.max(24, geo.b - geo.a + 1) + 4; S.vp.vis = vis; S.vp.shift = clampShift(geo.a - 2 + vis - (S.i + 6)); S.vp.vz = 1; S.yLock = null; }
  };
  MX.onChange = () => draw();
  MX.onClose = () => { if (S.vpSaved) { S.vp = S.vpSaved; S.vpSaved = null; } draw(); };
  /* 通用 tooltip：任何带 data-tip 的控件悬停时在光标旁显示说明 */
  const tt = $('#tt');
  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) return;
    tt.textContent = el.dataset.tip; tt.style.display = 'block';
  });
  document.addEventListener('mousemove', e => {
    if (tt.style.display !== 'block') return;
    const w = tt.offsetWidth, h = tt.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 18;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tt.style.left = x + 'px'; tt.style.top = y + 'px';
  });
  document.addEventListener('mouseout', e => {
    const to = e.relatedTarget;
    if (!to || !to.closest || !to.closest('[data-tip]')) tt.style.display = 'none';
  });
  let lastTouchAt = 0, tipTouchTimer = 0;
  document.addEventListener('mousedown', () => { if (Date.now() - lastTouchAt > 700) tt.style.display = 'none'; });
  /* 触屏没有 hover：点按带 data-tip 的控件时就地显示说明，3.2 秒后自动收起 */
  document.addEventListener('touchstart', e => {
    lastTouchAt = Date.now();
    clearTimeout(tipTouchTimer);
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tt.style.display = 'none'; return; }
    const t = e.touches[0];
    tt.textContent = el.dataset.tip; tt.style.display = 'block';
    const w = tt.offsetWidth, h = tt.offsetHeight;
    let x = t.clientX + 14, y = t.clientY + 18;
    if (x + w > window.innerWidth - 8) x = t.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = t.clientY - h - 14;
    tt.style.left = Math.max(8, x) + 'px'; tt.style.top = Math.max(8, y) + 'px';
    tipTouchTimer = setTimeout(() => { tt.style.display = 'none'; }, 3200);
  }, { passive: true });
  document.addEventListener('touchmove', () => { if (tt.style.display === 'block') tt.style.display = 'none'; }, { passive: true });
  /* 滚轮：横向缩放锚定光标下的K线；Shift+滚轮纵向缩放 */
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (!S.cs || !S.tf) return;
    S.yLock = null;
    const rc = cv.getBoundingClientRect(), mx = e.clientX - rc.left;
    const z = Math.pow(1.12, Math.max(-1.5, Math.min(1.5, e.deltaY / 100)));   // 按滚动量平滑缩放，兼容触控板
    if (e.shiftKey) {
      S.vp.vz = Math.max(0.4, Math.min(4, S.vp.vz * z));
    } else {
      const bc = S.tf.left + (mx - S.tf.padL) / S.tf.bw - 0.5;
      /* vis 保留小数：取整会让触控板的小幅滚动（每次不足半根）被丢掉，
         放大后视野很小，缩小时每一下都不足半根，看起来完全卡死 */
      const nv = Math.max(20, Math.min(600, S.vp.vis * z));
      const nBw = (rc.width - S.tf.padL - S.tf.padR) / nv;
      S.vp.vis = nv;
      S.vp.shift = clampShift(bc - ((mx - S.tf.padL) / nBw - 0.5) + nv - (S.i + 6));
    }
    draw();
  }, { passive: false });
  /* 触控：单指左右平移、双指缩放、双击复位；点按仍走 click */
  let tPanShift = 0, tPinch = null, tMoved = false, lastTap = 0, lastTapX = 0, lastTapY = 0;
  bindTouchPanZoom(cv, {
    start: () => { stop(); tPanShift = S.vp.shift; tPinch = null; tMoved = false; },
    move: dx => {
      tMoved = true;
      if (!S.cs || !S.tf) return;
      S.yLock = null;
      S.vp.shift = clampShift(tPanShift - dx / (S.tf ? S.tf.bw : 1));
      draw();
    },
    pinchStart: () => {
      tMoved = true; tPinch = null;
      if (!S.cs || !S.tf) return;
      tPinch = { vis: S.vp.vis, left: S.tf.left, bw: S.tf.bw, padL: S.tf.padL, padR: S.tf.padR, rc: cv.getBoundingClientRect() };
    },
    pinch: (scale, cx) => {
      if (!tPinch) return;
      tMoved = true;
      const mx = cx - tPinch.rc.left;
      const bc = tPinch.left + (mx - tPinch.padL) / tPinch.bw - 0.5;
      const nv = Math.max(20, Math.min(600, Math.round(tPinch.vis / scale)));
      const nBw = (tPinch.rc.width - tPinch.padL - tPinch.padR) / nv;
      S.yLock = null;
      S.vp.vis = nv;
      S.vp.shift = clampShift(bc - ((mx - tPinch.padL) / nBw - 0.5) + nv - (S.i + 6));
      draw();
    },
    end: () => { if (tMoved) { S.skipClick = true; setTimeout(() => { S.skipClick = false; }, 0); } }
  });
  cv.addEventListener('touchend', e => {
    if (tMoved || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0], now = Date.now();
    if (now - lastTap < 320 && Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY) < 30) { resetView(); lastTap = 0; }
    else { lastTap = now; lastTapX = t.clientX; lastTapY = t.clientY; }
  });
  window.addEventListener('resize', () => { applySubFrac(); draw(); });   /* 关系地图的贴合由 buildMap 内的 ResizeObserver 负责 */
  /* 左右面板折叠：让图表占据更多空间 */
  const syncPanes = () => {
    const app = $('#app'), lc = app.classList.contains('hide-l'), rc = app.classList.contains('hide-r');
    const tl = $('#tl'), tr = $('#tr');
    tl.textContent = lc ? '›' : '‹';
    tr.textContent = rc ? '‹' : '›';
    tl.dataset.tip = lc ? '展开左侧面板' : '收起左侧面板';
    tr.dataset.tip = rc ? '展开右侧面板' : '收起右侧面板';
    tl.setAttribute('aria-label', tl.dataset.tip);
    tr.setAttribute('aria-label', tr.dataset.tip);
  };
  S.syncPanes = syncPanes; syncPanes();
  $('#lclose').onclick = () => { $('#app').classList.add('hide-l'); syncPanes(); };
  $('#rclose').onclick = () => { $('#app').classList.add('hide-r'); syncPanes(); };
  $('#scrim').onclick = () => { $('#app').classList.add('hide-l', 'hide-r'); syncPanes(); };
  /* 移动端默认收起双栏；跨过断点时在「手机单列」与「桌面三栏」之间同步 */
  const applyResponsivePanes = () => {
    const app = $('#app');
    if (isMobile()) app.classList.add('hide-l', 'hide-r');
    else app.classList.remove('hide-l', 'hide-r');
    syncPanes();
  };
  applyResponsivePanes();
  const mqChange = () => { applyResponsivePanes(); draw(); };
  if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener('change', mqChange);
  else if (MOBILE_MQ.addListener) MOBILE_MQ.addListener(mqChange);
  $('#tl').addEventListener('click', () => { if ($('#app').dataset.mode === 'map') return; $('#app').classList.toggle('hide-l'); syncPanes(); });   /* 学习模式无左栏，折叠钮不生效 */
  $('#tr').addEventListener('click', () => { $('#app').classList.toggle('hide-r'); syncPanes(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (S.cs) draw(); }).observe($('#cvwrap'));
  document.addEventListener('keydown', e => {
    if (!$('#hlp').hidden || (MX.isOpen() && MX.state().mode === 'gen')) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { stop(); e.shiftKey ? nextEv() : step(1); }
    else if (e.key === 'ArrowLeft') { stop(); e.shiftKey ? prevEv() : step(-1); }
    else if (e.key === ' ') { e.preventDefault(); play(); }
    else if (e.key === 'Home') { stop(); go(START); }
    else if (e.key === '0') { resetView(); }
  });
  try { if (!localStorage.getItem('chanlab.tour')) tourStart(); } catch (e) { tourStart(); }
  gen();
}
document.addEventListener('DOMContentLoaded', init);
})();
