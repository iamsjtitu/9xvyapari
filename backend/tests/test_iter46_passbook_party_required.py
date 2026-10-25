# Iteration 46: passbook ledger convention, Rokad party mandatory, settings partial PUT, transfer smoke
import os
import datetime
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CASH_ID = "3811380b-f2ca-407b-9478-e77b69909c25"
BANK_ID = "4831c910-34a4-49e4-8ad8-52049e96d646"  # HDFC M M TRADERS. (CASH & BANK group)
TODAY = datetime.date.today().isoformat()


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    r = ses.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip("login failed")
    d = r.json()
    ses.headers.update({"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"})
    return ses


@pytest.fixture(scope="module")
def party(s):
    r = s.post(f"{BASE_URL}/api/parties", json={"name": "TEST_QA_PASSBOOK_PARTY", "type": "both"})
    assert r.status_code == 200, r.text
    p = r.json()
    yield p
    s.delete(f"{BASE_URL}/api/parties/{p['id']}")


def _rokad(party_id, typ, amt, **kw):
    b = {"date": TODAY, "type": typ, "amount": amt, "mode": "Cash", "cash_account_id": CASH_ID,
         "description": f"TEST_QA {typ}"}
    if party_id is not None:
        b["party_id"] = party_id
    b.update(kw)
    return b


# Rokad party mandatory
class TestPartyRequired:
    def test_post_without_party(self, s):
        r = s.post(f"{BASE_URL}/api/rokad", json=_rokad(None, "jama", 10))
        assert r.status_code == 400
        assert "Party chunna zaroori hai" in r.json()["detail"]

    def test_post_empty_party(self, s):
        r = s.post(f"{BASE_URL}/api/rokad", json=_rokad("", "jama", 10))
        assert r.status_code == 400
        assert "Party chunna zaroori hai" in r.json()["detail"]

    def test_put_remove_party(self, s, party):
        r = s.post(f"{BASE_URL}/api/rokad", json=_rokad(party["id"], "jama", 11))
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        try:
            r2 = s.put(f"{BASE_URL}/api/rokad/{rid}", json=_rokad("", "jama", 11))
            assert r2.status_code == 400
            assert "Party chunna zaroori hai" in r2.json()["detail"]
            r3 = s.put(f"{BASE_URL}/api/rokad/{rid}", json=_rokad(None, "jama", 11))
            assert r3.status_code == 400
        finally:
            s.delete(f"{BASE_URL}/api/rokad/{rid}")


# Ledger numbers for passbook flow (backend values; sign convention unchanged: +ve = party owes us)
class TestLedgerFlow:
    def test_receipt_payment_balance(self, s, party):
        r1 = s.post(f"{BASE_URL}/api/rokad", json=_rokad(party["id"], "jama", 1000))
        r2 = s.post(f"{BASE_URL}/api/rokad", json=_rokad(party["id"], "kharch", 400))
        assert r1.status_code == 200 and r2.status_code == 200
        ids = [r1.json()["id"], r2.json()["id"]]
        try:
            led = s.get(f"{BASE_URL}/api/summary/party/{party['id']}", params={"as_on": TODAY}).json()
            assert abs(led["party"]["balance"] - (-600)) < 0.01, led["party"]["balance"]
            assert {x["id"] for x in led["rokad"]} >= set(ids)
            cash = s.get(f"{BASE_URL}/api/summary/party/{CASH_ID}", params={"as_on": TODAY, "date_from": TODAY}).json()
            cids = {x["id"] for x in cash.get("cash_rokad", [])}
            assert set(ids) <= cids
            # cash running: opening + jama - kharch == balance
            net = sum(x["amount"] if x["type"] == "jama" else -x["amount"] for x in cash["cash_rokad"])
            other = sum((j.get("debit", 0) - j.get("credit", 0)) for j in cash.get("journal", []))
            other += sum((j.get("debit", 0) - j.get("credit", 0)) for j in cash.get("dos_journal", []))
            print("cash opening", cash.get("opening"), "balance", cash["party"]["balance"], "net", net, "jrnl", other)
        finally:
            for i in ids:
                assert s.delete(f"{BASE_URL}/api/rokad/{i}").status_code == 200
        assert s.get(f"{BASE_URL}/api/summary/party/{party['id']}", params={"as_on": TODAY}).json()["party"]["balance"] == 0


# Transfer smoke (not blocked by party rule)
class TestTransfer:
    def test_transfer(self, s):
        r = s.post(f"{BASE_URL}/api/rokad/transfer", json={"date": TODAY, "from_account_id": CASH_ID,
                   "to_account_id": BANK_ID, "amount": 5, "description": "TEST_QA transfer"})
        assert r.status_code == 200, r.text
        d = r.json()
        print(d)
        cid = d.get("contra_id") or (d.get("legs") or [{}])[0].get("contra_id")
        legs = d.get("legs") or d.get("entries") or []
        lid = legs[0]["id"] if legs else d.get("id")
        assert lid
        assert s.delete(f"{BASE_URL}/api/rokad/{lid}").status_code == 200


# Settings partial PUT keeps firm_name
class TestSettings:
    def test_partial_put(self, s):
        orig = s.get(f"{BASE_URL}/api/settings").json()
        try:
            assert s.put(f"{BASE_URL}/api/settings", json={"firm_name": "QA FIRM"}).status_code == 200
            assert s.get(f"{BASE_URL}/api/settings").json()["firm_name"] == "QA FIRM"
            r = s.put(f"{BASE_URL}/api/settings", json={"investment_group_ids": orig.get("investment_group_ids", [])})
            assert r.status_code == 200
            g = s.get(f"{BASE_URL}/api/settings").json()
            assert g["firm_name"] == "QA FIRM"
            assert g["investment_group_ids"] == orig.get("investment_group_ids", [])
            assert g["fy_start"] == orig["fy_start"]
        finally:
            s.put(f"{BASE_URL}/api/settings", json={"firm_name": "9x Vyapari"})
        assert s.get(f"{BASE_URL}/api/settings").json()["firm_name"] == "9x Vyapari"
