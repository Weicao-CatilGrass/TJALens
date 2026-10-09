'use strict';

// Parse a TJA file into absolute-time notes, honoring #BPMCHANGE and #MEASURE.
// Timing model: every measure spans its own time signature at the current BPM,
// and a note at index i of a measure with L characters lands at fraction i/L
// through that measure. #SCROLL and other cosmetic commands are ignored.

function splitHeaderValue(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  return [line.slice(0, i).trim().toUpperCase(), line.slice(i + 1).trim()];
}

function parseTJA(text) {
  const lines = String(text).split(/\r?\n/);
  const header = {};
  let bpm = 120;
  let sigNum = 4;
  let sigDen = 4;
  let inChart = false;
  const rawMeasures = [];

  for (const raw of lines) {
    const line = raw.split('//')[0].trim();
    if (line === '') continue;
    const up = line.toUpperCase();
    if (up.startsWith('#START')) { inChart = true; continue; }
    if (up.startsWith('#END')) break;

    if (!inChart) {
      const kv = splitHeaderValue(line);
      if (kv) header[kv[0]] = kv[1];
      continue;
    }

    if (line.startsWith('#')) {
      const body = line.slice(1).trim();
      const sp = body.split(/\s+/);
      const cmd = sp[0].toUpperCase();
      const val = body.slice(sp[0].length).trim();
      if (cmd === 'BPMCHANGE') {
        const v = parseFloat(val);
        if (isFinite(v) && v > 0) bpm = v;
      } else if (cmd === 'MEASURE') {
        const parts = val.split('/').map(Number);
        if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
          sigNum = parts[0];
          sigDen = parts[1];
        }
      }
      // #SCROLL / #DELAY / #GOGOSTART ... ignored for timing
      continue;
    }

    const chunks = line.split(',');
    if (chunks.length && chunks[chunks.length - 1] === '') chunks.pop();
    for (const m of chunks) rawMeasures.push({ chars: m, bpm, num: sigNum, den: sigDen });
  }

  const notes = [];
  const measures = [];
  let t = 0;

  rawMeasures.forEach((m, mi) => {
    const sec = (m.num * (4 / m.den)) * (60 / m.bpm); // measure length in seconds
    const L = m.chars.length;
    if (L > 0) {
      for (let i = 0; i < L; i++) {
        const ch = m.chars[i];
        if (ch >= '1' && ch <= '4') {
          notes.push({
            time: t + (i / L) * sec,
            color: (ch === '1' || ch === '3') ? 'D' : 'K',
            big: (ch === '3' || ch === '4'),
            measureIndex: mi,
            slot: i,
            of: L,
          });
        }
      }
    }
    measures.push({
      index: mi,
      chars: m.chars,
      start: t,
      sec,
      num: m.num,
      den: m.den,
      bpm: m.bpm,
    });
    t += sec;
  });

  notes.sort((a, b) => a.time - b.time);

  return { header, notes, measures, duration: t };
}

module.exports = { parseTJA };
