"use strict";

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { parseTJA } = require("./src/tjaParser");
const { analyze, DEFAULTS } = require("./src/metrics");

const POLL_MS = 20000;

// `--smoke`: render the first frame, print a line, then quit (for CI / checks).
const SMOKE = process.argv.includes("--smoke");

let win = null;
let currentFile = null;
let watcher = null;
let pollTimer = null;
let pushTimer = null;
let lastMtime = 0;

const settingsPath = () => path.join(app.getPath("userData"), "tjalens.json");

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(s) {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  } catch {
    /* ignore */
  }
}

function analyzeFile(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const parsed = parseTJA(raw);
  const res = analyze(parsed);
  return {
    file,
    fileName: path.basename(file),
    mtime: fs.statSync(file).mtimeMs,
    header: parsed.header,
    duration: res.duration,
    noteCount: res.noteCount,
    measureCount: res.measureCount,
    peakNPS: res.peakNPS,
    avgDensity: res.avgDensity,
    distinctPatterns: res.distinctPatterns,
    firstNoteTime: res.firstNoteTime,
    lastNoteTime: res.lastNoteTime,
    windowSec: DEFAULTS.windowSec,
    series: res.series,
    hex: res.hex,
    overall: res.overall,
    avgs: res.avgs,
    topPatterns: res.topPatterns,
  };
}

function push(file) {
  if (!file) return;
  try {
    const res = analyzeFile(file);
    lastMtime = res.mtime;
    if (win && !win.isDestroyed()) win.webContents.send("tja:update", res);
  } catch (e) {
    if (win && !win.isDestroyed())
      win.webContents.send("tja:error", (e && e.message) || String(e));
  }
}

// Coalesce bursty watch events / poll hits into a single re-analysis.
function schedulePush(file) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    push(file);
  }, 150);
}

function unwatch() {
  if (watcher) {
    try {
      watcher.close();
    } catch {
      /* ignore */
    }
    watcher = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function watch(file) {
  unwatch();
  currentFile = file;
  saveSettings({ lastFile: file });
  if (SMOKE) console.log("[watch]", file);

  try {
    lastMtime = fs.statSync(file).mtimeMs;
  } catch {
    /* ignore */
  }

  // 1) React immediately on save (fs.watch).
  try {
    watcher = fs.watch(file, () => schedulePush(file));
  } catch {
    /* ignore */
  }

  // 2) Also re-check the timestamp every 20s (catches editors without watch events).
  pollTimer = setInterval(() => {
    try {
      if (fs.statSync(file).mtimeMs !== lastMtime) schedulePush(file);
    } catch {
      /* ignore */
    }
  }, POLL_MS);

  schedulePush(file);
}

ipcMain.handle("tja:open", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Open TJA chart",
    filters: [
      { name: "TJA chart", extensions: ["tja"] },
      { name: "All files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });
  if (r.canceled || !r.filePaths.length) return null;
  const f = r.filePaths[0];
  watch(f);
  return analyzeFile(f);
});

ipcMain.handle("tja:load", (_e, f) => {
  watch(f);
  return analyzeFile(f);
});

ipcMain.on("tja:rendered", (_e, name) => {
  if (SMOKE) {
    console.log(`[smoke] rendered ok: ${name}`);
    setTimeout(() => app.quit(), 250);
  }
});

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 1000,
    backgroundColor: "#14161a",
    title: "TJALens",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  const cliFile = process.argv.find((a) => /\.tja$/i.test(a));
  if (SMOKE)
    console.log("[argv]", JSON.stringify(process.argv), "cliFile:", cliFile);

  const s = loadSettings();
  let initial = null;
  if (cliFile && fs.existsSync(cliFile)) initial = cliFile;
  else if (s.lastFile && fs.existsSync(s.lastFile)) initial = s.lastFile;
  if (initial) watch(initial);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  unwatch();
  if (process.platform !== "darwin") app.quit();
});
