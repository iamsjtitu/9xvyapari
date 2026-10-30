# v50: Rokad "Kiska?" reference party (ref_party_id) — memo rows on the ref party ledger, no balance effect
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
INT_ID = "a1f67f9b-84f9-4ab8-8bfd-5164ee223ece"     # INTEREST RECEIVED QA (group BYAJ QA, income)
SURAJ_ID = "cf1c4211-e25b-456f-bd25-9e95af1a77ef"   # SURAJ QA (opening 1,00,000)
CASH_ID = "3811380b-f2ca-407b-9478-e77b69909c25"    # CASH IN HAND
DATE = "2026-10-29"
CREATED = []


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    yield ss
    for rid in CREATED:
        ss.delete(f"{BASE_URL}/api/rokad/{rid}")


def _post(s, **kw):
    body = {"date": DATE, "type": "jama", "amount": 25000, "party_id": INT_ID, "cash_account_id": CASH_ID,
            "mode": "cash", "narration": "TEST_V50 byaj"}
    body.update(kw)
    r = s.post(f"{BASE_URL}/api/rokad", json=body)
    if r.status_code == 200:
        CREATED.append(r.json()["id"])
    return r


def _suraj_bal(s):
    return s.get(f"{BASE_URL}/api/summary/party/{SURAJ_ID}").json()["party"]["balance"]


class TestRefParty:
    def test_baseline(self, s):
        pytest.base = _suraj_bal(s)
        print("SURAJ base balance", pytest.base)

    def test_create_with_ref(self, s):
        r = _post(s, ref_party_id=SURAJ_ID)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ref_party_id"] == SURAJ_ID
        assert d["ref_party_name"] == "SURAJ QA"
        assert d["party_name"] == "INTEREST RECEIVED QA"
        pytest.rid = d["id"]
        g = [e for e in s.get(f"{BASE_URL}/api/rokad?date_from={DATE}&date_to={DATE}").json() if e["id"] == d["id"]]
        assert g and g[0]["ref_party_name"] == "SURAJ QA"

    def test_ref_equal_party_cleared(self, s):
        r = _post(s, ref_party_id=INT_ID, amount=11)
        assert r.status_code == 200
        assert r.json()["ref_party_id"] is None and r.json()["ref_party_name"] == ""

    def test_bogus_ref_cleared(self, s):
        r = _post(s, ref_party_id="bogus-xyz", ref_party_name="Bogus", amount=12)
        assert r.status_code == 200
        assert r.json()["ref_party_id"] is None and r.json()["ref_party_name"] == ""

    def test_no_ref_normal(self, s):
        r = _post(s, amount=13)
        assert r.status_code == 200
        assert r.json()["ref_party_id"] is None

    def test_party_required(self, s):
        r = s.post(f"{BASE_URL}/api/rokad", json={"date": DATE, "type": "jama", "amount": 5, "cash_account_id": CASH_ID,
                                                  "ref_party_id": SURAJ_ID})
        assert r.status_code == 400

    def test_suraj_memo_and_balance(self, s):
        d = s.get(f"{BASE_URL}/api/summary/party/{SURAJ_ID}").json()
        ids = [m["id"] for m in d["memo_rokad"]]
        assert pytest.rid in ids
        assert pytest.rid not in [x["id"] for x in d["rokad"]]
        assert d["party"]["balance"] == pytest.base
        d2 = s.get(f"{BASE_URL}/api/summary/party/{SURAJ_ID}?date_from=2026-04-01").json()
        assert pytest.rid in [m["id"] for m in d2["memo_rokad"]]

    def test_interest_ledger_normal(self, s):
        d = s.get(f"{BASE_URL}/api/summary/party/{INT_ID}").json()
        assert pytest.rid in [x["id"] for x in d["rokad"]]
        assert not d.get("memo_rokad")

    def test_parties_list_balance(self, s):
        ps = s.get(f"{BASE_URL}/api/parties").json()
        ps = ps if isinstance(ps, list) else ps.get("items", ps)
        su = [p for p in ps if p["id"] == SURAJ_ID][0]
        assert su["balance"] == pytest.base

    def test_trial_balance_outstanding(self, s):
        for path in ["/api/reports/trial-balance", "/api/outstanding", "/api/reports/outstanding"]:
            r = s.get(f"{BASE_URL}{path}")
            if r.status_code == 200:
                txt = r.text
                print(path, "SURAJ QA" in txt, "100000" in txt)

    def test_put_change_and_clear(self, s):
        rid = pytest.rid
        base = {"date": DATE, "type": "jama", "amount": 25000, "party_id": INT_ID, "cash_account_id": CASH_ID, "mode": "cash",
                "narration": "TEST_V50 byaj"}
        r = s.put(f"{BASE_URL}/api/rokad/{rid}", json={**base, "ref_party_id": "", "ref_party_name": "SURAJ QA"})
        assert r.status_code == 200
        assert r.json()["ref_party_id"] is None and r.json()["ref_party_name"] == ""
        d = s.get(f"{BASE_URL}/api/summary/party/{SURAJ_ID}").json()
        assert rid not in [m["id"] for m in d["memo_rokad"]]
        r = s.put(f"{BASE_URL}/api/rokad/{rid}", json={**base, "ref_party_id": SURAJ_ID})
        assert r.json()["ref_party_name"] == "SURAJ QA"
        d = s.get(f"{BASE_URL}/api/summary/party/{SURAJ_ID}").json()
        assert rid in [m["id"] for m in d["memo_rokad"]]

    def test_put_new_ref_with_stale_name(self, s):
        """Change ref id but client sends old name → name should follow the id"""
        ps = s.get(f"{BASE_URL}/api/parties?lite=1").json()
        other = [p for p in ps if p["id"] not in (SURAJ_ID, INT_ID) and "CASH" not in (p.get("name") or "").upper()][0]
        base = {"date": DATE, "type": "jama", "amount": 25000, "party_id": INT_ID, "cash_account_id": CASH_ID, "mode": "cash"}
        r = s.put(f"{BASE_URL}/api/rokad/{pytest.rid}", json={**base, "ref_party_id": other["id"], "ref_party_name": "SURAJ QA"})
        print("other", other["name"], "->", r.json()["ref_party_name"])
        assert r.json()["ref_party_name"] == other["name"]
