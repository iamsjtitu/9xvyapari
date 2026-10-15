"""Iteration 13 — Transfer (contra), Ledger Statement (date_from), Rokad accounts-summary dashboard-ish."""
import os
import pytest
import requests

def _load_env():
    env = {}
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env[k] = v
    except Exception:
        pass
    return env

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_env().get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"
ADMIN = {"username": "admin", "password": "Vyapari@2026"}

CASH_301_CODE = "301"
BANK_307_CODE = "307"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cash_ids(client):
    """Resolve party IDs for 301 (CASH IN HAND) and 307 (SBICC-M M TRD.) via accounts-summary."""
    r = client.get(f"{API}/rokad/accounts-summary", params={"date_from": "2026-06-10", "date_to": "2026-06-10"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    rows = data.get("rows") or data.get("accounts") or data.get("items") or []
    if not rows and isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                rows = v
                break
    by_code = {str(row.get("code")): row for row in rows}
    assert "301" in by_code and "307" in by_code, f"codes not found; got: {list(by_code)[:10]}"
    return {"301": by_code["301"], "307": by_code["307"], "total": data.get("total") or data.get("totals"), "raw": data}


# ----------------------------- TRANSFER CRUD ---------------------------------

@pytest.fixture(scope="module")
def ids(cash_ids):
    row301 = cash_ids["301"]
    row307 = cash_ids["307"]
    aid301 = row301.get("id") or row301.get("account_id") or row301.get("party_id")
    aid307 = row307.get("id") or row307.get("account_id") or row307.get("party_id")
    assert aid301 and aid307, f"missing ids: {row301} / {row307}"
    return {"301": aid301, "307": aid307,
            "closing301": row301.get("closing"), "closing307": row307.get("closing"),
            "total_closing": (cash_ids["total"] or {}).get("closing")}


class TestTransferHappyPath:
    contra_id = None

    def test_01_create_transfer(self, client, ids):
        payload = {"date": "2026-06-10", "from_account_id": ids["307"], "to_account_id": ids["301"],
                   "amount": 50000, "description": "test", "voucher_no": "T9"}
        r = client.post(f"{API}/rokad/transfer", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["contra_id"]
        assert body["from_account_id"] == ids["307"]
        assert body["to_account_id"] == ids["301"]
        assert body["amount"] == 50000
        assert "CASH IN HAND" in body["to_account_name"]
        assert len(body["legs"]) == 2
        types = sorted(l["type"] for l in body["legs"])
        assert types == ["jama", "kharch"]
        TestTransferHappyPath.contra_id = body["contra_id"]

    def test_02_summary_reflects_transfer(self, client, ids):
        r = client.get(f"{API}/rokad/accounts-summary",
                       params={"date_from": "2026-06-10", "date_to": "2026-06-10"}, timeout=15)
        data = r.json()
        rows = data.get("rows") or []
        by_code = {str(row.get("code")): row for row in rows}
        # 307: kharch +50000, closing decreased by 50000 (parties: negative balance = Cr)
        assert by_code["307"]["kharch"] - (ids.get("closing307_kharch") or 0) >= 50000 or by_code["307"]["kharch"] >= 50000
        # 301: jama +50000, closing +50000
        c301_old = ids["closing301"] or 0
        c307_old = ids["closing307"] or 0
        assert abs((by_code["301"]["closing"] - c301_old) - 50000) < 1e-6
        assert abs((by_code["307"]["closing"] - c307_old) - (-50000)) < 1e-6
        # total unchanged
        t_new = (data.get("total") or data.get("totals") or {}).get("closing")
        if ids["total_closing"] is not None and t_new is not None:
            assert abs(t_new - ids["total_closing"]) < 1e-2

    def test_03_rokad_list_shows_both_legs(self, client):
        r = client.get(f"{API}/rokad", params={"date_from": "2026-06-10", "date_to": "2026-06-10"}, timeout=15)
        assert r.status_code == 200
        rows = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        legs = [x for x in rows if x.get("contra_id") == TestTransferHappyPath.contra_id]
        assert len(legs) == 2
        names = {l.get("party_name") for l in legs}
        assert any("Transfer → CASH IN HAND" in (n or "") for n in names)
        assert any("Transfer ← SBICC-M M TRD." in (n or "") for n in names)

    def test_04_get_transfer_by_contra(self, client):
        r = client.get(f"{API}/rokad/transfer/{TestTransferHappyPath.contra_id}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["contra_id"] == TestTransferHappyPath.contra_id
        assert body["amount"] == 50000

    def test_05_update_transfer_keeps_leg_ids(self, client, ids):
        # capture current leg ids
        r = client.get(f"{API}/rokad/transfer/{TestTransferHappyPath.contra_id}", timeout=15)
        before = {l["type"]: l["id"] for l in r.json()["legs"]}
        payload = {"date": "2026-06-11", "from_account_id": ids["307"], "to_account_id": ids["301"],
                   "amount": 60000, "description": "updated"}
        r = client.put(f"{API}/rokad/transfer/{TestTransferHappyPath.contra_id}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["amount"] == 60000
        assert body["date"] == "2026-06-11"
        after = {l["type"]: l["id"] for l in body["legs"]}
        assert before == after, f"leg ids changed: {before} -> {after}"

    def test_06_put_rokad_on_leg_rejected(self, client):
        r = client.get(f"{API}/rokad/transfer/{TestTransferHappyPath.contra_id}", timeout=15)
        leg_id = r.json()["legs"][0]["id"]
        r = client.put(f"{API}/rokad/{leg_id}", json={
            "date": "2026-06-11", "type": "kharch", "cash_account_id": "x",
            "party_name": "x", "amount": 999, "description": ""
        }, timeout=15)
        assert r.status_code == 400, r.text
        assert "Transfer form" in r.text

    def test_07_summary_party_includes_transfer(self, client, ids):
        r = client.get(f"{API}/summary/party/{ids['301']}",
                       params={"date_from": "2026-06-10", "as_on": "2026-06-11"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        cash_rokad = body.get("cash_rokad") or []
        matched = [x for x in cash_rokad if x.get("contra_id") == TestTransferHappyPath.contra_id]
        assert len(matched) >= 1

    def test_08_delete_one_leg_removes_both(self, client):
        r = client.get(f"{API}/rokad/transfer/{TestTransferHappyPath.contra_id}", timeout=15)
        leg_id = r.json()["legs"][0]["id"]
        r = client.delete(f"{API}/rokad/{leg_id}", timeout=15)
        assert r.status_code in (200, 204)
        r = client.get(f"{API}/rokad/transfer/{TestTransferHappyPath.contra_id}", timeout=15)
        assert r.status_code == 404

    def test_09_summary_restored_after_delete(self, client, ids):
        r = client.get(f"{API}/rokad/accounts-summary",
                       params={"date_from": "2026-06-10", "date_to": "2026-06-10"}, timeout=15)
        rows = r.json().get("rows") or []
        by_code = {str(row.get("code")): row for row in rows}
        assert abs(by_code["301"]["closing"] - (ids["closing301"] or 0)) < 1e-6
        assert abs(by_code["307"]["closing"] - (ids["closing307"] or 0)) < 1e-6


# ----------------------------- TRANSFER VALIDATIONS --------------------------

class TestTransferValidations:
    def test_same_from_to_rejected(self, client, ids):
        payload = {"date": "2026-06-10", "from_account_id": ids["301"], "to_account_id": ids["301"], "amount": 100}
        r = client.post(f"{API}/rokad/transfer", json=payload, timeout=15)
        assert r.status_code == 400

    def test_non_cash_ledger_rejected(self, client, ids):
        # Pick a party that is NOT in cash/bank group — use known id of SBICC party is actually 307 (cash). Use parties list to pick any non-cash
        r = client.get(f"{API}/parties", timeout=20)
        parties = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        non_cash = next((p for p in parties if (p.get("group") or "").upper() != "CASH & BANK BALANCE"
                        and p["id"] not in (ids["301"], ids["307"])), None)
        assert non_cash, "no non-cash party found"
        payload = {"date": "2026-06-10", "from_account_id": non_cash["id"], "to_account_id": ids["301"], "amount": 100}
        r = client.post(f"{API}/rokad/transfer", json=payload, timeout=15)
        assert r.status_code == 400


# ----------------------------- LEDGER STATEMENT ------------------------------

class TestLedgerStatement:
    def test_date_from_opening(self, client, ids):
        r = client.get(f"{API}/summary/party/{ids['307']}",
                       params={"date_from": "2026-05-01", "as_on": "2026-05-05"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("date_from") == "2026-05-01"
        assert body.get("as_on") == "2026-05-05"
        assert body.get("opening") == -36696088.0
        assert body["party"]["balance"] == -44387254.0
        # entries dated within range
        for e in body.get("cash_rokad", []):
            assert "2026-05-01" <= e["date"] <= "2026-05-05"

    def test_no_date_from_opening_equals_party_opening(self, client, ids):
        r = client.get(f"{API}/summary/party/{ids['307']}", params={"as_on": "2026-05-05"}, timeout=20)
        body = r.json()
        po = body["party"].get("opening_balance")
        # When no date_from: either opening key absent OR equals party.opening_balance
        op = body.get("opening", po)
        assert op == po, f"opening={op} party.opening_balance={po}"

    def test_bad_date_400(self, client, ids):
        r = client.get(f"{API}/summary/party/{ids['307']}", params={"date_from": "not-a-date", "as_on": "2026-05-05"}, timeout=15)
        assert r.status_code == 400
