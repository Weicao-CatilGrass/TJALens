"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tj", {
  open: () => ipcRenderer.invoke("tja:open"),
  load: (file) => ipcRenderer.invoke("tja:load", file),
  rendered: (name) => ipcRenderer.send("tja:rendered", name),
  onUpdate: (cb) => ipcRenderer.on("tja:update", (_e, data) => cb(data)),
  onError: (cb) => ipcRenderer.on("tja:error", (_e, msg) => cb(msg)),
});
