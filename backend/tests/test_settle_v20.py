# Iteration 20: Account Settled validation-before-write (POST/PUT rokad) + journal voucher max+1 numbering
import os, time
import pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CLEAR_ID = "e00cbcee-8be5-4ca1-a90a-566488022450"
STP_ID = "640f05fe-107a-4c69-8752-eef837c70f77"  # SETTLE TEST PARTY (1000 Dr)
D = "2026-06-13"


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})
    return ss


def _rok(s, d=D):
    return s.get(f"{BASE_URL}/api/rokad", params={"date_from": d, "date_to": d}).json()


def _cash(s):
    accs = s.get(f"{BASE_URL}/api/accounts").json()
    return next((a for a in accs if "CASH" in (a.get("name") or "").upper()), accs[0])


def _jnum(v):
    return int(v[1:])


# POST settle validations: no row must be written
@pytest.mark.parametrize("case", ["clear", "account", "noparty"])
def test_post_settle_invalid_no_row(s, case):
    cash = _cash(s)
    tag = f"QA_V20_{case}_{int(time.time()*1000)}"
    accs = s.get(f"{BASE_URL}/api/accounts").json()
    body = {"date": D, "type": "jama", "amount": 5, "mode": "Cash", "description": tag,
            "cash_account_id": cash["id"], "settle": True}
    if case == "clear":
        body.update(party_id=CLEAR_ID, party_name="ACCOUNT CLEAR")
    elif case == "account":
        acc = next((a for a in accs if a["id"] != cash["id"]), accs[0])
        body.update(party_id=acc["id"], party_name=acc["name"])
    before = len(_rok(s))
    r = s.post(f"{BASE_URL}/api/rokad", json=body)
    after = _rok(s)
    orphans = [x for x in after if x.get("description") == tag]
    for o in orphans:
        s.delete(f"{BASE_URL}/api/rokad/{o['id']}")
    assert r.status_code == 400, r.text
    if case == "clear":
        assert "ek hi nahi" in r.text
    elif case == "account":
        assert "sirf party ledger" in r.text
    assert not orphans and len(after) == before


# PUT settle validation: stored entry unchanged
def test_put_settle_invalid_unchanged(s):
    cash = _cash(s)
    body = {"date": D, "type": "jama", "amount": 77, "party_id": STP_ID, "party_name": "SETTLE TEST PARTY",
            "mode": "Cash", "cash_account_id": cash["id"], "settle": False, "description": "QA_V20_PUT"}
    r = s.post(f"{BASE_URL}/api/rokad", json=body)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    try:
        r2 = s.put(f"{BASE_URL}/api/rokad/{rid}", json={**body, "settle": True, "party_id": CLEAR_ID,
                                                         "party_name": "ACCOUNT CLEAR", "amount": 999})
        assert r2.status_code == 400, r2.text
        doc = next(x for x in _rok(s) if x["id"] == rid)
        assert doc["party_id"] == STP_ID and doc["party_name"] == "SETTLE TEST PARTY"
        assert not doc.get("settle") and doc["amount"] == 77
        js = [j for j in s.get(f"{BASE_URL}/api/journal").json() if j.get("settles_rokad_id") == rid]
        assert not js
    finally:
        s.delete(f"{BASE_URL}/api/rokad/{rid}")


# Journal voucher numbering: max+1, no reuse after delete; settle journal continues sequence
def test_journal_vno_max_plus_one(s):
    cash = _cash(s)
    jb = {"date": D, "narration": "QA_V20_J", "lines": [
        {"account_id": cash["id"], "account_name": cash["name"], "debit": 1, "credit": 0},
        {"account_id": CLEAR_ID, "account_name": "ACCOUNT CLEAR", "debit": 0, "credit": 1}]}
    made, rid = [], None
    try:
        a = s.post(f"{BASE_URL}/api/journal", json=jb).json(); made.append(a["id"])
        b = s.post(f"{BASE_URL}/api/journal", json=jb).json(); made.append(b["id"])
        assert _jnum(b["voucher_no"]) == _jnum(a["voucher_no"]) + 1
        assert s.delete(f"{BASE_URL}/api/journal/{a['id']}").status_code == 200
        made.remove(a["id"])
        c = s.post(f"{BASE_URL}/api/journal", json=jb).json(); made.append(c["id"])
        assert _jnum(c["voucher_no"]) == _jnum(a["voucher_no"]) + 2, (a["voucher_no"], c["voucher_no"])
        all_v = [j["voucher_no"] for j in s.get(f"{BASE_URL}/api/journal").json()]
        assert len(all_v) == len(set(all_v)), "duplicate journal voucher numbers exist"
        # settlement journal continues
        r = s.post(f"{BASE_URL}/api/rokad", json={"date": D, "type": "jama", "amount": 950, "party_id": STP_ID,
                                                   "party_name": "SETTLE TEST PARTY", "mode": "Cash",
                                                   "cash_account_id": cash["id"], "settle": True})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        st = r.json()["settlement"]
        assert st["amount"] == 50 and _jnum(st["voucher_no"]) == _jnum(c["voucher_no"]) + 1
    finally:
        if rid:
            s.delete(f"{BASE_URL}/api/rokad/{rid}")
        for jid in made:
            s.delete(f"{BASE_URL}/api/journal/{jid}")
    bal = s.get(f"{BASE_URL}/api/ledgers/{STP_ID}/balance", params={"as_on": D}).json()["balance"]
    assert round(bal, 2) == 1000
