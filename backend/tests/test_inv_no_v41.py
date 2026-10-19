# Iteration 41: Rokad inv_no field (create/update/get) + by-voucher search on inv_no
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("access_token")
    sess.cookies.clear()
    sess.headers.update({"Authorization": f"Bearer {tok}"})
    return sess


@pytest.fixture(scope="module")
def cash(s):
    accs = s.get(f"{BASE_URL}/api/accounts").json()
    accs = accs if isinstance(accs, list) else accs.get("accounts", [])
    c = [a for a in accs if (a.get("type") or "").lower() in ("cash", "bank")] or accs
    return c[0]


@pytest.fixture(scope="module")
def entry(s, cash):
    r = s.post(f"{BASE_URL}/api/rokad", json={
        "date": "2026-10-19", "type": "kharch", "amount": 11, "description": "TEST_inv41",
        "cash_account_id": cash["id"], "cash_account_name": cash.get("name", ""), "inv_no": "TEST-INV-41A"})
    assert r.status_code in (200, 201), r.text
    d = r.json()
    yield d
    s.delete(f"{BASE_URL}/api/rokad/{d['id']}")


def test_create_returns_inv(entry):
    assert entry["inv_no"] == "TEST-INV-41A"
    assert entry.get("voucher_no")


def test_get_persists(s, entry):
    r = s.get(f"{BASE_URL}/api/rokad/{entry['id']}")
    assert r.status_code == 200 and r.json()["inv_no"] == "TEST-INV-41A"


def test_search_inv_case_insensitive(s, entry):
    r = s.get(f"{BASE_URL}/api/rokad/by-voucher", params={"voucher_no": "test-inv-41a"})
    assert r.status_code == 200
    ids = [e["id"] for e in r.json()["entries"]]
    assert entry["id"] in ids


def test_search_partial_no_match(s, entry):
    r = s.get(f"{BASE_URL}/api/rokad/by-voucher", params={"voucher_no": "TEST-INV"})
    assert entry["id"] not in [e["id"] for e in r.json()["entries"]]


def test_search_regex_safe(s):
    r = s.get(f"{BASE_URL}/api/rokad/by-voucher", params={"voucher_no": ".*"})
    assert r.status_code == 200
    assert all(e.get("inv_no") == ".*" or e.get("voucher_no") == ".*" for e in r.json()["entries"])


def test_search_by_vno_still_works(s, entry):
    r = s.get(f"{BASE_URL}/api/rokad/by-voucher", params={"voucher_no": entry["voucher_no"], "cash_account_id": entry["cash_account_id"]})
    assert entry["id"] in [e["id"] for e in r.json()["entries"]]


def test_update_inv(s, entry):
    body = {k: entry[k] for k in ("date", "type", "amount", "description", "cash_account_id", "cash_account_name", "voucher_no")}
    body["inv_no"] = "TEST-INV-41B"
    r = s.put(f"{BASE_URL}/api/rokad/{entry['id']}", json=body)
    assert r.status_code == 200, r.text
    g = s.get(f"{BASE_URL}/api/rokad/{entry['id']}").json()
    assert g["inv_no"] == "TEST-INV-41B"
    lst = s.get(f"{BASE_URL}/api/rokad", params={"date_from": "2026-10-19", "date_to": "2026-10-19"}).json()
    lst = lst if isinstance(lst, list) else lst.get("entries", [])
    assert any(e["id"] == entry["id"] and e["inv_no"] == "TEST-INV-41B" for e in lst)


def test_create_without_inv_defaults_empty(s, cash):
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-10-19", "type": "jama", "amount": 5, "description": "TEST_inv41b",
                                              "cash_account_id": cash["id"]})
    assert r.status_code in (200, 201)
    d = r.json()
    assert d.get("inv_no", "") == ""
    s.delete(f"{BASE_URL}/api/rokad/{d['id']}")
