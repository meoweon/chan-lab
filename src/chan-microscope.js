/* ============================================================================
 * chan-microscope.js — 理论显微镜（M2 第六节）
 *
 * 只负责"一个结构的放大与解释"：两态（生成 / 原理）+ 独立画布。
 * 数据与知识来自 chan-rules.js；本文件不修改引擎、不判定结构。
 * ============================================================================ */
var ChanMicroscope = (function () {
'use strict';
const R = ChanRules, $ = s => document.querySelector(s);
const ST = { impl: ['源码已有', '#a3e635'], partial: ['部分实现', '#f59e0b'], todo: ['待实现', '#94a3b8'] };
const M = { item: null, sel: null, c: null, mode: 'result', step: 0, steps: [], note: '' };

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function init() {
  $('#mxclose').onclick = close;
  cardWire();
  $('#mxmodes').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  $('#mxprev').onclick = () => move(-1);
  $('#mxnext').onclick = () => move(1);
  $('#mxright').onclick = e => {
    const st = e.target.closest('[data-step]');
    if (st) { M.step = +st.dataset.step; render(); return; }
    const ch = e.target.closest('[data-id]');
    if (ch) {
      const id = ch.dataset.id, item = R.get(id);
      if (!item || !M.c) return;
      let sel = null;
      if (ch.dataset.k) sel = { kind: ch.dataset.k, index: +ch.dataset.i };
      if (ch.dataset.k === 'signal') sel = { kind: 'signal', index: +ch.dataset.i, ghost: ch.dataset.g === '1' };
      M.note = '';
      open(id, sel, M.c);
    }
  };
  document.addEventListener('keydown', e => {
    if (!M.item || $('#mx').hidden) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' && M.mode === 'gen') move(1);
    else if (e.key === 'ArrowLeft' && M.mode === 'gen') move(-1);
  });
  window.addEventListener('resize', () => { if (M.item) paint(); });
}

function open(id, sel, c, note) {
  const item = R.get(id);
  if (!item) return;
  if (c) M.c = c;
  if (!M.c) return;
  M.item = item;
  M.note = note || '';
  M.sel = R.resolveSel(M.c, item, sel || null);
  M.steps = [];
  M.step = 0;
  M.mode = item.status === 'todo' ? 'principle' : 'gen';
  if (M.mode === 'gen') { M.steps = R.steps(M.c, item, M.sel); M.step = 0; }
  $('#mx').hidden = false;
  if (typeof ChanMicroscope.onOpen === 'function') ChanMicroscope.onOpen(M);
  render();
  if (typeof ChanMicroscope.onNav === 'function') ChanMicroscope.onNav(id, M.sel, M.c, M.note);
}

function close() {
  const was = !!M.item;
  $('#mx').hidden = true; M.item = null; M.sel = null; M.steps = [];
  if (was && typeof ChanMicroscope.onClose === 'function') ChanMicroscope.onClose();
}

function setMode(m) {
  if (!M.item) return;
  if (M.item.status === 'todo' && m !== 'principle') return;
  M.mode = m;
  if (m === 'gen') { M.steps = R.steps(M.c, M.item, M.sel); M.step = Math.min(M.step, Math.max(0, M.steps.length - 1)); }
  render();
}
function move(d) {
  if (M.mode !== 'gen' || !M.steps.length) return;
  M.step = Math.max(0, Math.min(M.steps.length - 1, M.step + d));
  render();
}

/* ───────────────────────── 渲染外壳 ───────────────────────── */
function render() {
  const it = M.item; if (!it) return;
  const [bn, bc] = ST[it.status] || [it.status, '#94a3b8'];
  $('#mxname').textContent = it.name;
  $('#mxbadge').textContent = bn;
  $('#mxbadge').style.cssText = `color:${bc};border-color:${bc}66;background:${bc}14`;
  $('#mxmodes').innerHTML = [['gen', '生成'], ['principle', '原理']].map(([m, n]) =>
    `<button data-m="${m}" class="${M.mode === m ? 'on' : ''}"${it.status === 'todo' && m !== 'principle' ? ' disabled' : ''}>${n}</button>`).join('');
  if (M.mode === 'gen') renderGen();
  else renderPrinciple();
  $('#mxcap').style.display = M.mode === 'gen' ? 'flex' : 'none';
  $('#mxprev').disabled = M.step <= 0;
  $('#mxnext').disabled = M.step >= M.steps.length - 1;
  const s = M.steps[M.step];
  $('#mxstep').textContent = M.steps.length ? `${M.step + 1} / ${M.steps.length}` : '—';
  $('#mxcapt').textContent = s ? s.t : '';
  paint();
}

function renderGen() {
  const f = R.facts(M.c, M.item, M.sel);
  let h = '';
  if (M.note) h += `<div class="mxnote mxwarn">${esc(M.note)}</div>`;
  if (f.note) h += `<div class="mxnote">${esc(f.note)}</div>`;
  if (f.rows.length) h += `<div class="mxsec">结构字段</div>` + f.rows.map(([k, v]) => `<div class="mxrow"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('');
  if (!M.steps.length) {
    h += `<div class="mxnote">当前案例中没有可展示的${esc(M.item.name)}。${M.item.status === 'partial' ? '源码只实现了其中一部分，无法给出完整生成过程。' : '可以继续推进回放，或在底部流程带落实下一步路径。'}</div>` + principleHint();
    $('#mxright').innerHTML = h;
    return;
  }
  const s = M.steps[M.step];
  h += `<div class="mxstep-h">步骤 ${M.step + 1} / ${M.steps.length} · ${esc(s.t)}</div><div class="mxstep-d">${esc(s.d)}</div>`;
  h += `<div class="mxsec">全过程</div>` + M.steps.map((x, k) =>
    `<div class="mxli ${k === M.step ? 'on' : ''}" data-step="${k}"><i>${k + 1}</i><span>${esc(x.t)}</span></div>`).join('');
  h += `<div class="mxnote">每一步只增加一层结构：原始K线 → 包含合并 → 分型 → 笔 → 中枢 → 背驰/信号。未到该步骤时不会提前显示。</div>`;
  $('#mxright').innerHTML = h;
  $('#mxstep').textContent = `${M.step + 1} / ${M.steps.length}`;
  $('#mxcapt').textContent = s.t;
}

function renderPrinciple() {
  const it = M.item, [bn, bc] = ST[it.status] || [it.status, '#94a3b8'];
  let h = `<div class="mxnote" style="border-color:${bc}55;background:${bc}0d"><b>${bn}</b> · ${esc(it.brief)}</div>`;
  if (it.status === 'todo') h += `<div class="mxnote">源码没有实现该结构：本页只陈述原著概念与缺口，不展示任何计算结果，也不伪造生成过程。</div>`;
  if (it.status === 'partial') h += `<div class="mxnote">源码只实现了其中一部分：结果模式只展示源码真实产出的字段；未实现的部分会明确标注。</div>`;
  h += `<div class="mxsec">定义</div><div class="mxp">${esc(it.def)}</div>`;
  if (it.math) h += `<div class="mxsec">数学表达</div><div class="mxcode">${esc(it.math)}</div>`;
  h += list('必要条件', it.need) + list('充分条件', it.suff) + list('前置条件', it.pre) + list('排除 / 失败条件', it.drop);
  if (it.near && it.near.length) h += `<div class="mxsec">相关概念</div>` + chipsHtml(it.near.map(([id, why]) => ({ id, label: `${R.get(id) ? R.get(id).name : id} — ${why}`, sel: null })));
  if (it.counter) h += `<div class="mxsec">反例</div><div class="mxp mxwarn">${esc(it.counter)}</div>`;
  h += `<div class="mxsec">原著出处</div><div class="mxp">${esc(it.origin)}</div>`;
  h += `<div class="mxsec">对应源码</div><div class="mxrow"><b>函数</b><span>${esc(it.src)}</span></div><div class="mxrow"><b>文件</b><span>${esc(it.srcFn)}</span></div>`;
  if (it.note) h += `<div class="mxsec">实现备注 / 口径差异</div><div class="mxp">${esc(it.note)}</div>`;
  h += `<div class="mxnote">来源分级：原著 =《教你炒股票》概念；源码 = 你上传的 C# 实现；工程约定 = 为无未来函数新增的兜底。凡课次未逐条核对处均标「课次待核对」，不冒充精确引文。</div>`;
  $('#mxright').innerHTML = h;
}

function list(title, arr) {
  if (!arr || !arr.length) return '';
  return `<div class="mxsec">${title}</div><ul class="mxul">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
}
function chipsHtml(arr) {
  return `<div class="mxchips">${arr.map(c => c.sel
    ? `<a class="mxchip" data-id="${esc(c.id)}" data-k="${esc(c.sel.kind)}" data-i="${c.sel.index}" data-g="${c.sel.ghost ? 1 : 0}">${esc(c.label)}</a>`
    : `<a class="mxchip" data-id="${esc(c.id)}">${esc(c.label)}</a>`).join('')}</div>`;
}
const principleHint = () => `<div class="mxnote">切到「原理」可看定义、必要/排除条件、反例与源码映射。</div>`;

/* ─────────────────────  悬浮卡片：拖动 + 缩放  ─────────────────────
 * 标题栏拖动（关闭钮除外），右下角原生 resize 手柄缩放；位置与尺寸记入 localStorage。 */
const CARD_KEY = 'chanlab.mxcard';
function cardSave() {
  const el = $('#mx'); if (el.hidden) return;
  try { localStorage.setItem(CARD_KEY, JSON.stringify({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })); } catch (e) {}
}
function cardRestore() {
  const el = $('#mx'); let s = null;
  try { s = JSON.parse(localStorage.getItem(CARD_KEY) || 'null'); } catch (e) {}
  if (!s || !isFinite(s.l) || !isFinite(s.t) || !isFinite(s.w) || !isFinite(s.h)) return;
  const w = Math.max(280, Math.min(s.w, window.innerWidth - 24)), h = Math.max(160, Math.min(s.h, window.innerHeight - 24));
  const l = Math.min(Math.max(s.l, 80 - w), window.innerWidth - 80), t = Math.min(Math.max(s.t, 8), window.innerHeight - 60);
  el.style.right = 'auto'; el.style.bottom = 'auto';
  el.style.width = w + 'px'; el.style.height = h + 'px';
  el.style.left = Math.round(l) + 'px'; el.style.top = Math.round(t) + 'px';
}
function cardWire() {
  const el = $('#mx'), head = el.querySelector('.mxhead');
  cardRestore();
  head.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('#mxclose')) return;
    const r = el.getBoundingClientRect();
    if (!el.style.left) { el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; }
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    e.preventDefault();
    const move = ev => {
      const w = el.offsetWidth;
      el.style.left = Math.min(Math.max(ev.clientX - dx, 80 - w), window.innerWidth - 80) + 'px';
      el.style.top = Math.min(Math.max(ev.clientY - dy, 8), window.innerHeight - 40) + 'px';
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); cardSave(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  if (window.ResizeObserver) new ResizeObserver(() => { if (!el.hidden) cardSave(); }).observe(el);
  window.addEventListener('resize', cardRestore);
}

/* ───────────────────────── 画布 ───────────────────────── */
/* 显微镜不再自带画布：由 app.js 让主图按当前结果 / 步骤聚焦 */
function paint() { if (typeof ChanMicroscope.onChange === 'function') ChanMicroscope.onChange(M); }

function focusFromSel(sel) {
  if (!sel) return {};
  if (sel.kind === 'raw') return { bars: [M.c.i] };
  if (sel.kind === 'stroke') return { stroke: sel.index };
  if (sel.kind === 'fractal') return { fractal: sel.index };
  if (sel.kind === 'merged') return { merged: sel.index };
  if (sel.kind === 'pivot') return { pivot: sel.index };
  if (sel.kind === 'div') return { div: sel.index };
  if (sel.kind === 'signal') {
    const list = sel.ghost ? (M.c.cs.run.ghosts || []) : (M.c.cs.run.signals || []);
    const x = list[sel.index]; return x ? { sig: { x, ghost: !!sel.ghost } } : {};
  }
  return {};
}

return { init, open, close, isOpen: () => !!M.item && !$('#mx').hidden, state: () => M };
})();
