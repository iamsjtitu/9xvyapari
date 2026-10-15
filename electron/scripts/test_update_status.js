// node scripts/test_update_status.js — unit tests for update-status (no Electron needed)
const assert = require("assert");
const { fmtBytes, makeStatus, progressStatus, simulateSequence } = require("../lib/update-status");

assert.strictEqual(fmtBytes(512), "512 B");
assert.strictEqual(fmtBytes(84_300), "84 KB");
assert.strictEqual(fmtBytes(12_345_678), "12.3 MB");
assert.strictEqual(fmtBytes(2_500_000_000), "2.50 GB");

let s = makeStatus("available", { version: "1.2.0" });
assert.strictEqual(s.state, "available");
assert(s.message.includes("Naya update available: v1.2.0"), "available message");
assert(typeof s.at === "number" && s.at > 0, "has timestamp");
assert.strictEqual(s.manual, false);

s = makeStatus("not-available", { version: "1.0.0", manual: true });
assert(s.message.includes("latest version par hain (v1.0.0)"));
assert.strictEqual(s.manual, true);

s = makeStatus("downloaded", { version: "1.2.0" });
assert(s.message.includes("Restart karke install"));

s = makeStatus("portable-available", { version: "1.3.0", releaseUrl: "https://github.com/x/y/releases/latest" });
assert(s.message.includes("v1.3.0") && s.releaseUrl.endsWith("/releases/latest"));

s = makeStatus("error", { message: "Internet connection check karein.", detail: "full text", manual: true });
assert.strictEqual(s.message, "Internet connection check karein.");
assert.strictEqual(s.detail, "full text");
assert.strictEqual(makeStatus("error").message, "Update check nahi ho paya");

s = progressStatus({ percent: 42.6, transferred: 36_000_000, total: 85_000_000, bytesPerSecond: 2_400_000 }, "1.2.0");
assert.strictEqual(s.state, "downloading");
assert.strictEqual(s.percent, 43);
assert.strictEqual(s.message, "v1.2.0 download ho raha hai — 36.0 MB / 85.0 MB (2.4 MB/s)");
assert.strictEqual(progressStatus({ percent: 250 }, "x").percent, 100);
assert.strictEqual(progressStatus({}, "x").percent, 0);
assert(!progressStatus({ percent: 5, transferred: 1, total: 2 }, "x").message.includes("/s)"), "no speed when unknown");

// simulated sequence: checking → available → N progress steps → downloaded, in order, with increasing delays
const emitted = [];
const scheduled = [];
const total = simulateSequence((st) => emitted.push(st), { version: "9.9.9", steps: 4, stepMs: 100, manual: true, schedule: (fn, ms) => scheduled.push([ms, fn]) });
assert.strictEqual(scheduled.length, 7);
assert(scheduled.every((x, i) => i === 0 || x[0] > scheduled[i - 1][0]), "delays increase");
assert.strictEqual(total, 600 + 100 * 5);
scheduled.forEach(([, fn]) => fn());
assert.deepStrictEqual(emitted.map((x) => x.state), ["checking", "available", "downloading", "downloading", "downloading", "downloading", "downloaded"]);
assert.strictEqual(emitted[0].manual, true);
assert.deepStrictEqual(emitted.filter((x) => x.state === "downloading").map((x) => x.percent), [25, 50, 75, 100]);
assert.strictEqual(emitted.at(-1).version, "9.9.9");

console.log("update-status: all tests passed");
