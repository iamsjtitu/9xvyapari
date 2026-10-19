# Iteration 24: Opening Balance Sheet — ACCOUNT CLEAR party-wise breakdown (row ids + settle_account_id + account-clear date_to)
import os, sys, time
import pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CLEAR_ID = "e00cbcee-8be5-4ca1-a90a-566488022450"
STP_ID = "640f05fe-107a-4c69-8752-eef837c70f77"  # SETTLE TEST PARTY (1000 Dr)
B_NAME = "QA CLEAR PARTY B"


def login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    r.raise_for_status()
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})
    return ss


def setup_data(s):
    accs = s.get(f"{BASE_URL}/api/accounts").json()
    cash = accs[0]
    r1 = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-06-20", "type": "jama", "amount": 940, "party_id": STP_ID,
                                               "party_name": "SETTLE TEST PARTY", "mode": "Cash", "cash_account_id": cash["id"],
                                               "cash_account_name": cash["name"], "settle": True})
    assert r1.status_code == 200, r1.text
    p = s.post(f"{BASE_URL}/api/parties", json={"name": B_NAME, "opening_balance": 300})
    assert p.status_code == 200, p.text
    pid = p.json()["id"]
    r2 = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-06-22", "type": "jama", "amount": 250, "party_id": pid,
                                               "party_name": B_NAME, "mode": "Cash", "cash_account_id": cash["id"],
                                               "cash_account_name": cash["name"], "settle": True})
    assert r2.status_code == 200, r2.text
    return {"r1": r1.json(), "r2": r2.json(), "pid": pid}


def cleanup(s):
    for d in ("2026-06-20", "2026-06-22"):
        for x in s.get(f"{BASE_URL}/api/rokad", params={"date_from": d, "date_to": d}).json():
            if x.get("party_id") == STP_ID or x.get("party_name") == B_NAME:
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
def data(s):
    cleanup(s)
    ctx = setup_data(s)
    yield ctx
    cleanup(s)


def _ob(s, d):
    r = s.get(f"{BASE_URL}/api/reports/opening-balances", params={"as_on": d})
    assert r.status_code == 200, r.text
    return r.json()


def test_settlement_amounts(data):
    assert data["r1"]["settlement"]["amount"] == 60
    assert data["r2"]["settlement"]["amount"] == 50


def test_ob_rows_have_id_and_settle_id(s, data):
    d = _ob(s, "2026-06-30")
    assert d["settle_account_id"] == CLEAR_ID
    rows = [r for sec in d["sections"] for r in sec["rows"]]
    assert rows and all(isinstance(r.get("id"), str) and r["id"] for r in rows)
    clear = next(r for r in rows if r["id"] == CLEAR_ID)
    assert clear["name"] == "ACCOUNT CLEAR"
    assert clear["balance"] >= 110
    # the settled parties are zero → not listed
    assert not any(r["id"] in (STP_ID, data["pid"]) for r in rows)


def test_ob_totals_consistent(s, data):
    d = _ob(s, "2026-06-30")
    for sec in d["sections"]:
        assert round(sum(r["balance"] for r in sec["rows"] if r["balance"] > 0), 2) == sec["dr_total"]
    assert d["grand_dr"] == round(sum(x["dr_total"] for x in d["sections"]), 2)
    assert d["count"] == sum(len(x["rows"]) for x in d["sections"])


def test_account_clear_breakdown_matches_head(s, data):
    r = s.get(f"{BASE_URL}/api/reports/account-clear", params={"date_to": "2026-06-30"})
    assert r.status_code == 200, r.text
    j = r.json()
    by = {}
    for row in j["rows"]:
        by[row["party_id"]] = by.get(row["party_id"], 0) + (row["amount"] if row["side"] == "off" else -row["amount"])
    assert round(by.get(STP_ID, 0), 2) == 60
    assert round(by.get(data["pid"], 0), 2) == 50
    d = _ob(s, "2026-06-30")
    clear = next(r for sec in d["sections"] for r in sec["rows"] if r["id"] == CLEAR_ID)
    assert round(sum(by.values()), 2) == round(clear["balance"], 2), "breakdown total != ACCOUNT CLEAR head"


def test_before_settlement(s, data):
    j = s.get(f"{BASE_URL}/api/reports/account-clear", params={"date_to": "2026-06-19"}).json()
    assert not any(r["party_id"] in (STP_ID, data["pid"]) for r in j["rows"])
    d = _ob(s, "2026-06-19")
    assert d["settle_account_id"] == CLEAR_ID


def test_fy_mode_has_settle_id(s):
    ys = s.get(f"{BASE_URL}/api/year-end/history").json().get("years", [])
    if not ys:
        pytest.skip("no closed FY")
    d = s.get(f"{BASE_URL}/api/reports/opening-balances", params={"fy_id": ys[0]["id"]}).json()
    assert "settle_account_id" in d
    assert all("id" in r for sec in d["sections"] for r in sec["rows"])


if __name__ == "__main__":  # python file.py setup|cleanup  (for UI testing)
    ss = login()
    if sys.argv[1] == "setup":
        cleanup(ss); print(setup_data(ss)["pid"])
    else:
        cleanup(ss); print("cleaned")
