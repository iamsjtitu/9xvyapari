# Iteration 21: Settled marker (settled_upto / settles_rokad_id), Account Clear report, Reopen settled rokad
import os, time
import pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CLEAR_ID = "e00cbcee-8be5-4ca1-a90a-566488022450"
STP_ID = "640f05fe-107a-4c69-8752-eef837c70f77"  # SETTLE TEST PARTY (1000 Dr)
D = "2026-06-20"
RANGE = {"date_from": "2026-06-01", "date_to": "2026-06-30"}


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})
    return ss


def _cash(s):
    accs = s.get(f"{BASE_URL}/api/accounts").json()
    return next((a for a in accs if "CASH" in (a.get("name") or "").upper()), accs[0])


def _rep(s, **p):
    r = s.get(f"{BASE_URL}/api/reports/account-clear", params=p or RANGE)
    assert r.status_code == 200, r.text
    return r.json()


def _bal(s, pid, d="2026-06-30"):
    return round(s.get(f"{BASE_URL}/api/ledgers/{pid}/balance", params={"as_on": d}).json()["balance"], 2)


@pytest.fixture(scope="module")
def settled(s):
    cash = _cash(s)
    body = {"date": D, "type": "jama", "amount": 940, "party_id": STP_ID, "party_name": "SETTLE TEST PARTY",
            "mode": "Cash", "cash_account_id": cash["id"], "cash_account_name": cash["name"], "settle": True}
    r = s.post(f"{BASE_URL}/api/rokad", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["settlement"]["amount"] == 60
    ctx = {"rid": d["id"], "body": body, "jid": d["settlement"]["journal_id"], "extra": []}
    yield ctx
    for kind, i in ctx["extra"]:
        s.delete(f"{BASE_URL}/api/{kind}/{i}")
    s.delete(f"{BASE_URL}/api/rokad/{ctx['rid']}")
    assert _bal(s, STP_ID) == 1000


# (1) settled marker data in party ledger
def test_party_ledger_settled_upto(s, settled):
    r = s.get(f"{BASE_URL}/api/summary/party/{STP_ID}", params={"as_on": "2026-06-30"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["settled_upto"] == D
    js = [j for j in d["journal"] if j.get("settles_rokad_id")]
    assert js and js[0]["settles_rokad_id"] == settled["rid"] and js[0]["auto"] == "settle"
    r2 = s.get(f"{BASE_URL}/api/summary/party/{STP_ID}", params={"as_on": "2026-06-19"}).json()
    assert r2["settled_upto"] is None


# (2) account clear report
def test_account_clear_report(s, settled):
    d = _rep(s)
    assert d["ledger"]["name"] == "ACCOUNT CLEAR"
    assert d["count"] == 1 and d["total_off"] == 60 and d["total_back"] == 0 and d["net"] == 60
    row = d["rows"][0]
    assert row["date"] == D and row["voucher_no"].startswith("J")
    assert row["party_name"] == "SETTLE TEST PARTY" and row["party_id"] == STP_ID
    assert row["rokad_id"] == settled["rid"] and row["rokad_vno"]
    assert row["amount"] == 60 and row["side"] == "off" and row["auto"] is True
    assert "Account cleared upto 20-06-2026" in row["narration"]
    assert _rep(s, date_from="2026-06-01", date_to="2026-06-19")["count"] == 0


def test_account_clear_invalid_date(s):
    r = s.get(f"{BASE_URL}/api/reports/account-clear", params={"date_from": "20-06-2026"})
    assert r.status_code == 400


def test_account_clear_manual_journal(s, settled):
    jb = {"date": "2026-06-21", "narration": "QA_V21_MANUAL", "lines": [
        {"account_id": STP_ID, "account_name": "SETTLE TEST PARTY", "debit": 25, "credit": 0},
        {"account_id": CLEAR_ID, "account_name": "ACCOUNT CLEAR", "debit": 0, "credit": 25}]}
    r = s.post(f"{BASE_URL}/api/journal", json=jb)
    assert r.status_code == 200, r.text
    jid = r.json()["id"]
    try:
        d = _rep(s)
        assert d["count"] == 2 and d["total_back"] == 25 and d["net"] == 35
        m = next(x for x in d["rows"] if x["journal_id"] == jid)
        assert m["side"] == "back" and m["auto"] is False and m["rokad_id"] is None
    finally:
        s.delete(f"{BASE_URL}/api/journal/{jid}")
    assert _rep(s)["count"] == 1


def test_account_clear_cr_party_back(s, settled):
    cash = _cash(s)
    nm = f"QA_V21_CR_{int(time.time())}"
    p = s.post(f"{BASE_URL}/api/parties", json={"name": nm, "opening_balance": -500})
    assert p.status_code == 200, p.text
    pid = p.json()["id"]
    rid = None
    try:
        r = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-06-22", "type": "kharch", "amount": 480, "party_id": pid,
                                                   "party_name": nm, "mode": "Cash", "cash_account_id": cash["id"], "settle": True})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        st = r.json()["settlement"]
        assert st["amount"] == 20 and st["side"] == "Cr"
        d = _rep(s)
        row = next(x for x in d["rows"] if x["rokad_id"] == rid)
        assert row["side"] == "back" and row["amount"] == 20 and row["auto"] is True and row["party_id"] == pid
        assert d["total_back"] == 20 and d["net"] == 40
        assert _bal(s, pid) == 0
    finally:
        if rid:
            s.delete(f"{BASE_URL}/api/rokad/{rid}")
        s.delete(f"{BASE_URL}/api/parties/{pid}")


# (3) reopen
def test_reopen_flow(s, settled):
    rid = settled["rid"]
    assert _bal(s, STP_ID) == 0
    r = s.post(f"{BASE_URL}/api/rokad/{rid}/reopen")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True and d["removed_amount"] == 60 and d["party_id"] == STP_ID and d["party_name"] == "SETTLE TEST PARTY"
    assert _bal(s, STP_ID) == 60
    assert _rep(s)["count"] == 0
    js = [j for j in s.get(f"{BASE_URL}/api/journal").json() if j.get("settles_rokad_id") == rid]
    assert not js
    doc = next(x for x in s.get(f"{BASE_URL}/api/rokad", params={"date_from": D, "date_to": D}).json() if x["id"] == rid)
    assert doc["settle"] is False and "settle_journal_id" not in doc and "settled_amount" not in doc
    led = s.get(f"{BASE_URL}/api/summary/party/{STP_ID}", params={"as_on": "2026-06-30"}).json()
    assert led["settled_upto"] is None
    r2 = s.post(f"{BASE_URL}/api/rokad/{rid}/reopen")
    assert r2.status_code == 400 and "settled nahi hai" in r2.text
    assert s.post(f"{BASE_URL}/api/rokad/does-not-exist-xyz/reopen").status_code == 404
    # re-settle via edit
    r3 = s.put(f"{BASE_URL}/api/rokad/{rid}", json={**settled["body"], "settle": True})
    assert r3.status_code == 200, r3.text
    assert r3.json()["settlement"]["amount"] == 60
    assert _bal(s, STP_ID) == 0 and _rep(s)["count"] == 1
