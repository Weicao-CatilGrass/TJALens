"use strict";

// Difficulty metrics over a sliding time window.
//
// Curves (per window):
//   density     - notes per second
//   switchRate  - Don<->Ka color changes per second ("brain split")
//   complexity  - average deviation from the 2/4/8/16 note grid (syncopation)
//   repetition  - how often this window's rhythm patterns repeat chart-wide
//   total       - weighted difficulty score (0..100)
//
// Every curve also gets an average-line pair:
//   global - mean over the whole file
//   active - mean over the [first note .. last note] span

const DEFAULTS = { windowSec: 8, stepSec: 4 };

const clamp100 = (x) => Math.max(0, Math.min(100, x));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const nearInt = (x, eps = 1e-6) => Math.abs(x - Math.round(x)) < eps;

// Normalize a measure to a 16-slot presence pattern (for repetition counting).
function measurePattern(measure) {
  const L = measure.chars.length;
  if (L === 0) return null;
  const grid = new Array(16).fill("0");
  let any = false;
  for (let i = 0; i < L; i++) {
    const ch = measure.chars[i];
    if (ch >= "1" && ch <= "4") {
      const slot = Math.round((i / L) * 16) % 16;
      grid[slot] = "1";
      any = true;
    }
  }
  return any ? grid.join("") : null;
}

// 0 = sits on a quarter (4分) grid or coarser, 0.5 = 8分 only,
// 1 = 16分 / finer / irregular (syncopated).
function noteComplexity(note, measure) {
  const L = measure.chars.length || 1;
  const qlen = measure.num * (4 / measure.den); // measure length in quarter notes
  const q = (note.slot / L) * qlen;
  if (nearInt(q)) return 0;
  if (nearInt(q * 2)) return 0.5;
  return 1;
}

function analyze(parsed, opts = {}) {
  const { windowSec, stepSec } = { ...DEFAULTS, ...opts };
  const notes = parsed.notes || [];
  const measures = parsed.measures || [];
  const duration = parsed.duration || 0;

  // ---- global pattern statistics ------------------------------------------
  const patternCounts = new Map();
  const measurePatterns = measures.map((m) => measurePattern(m));
  let patternTotal = 0;
  for (const p of measurePatterns) {
    if (p) {
      patternCounts.set(p, (patternCounts.get(p) || 0) + 1);
      patternTotal++;
    }
  }
  const patternTotalSafe = patternTotal || 1;
  const distinctSafe = patternCounts.size || 1;
  let maxCount = 1;
  for (const c of patternCounts.values()) if (c > maxCount) maxCount = c;
  // Per-measure repetition weight: most-used pattern -> 1, unique pattern -> 0.
  const measureRep = measurePatterns.map((p) =>
    p ? ((patternCounts.get(p) || 1) - 1) / Math.max(1, maxCount - 1) : 0,
  );

  // ---- per-note complexity + switch times ---------------------------------
  const comps = notes.map((n) =>
    noteComplexity(
      n,
      measures[n.measureIndex] || { num: 4, den: 4, chars: "" },
    ),
  );
  const switchTimes = [];
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].color !== notes[i - 1].color) switchTimes.push(notes[i].time);
  }

  const firstNoteTime = notes.length ? notes[0].time : 0;
  const lastNoteTime = notes.length ? notes[notes.length - 1].time : duration;

  // ---- sliding windows -----------------------------------------------------
  const series = [];
  const winCount = Math.max(1, Math.ceil(duration / stepSec));
  for (let w = 0; w < winCount; w++) {
    const start = w * stepSec;
    const end = start + windowSec;
    const len = windowSec;

    let nCount = 0,
      cSum = 0;
    for (let i = 0; i < notes.length; i++) {
      const t = notes[i].time;
      if (t >= start && t < end) {
        nCount++;
        cSum += comps[i];
      }
    }
    let swCount = 0;
    for (const t of switchTimes) if (t >= start && t < end) swCount++;

    let rSum = 0,
      rCount = 0;
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i];
      if (m.start >= start && m.start < end) {
        rSum += measureRep[i];
        rCount++;
      }
    }

    const density = nCount / len;
    const switchRate = swCount / len;
    const complexity = nCount ? (cSum / nCount) * 100 : 0;
    const repetition = rCount ? (rSum / rCount) * 100 : 0;
    const total = clamp100(
      0.4 * clamp100((density / 6) * 100) +
        0.4 * clamp100((switchRate / 3) * 100) +
        0.2 * clamp100(complexity),
    );
    series.push({
      t: start,
      density,
      switchRate,
      complexity,
      repetition,
      total,
      notes: nCount,
    });
  }

  // ---- hexagon dimensions --------------------------------------------------
  const avgDensity = duration > 0 ? notes.length / duration : 0;
  let peakNPS = 0;
  for (let i = 0, j = 0; i < notes.length; i++) {
    while (notes[j].time < notes[i].time - 1) j++;
    peakNPS = Math.max(peakNPS, i - j + 1);
  }
  const avgSwitch = duration > 0 ? switchTimes.length / duration : 0;
  const avgComplexity = notes.length ? mean(comps) * 100 : 0;

  let freqSum = 0;
  for (const c of patternCounts.values()) freqSum += c;
  const distinctPatterns = patternCounts.size || 1;
  const avgRepetition = mean(measureRep) * 100;

  const dmean = mean(series.map((s) => s.density));
  const dstd = Math.sqrt(mean(series.map((s) => (s.density - dmean) ** 2)));
  const variation = dmean > 0 ? clamp100((dstd / dmean) * 100) : 0;

  const hex = {
    variation: clamp100(variation),
    speed: clamp100((peakNPS / 12) * 100),
    density: clamp100((avgDensity / 6) * 100),
    repetition: clamp100(avgRepetition),
    complexity: clamp100(avgComplexity),
    brainSplit: clamp100((avgSwitch / 3) * 100),
  };

  const overall = clamp100(
    0.3 * hex.density +
      0.25 * hex.brainSplit +
      0.2 * hex.complexity +
      0.15 * hex.speed +
      0.1 * (100 - hex.repetition),
  );

  // ---- average lines (global + active span) -------------------------------
  const keys = ["density", "switchRate", "complexity", "repetition", "total"];
  const avgs = {};
  for (const k of keys) {
    avgs[k] = {
      global: mean(series.map((s) => s[k])),
      active: mean(
        series
          .filter(
            (s) => s.t + windowSec >= firstNoteTime && s.t <= lastNoteTime,
          )
          .map((s) => s[k]),
      ),
    };
  }

  const topPatterns = [...patternCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([pattern, count]) => ({ pattern, count }));

  return {
    series,
    hex,
    overall,
    avgs,
    topPatterns,
    duration,
    noteCount: notes.length,
    measureCount: measures.length,
    firstNoteTime,
    lastNoteTime,
    peakNPS,
    avgDensity,
    distinctPatterns: patternCounts.size,
  };
}

module.exports = { analyze, DEFAULTS };
