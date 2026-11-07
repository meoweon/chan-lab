/* chan-robust.js 冒烟测试：零污染自检 / 确定性 / 评分口径 */
const CR = require('../chan-robust.js');
const G = require('../chan-generator.js');
const E = require('../chan-engine.js');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg); if (!cond) fails++; };
const opts = { ...E.DEFAULT_OPTIONS };

/* 1. 基线案例（buy1，无污染）与自身对比：应满分（不假装有差异） */
const base = G.generate({ scenario: 'buy1', seed: 7, p0: 100 }, opts);
const self = CR.scoreCase(base, base);
ok(self.sig.survival === null || self.sig.survival === 1, `零噪声自身对比：信号存活=${self.sig.survival}`);
ok(self.stroke.hitRate === null || self.stroke.hitRate === 1, `零噪声自身对比：笔命中=${self.stroke.hitRate}`);
ok(self.pivot.score === null || Math.abs(self.pivot.score - 1) < 1e-9, `零噪声自身对比：中枢IoU=${self.pivot.score}`);
ok(self.total === null || self.total === 100, `零噪声自身对比：总分=${self.total}`);

/* 2. 受污染案例 vs generate 附带的基线：指标在 [0,1]，总分整数 */
const noisy = G.generate({ scenario: 'buy1', seed: 7, noise: 0.8, noiseType: 'ou', shapeNoise: 0.5, pollute: 0.6, p0: 100 }, opts);
ok(!!noisy.base, '污染案例已挂载 0 噪声基线');
ok(noisy.base.main.length === noisy.main.length, `1:1 对齐 ${noisy.base.main.length} === ${noisy.main.length}`);
const sc = CR.scoreCase(noisy.base, noisy);
const in01 = v => v == null || (v >= 0 && v <= 1);
ok(in01(sc.sig.survival) && in01(sc.stroke.hitRate) && in01(sc.pivot.score) && in01(sc.fractal.hitRate), '各指标均在 [0,1] 或 null');
ok(sc.total == null || (Number.isInteger(sc.total) && sc.total >= 0 && sc.total <= 100), `总分=${sc.total}（整数且在 0..100）`);

/* 3. 确定性：同参数重跑一致 */
const noisy2 = G.generate({ scenario: 'buy1', seed: 7, noise: 0.8, noiseType: 'ou', shapeNoise: 0.5, pollute: 0.6, p0: 100 }, opts);
const sc2 = CR.scoreCase(noisy2.base, noisy2);
ok(JSON.stringify(sc.sig) === JSON.stringify(sc2.sig) && sc.total === sc2.total, '同参数同种子评分逐位一致');

/* 4. 污染加重 → 输出供人工核对（存活率总体应下降） */
const harder = G.generate({ scenario: 'buy1', seed: 7, noise: 2.4, noiseType: 'ou', shapeNoise: 1.5, pollute: 1.8, p0: 100 }, opts);
const sc3 = CR.scoreCase(harder.base, harder);
console.log(`  INFO 轻污染: sig=${sc.sig.survival} stroke=${sc.stroke.hitRate} total=${sc.total}`);
console.log(`  INFO 重污染: sig=${sc3.sig.survival} stroke=${sc3.stroke.hitRate} total=${sc3.total}`);
ok(sc3.total < sc.total, `污染加重总分下降：${sc.total} → ${sc3.total}`);

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
