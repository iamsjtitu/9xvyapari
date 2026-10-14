"""Backend tests for Year-End (Naya Saal) carry forward feature.

Covers:
- preview endpoint data integrity
- validation on close
- full close cycle + verification
- undo
- undo blocked when new year has entries
- regression endpoints
- leaves DB in original state
"""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    env = "/app/frontend/.env"
    if os.path.exists(env):
        for line in open(env):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

BASE = _load_backend_url().rstrip("/") + "/api"
ADMIN = {"email": "admin@galla.com", "password": "admin123"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def pre_snapshot(client):
    """Snapshot original DB state so we can verify perfect restoration at the end."""
    settings = client.get(f"{BASE}/settings").json()
    parties = client.get(f"{BASE}/parties").json()
    pmap = {p["id"]: {"opening": p.get("opening_balance", 0), "balance": p.get("balance", 0)} for p in parties}
    counts = {
        "bills": len(client.get(f"{BASE}/bills").json()),
        "rokad": len(client.get(f"{BASE}/rokad").json()),
        "journal": len(client.get(f"{BASE}/journal").json()),
        "inward": len(client.get(f"{BASE}/inward").json()),
    }
    return {"settings": settings, "parties": pmap, "counts": counts}


# ---------- 1. PREVIEW ----------
class TestPreview:
    def test_preview_structure(self, client, pre_snapshot):
        r = client.get(f"{BASE}/year-end/preview", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["fy_start"] == pre_snapshot["settings"]["fy_start"]
        assert d["fy_end"] == pre_snapshot["settings"]["fy_end"]
        assert d["suggested"]["fy_start"] and d["suggested"]["fy_end"]
        assert d["confirm_text"] == "NAYA SAAL"
        assert "bills" in d["counts"] and "rokad" in d["counts"] and "dos_journal" in d["counts"]
        assert isinstance(d["parties"], list) and len(d["parties"]) > 0
        for row in d["parties"][:30]:
            assert set(["id", "code", "name", "nature", "opening_before", "closing", "carry", "new_opening"]) <= set(row.keys())
            if not row["carry"]:
                assert row["new_opening"] == 0
            else:
                assert row["new_opening"] == row["closing"]
        assert "totals" in d and "carry_dr" in d["totals"] and "carry_cr" in d["totals"] and "reset_count" in d["totals"]


# ---------- 2. VALIDATION ----------
class TestValidation:
    def test_wrong_confirm(self, client):
        r = client.post(f"{BASE}/year-end/close",
                        json={"new_fy_start": "2027-04-01", "new_fy_end": "2028-03-31", "confirm": "wrong"})
        assert r.status_code == 400
        assert "NAYA SAAL" in r.text

    def test_overlapping_fy(self, client):
        r = client.post(f"{BASE}/year-end/close",
                        json={"new_fy_start": "2026-04-01", "new_fy_end": "2028-03-31", "confirm": "NAYA SAAL"})
        assert r.status_code == 400

    def test_end_before_start(self, client):
        r = client.post(f"{BASE}/year-end/close",
                        json={"new_fy_start": "2028-04-01", "new_fy_end": "2027-04-01", "confirm": "NAYA SAAL"})
        assert r.status_code == 400

    def test_invalid_date(self, client):
        r = client.post(f"{BASE}/year-end/close",
                        json={"new_fy_start": "notadate", "new_fy_end": "2028-03-31", "confirm": "NAYA SAAL"})
        assert r.status_code == 400


# ---------- 3. FULL CYCLE ----------
class TestFullCycle:
    def test_close_year(self, client, pre_snapshot):
        preview = client.get(f"{BASE}/year-end/preview").json()
        r = client.post(f"{BASE}/year-end/close",
                        json={"new_fy_start": "2027-04-01", "new_fy_end": "2028-03-31", "confirm": "naya saal"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "fy_id" in d
        assert "yearend_" in d["backup_file"] and pre_snapshot["settings"]["fy_start"] in d["backup_file"]
        pytest.fy_id = d["fy_id"]

        s = client.get(f"{BASE}/settings").json()
        assert s["fy_start"] == "2027-04-01"
        assert s["fy_end"] == "2028-03-31"
        assert s["current_date"] == "2027-04-01"

        hist = client.get(f"{BASE}/year-end/history").json()
        assert len(hist["years"]) == 1
        assert hist["undo_possible"] is True
        assert all(v == 0 for v in hist["live_counts"].values())

        detail = client.get(f"{BASE}/year-end/{d['fy_id']}").json()
        assert isinstance(detail["parties"], list) and len(detail["parties"]) > 0
        assert isinstance(detail["accounts"], list)

        # Live collections empty
        for col in ["bills", "rokad", "journal", "inward"]:
            assert client.get(f"{BASE}/{col}").json() == []

        # Parties: opening == balance, carried parties keep pre-close balance
        parties = client.get(f"{BASE}/parties").json()
        preview_map = {p["id"]: p for p in preview["parties"]}
        for p in parties:
            assert abs(p["opening_balance"] - p["balance"]) < 0.01, f"Party {p['code']} opening!=balance"
            pm = preview_map.get(p["id"])
            if pm and pm["carry"]:
                assert abs(p["opening_balance"] - pm["closing"]) < 0.01
            elif pm and not pm["carry"]:
                assert abs(p["opening_balance"]) < 0.01

        # Backup file listed
        files = client.get(f"{BASE}/backup/files").json()
        file_list = files.get("files") if isinstance(files, dict) else files
        names = [f.get("name") if isinstance(f, dict) else f for f in file_list]
        assert any("yearend_" in str(n) for n in names)

        # Trial balance works
        tb = client.get(f"{BASE}/reports/trial-balance")
        assert tb.status_code == 200

    def test_undo(self, client, pre_snapshot):
        r = client.post(f"{BASE}/year-end/undo")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["restored_fy"]["fy_start"] == pre_snapshot["settings"]["fy_start"]
        assert d["restored_fy"]["fy_end"] == pre_snapshot["settings"]["fy_end"]

        s = client.get(f"{BASE}/settings").json()
        assert s["fy_start"] == pre_snapshot["settings"]["fy_start"]
        assert s["fy_end"] == pre_snapshot["settings"]["fy_end"]

        hist = client.get(f"{BASE}/year-end/history").json()
        assert hist["years"] == []
        assert hist["undo_possible"] is False

        # Live counts restored
        for col, expected in pre_snapshot["counts"].items():
            got = len(client.get(f"{BASE}/{col}").json())
            assert got == expected, f"{col} count mismatch: {got} vs {expected}"

        # Party balances identical to pre-close
        parties = client.get(f"{BASE}/parties").json()
        for p in parties:
            orig = pre_snapshot["parties"].get(p["id"])
            if orig:
                assert abs(p["opening_balance"] - orig["opening"]) < 0.01
                assert abs(p["balance"] - orig["balance"]) < 0.01

    def test_undo_404_when_no_closed(self, client):
        r = client.post(f"{BASE}/year-end/undo")
        assert r.status_code == 404


# ---------- 4. UNDO BLOCKED WHEN NEW YEAR HAS ENTRIES ----------
class TestUndoBlocked:
    def test_close_add_rokad_undo_fails_then_cleanup(self, client, pre_snapshot):
        # Close again
        r = client.post(f"{BASE}/year-end/close",
                        json={"new_fy_start": "2027-04-01", "new_fy_end": "2028-03-31", "confirm": "NAYA SAAL"})
        assert r.status_code == 200, r.text

        parties = client.get(f"{BASE}/parties").json()
        assert parties
        pid = parties[0]["id"]

        rk = client.post(f"{BASE}/rokad", json={
            "type": "jama", "amount": 100, "date": "2027-04-02",
            "description": "test", "party_id": pid
        })
        assert rk.status_code in (200, 201), rk.text
        rk_id = rk.json().get("id")
        assert rk_id

        # Undo blocked
        u = client.post(f"{BASE}/year-end/undo")
        assert u.status_code == 400
        assert "Naye saal me entries ho chuki hain" in u.text

        hist = client.get(f"{BASE}/year-end/history").json()
        assert hist["undo_possible"] is False

        # Delete rokad, undo should now succeed
        d = client.delete(f"{BASE}/rokad/{rk_id}")
        assert d.status_code in (200, 204)

        u2 = client.post(f"{BASE}/year-end/undo")
        assert u2.status_code == 200, u2.text

        # Final state matches pre-close
        s = client.get(f"{BASE}/settings").json()
        assert s["fy_start"] == pre_snapshot["settings"]["fy_start"]
        assert s["fy_end"] == pre_snapshot["settings"]["fy_end"]
        for col, expected in pre_snapshot["counts"].items():
            got = len(client.get(f"{BASE}/{col}").json())
            assert got == expected, f"{col} count mismatch after full cycle: {got} vs {expected}"


# ---------- 5. REGRESSION ----------
class TestRegression:
    def test_dashboard(self, client):
        r = client.get(f"{BASE}/summary/dashboard")
        assert r.status_code == 200

    def test_parties(self, client):
        r = client.get(f"{BASE}/parties")
        assert r.status_code == 200 and len(r.json()) > 500

    def test_backup_list(self, client):
        r = client.get(f"{BASE}/backup/files")
        assert r.status_code == 200
