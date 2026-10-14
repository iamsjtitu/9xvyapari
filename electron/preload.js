const { contextBridge, ipcRenderer } = require("electron");

const info = ipcRenderer.sendSync("app:info");
contextBridge.exposeInMainWorld("vyapari", {
  isDesktop: true,
  ...info,
  // Opens a PDF print-preview window (Electron has no native preview)
  printPreview: (opts) => ipcRenderer.invoke("print:preview", opts || {}),
});

// Main-process menu (Ctrl+P) asks the page to print via the same flow as the Print button
ipcRenderer.on("print:request", () => window.dispatchEvent(new CustomEvent("vyapari:print")));
