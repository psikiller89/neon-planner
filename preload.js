const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("planner", {
  load: () => ipcRenderer.invoke("data:load"),
  save: data => ipcRenderer.invoke("data:save", data),
  testNotify: () => ipcRenderer.invoke("notify:test"),
  setAutostart: on => ipcRenderer.invoke("autostart:set", on),
  exportData: data => ipcRenderer.invoke("data:export", data),
  importData: () => ipcRenderer.invoke("data:import"),
  onExternalChange: cb => ipcRenderer.on("data:changed", (_e, d) => cb(d))
});
