const fs = require('node:fs');
const E = require(require('node:path').resolve(__dirname, '../../src/chan-engine.js'));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const toCandles = arr => arr.map(a => ({ time: a[0], open: +a[1], high: +a[2], low: +a[3], close: +a[4], volume: 0 }));
const r8 = x => Math.round(x * 1e8) / 1e8;
const results = input.cases.map(c => {
  const candles = toCandles(c.candles);
  const sub = c.sub ? toCandles(c.sub) : null;
  const r = E.analyze(candles, c.opts || {}, sub);
  return {
    fractals: r.fractals.map(f => ({ mergedIndex: f.mergedIndex, barIndex: f.barIndex, price: r8(f.price), isTop: f.isTop, confirmBarIndex: f.confirmBarIndex })),
    strokes: r.strokes.map(s => ({ startBarIndex: s.startBarIndex, startPrice: r8(s.startPrice), endBarIndex: s.endBarIndex, endPrice: r8(s.endPrice), isUp: s.isUp, isConfirmed: s.isConfirmed, stableFromBarIndex: s.stableFromBarIndex ?? null })),
    pivots: r.pivots.map(p => ({ zg: r8(p.zg), zd: r8(p.zd), startStrokeIndex: p.startStrokeIndex, endStrokeIndex: p.endStrokeIndex, strokeCount: p.strokeCount, isConfirmed: p.isConfirmed, leavingStrokeIndex: p.leavingStrokeIndex ?? null })),
    points: r.points.map(p => ({ kind: p.kind, side: p.side, time: p.time, price: r8(p.price), referencePrice: r8(p.referencePrice), referenceBarIndex: p.referenceBarIndex, stopPrice: r8(p.stopPrice), areaRatio: p.areaRatio == null ? null : r8(p.areaRatio) })),
  };
});
process.stdout.write(JSON.stringify(results));
