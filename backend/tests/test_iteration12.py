"""Iteration 12 backend tests: CSRF, rate-limit, password change+revocation,
safe-delete, ledger as_on, rokad accounts-summary."""
import os, time, uuid, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://khata-book-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN_USER = "admin"
ADMIN_PASS = "Vyapari@2026"


def _login(username=ADMIN_USER, password=ADMIN_PASS, session=None):
    s = session or requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password})
    return s, r


@pytest.fixture()
def admin_session():
    # Function-scoped: password-change test revokes old tokens, so each test re-logins.
    s, r = _login()
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("must_change_password") is False
    assert "access_token" in data
    s.headers.update({"Authorization": f"Bearer {data['access_token']}",
                      "X-Requested-With": "XMLHttpRequest"})
    return s, data["access_token"]


# ---------------- AUTH / CSRF ----------------
class TestAuthCSRF:
    def test_login_cookie_set(self):
        s, r = _login()
        assert r.status_code == 200
        data = r.json()
        assert data["must_change_password"] is False
        assert data["access_token"]
        # Cookies should be set (preview uses SameSite=None;Secure for cross-site; local uses Lax)
        set_cookie = r.headers.get("set-cookie", "").lower()
        assert "access_token=" in set_cookie
        assert "httponly" in set_cookie
        assert "samesite=" in set_cookie

    def test_csrf_blocked_without_header(self):
        s, r = _login()
        assert r.status_code == 200
        # Mutation with cookie auth, no X-Requested-With
        r2 = s.post(f"{API}/backup/auto", json={"reason": "csrf-test"})
        assert r2.status_code == 403, f"expected 403 got {r2.status_code}: {r2.text}"
        assert "csrf" in r2.text.lower()

    def test_csrf_allowed_with_header(self):
        s, r = _login()
        r2 = s.post(f"{API}/backup/auto", json={"reason": "csrf-test"},
                    headers={"X-Requested-With": "XMLHttpRequest"})
        assert r2.status_code == 200, r2.text

    def test_csrf_bad_origin_blocked(self):
        s, r = _login()
        r2 = s.post(f"{API}/backup/auto", json={"reason": "evil"},
                    headers={"X-Requested-With": "XMLHttpRequest",
                             "Origin": "https://evil.example.net"})
        assert r2.status_code == 403
        assert "origin" in r2.text.lower()

    def test_bearer_no_csrf_header_needed(self, admin_session):
        s, token = admin_session
        # Use a bare session with bearer only (no cookies)
        r = requests.post(f"{API}/backup/auto", json={"reason": "bearer"},
                          headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text

    def test_get_not_blocked(self):
        s, _ = _login()
        r = s.get(f"{API}/parties")
        assert r.status_code == 200

    def test_docs_disabled(self):
        # These paths should NOT be served by backend (ingress sends non-/api to frontend;
        # the backend's /api/docs & /api/openapi.json must be 404).
        assert requests.get(f"{API}/docs").status_code == 404
        assert requests.get(f"{API}/openapi.json").status_code == 404
        assert requests.get(f"{API}/redoc").status_code == 404


# ---------------- RATE LIMIT ----------------
class TestRateLimit:
    def test_rate_limit_throwaway_user(self):
        uname = f"ratetest-{uuid.uuid4().hex[:8]}"
        attempts = []
        for i in range(6):
            r = requests.post(f"{API}/auth/login",
                              json={"username": uname, "password": "wrong"})
            attempts.append((r.status_code, r.text[:200]))
        # 3rd and 4th should mention 'koshish baaki'
        text34 = (attempts[2][1] + attempts[3][1]).lower()
        assert "koshish" in text34 or "baaki" in text34, attempts
        # 5th should mention 15 minute lock
        assert "15" in attempts[4][1] or "lock" in attempts[4][1].lower(), attempts[4]
        # 6th → 429
        assert attempts[5][0] == 429, attempts


# ---------------- PASSWORD CHANGE + TOKEN REVOCATION ----------------
class TestPasswordChangeRevocation:
    def test_full_flow_and_restore(self):
        # Login → token A
        _, rA = _login()
        assert rA.status_code == 200
        tokenA = rA.json()["access_token"]
        hdrA = {"Authorization": f"Bearer {tokenA}"}

        # Validate short password 422
        r = requests.post(f"{API}/auth/change-password",
                          json={"current_password": ADMIN_PASS, "new_password": "abc"},
                          headers=hdrA)
        assert r.status_code == 422, r.text

        # Validate admin123 rejected (either 400 or 422)
        r = requests.post(f"{API}/auth/change-password",
                          json={"current_password": ADMIN_PASS, "new_password": "admin123"},
                          headers=hdrA)
        assert r.status_code in (400, 422), r.text

        # Change to Temp#123456 → token B
        r = requests.post(f"{API}/auth/change-password",
                          json={"current_password": ADMIN_PASS, "new_password": "Temp#123456"},
                          headers=hdrA)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("must_change_password") is False
        tokenB = body["access_token"]
        assert tokenB and tokenB != tokenA

        # Give the backend a moment (iat is seconds)
        time.sleep(1.2)

        # Old token A should be rejected
        rOld = requests.get(f"{API}/auth/me",
                            headers={"Authorization": f"Bearer {tokenA}"})
        assert rOld.status_code == 401, rOld.text

        # New token B works
        rNew = requests.get(f"{API}/auth/me",
                            headers={"Authorization": f"Bearer {tokenB}"})
        assert rNew.status_code == 200

        # Restore password back to Vyapari@2026
        time.sleep(1.1)
        r = requests.post(f"{API}/auth/change-password",
                          json={"current_password": "Temp#123456", "new_password": ADMIN_PASS},
                          headers={"Authorization": f"Bearer {tokenB}"})
        assert r.status_code == 200, f"RESTORE FAILED: {r.text}"

        # Final sanity: login with original password works
        _, rFinal = _login()
        assert rFinal.status_code == 200, f"ORIGINAL PASSWORD LOGIN FAILED: {rFinal.text}"


# ---------------- SAFE DELETE ----------------
class TestSafeDelete:
    def test_party_307_cannot_delete(self, admin_session):
        s, _ = admin_session
        parties = s.get(f"{API}/parties").json()
        p307 = next((p for p in parties if str(p.get("code")) == "307"), None)
        assert p307, "party code 307 not found"
        pid = p307["id"]

        r = s.delete(f"{API}/parties/{pid}", headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 409, r.text
        body = r.json()
        detail = body.get("detail", body)
        assert detail.get("total", 0) >= 1
        assert detail.get("counts", {}).get("rokad", 0) == 15
        assert "samples" in detail

        # Usage endpoint echoes same counts
        u = s.get(f"{API}/ledgers/{pid}/usage").json()
        assert u.get("counts", {}).get("rokad") == 15

        # Still exists
        parties2 = s.get(f"{API}/parties").json()
        assert any(p["id"] == pid for p in parties2)

    def test_throwaway_party_delete_ok(self, admin_session):
        s, _ = admin_session
        payload = {"name": f"TEST_del_{uuid.uuid4().hex[:6]}", "code": 90000 + (uuid.uuid4().int % 1000)}
        r = s.post(f"{API}/parties", json=payload,
                   headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code in (200, 201), r.text
        pid = r.json()["id"]
        rd = s.delete(f"{API}/parties/{pid}",
                      headers={"X-Requested-With": "XMLHttpRequest"})
        assert rd.status_code == 200, rd.text

    def test_cash_in_hand_account_cannot_delete(self, admin_session):
        s, _ = admin_session
        accts = s.get(f"{API}/accounts").json()
        cih = next((a for a in accts if a.get("name", "").lower().strip() == "cash in hand"), None)
        assert cih, "'Cash IN Hand' account not found"
        r = s.delete(f"{API}/accounts/{cih['id']}",
                     headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 409, r.text
        detail = r.json().get("detail", {})
        assert detail.get("total", 0) >= 1

    def test_throwaway_account_delete_ok(self, admin_session):
        s, _ = admin_session
        groups = s.get(f"{API}/account-groups").json()
        assert groups
        gid = groups[0]["id"]
        payload = {"name": f"TEST_acct_{uuid.uuid4().hex[:5]}", "group_id": gid}
        r = s.post(f"{API}/accounts", json=payload,
                   headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code in (200, 201), r.text
        aid = r.json()["id"]
        rd = s.delete(f"{API}/accounts/{aid}",
                      headers={"X-Requested-With": "XMLHttpRequest"})
        assert rd.status_code == 200, rd.text


# ---------------- LEDGER AS ON ----------------
class TestLedgerAsOn:
    def _p307(self, s):
        parties = s.get(f"{API}/parties").json()
        return next(p for p in parties if str(p.get("code")) == "307")

    def test_summary_party_asof_0505(self, admin_session):
        s, _ = admin_session
        p = self._p307(s)
        r = s.get(f"{API}/summary/party/{p['id']}", params={"as_on": "2026-05-05"})
        assert r.status_code == 200
        data = r.json()
        bal = data.get("party", {}).get("balance")
        assert abs(bal - (-44387254.0)) < 1.0, f"got {bal}"

    def test_opening_balances_report_match(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/reports/opening-balances", params={"as_on": "2026-05-05"})
        assert r.status_code == 200
        data = r.json()
        rows = []
        for sec in data.get("sections", []):
            rows.extend(sec.get("rows", []) or sec.get("items", []))
        row = next((x for x in rows if "SBICC" in (x.get("name") or "").upper()), None)
        assert row, "SBICC row missing"
        assert abs(row["balance"] - (-44387254.0)) < 1.0, row

    def test_summary_party_asof_0430_differs(self, admin_session):
        s, _ = admin_session
        p = self._p307(s)
        r = s.get(f"{API}/summary/party/{p['id']}", params={"as_on": "2026-04-30"})
        assert r.status_code == 200
        bal = r.json()["party"]["balance"]
        assert abs(bal - (-44387254.0)) > 1.0, f"expected different closing, got {bal}"


# ---------------- ROKAD ACCOUNTS SUMMARY ----------------
class TestRokadSummary:
    def test_summary_may_1_5(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/rokad/accounts-summary",
                  params={"date_from": "2026-05-01", "date_to": "2026-05-05"})
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data.get("rows") or data.get("accounts") or data
        # Find row 307
        def _find(code):
            for row in rows:
                if str(row.get("code")) == str(code):
                    return row
            return None
        r307 = _find("307")
        assert r307, f"row 307 missing. keys: {rows[0].keys() if rows else 'empty'}"
        assert abs(r307["opening"] - (-36696088.0)) < 1.0
        assert abs(r307["jama"] - 2400000.0) < 1.0
        assert abs(r307["kharch"] - 10091166.0) < 1.0
        assert abs(r307["closing"] - (-44387254.0)) < 1.0
        tot = data.get("total") or data.get("totals")
        assert tot, f"total missing in response keys={list(data.keys())}"
        assert abs(tot["closing"] - (-26075516.19)) < 1.0

    def test_bad_date_400(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/rokad/accounts-summary",
                  params={"date_from": "oops", "date_to": "2026-05-05"})
        assert r.status_code == 400


# ---------------- REGRESSION TOUCHES ----------------
class TestRegression:
    def test_dashboard_endpoints(self, admin_session):
        s, _ = admin_session
        for ep in ["/parties", "/accounts", "/account-groups",
                   "/reports/trial-balance", "/reports/opening-balances"]:
            r = s.get(f"{API}{ep}")
            assert r.status_code == 200, f"{ep} -> {r.status_code}"
