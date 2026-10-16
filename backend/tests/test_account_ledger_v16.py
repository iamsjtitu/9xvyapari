# Iteration 16: /summary/party/{id} fallback to Chart-of-Accounts ledgers (cash/bank accounts) + regression
import os
from datetime import date, timedelta
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ACC_ID = "ff518072-9f4d-43e3-8cfc-6b148e82280b"
PARTY_ID = "3811380b-f2ca-407b-9478-e77b69909c25"
TODAY = date.today().isoformat()


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    sess.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return sess


@pytest.fixture(scope="module")
def summary(s):
    r = s.get(f"{BASE_URL}/api/rokad/accounts-summary", params={"date_from": "2026-04-01", "date_to": TODAY})
    assert r.status_code == 200
    return {row["id"]: row for row in r.json()["rows"]}


def _running(d):
    bal = d["opening"]
    for r in d["cash_rokad"]:
        bal += r["amount"] if r["type"] == "jama" else -r["amount"]
    for j in d["journal"]:
        bal += j["debit"] - j["credit"]
    return round(bal, 2)


# accounts-summary has both kinds
def test_accounts_summary_kinds(summary):
    assert summary[ACC_ID]["kind"] == "account"
    assert summary[PARTY_ID]["kind"] == "party"


# account-kind ledger
def test_account_ledger_basic(s, summary):
    r = s.get(f"{BASE_URL}/api/summary/party/{ACC_ID}", params={"as_on": TODAY})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["kind"] == "account"
    assert d["party"]["name"]
    assert d["party"]["group_name"] == "CASH & BANK BALANCE"
    assert d["bills"] == [] and d["rokad"] == [] and d["dos_journal"] == []
    assert isinstance(d["cash_rokad"], list) and isinstance(d["journal"], list)
    assert "_id" not in d["party"]
    assert round(d["party"]["balance"], 2) == round(summary[ACC_ID]["closing"], 2)
    # full history: opening = account opening balance and running = closing
    assert _running(d) == round(d["party"]["balance"], 2)


def test_account_ledger_date_from(s, summary):
    r = s.get(f"{BASE_URL}/api/summary/party/{ACC_ID}", params={"as_on": TODAY, "date_from": "2026-04-01"})
    assert r.status_code == 200
    d = r.json()
    assert round(d["opening"], 2) == round(summary[ACC_ID]["opening"], 2)
    for x in d["cash_rokad"] + d["journal"]:
        assert "2026-04-01" <= x["date"] <= TODAY
    assert _running(d) == round(d["party"]["balance"], 2)


def test_account_ledger_past_as_on(s):
    past = (date.today() - timedelta(days=30)).isoformat()
    d = s.get(f"{BASE_URL}/api/summary/party/{ACC_ID}", params={"as_on": past}).json()
    for x in d["cash_rokad"] + d["journal"]:
        assert x["date"] <= past
    b = s.get(f"{BASE_URL}/api/ledgers/{ACC_ID}/balance", params={"as_on": past}).json()
    assert round(b["balance"], 2) == round(d["party"]["balance"], 2)


# party-kind regression
def test_party_ledger_regression(s, summary):
    r = s.get(f"{BASE_URL}/api/summary/party/{PARTY_ID}", params={"as_on": TODAY})
    assert r.status_code == 200
    d = r.json()
    assert d.get("kind") != "account"
    for k in ("bills", "rokad", "cash_rokad", "journal", "dos_journal"):
        assert isinstance(d[k], list)
    assert d["party"]["id"] == PARTY_ID
    assert round(d["party"]["balance"], 2) == round(summary[PARTY_ID]["closing"], 2)


def test_party_ledger_date_from(s, summary):
    d = s.get(f"{BASE_URL}/api/summary/party/{PARTY_ID}", params={"as_on": TODAY, "date_from": "2026-04-01"}).json()
    assert round(d["opening"], 2) == round(summary[PARTY_ID]["opening"], 2)


# errors
def test_unknown_404(s):
    r = s.get(f"{BASE_URL}/api/summary/party/does-not-exist")
    assert r.status_code == 404
    assert r.json()["detail"] == "Party / account nahi mila"


def test_bad_date_400(s):
    assert s.get(f"{BASE_URL}/api/summary/party/{ACC_ID}", params={"as_on": "2026-13-99"}).status_code == 400
    assert s.get(f"{BASE_URL}/api/summary/party/{ACC_ID}", params={"date_from": "abc"}).status_code == 400


def test_semantically_invalid_date(s):
    # 2026-13-99 matches regex shape? No: regex is \d{4}-\d{2}-\d{2} -> it DOES match; check for no 500
    r = s.get(f"{BASE_URL}/api/summary/party/{ACC_ID}", params={"as_on": TODAY, "date_from": "2026-13-99"})
    assert r.status_code in (400, 422), f"got {r.status_code}"


def test_unauth_401():
    r = requests.get(f"{BASE_URL}/api/summary/party/{ACC_ID}")
    assert r.status_code == 401


# ledgers balance regression
@pytest.mark.parametrize("lid,kind", [(ACC_ID, "account"), (PARTY_ID, "party")])
def test_ledger_balance_matches(s, lid, kind):
    b = s.get(f"{BASE_URL}/api/ledgers/{lid}/balance", params={"as_on": TODAY})
    assert b.status_code == 200
    assert b.json()["kind"] == kind
    d = s.get(f"{BASE_URL}/api/summary/party/{lid}", params={"as_on": TODAY}).json()
    assert round(b.json()["balance"], 2) == round(d["party"]["balance"], 2)
