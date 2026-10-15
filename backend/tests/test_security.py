"""Pure unit tests for backend/security.py — run: cd /app/backend && python -m pytest tests/test_security.py -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from security import LoginThrottle, allowed_hosts, client_ip, cookie_policy, csrf_block_reason  # noqa: E402

ORIGINS = ["https://app.example.com"]
HOST_HDR = {"host": "app.example.com"}


def test_cookie_policy_defaults_lax_secure_web_and_insecure_desktop():
    assert cookie_policy({}) == {"samesite": "lax", "secure": True}
    assert cookie_policy({"FRONTEND_DIST": "/x"}) == {"samesite": "lax", "secure": False}
    assert cookie_policy({"COOKIE_SAMESITE": "none"}) == {"samesite": "none", "secure": True}
    assert cookie_policy({"COOKIE_SAMESITE": "weird"})["samesite"] == "lax"


def test_allowed_hosts_includes_cors_frontend_and_request_host():
    hosts = allowed_hosts({"host": "127.0.0.1:9333"}, ["https://web.example.com", "*"], "https://front.example.com")
    assert hosts == {"web.example.com", "front.example.com", "127.0.0.1:9333"}


def test_safe_methods_and_non_api_paths_pass():
    assert csrf_block_reason("GET", "/api/parties", {}, {"access_token": "t"}, ORIGINS) == ""
    assert csrf_block_reason("POST", "/static/x", {}, {"access_token": "t"}, ORIGINS) == ""


def test_cookie_auth_write_requires_custom_header():
    cookies = {"access_token": "t"}
    assert csrf_block_reason("POST", "/api/restore", HOST_HDR, cookies, ORIGINS) == "header"
    ok = {**HOST_HDR, "x-requested-with": "XMLHttpRequest"}
    assert csrf_block_reason("POST", "/api/restore", ok, cookies, ORIGINS) == ""


def test_bearer_auth_write_does_not_need_header():
    hdrs = {**HOST_HDR, "authorization": "Bearer abc"}
    assert csrf_block_reason("DELETE", "/api/bills/1", hdrs, {}, ORIGINS) == ""
    assert csrf_block_reason("DELETE", "/api/bills/1", hdrs, {"access_token": "t"}, ORIGINS) == ""


def test_foreign_origin_is_blocked_even_with_header():
    hdrs = {**HOST_HDR, "origin": "https://evil.example.net", "x-requested-with": "XMLHttpRequest"}
    assert csrf_block_reason("POST", "/api/year-end/close", hdrs, {"access_token": "t"}, ORIGINS) == "origin"
    assert csrf_block_reason("POST", "/api/auth/login", {**HOST_HDR, "origin": "null"}, {}, ORIGINS) == "origin"


def test_same_origin_desktop_and_referer_fallback_pass():
    desk = {"host": "127.0.0.1:9333", "origin": "http://127.0.0.1:9333", "x-requested-with": "XMLHttpRequest"}
    assert csrf_block_reason("PUT", "/api/rokad/1", desk, {"access_token": "t"}, ["http://127.0.0.1:9333"]) == ""
    ref = {**HOST_HDR, "referer": "https://app.example.com/rokad", "x-requested-with": "XMLHttpRequest"}
    assert csrf_block_reason("POST", "/api/rokad", ref, {"access_token": "t"}, ORIGINS) == ""


def test_login_without_cookie_passes_header_check():
    assert csrf_block_reason("POST", "/api/auth/login", HOST_HDR, {}, ORIGINS) == ""


def test_client_ip_prefers_forwarded_header():
    assert client_ip({"x-forwarded-for": "1.2.3.4, 10.0.0.1"}, "127.0.0.1") == "1.2.3.4"
    assert client_ip({}, "127.0.0.1") == "127.0.0.1"


def test_throttle_locks_after_max_fails_and_resets_on_success():
    clock = [1000.0]
    t = LoginThrottle(max_fails=3, lock_seconds=60, now=lambda: clock[0])
    assert t.locked_for("ip1", "admin") == 0
    assert t.failed("ip1", "admin") == 2
    assert t.failed("ip1", "admin") == 1
    assert t.failed("ip1", "admin") == 0
    assert 0 < t.locked_for("ip1", "admin") <= 61
    assert t.locked_for("ip2", "admin") == 0, "other ip unaffected"
    clock[0] += 61
    assert t.locked_for("ip1", "admin") == 0, "lock expires"
    t.failed("ip1", "admin")
    t.succeeded("ip1", "admin")
    assert t.failed("ip1", "admin") == 2, "success resets the counter"


def test_throttle_per_ip_limit_covers_username_spraying():
    t = LoginThrottle(max_fails=5, ip_max_fails=4, lock_seconds=60, now=lambda: 0.0)
    for i in range(4):
        t.failed("ip9", f"user{i}")
    assert t.locked_for("ip9", "another") > 0
