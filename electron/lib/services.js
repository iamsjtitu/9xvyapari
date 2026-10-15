const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const log = require("electron-log");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXE = process.platform === "win32" ? ".exe" : "";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function tryConnect(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
  });
}

function httpGet(url, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers, timeout: 3000 }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

function exitPromise(child, name) {
  return new Promise((_, reject) => {
    child.once("exit", (code) => reject(new Error(`${name} band ho gaya (exit code ${code}). Logs folder dekhein.`)));
    child.once("error", (err) => reject(new Error(`${name} start nahi hua: ${err.message}`)));
  });
}

async function waitFor(checkFn, child, name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const exited = exitPromise(child, name);
  while (Date.now() < deadline) {
    const ok = await Promise.race([checkFn(), exited]);
    if (ok) return;
    await sleep(400);
  }
  throw new Error(`${name} ${timeoutMs / 1000}s me start nahi hua.`);
}

function loadConfig(userData) {
  const file = path.join(userData, "config.json");
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); } catch { cfg = {}; }
  // admin_password is never persisted: the backend seeds "admin123" once and forces a change at first login
  const next = {
    jwt_secret: cfg.jwt_secret || crypto.randomBytes(32).toString("hex"),
    admin_username: cfg.admin_username || "admin",
    db_name: cfg.db_name || "vyapari",
  };
  fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
  return next;
}

function spawnLogged(name, exe, args, opts, logFile) {
  if (!fs.existsSync(exe)) throw new Error(`${name} file nahi mili: ${exe}`);
  const out = fs.openSync(logFile, "a");
  const child = spawn(exe, args, { ...opts, stdio: ["ignore", out, out], windowsHide: true });
  child.on("exit", (code) => log.info(`${name} exited with code ${code}`));
  return child;
}

async function startServices({ dataRoot, resourcesPath, isPackaged, onStatus }) {
  const mongoDir = path.join(dataRoot, "mongo");
  const logDir = path.join(dataRoot, "logs");
  const dosDir = path.join(dataRoot, "dos_backup");
  const backupDir = path.join(dataRoot, "backups");
  for (const d of [mongoDir, logDir, dosDir, backupDir]) fs.mkdirSync(d, { recursive: true });
  log.transports.file.resolvePathFn = () => path.join(logDir, "main.log");

  const base = { dataDir: dataRoot, dosDir, logDir, backupDir };
  if (!isPackaged) {
    const url = process.env.VYAPARI_DEV_URL || "http://localhost:3000";
    log.info(`Dev mode → ${url}`);
    return { ...base, url, children: [] };
  }

  const cfg = loadConfig(dataRoot);
  const desktopToken = crypto.randomBytes(16).toString("hex");
  const mongoPort = await freePort();
  const apiPort = await freePort();

  onStatus("Database start ho raha hai...");
  const mongod = spawnLogged(
    "MongoDB",
    path.join(resourcesPath, "mongodb", `mongod${EXE}`),
    ["--dbpath", mongoDir, "--port", String(mongoPort), "--bind_ip", "127.0.0.1",
     "--logpath", path.join(logDir, "mongod.log"), "--logappend"],
    { cwd: path.join(resourcesPath, "mongodb") },
    path.join(logDir, "mongod-stdout.log")
  );
  await waitFor(() => tryConnect(mongoPort), mongod, "MongoDB", 90000);

  onStatus("Hisab engine start ho raha hai...");
  const backendDir = path.join(resourcesPath, "backend");
  const url = `http://127.0.0.1:${apiPort}`;
  const env = {
    ...process.env,
    MONGO_URL: `mongodb://127.0.0.1:${mongoPort}`,
    DB_NAME: cfg.db_name,
    JWT_SECRET: cfg.jwt_secret,
    ADMIN_USERNAME: cfg.admin_username,
    PORT: String(apiPort),
    HOST: "127.0.0.1",
    CORS_ORIGINS: url,
    FRONTEND_URL: url,
    FRONTEND_DIST: path.join(resourcesPath, "frontend"),
    DOS_BACKUP_DIR: dosDir,
    BACKUP_DIR: backupDir,
    VYAPARI_LOG_DIR: logDir,
    DESKTOP_TOKEN: desktopToken,
    VYAPARI_PARENT_PID: String(process.pid),
    PYTHONUNBUFFERED: "1",
  };
  const backend = spawnLogged(
    "Backend",
    path.join(backendDir, `vyapari-backend${EXE}`),
    [],
    { cwd: backendDir, env },
    path.join(logDir, "backend.log")
  );
  await waitFor(
    () => httpGet(`${url}/api/`).then((s) => s === 200).catch(() => false),
    backend, "Backend", 90000
  );

  log.info(`Services ready → ${url} (mongo :${mongoPort})`);
  return { ...base, url, desktopToken, children: [backend, mongod], backend, mongod };
}

async function stopServices(services) {
  if (!services?.children?.length) return;
  const { url, desktopToken, backend, mongod } = services;
  try {
    // graceful MongoDB shutdown via backend, then wait for mongod to exit
    const mongoExit = new Promise((r) => { mongod.exitCode === null ? mongod.once("exit", r) : r(); });
    await httpGet(`${url}/api/desktop/shutdown`, { "x-desktop-token": desktopToken }, "POST").catch(() => {});
    await Promise.race([mongoExit, sleep(8000)]);
  } catch (e) {
    log.warn("graceful shutdown failed", e?.message);
  }
  for (const child of [backend, mongod]) {
    try { if (child.exitCode === null) child.kill(); } catch {}
  }
}

module.exports = { startServices, stopServices };
