// Pure helpers (no electron import) — build the status objects sent to the renderer over IPC

function fmtBytes(n = 0) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${Math.round(n)} B`;
}

const MESSAGES = {
  idle: () => "",
  checking: () => "Update check ho raha hai...",
  available: (s) => `Naya update available: v${s.version} — download shuru ho raha hai`,
  downloaded: (s) => `v${s.version} download ho gaya — Restart karke install karein`,
  "not-available": (s) => `Aap latest version par hain (v${s.version})`,
  "portable-available": (s) => `Naya version v${s.version} available hai — Download page kholein`,
  error: (s) => s.message || "Update check nahi ho paya",
};

function makeStatus(state, extra = {}) {
  const s = { state, manual: false, ...extra, at: Date.now() };
  if (!s.message) s.message = (MESSAGES[state] || (() => ""))(s);
  return s;
}

// electron-updater "download-progress" payload → downloading status
function progressStatus(p = {}, version = "") {
  const percent = Math.max(0, Math.min(100, Math.round(p.percent || 0)));
  const speed = p.bytesPerSecond ? ` (${fmtBytes(p.bytesPerSecond)}/s)` : "";
  return makeStatus("downloading", {
    version,
    percent,
    transferred: p.transferred || 0,
    total: p.total || 0,
    message: `v${version} download ho raha hai — ${fmtBytes(p.transferred)} / ${fmtBytes(p.total)}${speed}`,
  });
}

// Fake checking → available → progress → downloaded flow (VYAPARI_SIMULATE_UPDATE=1) for testing the UI wiring
function simulateSequence(emit, { version = "9.9.9", total = 85e6, steps = 10, stepMs = 400, manual = false, schedule = setTimeout } = {}) {
  let t = 0;
  const at = (fn, ms) => { t += ms; schedule(fn, t); };
  at(() => emit(makeStatus("checking", { manual })), 0);
  at(() => emit(makeStatus("available", { version })), 600);
  for (let i = 1; i <= steps; i++) {
    at(() => emit(progressStatus({ percent: (i / steps) * 100, transferred: (total * i) / steps, total, bytesPerSecond: 2.4e6 }, version)), stepMs);
  }
  at(() => emit(makeStatus("downloaded", { version })), stepMs);
  return t;
}

module.exports = { fmtBytes, makeStatus, progressStatus, simulateSequence };
