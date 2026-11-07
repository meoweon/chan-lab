/* chan-lab.html 真实噪声（realNoise / D 层）+ 同源 0 噪声基线 CDP 验收：
   0 落实一步路径（种子根只有 1 根K线，先让行情长出可比较的序列）
   1 滑杆存在且生效（画布蜡烛变化）  2 A 层互斥置灰  3 同种子确定性
   4 污染>0 自动挂载同源基线 → 对比页签 / 双屏开关可用
   5 再落实一步路径 → 基线仍随整条路径同步构造，污染冲击账单可见
   口径：场景选择器与 free 场景已随路径驱动改造移除，改由流程带虚框节点落实路径；
        哈希断言统一关闭 dual 图层，避免双屏基线与主链同时入画。
   注意：Chrome 156 下 SVGElement 无 .click()，一律 dispatchEvent；
   像素断言用蜡烛色过滤哈希（绿 #30d158 = 涨 / 红 #ff453a = 跌，兼容旧配色），不对全图做逐像素断言。 */
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(expr, timeout = 20000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await evaluate(expr)) return true; await sleep(step); }
  return false;
}
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg); if (!cond) fails++; };
const setSlider = (id, v) => `(()=>{const el=document.querySelector('#${id}');el.value=${v};el.dispatchEvent(new Event('input'));})()`;
const candleHash = `(()=>{const cv=document.querySelector('#cv'),g=cv.getContext('2d');const d=g.getImageData(0,0,cv.width,cv.height).data;let h=0,n=0;for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];if((r===255&&gg===69&&b===58)||(r===48&&gg===209&&b===88)||(r===239&&gg===68&&b===68)||(r===34&&gg===197&&b===94)){n++;h=(h*31+r+gg*7+b)&0x7fffffff;}}return {h:h,n:n};})()`;

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

  /* 0. 路径驱动：种子根只有 1 根K线，先落实一步让行情长出可比较的序列。
        哈希断言统一关闭 dual 图层，避免双屏 0 噪声基线与主链同时入画混淆哈希。 */
  await evaluate(`(()=>{const d=document.querySelector('#layers input[data-l="dual"]');if(d){d.checked=false;d.dispatchEvent(new Event('change'));}})()`);
  const commitStep = `(()=>{const n=document.querySelector('#gbsvg .brn.ghost');if(!n)return false;n.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;})()`;
  ok(await evaluate(commitStep), '流程带虚框节点可点击落实（路径驱动，无场景选择器）');
  await sleep(700);

  /* 1. 滑杆存在，默认 0 */
  ok(await evaluate(`!!document.querySelector('#rnoise') && document.querySelector('#rnoise').value === '0'`), '真实噪声滑杆存在，默认 0');

  /* 2. 归零污染 → 基线哈希 → 开真实噪声 → 哈希必须变化（噪声真实参与生成） */
  await evaluate(setSlider('noise', 0) + ';' + setSlider('shape', 0) + ';' + setSlider('pollute', 0));
  await sleep(400);
  const h0 = await evaluate(candleHash);
  await evaluate(setSlider('rnoise', 1));
  ok(await waitFor(`parseFloat(document.querySelector('#rnoise-v').textContent) === 1`, 5000, 100), '读数同步 rnoise-v=1');
  await sleep(600);
  const h1 = await evaluate(candleHash);
  ok(h1.n > 0 && h1.h !== h0.h, `真实噪声生效：蜡烛数 ${h0.n} → ${h1.n}，哈希 ${h0.h} → ${h1.h}`);

  /* 3. 互斥置灰：rnoise>0 → 路径噪声与噪声类型无效 */
  ok(await evaluate(`document.querySelector('#noise').disabled && document.querySelector('#ntype').disabled`), 'rnoise>0 时路径噪声/噪声类型置灰');
  await evaluate(setSlider('rnoise', 0));
  ok(await evaluate(`!document.querySelector('#noise').disabled`), 'rnoise=0 时路径噪声恢复可用');

  /* 4. 同种子确定性：seed 42→43→42，哈希 A===C 且 A!==B */
  await evaluate(setSlider('rnoise', 1));
  await evaluate(`(()=>{const s=document.querySelector('#seed');s.value=42;s.dispatchEvent(new Event('input'));})()`);
  await sleep(500);
  const A = await evaluate(candleHash);
  await evaluate(`(()=>{const s=document.querySelector('#seed');s.value=43;s.dispatchEvent(new Event('input'));})()`);
  await sleep(500);
  const B = await evaluate(candleHash);
  await evaluate(`(()=>{const s=document.querySelector('#seed');s.value=42;s.dispatchEvent(new Event('input'));})()`);
  await sleep(500);
  const C = await evaluate(candleHash);
  ok(A.h === C.h && A.n === C.n && (A.h !== B.h || A.n !== B.n), `同种子逐位复现（A===C，A≠B）`);
  /* 5. 污染>0 → 同源 0 噪声基线自动挂载：右栏对比页签与图层双屏开关可用 */
  ok(await evaluate(`!document.querySelector('.tab[data-t="diff"]').hidden && !!document.querySelector('#layers input[data-l="dual"]')`), '真实噪声>0 时对比页签与图层双屏开关可用');

  /* 6. 场景选择器已移除：改为再落实一步路径，验证基线随整条路径同步构造，污染冲击账单仍可用 */
  ok(await evaluate(commitStep), '可继续落实下一单位（二叉完全分类：向上 / 向下）');
  await sleep(800);
  const hPath = await evaluate(candleHash);
  ok(hPath.n > 0, `落实路径步骤后画布有蜡烛（n=${hPath.n}）`);
  ok(await evaluate(`!document.querySelector('.tab[data-t="diff"]').hidden`), '落实路径步骤后同源 0 噪声基线仍可用');
  ok(await evaluate(`(()=>{const t=document.querySelector('.tab[data-t="diff"]');t.dispatchEvent(new MouseEvent('click',{bubbles:true}));const b=document.querySelector('#rbody');return b.textContent.includes('污染冲击账单') && !b.textContent.includes('无 0 噪声基线');})()`), '对比页显示污染冲击账单（基线已随路径同步构造）');

  console.log(exceptions.length ? `\n运行时异常 ${exceptions.length} 个：${JSON.stringify(exceptions[0]).slice(0, 300)}` : '');
  console.log(fails || exceptions.length ? '存在失败项' : '\n真实噪声 CDP 验收全部通过');
  process.exit(fails || exceptions.length ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
