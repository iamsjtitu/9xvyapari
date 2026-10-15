const { autoUpdater } = require("electron-updater");
const { app, dialog, shell, net, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const log = require("electron-log");
const { friendlyUpdateError, resolveFeed } = require("./update-messages");
const { makeStatus, progressStatus, simulateSequence } = require("./update-status");
const { refocus } = require("./focus");

// Single status hub: renderer gets live pushes ("update:status") + can pull the last one ("update:get-status")
const hub = { status: makeStatus("idle"), actions: {}, getWin: () => null };

function emit(status) {
  hub.status = status;
  log.info(`update: ${status.state} ${status.message || ""}`);
  const win = hub.getWin();
  if (win && !win.isDestroyed()) win.webContents.send("update:status", status);
}

function registerUpdateIpc() {
  ipcMain.handle("update:get-status", () => hub.status);
  ipcMain.handle("update:action", async (_e, action) => {
    const fn = hub.actions[String(action)];
    if (typeof fn === "function") await fn();
    return hub.status;
  });
}

function readUpdateConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.resourcesPath, "update-config.json"), "utf8"));
  } catch {
    return {};
  }
}

function reportError(err, cfg, manual) {
  const detail = friendlyUpdateError(err, cfg);
  emit(makeStatus("error", { manual, message: detail.split("\n")[0], detail }));
  if (manual) {
    dialog.showMessageBox(hub.getWin(), { type: "warning", title: "Update", message: "Update check nahi ho paya", detail })
      .then(() => refocus(hub.getWin()));
  }
}

// Portable / zip builds can't self-install: check GitHub for a newer release and point to the download page
function setupPortableCheck(cfg) {
  const releases = `https://github.com/${cfg.owner}/${cfg.repo}/releases/latest`;
  const check = async (manual) => {
    if (!cfg.owner || !cfg.repo) {
      if (manual) emit(makeStatus("error", { manual, message: "Update source configure nahi hai." }));
      return;
    }
    emit(makeStatus("checking", { manual }));
    try {
      const headers = { "User-Agent": "9x-Vyapari", Accept: "application/vnd.github+json" };
      if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
      const res = await net.fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/latest`, { headers });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const latest = String((await res.json()).tag_name || "").replace(/^v/, "");
      const cur = app.getVersion();
      const newer = latest && latest.localeCompare(cur, undefined, { numeric: true }) > 0;
      if (newer) emit(makeStatus("portable-available", { version: latest, releaseUrl: releases }));
      else emit(makeStatus("not-available", { version: cur, manual }));
    } catch (err) {
      log.warn("portable update check failed", err?.message);
      reportError(err, cfg, manual);
    }
  };
  hub.actions = { check: () => check(true), openRelease: () => shell.openExternal(releases) };
  setTimeout(() => check(false), 8000);
  return { check: () => check(true) };
}

function setupSimulated() {
  const run = (manual) => simulateSequence(emit, { manual });
  hub.actions = {
    check: () => run(true),
    install: () => dialog.showMessageBox(hub.getWin(), { type: "info", title: "Update (simulation)", message: "Yahan app restart hokar naya version install hota." })
      .then(() => refocus(hub.getWin())),
  };
  setTimeout(() => run(false), 3000);
  return { check: () => run(true) };
}

function setupAutoUpdate(getWin, { portable } = {}) {
  hub.getWin = getWin;
  if (process.env.VYAPARI_SIMULATE_UPDATE) return setupSimulated();
  const cfg = readUpdateConfig();
  if (portable) return setupPortableCheck(cfg);

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Private repo: a read-only token baked in at build time (UPDATE_TOKEN secret) unlocks the GitHub API feed
  const { mode, feed } = resolveFeed(cfg);
  if (feed) {
    autoUpdater.setFeedURL(feed);
    log.info("Auto-update: private GitHub feed configured");
  } else if (mode === "private-missing-token") {
    log.warn("Auto-update: repo is private but no UPDATE_TOKEN was provided at build time");
  }

  let manual = false;
  let pendingVersion = "";

  autoUpdater.on("checking-for-update", () => emit(makeStatus("checking", { manual })));
  autoUpdater.on("update-available", (info) => {
    pendingVersion = info.version;
    emit(makeStatus("available", { version: info.version }));
  });
  autoUpdater.on("download-progress", (p) => emit(progressStatus(p, pendingVersion)));
  autoUpdater.on("update-not-available", () => {
    emit(makeStatus("not-available", { version: app.getVersion(), manual }));
    manual = false;
  });
  autoUpdater.on("update-downloaded", (info) => {
    emit(makeStatus("downloaded", { version: info.version }));
    manual = false;
  });
  autoUpdater.on("error", (err) => {
    log.warn("autoUpdater error", err?.message);
    reportError(err, cfg, manual);
    manual = false;
  });

  const check = (isManual) => {
    manual = isManual;
    autoUpdater.checkForUpdates().catch(() => {});
  };
  hub.actions = { check: () => check(true), install: () => autoUpdater.quitAndInstall(false, true) };

  setTimeout(() => check(false), 8000);
  setInterval(() => check(false), 6 * 60 * 60 * 1000);

  return { check: () => check(true) };
}

module.exports = { setupAutoUpdate, registerUpdateIpc };
