// node scripts/test_update_messages.js  — unit tests for update-messages (no Electron needed)
const assert = require("assert");
const { friendlyUpdateError, resolveFeed } = require("../lib/update-messages");

const cfgPrivNoToken = { owner: "iamsjtitu", repo: "9xvyapari", repoPrivate: true, private: false, token: "" };
const cfgPrivToken = { owner: "iamsjtitu", repo: "9xvyapari", repoPrivate: true, private: true, token: "github_pat_x" };
const cfgPublic = { owner: "iamsjtitu", repo: "9xvyapari", repoPrivate: false, private: false, token: "" };

const err404 = new Error('HttpError: 404 "method: GET url: https://github.com/iamsjtitu/9xvyapari/releases.atom\\n\\nPlease double check that your authentication token is correct..."\nHeaders: {...}');

// 404 without token → private-repo guidance mentioning both fixes
let m = friendlyUpdateError(err404, cfgPrivNoToken);
assert(m.includes("PRIVATE hai"), "should say repo is private");
assert(m.includes("UPDATE_TOKEN"), "should mention UPDATE_TOKEN secret");
assert(m.includes("Change visibility"), "should mention making repo public");
assert(m.includes('"iamsjtitu/9xvyapari"'), "should name the repo");
assert(!m.includes("Headers"), "should not dump raw headers");

// 404 with token → release missing guidance
m = friendlyUpdateError(err404, cfgPrivToken);
assert(m.includes("Release nahi mila"), "with token a 404 means no release yet");

// 401/403 → bad token guidance
m = friendlyUpdateError(new Error("HttpError: 401 Bad credentials"), cfgPrivToken);
assert(m.includes("UPDATE_TOKEN galat/expired"), "401 should blame token");

// network errors → internet message
m = friendlyUpdateError(new Error("net::ERR_INTERNET_DISCONNECTED"), cfgPublic);
assert(m.startsWith("Internet connection check karein"), "network error message");
m = friendlyUpdateError(new Error("getaddrinfo ENOTFOUND github.com"), cfgPublic);
assert(m.startsWith("Internet connection check karein"), "ENOTFOUND message");

// generic → first line only
m = friendlyUpdateError(new Error("Something odd\nsecond line"), cfgPublic);
assert.strictEqual(m, "Something odd");

// feed resolution
assert.deepStrictEqual(resolveFeed(cfgPrivToken), {
  mode: "private",
  feed: { provider: "github", owner: "iamsjtitu", repo: "9xvyapari", private: true, token: "github_pat_x" },
});
assert.strictEqual(resolveFeed(cfgPrivNoToken).mode, "private-missing-token");
assert.strictEqual(resolveFeed(cfgPublic).mode, "public");
// token should be used even if CI forgot the `private` flag
assert.strictEqual(resolveFeed({ ...cfgPrivToken, private: false }).mode, "private");

console.log("update-messages: all tests passed");
