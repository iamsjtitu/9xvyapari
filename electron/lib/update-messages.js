// Pure helpers (no electron import) so they can be unit-tested with plain node

// Turn electron-updater / GitHub errors into a short Hinglish message with the fix
function friendlyUpdateError(err, cfg = {}) {
  const raw = String(err?.message || err || "");
  const first = raw.split("\n")[0].slice(0, 160);
  const repo = `${cfg.owner || "?"}/${cfg.repo || "?"}`;
  if (/\b404\b/.test(raw)) {
    if (!cfg.token) {
      return (
        `GitHub repo "${repo}" PRIVATE hai, isliye update feed nahi khul raha (404).\n\n` +
        "Auto-update chalane ke liye koi EK karein:\n" +
        "1) Repo ko Public karo: GitHub → repo → Settings → Danger Zone → Change visibility → Public\n" +
        "     YA\n" +
        "2) Private rakhte hue token do: GitHub → Settings → Developer settings → Fine-grained tokens → " +
        `sirf "${repo}" repo, Permission: Contents = Read-only → token copy karo → repo → Settings → ` +
        "Secrets and variables → Actions → New repository secret → Name: UPDATE_TOKEN → Value: token.\n\n" +
        'Phir "Save to GitHub" se naya build banao aur Releases se wo Setup install karo — uske baad updates khud aayenge.'
      );
    }
    return `Release nahi mila (404). GitHub → Actions me build poora hone do (Releases me Setup .exe dikhna chahiye), phir dobara try karein.\n${first}`;
  }
  if (/\b401\b|\b403\b|Bad credentials/i.test(raw)) {
    return `UPDATE_TOKEN galat/expired lagta hai (${first}). GitHub me naya fine-grained token banao (Contents: Read-only) aur UPDATE_TOKEN secret update karke naya build lo.`;
  }
  if (/ENOTFOUND|ECONN|net::ERR|getaddrinfo|timed? ?out|EAI_AGAIN/i.test(raw)) {
    return `Internet connection check karein.\n${first}`;
  }
  return first;
}

// Decide how the updater should be configured from update-config.json
function resolveFeed(cfg = {}) {
  if (cfg.token && cfg.owner && cfg.repo) {
    return { mode: "private", feed: { provider: "github", owner: cfg.owner, repo: cfg.repo, private: true, token: cfg.token } };
  }
  if (cfg.repoPrivate) return { mode: "private-missing-token", feed: null };
  return { mode: "public", feed: null };
}

module.exports = { friendlyUpdateError, resolveFeed };
