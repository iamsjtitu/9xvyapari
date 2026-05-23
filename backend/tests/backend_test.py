"""Backend pytest suite for Galla Hisab-Kitab app."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://khata-book-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@galla.com"
ADMIN_PASSWORD = "admin123"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def auth_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    s.access_token = data["access_token"]
    s.user_id = data["id"]
    return s


@pytest.fixture(scope="session")
def created_ids():
    return {"parties": [], "items": [], "bills": [], "rokad": []}


# ---------------- Auth ----------------
class TestAuth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert "access_token" in data and len(data["access_token"]) > 10
        # Check httpOnly cookies set
        cookies = r.cookies
        assert "access_token" in cookies or "access_token" in r.headers.get("set-cookie", "")

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_bearer(self, auth_session):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {auth_session.access_token}"})
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauthenticated_returns_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Auth required on other endpoints ----------------
class TestAuthRequired:
    @pytest.mark.parametrize("path", [
        "/parties", "/items", "/bills", "/rokad",
        "/summary/dashboard"
    ])
    def test_unauthenticated_rejected(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401, f"{path} should require auth but got {r.status_code}"


# ---------------- Items ----------------
class TestItems:
    def test_seeded_items_present(self, auth_session):
        r = auth_session.get(f"{API}/items")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 6, f"Expected >=6 seeded items, got {len(items)}"
        names = [i["name"] for i in items]
        # check a few seeded names
        assert any("Gehu" in n for n in names)
        assert any("Chana" in n for n in names)

    def test_create_update_delete_item(self, auth_session, created_ids):
        payload = {"name": "TEST_Jowar", "unit": "Quintal", "rate": 2500, "hsn": "1007"}
        r = auth_session.post(f"{API}/items", json=payload)
        assert r.status_code == 200
        item = r.json()
        assert item["name"] == payload["name"]
        assert "id" in item
        iid = item["id"]
        created_ids["items"].append(iid)

        # GET verify
        r = auth_session.get(f"{API}/items")
        assert any(i["id"] == iid for i in r.json())

        # UPDATE
        upd = {**payload, "rate": 2700}
        r = auth_session.put(f"{API}/items/{iid}", json=upd)
        assert r.status_code == 200
        assert r.json()["rate"] == 2700

        # DELETE
        r = auth_session.delete(f"{API}/items/{iid}")
        assert r.status_code == 200
        created_ids["items"].remove(iid)


# ---------------- Parties ----------------
class TestParties:
    def test_create_list_party(self, auth_session, created_ids):
        payload = {"name": "TEST_Ramesh Traders", "phone": "9876543210",
                   "address": "Mandi Road", "type": "customer", "opening_balance": 1000.0}
        r = auth_session.post(f"{API}/parties", json=payload)
        assert r.status_code == 200
        party = r.json()
        assert party["name"] == payload["name"]
        assert "id" in party
        pid = party["id"]
        created_ids["parties"].append(pid)

        r = auth_session.get(f"{API}/parties")
        assert r.status_code == 200
        parties = r.json()
        found = next((p for p in parties if p["id"] == pid), None)
        assert found is not None
        assert "balance" in found
        assert found["balance"] == 1000.0  # opening balance reflected

    def test_update_delete_party(self, auth_session, created_ids):
        payload = {"name": "TEST_ToDelete", "phone": "1", "address": "x",
                   "type": "both", "opening_balance": 0}
        r = auth_session.post(f"{API}/parties", json=payload)
        pid = r.json()["id"]

        upd = {**payload, "name": "TEST_Updated"}
        r = auth_session.put(f"{API}/parties/{pid}", json=upd)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Updated"

        r = auth_session.delete(f"{API}/parties/{pid}")
        assert r.status_code == 200


# ---------------- Bills + Rokad linkage ----------------
class TestBills:
    @pytest.fixture(scope="class")
    def test_party(self, auth_session, created_ids):
        r = auth_session.post(f"{API}/parties", json={
            "name": "TEST_BillParty", "phone": "1", "address": "x",
            "type": "customer", "opening_balance": 0
        })
        pid = r.json()["id"]
        created_ids["parties"].append(pid)
        return r.json()

    @pytest.fixture(scope="class")
    def test_item(self, auth_session):
        r = auth_session.get(f"{API}/items")
        return r.json()[0]

    def test_create_sale_bill_and_balance(self, auth_session, test_party, test_item, created_ids):
        item_amt = 10 * test_item["rate"]
        commission = round(item_amt * 0.02, 2)
        total = item_amt + commission
        payload = {
            "bill_type": "sale",
            "party_id": test_party["id"],
            "party_name": test_party["name"],
            "date": "2026-01-15",
            "items": [{
                "item_id": test_item["id"], "item_name": test_item["name"],
                "qty": 10, "unit": test_item["unit"], "rate": test_item["rate"],
                "amount": item_amt
            }],
            "subtotal": item_amt,
            "commission_pct": 2.0,
            "commission_amt": commission,
            "other_charges": 0,
            "total": total,
            "payment_received": 5000,
            "notes": "TEST sale"
        }
        r = auth_session.post(f"{API}/bills", json=payload)
        assert r.status_code == 200
        bill = r.json()
        assert bill["bill_no"].startswith("S")
        assert len(bill["bill_no"]) == 6  # S + 5 digits
        assert abs(bill["balance"] - (total - 5000)) < 0.01
        created_ids["bills"].append(bill["id"])

        # Rokad auto entry created
        r = auth_session.get(f"{API}/rokad")
        rokad = [x for x in r.json() if x.get("ref_bill_id") == bill["id"]]
        assert len(rokad) == 1
        assert rokad[0]["type"] == "jama"
        assert rokad[0]["amount"] == 5000

        # Party balance: total - payment_received (sale -> +ve owe)
        r = auth_session.get(f"{API}/summary/party/{test_party['id']}")
        assert r.status_code == 200
        data = r.json()
        expected_bal = round(total - 5000, 2)
        assert abs(data["party"]["balance"] - expected_bal) < 0.01

    def test_create_purchase_bill(self, auth_session, test_party, test_item, created_ids):
        item_amt = 5 * test_item["rate"]
        payload = {
            "bill_type": "purchase",
            "party_id": test_party["id"],
            "party_name": test_party["name"],
            "date": "2026-01-15",
            "items": [{
                "item_id": test_item["id"], "item_name": test_item["name"],
                "qty": 5, "unit": test_item["unit"], "rate": test_item["rate"],
                "amount": item_amt
            }],
            "subtotal": item_amt,
            "commission_pct": 0,
            "commission_amt": 0,
            "other_charges": 0,
            "total": item_amt,
            "payment_received": 0,
            "notes": "TEST purchase"
        }
        r = auth_session.post(f"{API}/bills", json=payload)
        assert r.status_code == 200
        bill = r.json()
        assert bill["bill_no"].startswith("P")
        assert bill["balance"] == item_amt
        created_ids["bills"].append(bill["id"])


# ---------------- Rokad ----------------
class TestRokad:
    def test_create_jama_and_kharch(self, auth_session, created_ids):
        r = auth_session.post(f"{API}/rokad", json={
            "date": "2026-01-15", "type": "jama", "amount": 1500,
            "description": "TEST jama entry", "mode": "Cash"
        })
        assert r.status_code == 200
        created_ids["rokad"].append(r.json()["id"])

        r = auth_session.post(f"{API}/rokad", json={
            "date": "2026-01-15", "type": "kharch", "amount": 300,
            "description": "TEST kharch entry", "mode": "UPI"
        })
        assert r.status_code == 200
        created_ids["rokad"].append(r.json()["id"])

    def test_rokad_filter_by_date(self, auth_session):
        r = auth_session.get(f"{API}/rokad?date_from=2026-01-15&date_to=2026-01-15")
        assert r.status_code == 200
        entries = r.json()
        assert all(e["date"] == "2026-01-15" for e in entries)
        assert len(entries) >= 2


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard_summary(self, auth_session):
        r = auth_session.get(f"{API}/summary/dashboard")
        assert r.status_code == 200
        data = r.json()
        for key in ["today", "month", "parties_count", "items_count", "total_udhaar", "total_owed"]:
            assert key in data, f"missing key {key}"
        assert isinstance(data["parties_count"], int)
        assert isinstance(data["items_count"], int)
        assert data["items_count"] >= 6


# ---------------- Cleanup ----------------
def test_zz_cleanup(auth_session, created_ids):
    for bid in created_ids["bills"]:
        auth_session.delete(f"{API}/bills/{bid}")
    for rid in created_ids["rokad"]:
        auth_session.delete(f"{API}/rokad/{rid}")
    for pid in created_ids["parties"]:
        auth_session.delete(f"{API}/parties/{pid}")
    for iid in created_ids["items"]:
        auth_session.delete(f"{API}/items/{iid}")
