"""Tests for Rokad v15 features: default cash account linking, PUT edit, backfill."""
import os
import pytest
import requests
from pathlib import Path

def _load_env():
    envf = Path("/app/frontend/.env")
    for line in envf.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
_load_env()

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def test_initial_rokad_count(session):
    r = session.get(f"{BASE}/rokad")
    assert r.status_code == 200
    assert len(r.json()) == 17, f"Expected 17 rokad entries, got {len(r.json())}"


def test_backfill_no_unlinked_entries(session):
    r = session.get(f"{BASE}/rokad")
    for e in r.json():
        assert e.get("cash_account_id"), f"Entry {e.get('id')} missing cash_account_id after backfill"


def test_default_cash_account_is_301(session):
    r = session.get(f"{BASE}/parties")
    assert r.status_code == 200
    parties = r.json()
    cash301 = [p for p in parties if p.get("code") == 301]
    assert len(cash301) >= 1, "No party with code 301 found"
    assert "cash" in cash301[0]["name"].lower()


def test_post_rokad_with_empty_cash_account_defaults_to_301(session):
    payload = {
        "date": "2026-01-15",
        "type": "jama",
        "amount": 100,
        "party_name": "TEST_HOST_DEFAULT",
        "description": "TEST default fallback",
        "cash_account_id": "",
    }
    r = session.post(f"{BASE}/rokad", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["cash_account_id"], "cash_account_id should be auto-populated"
    assert "cash" in (data.get("cash_account_name") or "").lower()
    rid = data["id"]
    # cleanup
    d = session.delete(f"{BASE}/rokad/{rid}")
    assert d.status_code == 200


def test_put_rokad_update(session):
    # create
    payload = {
        "date": "2026-01-15",
        "type": "jama",
        "amount": 908400,
        "party_name": "TEST_HOST9X",
        "description": "test",
        "cash_account_id": "",
    }
    c = session.post(f"{BASE}/rokad", json=payload)
    assert c.status_code == 200
    rid = c.json()["id"]
    cash_id = c.json()["cash_account_id"]
    assert cash_id

    # update
    new_payload = {**payload, "amount": 5000, "description": "edited", "cash_account_id": cash_id}
    u = session.put(f"{BASE}/rokad/{rid}", json=new_payload)
    assert u.status_code == 200, u.text
    assert u.json()["amount"] == 5000
    assert u.json()["description"] == "edited"
    assert "updated_at" in u.json()

    # verify via GET
    g = session.get(f"{BASE}/rokad")
    found = [e for e in g.json() if e["id"] == rid]
    assert len(found) == 1
    assert found[0]["amount"] == 5000
    assert found[0]["description"] == "edited"
    assert "updated_at" in found[0]

    # cleanup
    d = session.delete(f"{BASE}/rokad/{rid}")
    assert d.status_code == 200


def test_put_rokad_nonexistent_404(session):
    payload = {"date": "2026-01-15", "type": "jama", "amount": 1}
    r = session.put(f"{BASE}/rokad/does-not-exist-id-xyz", json=payload)
    assert r.status_code == 404


def test_final_count_is_17(session):
    r = session.get(f"{BASE}/rokad")
    assert len(r.json()) == 17, f"DB not clean, got {len(r.json())}"


# Regression smoke
def test_parties_count(session):
    r = session.get(f"{BASE}/parties")
    assert r.status_code == 200
    assert len(r.json()) == 527


def test_dashboard(session):
    r = session.get(f"{BASE}/summary/dashboard")
    assert r.status_code == 200
