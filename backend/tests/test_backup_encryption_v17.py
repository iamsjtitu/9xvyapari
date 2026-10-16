# Iteration 17: encrypted backups (.vbk) with mandatory Backup Password
import os
import time
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
BACKUP_DIR = Path("/app/backend/backups")
BK_PW = "Backup@2026"
HINT = "test hint"
LOGIN = {"username": "admin", "password": "Vyapari@2026"}


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=LOGIN)
    assert r.status_code == 200, r.text
    d = r.json()
    ses = requests.Session()
    ses.headers.update({"Authorization": f"Bearer {d['access_token']}"})
    ses.login_data = d
    return ses


@pytest.fixture(scope="module")
def fresh_backup(s):
    r = s.post(f"{BASE_URL}/api/backup/auto", json={"reason": "test"})
    assert r.status_code == 200, r.text
    return r.json()


# --- auth flags
def test_login_and_me_flags(s):
    d = s.login_data
    assert d["must_change_password"] is False and d["must_set_backup_password"] is False
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    assert me["must_change_password"] is False and me["must_set_backup_password"] is False


# --- security status
def test_security(s):
    d = s.get(f"{BASE_URL}/api/backup/security").json()
    assert d["configured"] is True and d["hint"] == HINT
    assert d["set_at"] and d["changed_at"] and d["plain_files"] == 0 and d["folder"]


# --- auto backup file is encrypted
def test_auto_backup_encrypted(fresh_backup):
    d = fresh_backup
    assert d["name"].endswith(".vbk") and d["encrypted"] is True and d["hint"] == HINT
    assert isinstance(d["counts"], dict) and "parties" in d["counts"]
    blob = (BACKUP_DIR / d["name"]).read_bytes()
    assert blob.startswith(b"9XVBK")
    for w in (b"parties", b'"name"', b"rokad", b"exported_at"):
        assert w not in blob


# --- download
def test_download(s):
    r = s.get(f"{BASE_URL}/api/backup")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/octet-stream")
    cd = r.headers["content-disposition"]
    assert "attachment" in cd and "vyapari-backup_" in cd and "_download.vbk" in cd
    assert r.content.startswith(b"9XVBK") and b"parties" not in r.content


# --- restore-file errors + success
def test_restore_file_errors(s, fresh_backup):
    n = fresh_backup["name"]
    r = s.post(f"{BASE_URL}/api/backup/restore-file", json={"name": n, "password": "wrong"})
    assert r.status_code == 400 and r.json()["detail"] == "Backup password galat hai (ya file kharab hai)"
    r = s.post(f"{BASE_URL}/api/backup/restore-file", json={"name": n})
    assert r.status_code == 400 and r.json()["detail"] == "Backup password dein"
    for bad in ("../x.vbk", "../../etc/passwd", "foo.vbk", "vyapari-backup_nope.vbk", "../backups/" + n.replace("vyapari-backup_", "x")):
        r = s.post(f"{BASE_URL}/api/backup/restore-file", json={"name": bad, "password": BK_PW})
        assert r.status_code == 404, bad


def test_restore_file_success(s, fresh_backup):
    before = len(s.get(f"{BASE_URL}/api/parties").json())
    before_r = len(s.get(f"{BASE_URL}/api/rokad").json())
    r = s.post(f"{BASE_URL}/api/backup/restore-file", json={"name": fresh_backup["name"], "password": BK_PW})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True and d["restored"]["parties"] == fresh_backup["counts"]["parties"]
    assert len(s.get(f"{BASE_URL}/api/parties").json()) == before
    assert len(s.get(f"{BASE_URL}/api/rokad").json()) == before_r


