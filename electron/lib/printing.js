const { BrowserWindow, app, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const log = require("electron-log");
const { refocus } = require("./focus");

const safeName = (s) => String(s || "").replace(/[\\/:*?"<>|\n\r\t]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "Print";

// Electron has no built-in print preview: render the page to PDF and show it in Chromium's PDF viewer
async function openPrintPreview(webContents, { landscape = false, title = "Print", filename = "" } = {}) {
  const pdf = await webContents.printToPDF({
    printBackground: true,
    landscape,
    pageSize: "A4",
    preferCSSPageSize: true,
  });
  // own folder per preview → the PDF viewer's "Save" offers "<Party / Account name>.pdf", not print-<timestamp>.pdf
  const dir = path.join(app.getPath("temp"), "9x-vyapari-print", String(Date.now()));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${safeName(filename || title)}.pdf`);
  fs.writeFileSync(file, pdf);

  const parent = BrowserWindow.fromWebContents(webContents);
  const win = new BrowserWindow({
    width: 1100, height: 850, parent: parent || undefined, title: `${safeName(filename || title)} – Print Preview`,
    autoHideMenuBar: true, backgroundColor: "#525659",
    webPreferences: { plugins: true, contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.on("closed", () => {
    fs.rm(dir, { recursive: true, force: true }, () => {});
    refocus(parent);  // give keyboard focus back to the app page
  });
  await win.loadURL(`file://${file}#toolbar=1&view=FitH`);
  log.info(`Print preview opened (${landscape ? "landscape" : "portrait"}): ${file}`);
  return { ok: true };
}

function registerPrintIpc() {
  ipcMain.handle("print:preview", async (event, opts) => {
    try {
      return await openPrintPreview(event.sender, opts || {});
    } catch (err) {
      log.error("print preview failed", err);
      return { ok: false, error: String(err?.message || err) };
    }
  });
}

module.exports = { openPrintPreview, registerPrintIpc };
