// Additional unit tests for update-messages
const assert = require("assert");
const { friendlyUpdateError, resolveFeed } = require("../lib/update-messages");

// (a) EXACT user error text with Headers dump, private repo, no token
const userErr = new Error(
  'HttpError: 404 "method: GET url: https://github.com/iamsjtitu/9xvyapari/releases.atom\n\nPlease double check that your authentication token is correct."\nHeaders: {"content-type":"text/html","set-cookie":"abc=1; Path=/"}'
);
const cfgA = { owner: "iamsjtitu", repo: "9xvyapari", repoPrivate: true, token: "" };
const mA = friendlyUpdateError(userErr, cfgA);
assert(mA.includes("PRIVATE"), "a: PRIVATE missing");
assert(mA.includes("UPDATE_TOKEN"), "a: UPDATE_TOKEN missing");
assert(mA.includes("Change visibility"), "a: Change visibility missing");
assert(mA.includes("iamsjtitu/9xvyapari"), "a: repo name missing");
assert(!mA.includes("Headers"), "a: should NOT contain Headers");
assert(!mA.includes("set-cookie"), "a: should NOT contain set-cookie");
console.log("(a) PASS");

// (b) same error with token
const mB = friendlyUpdateError(userErr, { ...cfgA, token: "ghp_abc" });
assert(mB.includes("Release nahi mila"), "b: should say Release nahi mila");
console.log("(b) PASS");

// (c) resolveFeed with token & private:false
const rC = resolveFeed({ owner: "o", repo: "r", token: "t", private: false });
assert.strictEqual(rC.mode, "private", "c: mode must be private");
assert.strictEqual(rC.feed.private, true, "c: feed.private must be true");
assert.strictEqual(rC.feed.token, "t", "c: feed.token must be t");
console.log("(c) PASS");

// (d) resolveFeed repoPrivate:true, no token
assert.strictEqual(resolveFeed({ repoPrivate: true }).mode, "private-missing-token", "d");
console.log("(d) PASS");

// (e) resolveFeed empty
assert.strictEqual(resolveFeed({}).mode, "public", "e");
console.log("(e) PASS");

// (f) null err, empty cfg - no throw, returns string
const mF = friendlyUpdateError(null, {});
assert.strictEqual(typeof mF, "string", "f: must return string");
console.log("(f) PASS: typeof=", typeof mF, "val=", JSON.stringify(mF));

console.log("ALL EXTRA TESTS PASSED");
