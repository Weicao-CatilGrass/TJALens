"use strict";

Chart.defaults.color = "#c8ccd4";
Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
Chart.defaults.font.family = '"Segoe UI", system-ui, sans-serif';

const COLOR = {
  density: "#4cc2ff",
  switchRate: "#ffcc4d",
  complexity: "#ff6b6b",
  repetition: "#9b8cff",
  total: "#5ddc7a",
};
const AVG_GLOBAL = "rgba(205,210,220,0.75)";
const AVG_ACTIVE = "rgba(110,170,255,0.95)";

let charts = {};
let windowSec = 8;

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function baseLineOptions(title, yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#d6dae2",
        font: { size: 13, weight: "600" },
      },
      legend: { labels: { boxWidth: 14, boxHeight: 2, color: "#aab2c0" } },
    },
    scales: {
      x: {
        title: { display: true, text: "Time (s)", color: "#8b93a3" },
        grid: { color: "rgba(255,255,255,0.04)" },
      },
      y: {
        title: { display: true, text: yTitle, color: "#8b93a3" },
        grid: { color: "rgba(255,255,255,0.06)" },
        beginAtZero: true,
      },
    },
  };
}

function lineChart(canvasId, key, label, yTitle, data) {
  const labels = data.series.map((s) => s.t.toFixed(0));
  const vals = data.series.map((s) => +Number(s[key]).toFixed(3));
  const g = data.avgs[key].global;
  const a = data.avgs[key].active;
  const color = COLOR[key];

  return new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data: vals,
          borderColor: color,
          backgroundColor: hexA(color, 0.14),
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "Global average",
          data: labels.map(() => +g.toFixed(3)),
          borderColor: AVG_GLOBAL,
          borderDash: [6, 6],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
        {
          label: "Active-span average",
          data: labels.map(() => +a.toFixed(3)),
          borderColor: AVG_ACTIVE,
          borderDash: [3, 3],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
      ],
    },
    options: baseLineOptions(`${label} (window ${windowSec}s)`, yTitle),
  });
}

function radarChart(data) {
  const h = data.hex;
  const labels = [
    "Density",
    "Speed",
    "Brain-split",
    "Complexity",
    "Repetition",
    "Variation",
  ];
  const values = [
    h.density,
    h.speed,
    h.brainSplit,
    h.complexity,
    h.repetition,
    h.variation,
  ];
  return new Chart(document.getElementById("chartRadar"), {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: `Overall ${data.overall.toFixed(1)}`,
          data: values.map((v) => +v.toFixed(1)),
          borderColor: "#5ddc7a",
          backgroundColor: hexA("#5ddc7a", 0.22),
          pointBackgroundColor: "#5ddc7a",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: `Six-axis radar · overall ${data.overall.toFixed(1)}`,
          color: "#d6dae2",
          font: { size: 13, weight: "600" },
        },
        legend: { labels: { color: "#aab2c0" } },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 25,
            color: "#6b7382",
            backdropColor: "transparent",
          },
          grid: { color: "rgba(255,255,255,0.08)" },
          angleLines: { color: "rgba(255,255,255,0.08)" },
          pointLabels: { color: "#c8ccd4", font: { size: 12 } },
        },
      },
    },
  });
}

function destroyCharts() {
  for (const k of Object.keys(charts)) charts[k].destroy();
  charts = {};
}

function fillStats(data) {
  const h = data.header || {};
  const chips = [
    ["Title", h.TITLE || "-"],
    ["Course", `${h.COURSE || "-"} Lv ${h.LEVEL || "-"}`],
    ["Duration", `${data.duration.toFixed(1)}s`],
    ["Notes", data.noteCount],
    ["Measures", data.measureCount],
    ["Avg NPS", data.avgDensity.toFixed(2)],
    ["Peak NPS", data.peakNPS],
    ["Patterns", data.distinctPatterns],
    ["Overall", data.overall.toFixed(1)],
  ];
  document.getElementById("stats").innerHTML = chips
    .map(([k, v]) => `<span class="chip">${k}: <b>${v}</b></span>`)
    .join("");
}

function fillPatterns(data) {
  const tb = document.querySelector("#patternsTable tbody");
  tb.innerHTML = data.topPatterns
    .map(
      (p, i) =>
        `<tr><td>${i + 1}</td><td class="mono">${p.pattern}</td><td>${p.count}</td></tr>`,
    )
    .join("");
}

function render(data) {
  destroyCharts();
  windowSec = data.windowSec || 8;

  charts.total = lineChart(
    "chartTotal",
    "total",
    "Total difficulty",
    "score 0-100",
    data,
  );
  charts.density = lineChart(
    "chartDensity",
    "density",
    "Density",
    "notes/sec",
    data,
  );
  charts.switchRate = lineChart(
    "chartSwitch",
    "switchRate",
    "Switch rate (brain-split)",
    "switches/sec",
    data,
  );
  charts.complexity = lineChart(
    "chartComplexity",
    "complexity",
    "Rhythm complexity",
    "0-100",
    data,
  );
  charts.repetition = lineChart(
    "chartRepetition",
    "repetition",
    "Pattern repetition",
    "0-100",
    data,
  );
  charts.radar = radarChart(data);

  fillStats(data);
  fillPatterns(data);

  document.getElementById("fileName").textContent = data.fileName;
  if (window.tj.rendered) window.tj.rendered(data.fileName);
  setStatus(`updated ${new Date().toLocaleTimeString()}`);
}

function setStatus(text, isError) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.classList.toggle("err", !!isError);
}

document.getElementById("openBtn").addEventListener("click", async () => {
  setStatus("opening…");
  try {
    const res = await window.tj.open();
    if (res) render(res);
  } catch (e) {
    setStatus("open failed: " + e, true);
  }
});

window.tj.onUpdate((data) => render(data));
window.tj.onError((msg) => setStatus("parse error: " + msg, true));
