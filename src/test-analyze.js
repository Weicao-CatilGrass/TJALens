'use strict';

// CLI sanity check: node src/test-analyze.js "D:/path/to/file.tja"
const fs = require('fs');
const { parseTJA } = require('./tjaParser');
const { analyze } = require('./metrics');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node src/test-analyze.js "<path to .tja>"');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const parsed = parseTJA(raw);
const res = analyze(parsed);

console.log('file        :', file);
console.log('title/course:', parsed.header.TITLE, '/', parsed.header.COURSE, 'Lv', parsed.header.LEVEL);
console.log('measures    :', res.measureCount);
console.log('notes       :', res.noteCount);
console.log('duration    :', res.duration.toFixed(2), 's');
console.log('avg NPS     :', res.avgDensity.toFixed(2), ' peak1s:', res.peakNPS);
console.log('hexagon     :', JSON.stringify(res.hex, (k, v) => (typeof v === 'number' ? +v.toFixed(1) : v)));
console.log('overall     :', res.overall.toFixed(1));
console.log('avgs        :', JSON.stringify(res.avgs, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
console.log('windows     :', res.series.length);
console.log('top patterns:');
for (const p of res.topPatterns.slice(0, 6)) console.log('   ', p.pattern, 'x', p.count);
console.log('first 3 win :', res.series.slice(0, 3).map((s) => ({
  t: s.t, den: +s.density.toFixed(2), sw: +s.switchRate.toFixed(2), cx: +s.complexity.toFixed(0), rp: +s.repetition.toFixed(0), tot: +s.total.toFixed(0),
})));
