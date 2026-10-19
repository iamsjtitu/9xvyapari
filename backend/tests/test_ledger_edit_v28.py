# Iteration 28: Edit voucher from Party Ledger – GET /api/rokad/{id}, GET /api/journal/{id}, route shadowing, setup data
# Set KEEP_DATA=1 to keep the created vouchers (ids written to /tmp/qa28.json) for UI testing.
import os, json
import pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PID = "640f05fe-107a-4c69-8752-eef837c70f77"
PNAME = "SETTLE TEST PARTY"
CLEAR_ID = "e00cbcee-8be5-4ca1-a90a-566488022450"
KEEP = os.environ.get("KEEP_DATA") == "1"


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})
    return ss


@pytest.fixture(scope="module")
def data(s):
    ids = {"rokad": [], "journal": [], "bills": []}
    accs = s.get(f"{BASE_URL}/api/accounts").json()
    cash = next(a for a in accs if "CASH" in (a.get("name") or "").upper())
    base = {"type": "jama", "party_id": PID, "party_name": PNAME, "mode": "Cash",
            "cash_account_id": cash["id"], "cash_account_name": cash["name"]}
    r = s.post(f"{BASE_URL}/api/rokad", json={**base, "date": "2026-06-10", "amount": 300, "settle": False})
    assert r.status_code == 200, r.text
    ids["rokad_a"] = r.json()["id"]; ids["rokad"].append(ids["rokad_a"])
    r = s.post(f"{BASE_URL}/api/journal", json={"date": "2026-06-11", "narration": "QA manual jrnl", "lines": [
        {"account_id": PID, "account_name": PNAME, "debit": 20, "credit": 0},
        {"account_id": CLEAR_ID, "account_name": "ACCOUNT CLEAR", "debit": 0, "credit": 20}]})
    assert r.status_code == 200, r.text
    ids["journal_b"] = r.json()["id"]; ids["journal"].append(ids["journal_b"])
    r = s.post(f"{BASE_URL}/api/rokad", json={**base, "date": "2026-06-12", "amount": 700, "settle": True})
    assert r.status_code == 200, r.text
    ids["rokad_c"] = r.json()["id"]; ids["rokad"].append(ids["rokad_c"])
    ids["settle_journal"] = (r.json().get("settlement") or {}).get("journal_id")
    item = s.get(f"{BASE_URL}/api/items").json()[0]
    bill = {"bill_type": "sale", "party_id": PID, "party_name": PNAME, "date": "2026-06-13",
            "items": [{"item_id": item["id"], "item_name": item["name"], "weight": 1, "nwt": 1, "rate": 100, "amount": 100}],
            "subtotal": 100, "total": 100}
    r = s.post(f"{BASE_URL}/api/bills", json=bill)
    assert r.status_code == 200, r.text
    ids["bill_d"] = r.json()["id"]; ids["bills"].append(ids["bill_d"])
    json.dump(ids, open("/tmp/qa28.json", "w"))
    yield ids
    if not KEEP:
        for b in ids["bills"]:
            s.delete(f"{BASE_URL}/api/bills/{b}")
        for j in ids["journal"]:
            s.delete(f"{BASE_URL}/api/journal/{j}")
        for rid in ids["rokad"]:
            s.delete(f"{BASE_URL}/api/rokad/{rid}")


# GET /api/rokad/{id}
def test_get_rokad(s, data):
    r = s.get(f"{BASE_URL}/api/rokad/{data['rokad_a']}")
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == data["rokad_a"] and d["amount"] == 300 and d["date"].startswith("2026-06-10")
    assert d["party_id"] == PID and "_id" not in d


def test_get_rokad_404(s):
    r = s.get(f"{BASE_URL}/api/rokad/does-not-exist-xyz")
    assert r.status_code == 404


def test_get_rokad_requires_auth():
    assert requests.get(f"{BASE_URL}/api/rokad/does-not-exist-xyz").status_code == 401


# GET /api/journal/{id}
def test_get_journal(s, data):
    r = s.get(f"{BASE_URL}/api/journal/{data['journal_b']}")
    assert r.status_code == 200
    d = r.json()
    assert d["narration"] == "QA manual jrnl" and d["date"].startswith("2026-06-11")
    assert len(d["lines"]) == 2 and "_id" not in d


def test_get_journal_404(s):
    assert s.get(f"{BASE_URL}/api/journal/nope-xyz").status_code == 404


# Regression: literal /rokad/* GET routes must not be shadowed by /rokad/{rid}
def test_accounts_summary_not_shadowed(s):
    r = s.get(f"{BASE_URL}/api/rokad/accounts-summary", params={"date_from": "2026-06-01", "date_to": "2026-06-30"})
    assert r.status_code == 200, r.text
    assert "rows" in r.json()


def test_by_voucher_not_shadowed(s):
    r = s.get(f"{BASE_URL}/api/rokad/by-voucher", params={"voucher_no": "1"})
    assert r.status_code != 404 or "Entry nahi mili" not in r.text


# Settlement journal exists and links back to rokad c; editing the auto journal is forbidden
def test_settlement_journal_links_rokad(s, data):
    assert data["settle_journal"]
    j = s.get(f"{BASE_URL}/api/journal/{data['settle_journal']}").json()
    assert j.get("settles_rokad_id") == data["rokad_c"]
    r = s.put(f"{BASE_URL}/api/journal/{data['settle_journal']}", json={"date": j["date"], "narration": "x", "lines": j["lines"]})
    assert r.status_code == 400


# Ledger summary returns all 4 voucher types for the party
def test_ledger_summary_rows(s, data):
    r = s.get(f"{BASE_URL}/api/summary/party/{PID}", params={"as_on": "2026-06-30"})
    assert r.status_code == 200
    d = r.json()
    assert {x["id"] for x in d["rokad"]} >= {data["rokad_a"], data["rokad_c"]}
    jids = {x["id"] for x in d["journal"]}
    assert data["journal_b"] in jids and data["settle_journal"] in jids
    assert data["bill_d"] in {b["id"] for b in d["bills"]}
