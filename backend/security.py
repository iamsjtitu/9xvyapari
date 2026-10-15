"""Auth hardening helpers: login throttling, CSRF/origin checks, cookie policy. Pure functions where possible."""
import os
import time
from urllib.parse import urlparse

LOGIN_MAX_FAILS = 5          # per ip+username
LOGIN_IP_MAX_FAILS = 20      # per ip (any username)
LOGIN_LOCK_SECONDS = 15 * 60
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-requested-with"
CSRF_HEADER_VALUE = "xmlhttprequest"


class LoginThrottle:
    """In-memory brute-force guard (single-process app). key -> [fail_count, locked_until_ts]."""

    def __init__(self, max_fails=LOGIN_MAX_FAILS, ip_max_fails=LOGIN_IP_MAX_FAILS, lock_seconds=LOGIN_LOCK_SECONDS, now=time.time):
        self.max_fails, self.ip_max_fails, self.lock_seconds, self.now = max_fails, ip_max_fails, lock_seconds, now
        self._state = {}

    def _entry(self, key):
        return self._state.setdefault(key, [0, 0.0])

    def locked_for(self, ip: str, username: str) -> int:
        """Seconds remaining in lockout (0 = allowed)."""
        t = self.now()
        remaining = 0
        for key in (f"{ip}|{username}", f"ip|{ip}"):
            fails, until = self._entry(key)
            if until > t:
                remaining = max(remaining, int(until - t) + 1)
            elif until and until <= t:
                self._state[key] = [0, 0.0]  # lock expired → reset
        return remaining

    def failed(self, ip: str, username: str) -> int:
        """Record a failure; returns attempts left before lock (0 = now locked)."""
        t = self.now()
        left = self.max_fails
        for key, limit in ((f"{ip}|{username}", self.max_fails), (f"ip|{ip}", self.ip_max_fails)):
            e = self._entry(key)
            e[0] += 1
            if e[0] >= limit:
                e[1] = t + self.lock_seconds
            if key.startswith(f"{ip}|"):
                left = max(0, limit - e[0])
        return left

    def succeeded(self, ip: str, username: str):
        self._state.pop(f"{ip}|{username}", None)


def client_ip(headers, fallback: str) -> str:
    fwd = (headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return fwd or (headers.get("x-real-ip") or "").strip() or fallback or "?"


def cookie_policy(env=os.environ) -> dict:
    """SameSite=Lax by default (frontend is same-origin: web ingress + desktop). COOKIE_SAMESITE=none for true cross-origin."""
    desktop = bool(env.get("FRONTEND_DIST"))
    samesite = (env.get("COOKIE_SAMESITE") or "lax").lower()
    if samesite not in ("lax", "strict", "none"):
        samesite = "lax"
    secure_default = "0" if desktop else "1"
    secure = (env.get("COOKIE_SECURE") or secure_default) == "1"
    if samesite == "none":
        secure = True  # browsers reject SameSite=None without Secure
    return {"samesite": samesite, "secure": secure}


def allowed_hosts(headers, cors_origins, frontend_url="") -> set:
    hosts = {urlparse(o).netloc.lower() for o in cors_origins if o and o != "*"}
    if frontend_url:
        hosts.add(urlparse(frontend_url).netloc.lower())
    host = (headers.get("x-forwarded-host") or headers.get("host") or "").split(",")[0].strip().lower()
    if host:
        hosts.add(host)
    return {h for h in hosts if h}


def csrf_block_reason(method: str, path: str, headers, cookies, cors_origins, frontend_url="") -> str:
    """Return a reason string if a mutating /api request must be rejected, else ''.
    1) Origin/Referer (when present) must belong to an allowed host.
    2) Cookie-authenticated requests (no Bearer) must carry X-Requested-With: XMLHttpRequest
       — a custom header cannot be added by cross-site forms / simple requests."""
    if method.upper() in SAFE_METHODS or not path.startswith("/api/"):
        return ""
    source = headers.get("origin") or headers.get("referer") or ""
    if source and source != "null":
        host = urlparse(source).netloc.lower()
        if host and host not in allowed_hosts(headers, cors_origins, frontend_url):
            return "origin"
    elif source == "null":
        return "origin"
    bearer = (headers.get("authorization") or "").startswith("Bearer ")
    if cookies.get("access_token") and not bearer:
        if (headers.get(CSRF_HEADER) or "").lower() != CSRF_HEADER_VALUE:
            return "header"
    return ""
