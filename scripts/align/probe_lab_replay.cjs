const fs = require('node:fs');
const E = require(require('node:path').resolve(__dirname, '../../src/chan-engine.js'));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const toCandles = arr => arr.map(a => ({ time: a[0], open: +a[1], high: +a[2], low: +a[3], close: +a[4], volume: 0 }));
const r8 = x => Math.round(x * 1e8) / 1e8;
const out = input.cases.map(c => {
  const r = E.replay(toCandles(c.candles), c.sub ? toCandles(c.sub) : null, c.opts || {});
  return r.signals.filter(s => s.gConfirm >= 699).map(s => ({ kind: s.kind, side: s.side, time: s.time, price: r8(s.price), referencePrice: r8(s.refPrice), stopPrice: r8(s.stopPrice), areaRatio: s.areaRatio == null ? null : r8(s.areaRatio) }));
});
process.stdout.write(JSON.stringify(out));
