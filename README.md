# TJALens

TJALens is a desktop app that visualizes the difficulty of a TJA chart in real time.

## What it does

- Watches a `.tja` file and re-analyzes it every 20 seconds and on every save.
- Plots per-time curves for density, color-switch rate, rhythm-pattern repetition,
  rhythm complexity, and a combined difficulty score.
- Draws a **global average** line and a **first-note-to-last-note average** line on each curve.
- Shows a six-axis radar: density, speed, brain-split, complexity, repetition, variation.

## Run

```bash
npm install
npm start
```

## License

MIT © 2025-2026 Weicao-CatilGrass
