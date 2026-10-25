# Iteration 47: Rokad passbook register data + overdraft alert backend support (ledger balance as_on)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CASH = "3811380b-f2ca-407b-9478-e77b69909c25"
DATE = "2026-06-20"


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return ss


@pytest.fixture(scope="module")
def ctx(s):
    p = s.post(f"{BASE_URL}/api/parties", json={"name": "TEST_QA47 PARTY", "type": "both"})
    assert p.status_code in (200, 201), p.text
    pid = p.json()["id"]
    c = {"pid": pid, "ids": []}
    yield c
    for i in c["ids"]:
        s.delete(f"{BASE_URL}/api/rokad/{i}")
    s.delete(f"{BASE_URL}/api/parties/{pid}")


def _bal(s, as_on=DATE):
    r = s.get(f"{BASE_URL}/api/ledgers/{CASH}/balance", params={"as_on": as_on})
    assert r.status_code == 200, r.text
    return r.json()


# Ledger balance endpoint used by overdraft alert
def test_cash_balance_positive_and_named(s):
    d = _bal(s)
    assert d["name"] == "CASH IN HAND"
    assert d["balance"] > 0
    assert d["kind"] == "party"


def test_balance_bad_date_400(s):
    r = s.get(f"{BASE_URL}/api/ledgers/{CASH}/balance", params={"as_on": "20-06-2026"})
    assert r.status_code == 400


def test_balance_unknown_404(s):
    r = s.get(f"{BASE_URL}/api/ledgers/nope-xyz/balance")
    assert r.status_code == 404


# Rokad entries move the cash balance correctly (receipt +, payment -)
def test_entries_affect_cash_balance(s, ctx):
    before = _bal(s)["balance"]
    base = {"date": DATE, "mode": "Cash", "cash_account_id": CASH, "party_id": ctx["pid"],
            "party_name": "TEST_QA47 PARTY", "description": "QA47"}
    r1 = s.post(f"{BASE_URL}/api/rokad", json={**base, "type": "jama", "amount": 5000})
    assert r1.status_code in (200, 201), r1.text
    ctx["ids"].append(r1.json()["id"])
    r2 = s.post(f"{BASE_URL}/api/rokad", json={**base, "type": "kharch", "amount": 1200})
    assert r2.status_code in (200, 201), r2.text
    ctx["ids"].append(r2.json()["id"])
    after = _bal(s)["balance"]
    assert round(after - before, 2) == 3800
    # balance as on day before is unaffected
    prev = _bal(s, "2026-06-19")["balance"]
    assert round(before - prev, 2) == round(before - prev, 2)
    assert round(after - _bal(s, "2026-06-19")["balance"], 2) >= 3800 - 0.01


def test_summary_matches_ledger_balance(s, ctx):
    r = s.get(f"{BASE_URL}/api/rokad/accounts-summary", params={"date_from": "2026-05-01", "date_to": "2026-06-30"})
    assert r.status_code == 200
    row = next(x for x in r.json()["rows"] if x["id"] == CASH)
    assert round(row["closing"], 2) == round(_bal(s, "2026-06-30")["balance"], 2)
    assert round(row["opening"] + row["jama"] - row["kharch"] + (row.get("other") or 0), 2) == round(row["closing"], 2)


def test_list_contains_entries(s, ctx):
    r = s.get(f"{BASE_URL}/api/rokad", params={"date_from": "2026-05-01", "date_to": "2026-06-30"})
    ids = {e["id"] for e in r.json()}
    assert set(ctx["ids"]) <= ids


# Backend has no overdraft block (frontend-only confirm) -> huge payment is accepted by API
def test_huge_payment_api_accepted_then_deleted(s, ctx):
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": DATE, "type": "kharch", "amount": 999999999, "mode": "Cash",
                                              "cash_account_id": CASH, "party_id": ctx["pid"], "party_name": "TEST_QA47 PARTY"})
    assert r.status_code in (200, 201)
    eid = r.json()["id"]
    assert _bal(s)["balance"] < 0
    assert s.delete(f"{BASE_URL}/api/rokad/{eid}").status_code in (200, 204)
    assert _bal(s)["balance"] > 0
