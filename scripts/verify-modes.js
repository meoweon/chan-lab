/* 两模式并列 CDP 验收：学习 / 实验 + 分支流程带（顶层分支页已移除，流程带是唯一推演入口）
 * 惯例同 cdp-verify.js：Chrome headless 端口 9223 + Node 内置 WebSocket；
 * SVG 点击一律 dispatchEvent(MouseEvent)；跑完 pkill 残留 Chrome。 */
const PORT = 9223;
let ws, msgId = 0;
const pending = new Map();
const exceptions = [];

function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const evaluate = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(() => r(true), ms));
async function waitFor(expr, timeout = 20000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(expr)) return true;
    await sleep(step);
  }
  return false;
}
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg); if (!cond) fails++; };
const click = sel => evaluate(`(() => { const el = document.querySelector('${sel}'); if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);

(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = list.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails);
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#cv')`, 15000);
  /* 关掉自动播放：回放位置不确定会让后续断言（找到哪条可走转移）变成赛跑 */
  await evaluate(`(() => { const b = document.getElementById('play'); if (b && b.textContent.indexOf('暂停') >= 0) b.click(); return true; })()`);

  /* 1. 顶部只剩 学习/实验 两模式，二级切换 #mtabs 与分支页 DOM 均不存在 */
  ok(await evaluate(`document.querySelectorAll('#vtabs button').length === 2 && ['map','chart'].every(v => !!document.querySelector('#vtabs [data-v="'+v+'"]'))`), '顶部 学习/实验 两模式并列');
  ok(await evaluate(`!document.querySelector('#mtabs') && !document.querySelector('#vtabs [data-v="branch"]')`), '顶层「分支」按钮与二级切换已移除');
  ok(await evaluate(`!document.querySelector('#brwrap') && !document.querySelector('#brhead') && !document.querySelector('#brside') && !document.querySelector('#brg')`), '分支页 DOM（容器 / 树 / 右栏 / 保存恢复按钮）已全部移除');

  /* 2. 默认实验模式：画布 + 播放器 + 状态网络 + 分支流程带（独立框）可见；空起点 = 种子行情 + 入场步虚框 */
  ok(await evaluate(`!document.querySelector('#cvwrap').hidden && !document.querySelector('#player').hidden && document.querySelector('#mapwrap').hidden && !document.querySelector('#statewrap').hidden && !document.querySelector('#gbwrap').hidden && !!document.querySelector('#gbsvg') && document.querySelector('#gbscroll').clientHeight > 0`), '默认实验模式：画布+播放器+状态网络+流程带可见，地图隐藏');
  ok(await evaluate(`document.querySelector('#app').dataset.mode === 'chart' && document.querySelector('#gbsvg').querySelectorAll('.brn:not(.ghost)').length === 1 && document.querySelector('#gbsvg').querySelectorAll('.brn.ghost').length === 2`), '空起点：起点节点 + 恰两个方向虚框（默认最小分型的顶 / 底，二叉完全分类）');
  ok(await evaluate(`(() => { const s = document.getElementById('gbunit'); return !!s && s.options.length === 3 && s.value === 'fx'; })()`), '单位下拉三档，默认最小分型');
  ok(await evaluate(`document.querySelector('#gbsvg .brn.ghost').textContent.indexOf('下一分型') >= 0`), '默认虚框文案为「下一分型」');
  ok(await evaluate(`(() => { const t = document.getElementById('gbftitle'); t.click(); const f = document.getElementById('gbwrap').classList.contains('folded'); t.click(); return f && !document.getElementById('gbwrap').classList.contains('folded') && document.getElementById('gbscroll').clientHeight > 0; })()`), '流程带独立可折叠/展开（与状态网络同级）');
  ok(await evaluate(`!document.querySelector('#sttip-t') && document.querySelectorAll('#sthead button').length === 1`), '状态网络头部「详情」按钮已移除，仅保留「复位」');

  /* 2b. 路径构造：场景下拉已移除；点击入场步 → 路径推进，主图切换为路径构造行情 */
  ok(await evaluate(`!document.querySelector('#sc') && !document.querySelector('#scdesc')`), '场景下拉与描述已移除');
  ok(await evaluate(`(() => { const g = document.querySelector('#gbsvg .brn.ghost'); if (!g) return false; g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`) && await sleep(350), '点击「下一分型 · 顶」落实第一步');
  ok(await evaluate(`document.getElementById('cvinfo').textContent.indexOf('分支 ·') >= 0`), '主图切换为路径构造行情');
  ok(await evaluate(`document.querySelector('#gbsvg').querySelectorAll('.brn:not(.ghost)').length >= 2`), '流程带出现 起点+步骤 实心节点');

  /* 3. 学习 = 结构关系地图 */
  ok(await click('#vtabs [data-v="map"]'), '点击「学习」');
  ok(await evaluate(`!document.querySelector('#mapwrap').hidden && document.querySelector('#cvwrap').hidden && document.querySelector('#statewrap').hidden && document.querySelector('#gbwrap').hidden`), '学习：地图可见，画布/状态网络/流程带隐藏');
  ok(await evaluate(`document.querySelector('#app').dataset.mode === 'map' && document.querySelector('#left').getBoundingClientRect().width === 0 && document.querySelector('#rmg').children.length > 0`), '学习：左栏已移除，关系地图已渲染');
  ok(await evaluate(`!document.querySelector('[data-rmmx]') && !document.querySelector('#rmside button')`), '学习：右栏无「打开理论显微镜」入口');
  ok(await click('#vtabs [data-v="chart"]') && await sleep(120), '切回实验');
  ok(await evaluate(`document.querySelector('#app').dataset.mode === 'chart' && !document.querySelector('#cvwrap').hidden && !document.querySelector('#statewrap').hidden && !document.querySelector('#gbwrap').hidden`), '实验：视图状态正确恢复');

  /* 4. 图层开关：分支预览 + 双屏对比；旧对比模式按钮组已移除 */
  ok(await evaluate(`!!document.querySelector('#layers input[data-l="gb"]')`), '图层开关含「分支预览（完全分类）」');
  ok(await evaluate(`!!document.querySelector('#layers input[data-l="dual"]')`), '图层开关含「上下双屏 + 差异带」');
  ok(await evaluate(`!document.querySelector('#cmptabs') && !document.querySelector('[data-cm]')`), '同屏幽灵叠加与两处对比模式按钮组已全部移除');
  /* 4b. 数字框：原生 spinner 隐藏，改由自绘 − / + 微调；统一写入口派发 input */
  ok(await evaluate(`['csvmax','seed'].every(id => { const el = document.getElementById(id); return el && el.closest('.num') && document.querySelectorAll('.num [data-for="' + id + '"][data-step]').length === 2; })`), '两个数字框均由自绘 − / + 微调按钮包裹');
  ok(await evaluate(`(() => { const el = document.getElementById('csvmax'), before = +el.value; document.querySelector('.num [data-for="csvmax"][data-step="1"]').click(); const after = +el.value; el.value = String(before); el.dispatchEvent(new Event('input', { bubbles: true })); return after === before + 100; })()`), '点击 + 按 step 步进（csvmax 100）并已恢复原值');
  ok(await evaluate(`(() => { const el = document.getElementById('csvmax'); el.value = '150'; el.dispatchEvent(new Event('input', { bubbles: true })); const d = document.querySelector('.num [data-for="csvmax"][data-step="-1"]').disabled; el.value = '1000'; el.dispatchEvent(new Event('input', { bubbles: true })); return d && !document.querySelector('.num [data-for="csvmax"][data-step="-1"]').disabled; })()`), '到达 min / max 时对应方向按钮自动置灰');

  /* 5. 分支 = 当前单位的二叉完全分类：任何状态都恰有两个方向虚框；状态网络为纯观察（无推演按钮） */
  ok(await evaluate(`!document.querySelector('[data-stbr]')`), '状态网络已无推演按钮（纯观察视图）');
  ok(await evaluate(`document.querySelectorAll('#gbsvg .brn.ghost').length === 2`), '任何状态都恰有当前单位的两个方向虚框（互斥且完备）');
  const nA = await evaluate(`document.querySelectorAll('#gbsvg .brn:not(.ghost)').length`);
  ok(await evaluate(`(() => { const gs = document.querySelectorAll('#gbsvg .brn.ghost'); gs[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`) && await sleep(300), '点击「下一单位」虚框落实');
  ok(await evaluate(`document.querySelectorAll('#gbsvg .brn:not(.ghost)').length === ${nA + 1}`), '流程带新增一个步骤节点');
  ok(await evaluate(`document.getElementById('cvinfo').textContent.indexOf('分型') >= 0`), '主图切换为新构造行情');

  /* 6. 流程带幽灵节点点击落实（无可用转移时如实跳过，不伪造） */
  {
    const hasGhost = await evaluate(`!!document.querySelector('#gbsvg .brn.ghost')`);
    if (hasGhost) {
      const n0 = await evaluate(`document.querySelector('#gbsvg').querySelectorAll('.brn').length`);
      ok(await evaluate(`(() => { const g = document.querySelector('#gbsvg .brn.ghost'); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`) && await sleep(250), '点击流程带虚框节点落实下一层');
      ok(await evaluate(`document.querySelector('#app').dataset.mode === 'chart' && !document.querySelector('#cvwrap').hidden`), '落实后仍在实验模式，主图同步更新');
      ok(await evaluate(`document.querySelector('#gbsvg').querySelectorAll('.brn').length > ${n0}`), '流程带节点随单位序列增长');
    } else ok(true, '当前状态无可构造的下一层转移，跳过落实测试（不伪造）');
  }

  /* 6b. 点击历史实心节点 = 回退并截断到该步 */
  ok(await evaluate(`(() => { const ns = document.querySelectorAll('#gbsvg .brn:not(.ghost)'); ns[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`) && await sleep(350), '点击起点节点回退');
  ok(await evaluate(`document.getElementById('cvinfo').textContent.indexOf('路径 · 0 步') >= 0 && document.querySelector('#gbsvg').querySelectorAll('.brn:not(.ghost)').length === 1`), '回退后路径截断到起点（种子行情）');
  ok(await evaluate(`(() => { const g = document.querySelector('#gbsvg .brn.ghost'); if (!g) return false; g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`) && await sleep(350), '重新落实一笔（后续步骤在非空路径上继续）');

  /* 6c. 进度条右侧重置按钮：清空路径回到起点，可重新开始构造 */
  ok(await evaluate(`!!document.querySelector('#pathreset')`), '进度条右侧重置按钮存在');
  ok(await click('#pathreset') && await sleep(300), '点击重置按钮');
  ok(await evaluate(`document.getElementById('cvinfo').textContent.indexOf('路径 · 0 步') >= 0 && document.querySelectorAll('#gbsvg .brn:not(.ghost)').length === 1 && document.querySelectorAll('#gbsvg .brn.ghost').length === 2`), '重置后回到种子起点，可重新开始构造');

  /* 6d. 三档最小单位：切换只影响后续步骤；幽灵文案与根数随单位同步 */
  ok(await evaluate(`(() => { const s = document.getElementById('gbunit'); s.value = 'bi'; s.dispatchEvent(new Event('change', { bubbles: true })); const g = document.querySelector('#gbsvg .brn.ghost'); return !!g && g.textContent.indexOf('下一笔') >= 0 && g.textContent.indexOf('7 根') >= 0; })()`), '切到最小笔：虚框文案为「下一笔」且标 7 根');
  ok(await evaluate(`(() => { const g = document.querySelector('#gbsvg .brn.ghost'); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`) && await sleep(300), '最小笔下落实一步');
  ok(await evaluate(`document.querySelector('#gbsvg').textContent.indexOf('向上笔') >= 0`), '流程带节点标注「向上笔」');
  ok(await evaluate(`(() => { const s = document.getElementById('gbunit'); s.value = 'bar'; s.dispatchEvent(new Event('change', { bubbles: true })); const g = document.querySelector('#gbsvg .brn.ghost'); return !!g && g.textContent.indexOf('下一根') >= 0 && g.textContent.indexOf('1 根') >= 0; })()`), '切到单根K线：虚框文案为「下一根」且标 1 根');
  ok(await evaluate(`(() => { const g = document.querySelector('#gbsvg .brn.ghost'); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`) && await sleep(300), '单根K线下落实一步');
  ok(await evaluate(`/阳线|阴线/.test(document.querySelector('#gbsvg').textContent)`), '流程带节点标注阳线 / 阴线');
  ok(await evaluate(`(() => { const s = document.getElementById('gbunit'); s.value = 'fx'; s.dispatchEvent(new Event('change', { bubbles: true })); return document.querySelector('#gbsvg').textContent.indexOf('下一分型') >= 0; })()`), '切回最小分型：虚框文案同步');
  ok(await evaluate(`document.querySelector('#gbsvg').textContent.indexOf('向上笔') >= 0 && /阳线|阴线/.test(document.querySelector('#gbsvg').textContent)`), '切换单位不改写已落实步骤的单位');

  /* 7. 学习 ↔ 实验往返，运行时零异常 */
  ok(await click('#vtabs [data-v="map"]') && await click('#vtabs [data-v="chart"]') && await sleep(120), '学习↔实验往返');
  ok(await evaluate(`!document.querySelector('#cvwrap').hidden && document.querySelector('#mapwrap').hidden && document.querySelector('#app').dataset.mode === 'chart'`), '往返后实验模式视图状态正确');
  ok(exceptions.length === 0, '全程运行时零异常' + (exceptions.length ? '：' + JSON.stringify(exceptions).slice(0, 300) : ''));

  console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('脚本异常:', e.message); process.exit(2); });
