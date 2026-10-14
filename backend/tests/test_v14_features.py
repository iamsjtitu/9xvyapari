"""v1.4 features: single-user auth, change-password, auto backup."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@galla.com"
ADMIN_PASSWORD = "admin123"


def _login(password=ADMIN_PASSWORD):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": password})
    return s, r


@pytest.fixture(scope="module")
def auth():
    s, r = _login()
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------- Register endpoint removed ----------
class TestRegisterRemoved:
    def test_register_returns_404(self):
        r = requests.post(f"{API}/auth/register",
                          json={"email": "x@y.com", "password": "aa", "name": "x"})
        assert r.status_code == 404, f"register should be 404 (removed), got {r.status_code}"


# ---------- Change password ----------
class TestChangePassword:
    def test_change_password_full_flow(self, auth):
        # wrong current password
        r = auth.post(f"{API}/auth/change-password",
                      json={"current_password": "wrongpass", "new_password": "test1234"})
        assert r.status_code == 400
        assert "Purana password galat" in r.json().get("detail", "")

        # new too short -> 422
        r = auth.post(f"{API}/auth/change-password",
                      json={"current_password": ADMIN_PASSWORD, "new_password": "ab"})
        assert r.status_code == 422

        # same as current -> 400
        r = auth.post(f"{API}/auth/change-password",
                      json={"current_password": ADMIN_PASSWORD, "new_password": ADMIN_PASSWORD})
        assert r.status_code == 400
        assert "alag" in r.json().get("detail", "")

        # valid change admin123 -> test1234
        r = auth.post(f"{API}/auth/change-password",
                      json={"current_password": ADMIN_PASSWORD, "new_password": "test1234"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # old password login fails
        _, r_old = _login(ADMIN_PASSWORD)
        assert r_old.status_code == 401

        # new password login works
        s_new, r_new = _login("test1234")
        assert r_new.status_code == 200
        tok_new = r_new.json()["access_token"]
        s_new.headers.update({"Authorization": f"Bearer {tok_new}"})

        # restore back to admin123
        r = s_new.post(f"{API}/auth/change-password",
                       json={"current_password": "test1234", "new_password": ADMIN_PASSWORD})
        assert r.status_code == 200

        # confirm admin123 works again
        _, r_fin = _login(ADMIN_PASSWORD)
        assert r_fin.status_code == 200


# ---------- Backup endpoints ----------
class TestBackup:
    def test_auto_backup_logout(self, auth):
        r = auth.post(f"{API}/backup/auto", json={"reason": "logout"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["name"].startswith("vyapari-backup_")
        assert d["name"].endswith("_logout.json")
        assert d["size"] > 100
        assert "folder" in d and "/backups" in d["folder"]
        assert "counts" in d
        for k in ["parties", "bills", "rokad", "dos_journal", "inward", "gst_returns"]:
            assert k in d["counts"], f"counts missing {k}"

    def test_backup_files_sorted(self, auth):
        # create two backups quickly
        r1 = auth.post(f"{API}/backup/auto", json={"reason": "manual"}).json()
        time.sleep(1.1)
        r2 = auth.post(f"{API}/backup/auto", json={"reason": "manual"}).json()
        files = auth.get(f"{API}/backup/files").json()
        assert files["folder"].endswith("/backups")
        names = [f["name"] for f in files["files"]]
        # newest first => r2 should appear before r1
        idx1 = names.index(r1["name"])
        idx2 = names.index(r2["name"])
        assert idx2 < idx1, "backups not sorted newest first"

    def test_restore_file_traversal_blocked(self, auth):
        r = auth.post(f"{API}/backup/restore-file", json={"name": "../server.py"})
        assert r.status_code == 404

    def test_restore_file_valid(self, auth):
        # take parties count before
        before = len(auth.get(f"{API}/parties").json())
        made = auth.post(f"{API}/backup/auto", json={"reason": "manual"}).json()
        r = auth.post(f"{API}/backup/restore-file", json={"name": made["name"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "restored" in d
        assert "parties" in d["restored"]
        # parties count unchanged
        after = len(auth.get(f"{API}/parties").json())
        assert before == after, f"party count changed after restore: {before} -> {after}"


# ---------- Regression: dashboard & settings ----------
class TestRegression:
    def test_dashboard(self, auth):
        r = auth.get(f"{API}/summary/dashboard")
        assert r.status_code == 200
        d = r.json()
        assert d["parties_count"] >= 500  # per request, ~527

    def test_settings_save(self, auth):
        s = auth.get(f"{API}/settings").json()
        firm = s.get("firm_name", "9x Vyapari")
        r = auth.put(f"{API}/settings", json={"firm_name": firm,
                                               "fy_start": s.get("fy_start", ""),
                                               "fy_end": s.get("fy_end", ""),
                                               "current_date": s.get("current_date", "")})
        assert r.status_code == 200
        assert r.json()["firm_name"] == firm


# ---------- Final safety: ensure admin123 works at end ----------
def test_zz_admin123_restored():
    _, r = _login(ADMIN_PASSWORD)
    assert r.status_code == 200, "admin123 must be restored at end of suite"
