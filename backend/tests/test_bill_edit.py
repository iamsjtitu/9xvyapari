"""Tests for new PUT /api/bills/{id} feature + rokad sync."""
import os
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


def _p00004(client):
    bills = client.get(f"{API}/bills").json()
    for b in bills:
        if b["bill_no"] == "P00004":
            return b
    pytest.fail("P00004 bill not found")


def _payload_from_bill(b):
    payload = {k: v for k, v in b.items()
               if k not in ("id", "bill_no", "balance", "created_at", "updated_at")}
    # Make sure items match BillItem shape (strip extra keys if any) - keep as-is
    return payload


def test_bill_p00004_exists(client):
    b = _p00004(client)
    assert round(b["total"], 2) == 797844.00
    assert b["bill_type"] == "purchase"


def test_initial_state(client):
    bills = client.get(f"{API}/bills").json()
    rokad = client.get(f"{API}/rokad").json()
    assert len(bills) == 4, f"Expected 4 bills, got {len(bills)}"
    assert len(rokad) == 17, f"Expected 17 rokad, got {len(rokad)}"


def test_update_bill_sets_rokad_and_updated_at(client):
    b = _p00004(client)
    bid = b["id"]
    payload = _payload_from_bill(b)
    payload["remark1"] = "EDIT TEST"
    payload["payment_received"] = 1000
    # try to change bill_type (should be ignored)
    payload["bill_type"] = "sale"

    r = client.put(f"{API}/bills/{bid}", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["bill_no"] == "P00004"
    assert data["bill_type"] == "purchase"  # immutable
    assert data["remark1"] == "EDIT TEST"
    assert data["payment_received"] == 1000
    assert round(data["balance"], 2) == 796844.00
    assert "updated_at" in data and data["updated_at"]

    # GET verifies persistence
    g = client.get(f"{API}/bills/{bid}").json()
    assert g["remark1"] == "EDIT TEST"
    assert g["payment_received"] == 1000
    assert g["bill_type"] == "purchase"
    assert g["bill_no"] == "P00004"

    # Rokad sync: one entry with ref_bill_id == bid
    rokad = client.get(f"{API}/rokad").json()
    linked = [r for r in rokad if r.get("ref_bill_id") == bid]
    assert len(linked) == 1
    e = linked[0]
    assert e["type"] == "kharch"
    assert e["amount"] == 1000
    assert e["cash_account_name"] == "CASH IN HAND"


def test_revert_bill_removes_rokad(client):
    b = _p00004(client)
    bid = b["id"]
    payload = _payload_from_bill(b)
    payload["remark1"] = ""
    payload["payment_received"] = 0
    r = client.put(f"{API}/bills/{bid}", json=payload)
    assert r.status_code == 200
    g = client.get(f"{API}/bills/{bid}").json()
    assert g["payment_received"] == 0
    assert round(g["balance"], 2) == 797844.00

    rokad = client.get(f"{API}/rokad").json()
    linked = [r for r in rokad if r.get("ref_bill_id") == bid]
    assert len(linked) == 0
    assert len(rokad) == 17


def test_put_nonexistent_404(client):
    b = _p00004(client)
    payload = _payload_from_bill(b)
    r = client.put(f"{API}/bills/nonexistent-id-xyz", json=payload)
    assert r.status_code == 404


def test_final_state(client):
    bills = client.get(f"{API}/bills").json()
    rokad = client.get(f"{API}/rokad").json()
    assert len(bills) == 4
    assert len(rokad) == 17
    p = next(b for b in bills if b["bill_no"] == "P00004")
    assert round(p["total"], 2) == 797844.00
    assert p["payment_received"] == 0
