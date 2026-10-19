const { BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const log = require("electron-log");
const { saveAppConfig, forgetRecent, ensureWritableDir } = require("./config");

// Shows the "Data Folder chunein" window; resolves with chosen folder, or null if closed
function chooseDataRoot(appCfg, icon) {
  return new Promise((resolve) => {
    let current = appCfg.dataRoot;
    let done = false;

    const win = new BrowserWindow({
      width: 620, height: 520, resizable: false, maximizable: false, minimizable: false,
      title: "9x Vyapari – Data Folder", icon, backgroundColor: "#1a1612", show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "..", "chooser-preload.js"),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      },
    });

    const finish = (value) => {
      if (done) return;
      done = true;
      ipcMain.removeHandler("chooser:state");
      ipcMain.removeHandler("chooser:browse");
      ipcMain.removeHandler("chooser:start");
      ipcMain.removeHandler("chooser:forget");
      if (!win.isDestroyed()) win.destroy();
      resolve(value);
    };

    ipcMain.handle("chooser:state", () => ({ current, recent: appCfg.recent, portable: appCfg.portable }));

    ipcMain.handle("chooser:browse", async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: "Data Folder chunein",
        defaultPath: current,
        buttonLabel: "Yeh Folder Chunein",
        properties: ["openDirectory", "createDirectory", "promptToCreate"],
      });
      if (canceled || !filePaths[0]) return null;
      current = filePaths[0];
      return current;
    });

    ipcMain.handle("chooser:forget", (_e, folder) => {
      const next = forgetRecent(folder, appCfg);
      appCfg.recent = next.recent;
      appCfg.dataRoot = next.dataRoot;
      if (current === folder) current = next.dataRoot;
      log.info(`Recent folder removed from list (data untouched) → ${folder}`);
      return { current, recent: appCfg.recent, portable: appCfg.portable };
    });

    ipcMain.handle("chooser:start", (_e, chosen) => {
      try {
        ensureWritableDir(chosen);
      } catch (err) {
        return { ok: false, error: `Is folder me likh nahi sakte: ${err.message}` };
      }
      saveAppConfig(chosen, appCfg);
      log.info(`Data folder → ${chosen}`);
      finish(chosen);
      return { ok: true };
    });

    win.on("closed", () => finish(null));
    win.loadFile(path.join(__dirname, "..", "chooser.html"));
    win.once("ready-to-show", () => win.show());
  });
}

module.exports = { chooseDataRoot };
