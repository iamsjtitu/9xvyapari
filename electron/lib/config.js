const { app } = require("electron");
const fs = require("fs");
const path = require("path");

// Portable (exe folder) vs installed (AppData) detection
function portableDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (!app.isPackaged || process.platform !== "win32") return null;
  const dir = path.dirname(process.execPath);
  const lower = dir.toLowerCase();
  const installed = lower.includes("\\appdata\\local\\programs\\") || lower.includes("\\program files");
  return installed ? null : dir;
}

function configFile() {
  const p = portableDir();
  return p ? path.join(p, "9x-vyapari.config.json") : path.join(app.getPath("userData"), "app-config.json");
}

function defaultDataRoot() {
  const p = portableDir();
  return p ? path.join(p, "9xVyapariData") : path.join(app.getPath("documents"), "9x Vyapari Data");
}

function loadAppConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(configFile(), "utf8")); } catch { cfg = {}; }
  return {
    dataRoot: cfg.dataRoot || defaultDataRoot(),
    recent: Array.isArray(cfg.recent) ? cfg.recent : [],
    portable: !!portableDir(),
  };
}

function saveAppConfig(dataRoot, prev) {
  const recent = [dataRoot, ...(prev?.recent || []).filter((r) => r !== dataRoot)].slice(0, 6);
  const file = configFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ dataRoot, recent }, null, 2));
  return { dataRoot, recent, portable: !!portableDir() };
}

function ensureWritableDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, ".write-test");
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
}

module.exports = { portableDir, defaultDataRoot, loadAppConfig, saveAppConfig, ensureWritableDir };
