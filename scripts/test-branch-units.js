/* 分支单位（单根K线 / 最小分型 / 最小笔）的 Node 验收：不依赖浏览器，直接跑生成器 + 引擎。
 * 运行：node scripts/test-branch-units.js */
const assert = require('assert');
const path = require('path');
const G = require(path.join(__dirname, '..', 'chan-generator.js'));
const E = require(path.join(__dirname, '..', 'chan-engine.js'));
const OPTS = { ...E.DEFAULT_OPTIONS };

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { fails++; console.error('FAIL ' + name + '\n     ' + e.message); }
}

function root(over) {
  const spec = G._norm({ scenario: 'buy1', amp: 1.5, factor: 5, seed: 7, lenScale: 1, ...over });
  const c = G._compile([{ x: 0, n: 1, fixed: true }], spec, 0);
  return { spec, main: c.main, sub: c.sub, run: E.replay(c.main, c.sub, OPTS) };
}
const lastBar = cs => cs.main.length - 1;
const lastFractal = r => r.tail.res.fractals[r.tail.res.fractals.length - 1];
const lastStroke = r => r.tail.res.strokes[r.tail.res.strokes.length - 1];

test('appendChain 追加固定根数并保留父前缀', () => {
  const p = root();
  const cs = G.appendChain(p, [{ x: 0, n: 1, fixed: true }, { x: 1, n: 1, fixed: true }], 5, 0, OPTS);
  assert.strictEqual(cs.main.length, 2);
  assert.strictEqual(cs.run.snaps.length, 2);
  assert.deepStrictEqual(cs.main[0], p.main[0]);
});

test('单根K线：恰好新增 1 根，方向如实判定', () => {
  const p = root();
  const r = G.buildUnit(p, lastBar(p), 'bar', 'up', OPTS);
  assert(r && r.formed, '应构造成功');
  assert.strictEqual(r.bars, 1);
  assert.strictEqual(r.cs.main.length, p.main.length + 1);
  const c = r.cs.main[lastBar(r.cs)];
  assert(c.close >= c.open, '向上应落阳线');
});

test('最小分型：向上恰好造出一个已确认顶分型', () => {
  const p = root();
  const r = G.buildUnit(p, lastBar(p), 'fx', 'up', OPTS);
  assert(r && r.formed, '应构造成功');
  assert.strictEqual(r.bars, 3);
  const f = lastFractal(r);
  assert(f && f.isTop, '最后一个分型应为顶');
  assert(f.confirmBarIndex + r.tail.off > lastBar(p), '分型应在分叉点之后确认');
});

test('最小分型：向下恰好造出一个已确认底分型', () => {
  const p = root();
  const r = G.buildUnit(p, lastBar(p), 'fx', 'down', OPTS);
  assert(r && r.formed, '应构造成功');
  assert.strictEqual(r.bars, 3);
  const f = lastFractal(r);
  assert(f && !f.isTop, '最后一个分型应为底');
});

test('最小笔：向上恰好形成向上笔', () => {
  const p = root();
  const r = G.buildUnit(p, lastBar(p), 'bi', 'up', OPTS);
  assert(r && r.formed, '应构造成功');
  assert.strictEqual(r.bars, 7);
  const s = lastStroke(r);
  assert(s && s.isUp, '最后一笔应为向上');
  assert(s.endBarIndex + r.tail.off > lastBar(p), '笔应在分叉点之后完成');
});

test('最小笔：向下恰好形成向下笔', () => {
  const p = root();
  const r = G.buildUnit(p, lastBar(p), 'bi', 'down', OPTS);
  assert(r && r.formed, '应构造成功');
  assert.strictEqual(r.bars, 7);
  const s = lastStroke(r);
  assert(s && !s.isUp, '最后一笔应为向下');
});

test('走势长度 × 只拉伸时间、不改变单位', () => {
  const p = root({ lenScale: 2 });
  const fx = G.buildUnit(p, lastBar(p), 'fx', 'up', OPTS);
  const bi = G.buildUnit(p, lastBar(p), 'bi', 'up', OPTS);
  assert(fx.formed && bi.formed, '拉伸后仍应构造成功');
  assert.strictEqual(fx.bars, 6);
  assert.strictEqual(bi.bars, 14);
  assert(lastFractal(fx).isTop, '拉伸后仍是顶分型');
  assert(lastStroke(bi).isUp, '拉伸后仍是向上笔');
});

