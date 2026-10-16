const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const log = require("electron-log");
const { startServices, stopServices } = require("./lib/services");
const { buildMenu } = require("./lib/menu");
const { setupAutoUpdate, registerUpdateIpc } = require("./lib/updater");
const { loadAppConfig, saveAppConfig } = require("./lib/config");
const { chooseDataRoot } = require("./lib/chooser");
const { registerPrintIpc } = require("./lib/printing");
const { refocus } = require("./lib/focus");

log.transports.file.level = "info";
Object.assign(console, log.functions);

if (!app.requestSingleInstanceLock()) app.quit();
registerPrintIpc();
registerUpdateIpc();

const ICON = path.join(__dirname, "build", "icon.png");
let mainWin = null;
let splash = null;
let services = null;
let updater = null;
let quitting = false;
let lastLogDir = "";

function showSplash() {
  splash = new BrowserWindow({
    width: 440, height: 280, frame: false, resizable: false, alwaysOnTop: true,
    show: false, icon: ICON, backgroundColor: "#1a1612",
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
}

function setSplashStatus(msg) {
  log.info(msg);
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript(`window.setStatus(${JSON.stringify(msg)})`).catch(() => {});
  }
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.destroy();
  splash = null;
}

async function showMain(url) {
  mainWin = new BrowserWindow({
    width: 1366, height: 820, minWidth: 1024, minHeight: 640, show: false,
    title: "9x Vyapari", icon: ICON, backgroundColor: "#f3efe6",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWin.once("ready-to-show", () => {
    closeSplash();
    mainWin.maximize();
    mainWin.show();
    refocus(mainWin);
  });
  // Native dialogs / child windows can leave inputs deaf on Windows → re-arm page focus whenever the window is focused
  mainWin.on("focus", () => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.focus(); });
  mainWin.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target) || /^(mailto|tel):/i.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  mainWin.on("closed", () => { mainWin = null; });
  await mainWin.loadURL(url);
}

ipcMain.on("app:info", (event) => {
  event.returnValue = {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    portable: !!services?.portable,
    dataDir: services?.dataDir || "",
    dosDir: services?.dosDir || "",
    backupDir: services?.backupDir || "",
  };
});

async function resolveDataRoot() {
  const appCfg = loadAppConfig();
  if (process.env.VYAPARI_DATA_DIR) return { dataRoot: process.env.VYAPARI_DATA_DIR, appCfg };
  if (!app.isPackaged) return { dataRoot: appCfg.dataRoot, appCfg };
  const chosen = await chooseDataRoot(appCfg, ICON);
  return { dataRoot: chosen, appCfg };
}

app.whenReady().then(async () => {
  try {
    const { dataRoot, appCfg } = await resolveDataRoot();
    if (!dataRoot) { quitting = true; app.quit(); return; }
    saveAppConfig(dataRoot, appCfg);
    lastLogDir = path.join(dataRoot, "logs");

    showSplash();
    services = await startServices({
      dataRoot,
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      onStatus: setSplashStatus,
    });
    services.portable = appCfg.portable;

    Menu.setApplicationMenu(buildMenu({
      getWin: () => mainWin,
      services,
      checkUpdates: () => updater?.check(),
      changeFolder: () => { app.relaunch(); app.quit(); },
    }));
    setSplashStatus("9x Vyapari khul raha hai...");
    await showMain(services.url);
    if (app.isPackaged || process.env.VYAPARI_SIMULATE_UPDATE) {
      updater = setupAutoUpdate(() => mainWin, { portable: appCfg.portable });
    }
  } catch (err) {
    log.error("Startup failed", err);
    closeSplash();
    dialog.showErrorBox(
      "9x Vyapari start nahi ho paya",
      `${err?.message || err}\n\n${logTail(services?.logDir || lastLogDir)}Log file: ${log.transports.file.getFile().path}`
    );
    quitting = true;
    stopServices(services).finally(() => app.exit(1));
  }
});

// Last lines of backend.log / backend-stdio.log so the real reason (eg. missing module) is visible in the dialog
function logTail(logDir) {
  if (!logDir) return "";
  const fs = require("fs");
  for (const name of ["backend-stdio.log", "backend.log", "mongod-stdout.log"]) {
    try {
      const file = path.join(logDir, name);
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean);
      const tail = lines.slice(-8).map((l) => l.slice(0, 220));
      if (tail.length) return `Backend log (${name}):\n${tail.join("\n")}\n\n`;
    } catch {}
  }
  return "";
}

app.on("second-instance", () => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
});

// chooser window closes before splash/main exist – only quit once the app is actually running
app.on("window-all-closed", () => { if (services || quitting) app.quit(); });
process.on("SIGTERM", () => app.quit());

app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  if (!services?.children?.length) return;
  event.preventDefault();
  stopServices(services).finally(() => app.quit());
});
