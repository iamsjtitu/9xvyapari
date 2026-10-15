const { contextBridge, ipcRenderer } = require("electron");

const info = ipcRenderer.sendSync("app:info");
contextBridge.exposeInMainWorld("vyapari", {
  isDesktop: true,
  ...info,
  // Opens a PDF print-preview window (Electron has no native preview)
  printPreview: (opts) => ipcRenderer.invoke("print:preview", opts || {}),
  // Auto-update: live status pushes + last known status + actions ("check" | "install" | "openRelease")
  onUpdateStatus: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
  getUpdateStatus: () => ipcRenderer.invoke("update:get-status"),
  updateAction: (action) => ipcRenderer.invoke("update:action", String(action)),
});

// Main-process menu (Ctrl+P) asks the page to print via the same flow as the Print button
ipcRenderer.on("print:request", () => window.dispatchEvent(new CustomEvent("vyapari:print")));
