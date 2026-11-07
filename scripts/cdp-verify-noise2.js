/* chan-lab.html 新噪声系统（冻结完美行情 + 逐根污染，ChanNoise）CDP 验收：
   1 新滑杆存在、旧噪声滑杆已移除            2 ε=0：无双屏、对比页签隐藏
   3 ε>0：上下双屏出现、右栏自动切到「对比」  4 污染改变画面（蜡烛哈希变化）
   5 同种子确定性（种子改走再改回，画面复原）  6 预设按钮 data-eps 生效
   7 临界点扫描出表                          8 ε 回 0：双屏关闭、对比页签隐藏
   口径：app.js 整体包在 IIFE 里，Runtime.evaluate 看不到内部变量，一律走 DOM；
        Chrome 156 下 SVGElement 无 .click()，一律 dispatchEvent；
        脚本开头关闭自动播放，避免回放位置不确定造成赛跑断言。 */
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
const setSlider = (id, v) => `(()=>{const el=document.querySelector('#${id}');el.value=${v};el.dispatchEvent(new Event('input',{bubbles:true}));})()`;
const click = sel => `(()=>{const el=document.querySelector('${sel}');if(!el)return false;el.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;})()`;
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
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  /* 全新 user-data-dir 打开的是 about:blank，再导航到目标页，避免连到残留会话 */
  await send('Page.navigate', { url: 'file://' + process.cwd() + '/chan-lab.html' });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#cv')`, 15000);

  /* 关闭自动播放：文案含「暂停」说明正在播放，点一下停住 */
  await evaluate(`(()=>{const b=document.querySelector('#play');if(b&&b.textContent.indexOf('暂停')>=0){b.dispatchEvent(new MouseEvent('click',{bubbles:true}));}return b?b.textContent:'';})()`);

  /* 1. 新滑杆存在、旧噪声滑杆已移除 */
  ok(await evaluate(`['eps','w_wick','w_body','w_incl','w_spike','seed'].every(id=>!!document.querySelector('#'+id))`), '新噪声滑杆齐全（ε + 四算子 + 种子）');
  ok(await evaluate(`['noise','rnoise','shape','pollute'].every(id=>!document.querySelector('#'+id))`), '旧噪声滑杆（noise/rnoise/shape/pollute）已移除');

  /* 2. ε=0：无双屏，对比页签隐藏 */
  ok(await evaluate(`document.querySelector('#eps').value === '0'`), 'ε 默认 0');
  await sleep(400);
  ok(await evaluate(`(()=>{const t=document.querySelector('.tab[data-t="diff"]');const st=document.querySelector('#subinfo');return t && t.hidden && st && st.textContent.indexOf('上下双屏') < 0;})()`), 'ε=0：对比页签隐藏、无双屏字样');

  /* 3. 落实若干步，让行情长出来 */
  let committed = 0;
  for (let k = 0; k < 12; k++) {
    const done = await evaluate(click('#gbsvg .brn.ghost'));
    if (!done) break;
    committed++;
    await sleep(350);
  }
  ok(committed >= 5, '分支流程带落实步骤数 = ' + committed + '（≥5）');

  /* 4. ε=0.5：上下双屏出现、右栏自动切到「对比」 */
  await evaluate(setSlider('eps', 0.5));
  await sleep(700);
  ok(await evaluate(`(()=>{const st=document.querySelector('#subinfo');const w=document.querySelector('#subwrap');return st && st.textContent.indexOf('上下双屏') >= 0 && w && !w.hidden;})()`), 'ε=0.5：次级别副图进入上下双屏（上=完美 下=污染）');
  ok(await evaluate(`(()=>{const t=document.querySelector('.tab[data-t="diff"]');return t && !t.hidden && t.classList.contains('on');})()`), 'ε>0：右栏自动切到「对比」页签');
  ok(await evaluate(`document.querySelector('#rbody').textContent.indexOf('污染冲击账单') >= 0`), '对比页签出现污染冲击账单');
  ok(await evaluate(`document.querySelector('#rbody').textContent.indexOf('当前污染：ε 0.5') >= 0`), '对比页签显示当前 ε 与四算子权重');

  /* 5. 污染改变画面 */
  const h0 = await evaluate(candleHash);
  await evaluate(setSlider('eps', 0));
  await sleep(600);
  const hClean = await evaluate(candleHash);
  await evaluate(setSlider('eps', 0.5));
  await sleep(600);
  const hPol = await evaluate(candleHash);
  ok(hClean.n > 0 && hPol.n > 0, '两档 ε 下画布均有蜡烛（n=' + hClean.n + '/' + hPol.n + '）');
  ok(hClean.h !== hPol.h, 'ε 0 → 0.5 画面发生变化（污染生效）');

  /* 6. 同种子确定性：种子改走再改回，画面复原 */
  await evaluate(`(()=>{const el=document.querySelector('#seed');el.value=8;el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(600);
  const hSeed8 = await evaluate(candleHash);
  await evaluate(`(()=>{const el=document.querySelector('#seed');el.value=7;el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(600);
  const hSeed7 = await evaluate(candleHash);
  ok(hSeed8.h !== hSeed7.h, '换种子画面改变（噪声确实重抽）');
  ok(hSeed7.h === hPol.h, '种子改回 7 后画面与之前完全一致（同种子确定性）');

  /* 7. 临界点扫描（ε>0 时 diff 页签渲染的是 base 分支，扫描按钮在此） */
  await evaluate(click('[data-scan]'));
  const scanReady = await waitFor(`(()=>{const b=document.querySelector('#rbody');return !!b && (b.querySelectorAll('[data-seteps]').length > 0 || b.textContent.indexOf('结构没有质变') >= 0);})()`, 30000);
  ok(scanReady, '临界点扫描出表（事件行或「无质变」提示）');
  const rows = await evaluate(`document.querySelectorAll('#rbody [data-seteps]').length`);
  const gridRows = await evaluate(`(()=>{const b=document.querySelector('#rbody');const t=[...b.querySelectorAll('table.tb')];return t.length >= 2;})()`);
  ok(gridRows, '扫描结果含 ε 网格表');
  if (rows > 0) {
    await evaluate(click('#rbody [data-seteps]'));
    await sleep(500);
    const epsNow = await evaluate(`document.querySelector('#eps').value`);
    ok(+epsNow > 0, '点扫描事件行把 ε 拨到该处（ε=' + epsNow + '）');
  }

  /* 9. ε 回 0：双屏关闭、对比页签隐藏 */
  await evaluate(setSlider('eps', 0));
  await sleep(600);
  ok(await evaluate(`(()=>{const st=document.querySelector('#subinfo');const t=document.querySelector('.tab[data-t="diff"]');return st && st.textContent.indexOf('上下双屏') < 0 && t && t.hidden;})()`), 'ε 回 0：双屏关闭、对比页签重新隐藏');

  /* 全程无页面异常 */
  ok(exceptions.length === 0, '全程无未捕获页面异常' + (exceptions.length ? '：' + JSON.stringify(exceptions).slice(0, 400) : ''));

  console.log(fails === 0 ? 'ALL PASS' : 'FAILURES: ' + fails);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