test('旧存档步骤没有单位：按旧 7 根理想腿回放', () => {
  const p = root();
  const r = G.buildUnit(p, lastBar(p), 'legacy', 'up', OPTS);
  assert(r && r.formed);
  assert.strictEqual(r.bars, 6);
  assert.strictEqual(r.cs.main.length, p.main.length + 6);
});

test('按步记录：改单位不影响已落实的前一步', () => {
  const p = root();
  const a = G.buildUnit(p, lastBar(p), 'fx', 'up', OPTS);
  const b = G.buildUnit(a.cs, lastBar(a.cs), 'bar', 'down', OPTS);
  const a2 = G.buildUnit(p, lastBar(p), 'fx', 'up', OPTS);
  assert.deepStrictEqual(a.cs.main, a2.cs.main, '前一步K线不应被后一步改变');
  assert.strictEqual(b.cs.main.length, a.cs.main.length + 1);
});

test('重真实噪声下不伪造结构：照常落盘，formed 如实为布尔值', () => {
  const p = root({ realNoise: 1, seed: 7 });
  const r = G.buildUnit(p, lastBar(p), 'bi', 'up', OPTS);
  assert(r, '不应因噪声返回 null');
  assert.strictEqual(typeof r.formed, 'boolean');
  assert.strictEqual(r.bars, 7, '未达成分型/笔时落完整名义脚本，不截断');
  assert.strictEqual(r.cs.main.length, p.main.length + 7);
});

test('连续多步 × 三档单位 × 双向都可落盘', () => {
  let cs = root();
  for (let step = 0; step < 4; step++) {
    for (const u of ['bar', 'fx', 'bi']) {
      for (const dir of ['up', 'down']) {
        const r = G.buildUnit(cs, lastBar(cs), u, dir, OPTS);
        assert(r && r.bars > 0, `${u}/${dir} 第 ${step} 步应返回非空`);
        assert(r.cs.main.length > cs.main.length, '必须新增K线');
      }
    }
    const pick = G.buildUnit(cs, lastBar(cs), ['bar', 'fx', 'bi'][step % 3], step % 2 ? 'down' : 'up', OPTS);
    cs = pick.cs;
  }
});

test('污染链与 0 噪声基线按同一脚本逐根对齐', () => {
  const spec = G._norm({ scenario: 'buy1', amp: 1.5, factor: 5, seed: 7, lenScale: 1, noise: 0.6 });
  const baseSpec = { ...spec, noise: 0, realNoise: 0, shapeNoise: 0, pollute: 0 };
  const mk = sp => { const c = G._compile([{ x: 0, n: 1, fixed: true }], sp, 0); return { spec: sp, main: c.main, sub: c.sub, run: E.replay(c.main, c.sub, OPTS) }; };
  let mc = mk(spec), bc = mk(baseSpec);
  for (const [u, dir] of [['fx', 'up'], ['bar', 'down'], ['bi', 'up']]) {
    const bar = mc.main.length - 1;
    const r = G.buildUnit(mc, bar, u, dir, OPTS);
    mc = G.appendChain(mc, r.legs, spec.factor, bar, OPTS);
    bc = G.appendChain(bc, r.legs, baseSpec.factor, bc.main.length - 1, OPTS);
    assert.strictEqual(mc.main.length, bc.main.length, `${u} 后两链K线数应一致`);
    assert.strictEqual(mc.run.snaps.length, bc.run.snaps.length, `${u} 后两链快照数应一致`);
  }
});

test('预览与落实是同一个纯构造：同输入逐根一致', () => {
  const p = root({ realNoise: 1, seed: 42 });
  for (const u of ['bar', 'fx', 'bi']) for (const dir of ['up', 'down']) {
    const a = G.buildUnit(p, lastBar(p), u, dir, OPTS);
    const b = G.buildUnit(p, lastBar(p), u, dir, OPTS);
    assert.deepStrictEqual(a.cs.main, b.cs.main, `${u}/${dir} 预览应与落实一致`);
    assert.strictEqual(a.formed, b.formed);
  }
});

if (fails) { console.error(`\n${fails} 项失败`); process.exit(1); }
console.log('\n全部通过');