# --- multipart restore
def test_upload_restore(s):
    blob = s.get(f"{BASE_URL}/api/backup").content
    before = len(s.get(f"{BASE_URL}/api/parties").json())
    r = s.post(f"{BASE_URL}/api/restore", files={"file": ("b.vbk", blob)}, data={"password": "wrong"})
    assert r.status_code == 400 and "galat" in r.json()["detail"]
    r = s.post(f"{BASE_URL}/api/restore", files={"file": ("b.vbk", blob)})
    assert r.status_code == 400 and r.json()["detail"] == "Backup password dein"
    r = s.post(f"{BASE_URL}/api/restore", files={"file": ("b.vbk", blob)}, data={"password": BK_PW})
    assert r.status_code == 200, r.text
    assert r.json()["restored"]["parties"] == before
    assert len(s.get(f"{BASE_URL}/api/parties").json()) == before
    r = s.post(f"{BASE_URL}/api/restore", files={"file": ("x.txt", b"hello plain text")}, data={"password": BK_PW})
    assert r.status_code == 400 and "9x Vyapari backup nahi hai" in r.json()["detail"]
    r = s.post(f"{BASE_URL}/api/restore", files={"file": ("x.json", b'{"foo":1}')})
    assert r.status_code == 200 and r.json()["restored"] == {}
    # truncated vbk (just magic)
    r = s.post(f"{BASE_URL}/api/restore", files={"file": ("t.vbk", b"9XVBK")}, data={"password": BK_PW})
    print("truncated vbk ->", r.status_code, r.text[:200])
    assert r.status_code in (400, 422)


# --- password validations + change + revert
def test_password_validations(s):
    u = f"{BASE_URL}/api/backup/password"
    assert s.post(u, json={"new_password": "abc"}).status_code == 422
    r = s.post(u, json={"new_password": "Backup@X1"})
    assert r.status_code == 400 and r.json()["detail"] == "Purana backup password (ya login password) dein"
    r = s.post(u, json={"new_password": "Backup@X1", "current_password": "nope123"})
    assert r.status_code == 400 and r.json()["detail"] == "Purana backup password galat hai"
    r = s.post(u, json={"new_password": "Backup@X1", "login_password": "nope123"})
    assert r.status_code == 400 and r.json()["detail"] == "Login password galat hai"
    # still unchanged
    assert s.get(f"{BASE_URL}/api/backup/security").json()["hint"] == HINT


def test_change_and_revert(s):
    old = s.post(f"{BASE_URL}/api/backup/auto", json={"reason": "test-old"}).json()["name"]
    time.sleep(1.1)
    try:
        r = s.post(f"{BASE_URL}/api/backup/password",
                   json={"new_password": "Backup@TEMP1", "current_password": BK_PW, "hint": "tmp"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] and d["changed"] is True and d["hint"] == "tmp"
        assert s.get(f"{BASE_URL}/api/backup/security").json()["hint"] == "tmp"
        # old file still opens with old pw
        r = s.post(f"{BASE_URL}/api/backup/restore-file", json={"name": old, "password": BK_PW})
        assert r.status_code == 200, r.text
        new = s.post(f"{BASE_URL}/api/backup/auto", json={"reason": "test-new"}).json()
        assert new["hint"] == "tmp"
        r = s.post(f"{BASE_URL}/api/backup/restore-file", json={"name": new["name"], "password": BK_PW})
        assert r.status_code == 400
        r = s.post(f"{BASE_URL}/api/backup/restore-file", json={"name": new["name"], "password": "Backup@TEMP1"})
        assert r.status_code == 200
    finally:
        r = s.post(f"{BASE_URL}/api/backup/password",
                   json={"new_password": BK_PW, "login_password": LOGIN["password"], "hint": HINT})
        assert r.status_code == 200, r.text
    sec = s.get(f"{BASE_URL}/api/backup/security").json()
    assert sec["hint"] == HINT and sec["configured"]
    # new key works with Backup@2026
    nb = s.post(f"{BASE_URL}/api/backup/auto", json={"reason": "test-revert"}).json()
    r = s.post(f"{BASE_URL}/api/backup/restore-file", json={"name": nb["name"], "password": BK_PW})
    assert r.status_code == 200


# --- files list
def test_files_list(s):
    d = s.get(f"{BASE_URL}/api/backup/files").json()
    files = d["files"]
    assert files and all(f["name"].endswith(".vbk") and f["encrypted"] for f in files)
    times = [f["created_at"] for f in files]
    assert times == sorted(times, reverse=True)
    assert files[0]["hint"] == HINT
    assert not list(BACKUP_DIR.glob("*.json"))
    assert len(files) <= 30


def test_unauth_blocked():
    assert requests.get(f"{BASE_URL}/api/backup").status_code == 401
    assert requests.get(f"{BASE_URL}/api/backup/security").status_code == 401
