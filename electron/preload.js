const { contextBridge, ipcRenderer } = require("electron");

const info = ipcRenderer.sendSync("app:info");
contextBridge.exposeInMainWorld("vyapari", { isDesktop: true, ...info });
