"""Backend tests for Journal Entry edit (PUT /api/journal/{id})."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://khata-book-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def existing_entry(client):
    r = client.get(f"{API}/journal")
    assert r.status_code == 200
    entries = r.json()
    assert len(entries) >= 1, "Expected at least 1 journal entry"
    return entries[0]


def test_initial_state(client):
    r = client.get(f"{API}/journal")
    assert r.status_code == 200
    assert len(r.json()) == 1, f"Expected exactly 1 entry at start, got {len(r.json())}"


def test_put_nonexistent_returns_404(client):
    r = client.put(f"{API}/journal/nonexistent-id-xyz", json={
        "date": "2025-01-01", "narration": "x", "ref": "",
        "lines": [
            {"account_id": "a", "account_name": "A", "debit": 10, "credit": 0},
            {"account_id": "b", "account_name": "B", "debit": 0, "credit": 10},
        ],
    })
    assert r.status_code == 404


def test_put_zero_amount_returns_400(client, existing_entry):
    lines = [{"account_id": l["account_id"], "account_name": l["account_name"], "debit": 0, "credit": 0}
             for l in existing_entry["lines"]]
    r = client.put(f"{API}/journal/{existing_entry['id']}", json={
        "date": existing_entry["date"], "narration": "zero", "ref": "", "lines": lines,
    })
    assert r.status_code == 400
    assert "Amount" in r.json().get("detail", "")


def test_put_unbalanced_returns_400(client, existing_entry):
    lines = [dict(l) for l in existing_entry["lines"]]
    # Break balance: bump first line debit by 1
    if lines[0]["debit"]:
        lines[0]["debit"] += 1
    else:
        lines[0]["credit"] += 1
    r = client.put(f"{API}/journal/{existing_entry['id']}", json={
        "date": existing_entry["date"], "narration": "unbal",
        "ref": existing_entry.get("ref", ""), "lines": lines,
    })
    assert r.status_code == 400
    assert "match nahi" in r.json().get("detail", "")
    # DB unchanged
    r2 = client.get(f"{API}/journal")
    assert any(e["id"] == existing_entry["id"] and e["narration"] == existing_entry["narration"]
               for e in r2.json())


def test_put_valid_updates_entry(client, existing_entry):
    original_narration = existing_entry["narration"]
    original_voucher = existing_entry["voucher_no"]
    payload = {
        "date": existing_entry["date"],
        "narration": "EDIT TEST",
        "ref": existing_entry.get("ref", ""),
        "lines": [{"account_id": l["account_id"], "account_name": l["account_name"],
                   "debit": l["debit"], "credit": l["credit"]} for l in existing_entry["lines"]],
    }
    r = client.put(f"{API}/journal/{existing_entry['id']}", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["narration"] == "EDIT TEST"
    assert body["voucher_no"] == original_voucher
    assert "updated_at" in body

    # GET verifies persistence
    r2 = client.get(f"{API}/journal")
    entries = r2.json()
    assert len(entries) == 1
    e = entries[0]
    assert e["id"] == existing_entry["id"]
    assert e["narration"] == "EDIT TEST"
    assert e["voucher_no"] == original_voucher
    assert "updated_at" in e
    assert e["total"] == existing_entry["total"]

    # Restore original narration
    payload["narration"] = original_narration
    r3 = client.put(f"{API}/journal/{existing_entry['id']}", json=payload)
    assert r3.status_code == 200
    r4 = client.get(f"{API}/journal")
    assert r4.json()[0]["narration"] == original_narration
    assert len(r4.json()) == 1
