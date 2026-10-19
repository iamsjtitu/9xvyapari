const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chooser", {
  state: () => ipcRenderer.invoke("chooser:state"),
  browse: () => ipcRenderer.invoke("chooser:browse"),
  start: (folder) => ipcRenderer.invoke("chooser:start", folder),
  forget: (folder) => ipcRenderer.invoke("chooser:forget", folder),
});
