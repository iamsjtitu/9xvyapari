# Iteration 19: Account Settled (rokad settle -> auto journal to ACCOUNT CLEAR) + party create hardening
import os, time
import pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CLEAR_ID = "e00cbcee-8be5-4ca1-a90a-566488022450"
D = "2026-06-12"


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})
    return ss


@pytest.fixture(scope="module")
def cleanup(s):
    ids = {"parties": [], "rokad": []}
    yield ids
    for rid in ids["rokad"]:
        s.delete(f"{BASE_URL}/api/rokad/{rid}")
    for pid in ids["parties"]:
        s.delete(f"{BASE_URL}/api/parties/{pid}")


def _cash(s):
    accs = s.get(f"{BASE_URL}/api/accounts").json()
    c = next((a for a in accs if "CASH" in (a.get("name") or "").upper()), accs[0] if accs else None)
    return c


def _bal(s, pid, d=D):
    r = s.get(f"{BASE_URL}/api/ledgers/{pid}/balance", params={"as_on": d})
    assert r.status_code == 200, r.text
    return round(r.json()["balance"], 2)


def _settle_journals(s, rid):
    js = s.get(f"{BASE_URL}/api/journal", params={"date_from": D, "date_to": D}).json()
    return [j for j in js if j.get("settles_rokad_id") == rid]


def _mk_party(s, cleanup, name, ob):
    r = s.post(f"{BASE_URL}/api/parties", json={"name": name, "type": "both", "opening_balance": ob})
    assert r.status_code in (200, 201), r.text
    cleanup["parties"].append(r.json()["id"])
    return r.json()


# settings link
def test_settings_has_settle_account(s):
    st = s.get(f"{BASE_URL}/api/settings").json()
    assert st.get("settle_account_id") == CLEAR_ID
    assert (st.get("settle_account_name") or "").upper() == "ACCOUNT CLEAR"


# full Dr flow: create -> edit -> unsettle -> resettle -> delete
def test_settle_dr_full_flow(s, cleanup):
    p = _mk_party(s, cleanup, f"QA SETTLE PARTY {int(time.time())}", 1000)
    pid = p["id"]
    cash = _cash(s)
    body = {"date": D, "type": "jama", "amount": 940, "party_id": pid, "party_name": p["name"], "mode": "Cash",
            "cash_account_id": cash["id"], "cash_account_name": cash["name"], "settle": True}
    r = s.post(f"{BASE_URL}/api/rokad", json=body)
    assert r.status_code == 200, r.text
    rk = r.json(); rid = rk["id"]; cleanup["rokad"].append(rid)
    st = rk["settlement"]
    assert st["amount"] == 60 and st["side"] == "Dr" and st["ledger"] == "ACCOUNT CLEAR"
    assert st["voucher_no"].startswith("J")
    assert st["narration"].startswith("Account cleared upto 12-06-2026")
    assert _bal(s, pid) == 0
    js = _settle_journals(s, rid)
    assert len(js) == 1
    lines = js[0]["lines"]
    dr = next(l for l in lines if l["debit"] > 0); cr = next(l for l in lines if l["credit"] > 0)
    assert dr["account_id"] == CLEAR_ID and dr["debit"] == 60
    assert cr["account_id"] == pid and cr["credit"] == 60
    lst = s.get(f"{BASE_URL}/api/rokad", params={"date_from": D, "date_to": D}).json()
    doc = next(x for x in lst if x["id"] == rid)
    assert doc["settle"] is True and doc["settle_journal_id"] == js[0]["id"] and doc["settled_amount"] == 60

    # edit amount 900 -> 100
    r = s.put(f"{BASE_URL}/api/rokad/{rid}", json={**body, "amount": 900})
    assert r.status_code == 200, r.text
    assert r.json()["settlement"]["amount"] == 100
    assert len(_settle_journals(s, rid)) == 1
    assert _bal(s, pid) == 0

    # untick
    r = s.put(f"{BASE_URL}/api/rokad/{rid}", json={**body, "amount": 900, "settle": False})
    assert r.status_code == 200 and r.json()["settlement"] is None
    assert len(_settle_journals(s, rid)) == 0
    assert _bal(s, pid) == 100

    # retick + delete
    r = s.put(f"{BASE_URL}/api/rokad/{rid}", json={**body, "amount": 900})
    assert r.json()["settlement"]["amount"] == 100
    assert s.delete(f"{BASE_URL}/api/rokad/{rid}").status_code == 200
    cleanup["rokad"].remove(rid)
    assert len(_settle_journals(s, rid)) == 0
    assert _bal(s, pid) == 1000


# Cr side: we owe party
def test_settle_cr_side(s, cleanup):
    p = _mk_party(s, cleanup, f"QA SETTLE CR {int(time.time())}", -500)
    pid = p["id"]
    cash = _cash(s)
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": D, "type": "kharch", "amount": 480, "party_id": pid,
                                               "party_name": p["name"], "mode": "Cash", "cash_account_id": cash["id"],
                                               "settle": True})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]; cleanup["rokad"].append(rid)
    st = r.json()["settlement"]
    assert st["amount"] == 20 and st["side"] == "Cr"
    js = _settle_journals(s, rid)
    assert len(js) == 1
    dr = next(l for l in js[0]["lines"] if l["debit"] > 0); cr = next(l for l in js[0]["lines"] if l["credit"] > 0)
    assert dr["account_id"] == pid and cr["account_id"] == CLEAR_ID and dr["debit"] == 20
    assert _bal(s, pid) == 0


# error: party == ACCOUNT CLEAR ledger -> 400 and NO orphan rokad left behind
def test_settle_party_is_clear_ledger(s):
    cash = _cash(s)
    tag = f"QA_ORPHAN_{int(time.time())}"
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": D, "type": "jama", "amount": 5, "party_id": CLEAR_ID,
                                               "party_name": "ACCOUNT CLEAR", "mode": "Cash", "description": tag,
                                               "cash_account_id": cash["id"], "settle": True})
    assert r.status_code == 400, r.text
    assert "ek hi nahi" in r.text
    lst = s.get(f"{BASE_URL}/api/rokad", params={"date_from": D, "date_to": D}).json()
    orphans = [x for x in lst if x.get("description") == tag]
    for o in orphans:
        s.delete(f"{BASE_URL}/api/rokad/{o['id']}")
    assert not orphans, f"rokad persisted despite 400: {len(orphans)} orphan(s)"


# party create hardening
@pytest.mark.parametrize("nm", ["", "   "])
def test_party_empty_name_422(s, nm):
    r = s.post(f"{BASE_URL}/api/parties", json={"name": nm})
    assert r.status_code == 422, r.text


def test_party_dup_case_insensitive_409(s, cleanup):
    nm = f"QA DUP PARTY {int(time.time())}"
    _mk_party(s, cleanup, nm, 0)
    r = s.post(f"{BASE_URL}/api/parties", json={"name": nm.lower()})
    assert r.status_code == 409, r.text
    r = s.post(f"{BASE_URL}/api/parties", json={"name": "  " + nm + "  "})
    assert r.status_code == 409, r.text
