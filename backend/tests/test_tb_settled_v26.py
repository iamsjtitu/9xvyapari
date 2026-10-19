# Iteration 26: Trial Balance ACCOUNT CLEAR breakdown (row ids + settle_account_id) & Party Khata settled flags
# Requires SETTLE TEST PARTY state: receipt 1000 (2026-06-20) + payment 40 settle (2026-06-21). Set KEEP_DATA=1 to keep QA SETTLED B for UI tests.
import os
import pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CLEAR_ID = "e00cbcee-8be5-4ca1-a90a-566488022450"
STP_ID = "640f05fe-107a-4c69-8752-eef837c70f77"
B_NAME = "QA SETTLED B"


def login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    r.raise_for_status()
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})
    return ss


def cleanup_b(s):
    for x in s.get(f"{BASE_URL}/api/rokad", params={"date_from": "2026-06-22", "date_to": "2026-06-23"}).json():
        if x.get("party_name") == B_NAME:
            s.delete(f"{BASE_URL}/api/rokad/{x['id']}")
    for p in s.get(f"{BASE_URL}/api/parties").json():
        if p.get("name") == B_NAME:
            s.delete(f"{BASE_URL}/api/parties/{p['id']}")


@pytest.fixture(scope="module")
def s():
    try:
        return login()
    except Exception as e:
        pytest.skip(f"login failed {e}")


@pytest.fixture(scope="module")
def cash(s):
    return s.get(f"{BASE_URL}/api/accounts").json()[0]


@pytest.fixture(scope="module")
def b(s, cash):
    cleanup_b(s)
    p = s.post(f"{BASE_URL}/api/parties", json={"name": B_NAME, "opening_balance": 300})
    assert p.status_code == 200, p.text
    pid = p.json()["id"]
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-06-22", "type": "jama", "amount": 250, "party_id": pid, "party_name": B_NAME,
                                              "mode": "Cash", "cash_account_id": cash["id"], "cash_account_name": cash["name"], "settle": True})
    assert r.status_code == 200, r.text
    yield {"pid": pid, "rokad": r.json()}
    if os.environ.get("KEEP_DATA") != "1":
        cleanup_b(s)


def _party(s, pid):
    return next(p for p in s.get(f"{BASE_URL}/api/parties").json() if p["id"] == pid)


def test_tb_has_settle_id_and_row_ids(s):
    d = s.get(f"{BASE_URL}/api/reports/trial-balance").json()
    assert d["settle_account_id"] == CLEAR_ID
    rows = [r for sec in d["sections"] for r in sec["rows"]]
    assert rows and all(isinstance(r.get("id"), str) and r["id"] for r in rows)
    clear = next(r for r in rows if r["id"] == CLEAR_ID)
    assert clear["name"] == "ACCOUNT CLEAR"
    assert abs(clear["balance"] - 40) < 0.01


def test_parties_have_settled_fields(s):
    ps = s.get(f"{BASE_URL}/api/parties").json()
    for p in ps:
        assert "settled_upto" in p and isinstance(p["settled"], bool)
        assert p["settled"] == (bool(p["settled_upto"]) and abs(p["balance"]) < 0.005)
    stp = next(p for p in ps if p["id"] == STP_ID)
    assert stp["settled_upto"] == "2026-06-21" and stp["settled"] is True and abs(stp["balance"]) < 0.005


def test_b_settled_and_tb_clear_90(s, b):
    assert b["rokad"]["settlement"]["amount"] == 50
    p = _party(s, b["pid"])
    assert p["settled"] is True and p["settled_upto"] == "2026-06-22"
    d = s.get(f"{BASE_URL}/api/reports/trial-balance").json()
    clear = next(r for sec in d["sections"] for r in sec["rows"] if r["id"] == CLEAR_ID)
    assert abs(clear["balance"] - 90) < 0.01


def test_settled_flips_false_on_new_receipt(s, b, cash):
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-06-23", "type": "jama", "amount": 10, "party_id": b["pid"], "party_name": B_NAME,
                                              "mode": "Cash", "cash_account_id": cash["id"], "cash_account_name": cash["name"]})
    assert r.status_code == 200, r.text
    p = _party(s, b["pid"])
    assert abs(p["balance"] + 10) < 0.01
    assert p["settled"] is False and p["settled_upto"] == "2026-06-22"
    assert s.delete(f"{BASE_URL}/api/rokad/{r.json()['id']}").status_code == 200
    p = _party(s, b["pid"])
    assert p["settled"] is True and abs(p["balance"]) < 0.005


def test_account_clear_report_rows(s, b):
    d = s.get(f"{BASE_URL}/api/reports/account-clear").json()
    pids = {r.get("party_id") for r in d["rows"]}
    assert STP_ID in pids and b["pid"] in pids
