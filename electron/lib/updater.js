const { autoUpdater } = require("electron-updater");
const { app, dialog, shell, net } = require("electron");
const fs = require("fs");
const path = require("path");
const log = require("electron-log");

function readUpdateConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.resourcesPath, "update-config.json"), "utf8"));
  } catch {
    return {};
  }
}

// Portable / zip builds can't self-install: just check GitHub for a newer release and open the page
function setupPortableCheck(getWin, cfg) {
  const releases = `https://github.com/${cfg.owner}/${cfg.repo}/releases/latest`;
  const check = async (manual) => {
    if (!cfg.owner || !cfg.repo) {
      if (manual) dialog.showMessageBox(getWin(), { type: "info", title: "Update", message: "Update source configure nahi hai." });
      return;
    }
    try {
      const headers = { "User-Agent": "9x-Vyapari", Accept: "application/vnd.github+json" };
      if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
      const res = await net.fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/latest`, { headers });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const latest = String((await res.json()).tag_name || "").replace(/^v/, "");
      const cur = app.getVersion();
      const newer = latest && latest.localeCompare(cur, undefined, { numeric: true }) > 0;
      if (newer) {
        const { response } = await dialog.showMessageBox(getWin(), {
          type: "info", buttons: ["Download Page Kholein", "Baad Me"], defaultId: 0, cancelId: 1,
          title: "Naya version available",
          message: `9x Vyapari v${latest} available hai (aapka: v${cur}).`,
          detail: "Portable version khud update nahi hota — nayi file download karke purani ki jagah rakhein. Data folder same rahega.",
        });
        if (response === 0) shell.openExternal(releases);
      } else if (manual) {
        dialog.showMessageBox(getWin(), { type: "info", title: "Update", message: "Aap already latest version par hain." });
      }
    } catch (err) {
      log.warn("portable update check failed", err?.message);
      if (manual) dialog.showMessageBox(getWin(), { type: "warning", title: "Update", message: "Update check nahi ho paya", detail: "Internet connection check karein.\n" + String(err?.message || err) });
    }
  };
  setTimeout(() => check(false), 8000);
  return { check: () => check(true) };
}

function setupAutoUpdate(getWin, { portable } = {}) {
  const cfg = readUpdateConfig();
  if (portable) return setupPortableCheck(getWin, cfg);

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  if (cfg.private && cfg.token && cfg.owner && cfg.repo) {
    autoUpdater.setFeedURL({ provider: "github", owner: cfg.owner, repo: cfg.repo, private: true, token: cfg.token });
    log.info("Auto-update: private GitHub feed configured");
  }

  let manual = false;

  autoUpdater.on("update-available", (info) => log.info(`Update available: v${info.version}`));

  autoUpdater.on("update-not-available", () => {
    if (manual) {
      dialog.showMessageBox(getWin(), { type: "info", title: "Update", message: "Aap already latest version par hain." });
    }
    manual = false;
  });

  autoUpdater.on("update-downloaded", async (info) => {
    manual = false;
    const { response } = await dialog.showMessageBox(getWin(), {
      type: "info",
      buttons: ["Abhi Restart Karein", "Baad Me"],
      defaultId: 0,
      cancelId: 1,
      title: "Update taiyaar hai",
      message: `9x Vyapari v${info.version} download ho gaya hai.`,
      detail: "Restart karne par naya version install ho jayega. Aapka data surakshit rahega.",
    });
    if (response === 0) autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on("error", (err) => {
    log.warn("autoUpdater error", err?.message);
    if (manual) {
      dialog.showMessageBox(getWin(), {
        type: "warning", title: "Update", message: "Update check nahi ho paya",
        detail: "Internet connection check karein.\n" + String(err?.message || err),
      });
    }
    manual = false;
  });

  const check = (isManual) => {
    manual = isManual;
    autoUpdater.checkForUpdates().catch(() => {});
  };

  setTimeout(() => check(false), 8000);
  setInterval(() => check(false), 6 * 60 * 60 * 1000);

  return { check: () => check(true) };
}

module.exports = { setupAutoUpdate };
