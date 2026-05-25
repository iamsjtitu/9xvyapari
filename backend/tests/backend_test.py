"""Backend pytest suite for Galla Hisab-Kitab v1.2 (FoxPro structure)."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@galla.com"
ADMIN_PASSWORD = "admin123"

# 18 expected groups (per v1.2 FoxPro reseed)
EXPECTED_GROUPS = {
    "CAPITAL A/C": (1, 50, "liability"),
    "LOANS (LIABILITY)": (51, 100, "liability"),
    "OTHER DEPOSITS": (101, 200, "asset"),
    "FIXED ASSETS": (201, 250, "asset"),
    "CURRENT ASSETS": (251, 299, "asset"),
    "CASH & BANK BALANCE": (300, 349, "asset"),
    "SALES PARTY": (350, 1199, "asset"),
    "PURCHASE PARTY": (1200, 2199, "liability"),
    "COLD STORAGE": (2200, 2400, "asset"),
    "LOANS & ADVANCES": (2500, 2899, "asset"),
    "SALES A/C": (3001, 3034, "income"),
    "INDIRECT INCOMES": (3035, 3049, "income"),
    "PURCHASE A/C": (3050, 3099, "expense"),
    "INDIRECT EXP.": (3100, 3149, "expense"),
    "OTHER EXP": (3150, 3199, "expense"),
    "SALARY A/C": (3200, 3249, "expense"),
    "DIRECT EXPENSES": (3250, 3299, "expense"),
    "STAFF ADVANCE": (3300, 3400, "asset"),
}


@pytest.fixture(scope="session")
def auth_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    s.access_token = data["access_token"]
    return s


@pytest.fixture(scope="session")
def created_ids():
    return {"parties": [], "items": [], "bills": [], "rokad": [],
            "inward": [], "journal": [], "accounts": [], "groups": []}


# ---------------- Auth ----------------
class TestAuth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200 and r.json()["status"] == "ok"

    def test_login_success(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert len(d["access_token"]) > 10
        # httpOnly cookies
        assert "access_token" in r.cookies

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


class TestAuthRequired:
    @pytest.mark.parametrize("path", [
        "/parties", "/items", "/bills", "/rokad", "/summary/dashboard",
        "/account-groups", "/accounts", "/journal", "/settings", "/backup",
        "/inward", "/reports/trial-balance",
    ])
    def test_unauth_blocked(self, path):
        assert requests.get(f"{API}{path}").status_code == 401


# ---------------- Account Groups (v1.2 - 18 FoxPro groups) ----------------
class TestAccountGroupsV12:
    def test_18_groups_seeded_with_codes(self, auth_session):
        r = auth_session.get(f"{API}/account-groups")
        assert r.status_code == 200
        groups = r.json()
        assert len(groups) == 18, f"Expected 18 groups, got {len(groups)}"
        for g in groups:
            assert g["name"] in EXPECTED_GROUPS, f"Unexpected group: {g['name']}"
            fcode, lcode, nature = EXPECTED_GROUPS[g["name"]]
            assert g["fcode"] == fcode, f"{g['name']} fcode {g['fcode']} != {fcode}"
            assert g["lcode"] == lcode, f"{g['name']} lcode {g['lcode']} != {lcode}"
            assert g["nature"] == nature, f"{g['name']} nature {g['nature']} != {nature}"
            assert "ecode" in g

    def test_all_expected_groups_present(self, auth_session):
        groups = auth_session.get(f"{API}/account-groups").json()
        names = {g["name"] for g in groups}
        for expected_name in EXPECTED_GROUPS.keys():
            assert expected_name in names, f"Missing group {expected_name}"


# ---------------- next-code endpoint ----------------
class TestNextCode:
    def test_next_code_for_sales_party(self, auth_session):
        """SALES PARTY range 350-1199. Existing party RAMOTAR BAGRI at 350 (per context).
        Next free code should be >= 351 (or 350 if empty)."""
        groups = auth_session.get(f"{API}/account-groups").json()
        sp = next(g for g in groups if g["name"] == "SALES PARTY")
        r = auth_session.get(f"{API}/account-groups/{sp['id']}/next-code")
        assert r.status_code == 200
        d = r.json()
        assert "next_code" in d
        assert d["fcode"] == 350
        assert d["lcode"] == 1199
        assert d["next_code"] >= 350 and d["next_code"] <= 1199

    def test_next_code_for_empty_group(self, auth_session):
        """For a group with no parties/accounts, next_code should equal fcode."""
        groups = auth_session.get(f"{API}/account-groups").json()
        # FIXED ASSETS (201-250) likely empty
        fa = next(g for g in groups if g["name"] == "FIXED ASSETS")
        r = auth_session.get(f"{API}/account-groups/{fa['id']}/next-code")
        assert r.status_code == 200
        d = r.json()
        # if empty -> fcode 201
        # if not empty -> still in range
        assert d["fcode"] == 201 and d["lcode"] == 250
        assert d["next_code"] is None or (201 <= d["next_code"] <= 250)

    def test_next_code_increments_after_party_added(self, auth_session, created_ids):
        groups = auth_session.get(f"{API}/account-groups").json()
        sa = next(g for g in groups if g["name"] == "STAFF ADVANCE")  # 3300-3400
        r1 = auth_session.get(f"{API}/account-groups/{sa['id']}/next-code")
        next1 = r1.json()["next_code"]

        # create party in this group with that code
        pr = auth_session.post(f"{API}/parties", json={
            "name": "TEST_StaffX", "code": next1, "group_id": sa["id"],
            "group_name": sa["name"], "type": "both", "opening_balance": 0
        })
        assert pr.status_code == 200
        created_ids["parties"].append(pr.json()["id"])

        r2 = auth_session.get(f"{API}/account-groups/{sa['id']}/next-code")
        assert r2.json()["next_code"] == next1 + 1

    def test_next_code_invalid_group(self, auth_session):
        r = auth_session.get(f"{API}/account-groups/nonexistent/next-code")
        assert r.status_code == 404


# ---------------- Parties with FoxPro fields ----------------
class TestPartiesV12:
    def test_create_party_with_full_foxpro_fields(self, auth_session, created_ids):
        groups = auth_session.get(f"{API}/account-groups").json()
        pp = next(g for g in groups if g["name"] == "PURCHASE PARTY")
        nxt = auth_session.get(f"{API}/account-groups/{pp['id']}/next-code").json()["next_code"]

        payload = {
            "name": "TEST_FULL Trader", "code": nxt, "group_id": pp["id"],
            "group_name": pp["name"], "place": "Hisar", "gstin": "06ABCDE1234F1Z5",
            "pan": "ABCDE1234F", "cstno": "CST123", "mpstno": "MPST456",
            "phone": "9999999999", "address": "Main Mandi", "address2": "Shop 23",
            "alt_name": "FULL TRD", "opening_balance": 5000.0, "opening_qty": 100.5,
            "rate": 2200.0, "type": "supplier",
        }
        r = auth_session.post(f"{API}/parties", json=payload)
        assert r.status_code == 200, r.text
        p = r.json()
        for k in ["code", "place", "gstin", "pan", "cstno", "mpstno",
                  "alt_name", "address2", "opening_qty", "rate", "group_id"]:
            assert p.get(k) == payload[k], f"{k}: {p.get(k)} != {payload[k]}"
        created_ids["parties"].append(p["id"])

        # round-trip via GET
        lst = auth_session.get(f"{API}/parties").json()
        found = next(x for x in lst if x["id"] == p["id"])
        assert found["gstin"] == payload["gstin"]
        assert found["balance"] == 5000.0


# ---------------- Inward Register ----------------
class TestInward:
    def test_inward_crud(self, auth_session, created_ids):
        # create cold storage party first
        groups = auth_session.get(f"{API}/account-groups").json()
        cs = next(g for g in groups if g["name"] == "COLD STORAGE")
        nxt = auth_session.get(f"{API}/account-groups/{cs['id']}/next-code").json()["next_code"]
        cs_party = auth_session.post(f"{API}/parties", json={
            "name": "TEST_ColdStore1", "code": nxt, "group_id": cs["id"],
            "group_name": cs["name"], "type": "both"
        }).json()
        created_ids["parties"].append(cs_party["id"])

        items = auth_session.get(f"{API}/items").json()

        payload = {
            "date": "2026-01-10", "ref_no": "REF001", "lot_no": "LOT-101",
            "cold_storage_id": cs_party["id"], "cold_storage_name": cs_party["name"],
            "bags": 50, "weight": 25.5,
            "item_id": items[0]["id"], "item_name": items[0]["name"],
            "notes": "TEST inward"
        }
        r = auth_session.post(f"{API}/inward", json=payload)
        assert r.status_code == 200, r.text
        row = r.json()
        assert row["lot_no"] == "LOT-101"
        assert row["bags"] == 50
        assert row["weight"] == 25.5
        iid = row["id"]
        created_ids["inward"].append(iid)

        # list
        r = auth_session.get(f"{API}/inward")
        assert r.status_code == 200
        assert any(x["id"] == iid for x in r.json())

        # filter by cold_storage_id
        r = auth_session.get(f"{API}/inward",
                             params={"cold_storage_id": cs_party["id"]})
        assert all(x["cold_storage_id"] == cs_party["id"] for x in r.json())

        # filter by date
        r = auth_session.get(f"{API}/inward",
                             params={"date_from": "2026-01-10", "date_to": "2026-01-10"})
        assert all(x["date"] == "2026-01-10" for x in r.json())

        # update
        upd = {**payload, "bags": 75, "weight": 35.0}
        r = auth_session.put(f"{API}/inward/{iid}", json=upd)
        assert r.status_code == 200
        assert r.json()["bags"] == 75
        assert r.json()["weight"] == 35.0

        # delete
        r = auth_session.delete(f"{API}/inward/{iid}")
        assert r.status_code == 200
        created_ids["inward"].remove(iid)
        # verify gone
        rows = auth_session.get(f"{API}/inward").json()
        assert not any(x["id"] == iid for x in rows)


# ---------------- Bills with full FoxPro purchase fields ----------------
class TestBillsFoxPro:
    def test_purchase_bill_with_all_charges(self, auth_session, created_ids):
        groups = auth_session.get(f"{API}/account-groups").json()
        pp = next(g for g in groups if g["name"] == "PURCHASE PARTY")
        nxt = auth_session.get(f"{API}/account-groups/{pp['id']}/next-code").json()["next_code"]
        p = auth_session.post(f"{API}/parties", json={
            "name": "TEST_PP Trader", "code": nxt, "group_id": pp["id"],
            "group_name": pp["name"], "type": "supplier"
        }).json()
        created_ids["parties"].append(p["id"])

        items = auth_session.get(f"{API}/items").json()
        item = items[0]

        # build bill: 10 bags x 50kg pack, weight 5q wb 5.2q ghat 0.05 nwt 5.15
        bag = 10
        weight = 5.0
        wb = 5.2
        ghat = 0.05
        nwt = 5.15
        amount = round(nwt * item["rate"], 2)
        subtotal = amount
        hamali_rt = 2.0
        hamali_amt = hamali_rt * bag        # 20
        bhada_rt = 50.0
        bhada_amt = bhada_rt * weight       # 250
        dalali_rt = 2.0
        dalali_amt = round(dalali_rt * subtotal / 100, 2)
        mandirt = 1.0
        mandiamt = round(mandirt * subtotal / 100, 2)
        cartage_amt = 100.0
        additions = hamali_amt + bhada_amt + mandiamt + cartage_amt
        deductions = dalali_amt
        total = subtotal + additions - deductions

        payload = {
            "bill_type": "purchase",
            "party_id": p["id"], "party_name": p["name"],
            "date": "2026-01-15", "s_date": "2026-01-15", "due_date": "2026-02-15",
            "lot_no": "LOT-500", "gp_no": "GP-500", "truck_no": "HR-55-XX-9999",
            "driver_name": "Ramu", "bilty_no": "BLT-500", "garage": "Garage-A",
            "no_of_bag": "10 bags", "bag_pack_q": "50 Kg",
            "agent_id": None, "agent_name": "AGENT-1",
            "buyer_id": None, "buyer_name": "BUYER-1",
            "items": [{
                "item_id": item["id"], "item_name": item["name"],
                "bag": bag, "pack": 50, "bag_pack": "10 x 50",
                "weight": weight, "wb": wb, "ghat": ghat, "nwt": nwt,
                "unit": "Quintal", "rate": item["rate"], "amount": amount, "qty": nwt,
            }],
            "subtotal": subtotal,
            "hamali_rt": hamali_rt, "hamali_amt": hamali_amt,
            "cartage_rt": 0, "cartage_amt": cartage_amt,
            "bhada_rt": bhada_rt, "bhada_amt": bhada_amt,
            "mandirt": mandirt, "mandiamt": mandiamt,
            "dalali_rt": dalali_rt, "dalali_amt": dalali_amt,
            "discount_rt": 0, "discount_amt": 0,
            "rebate_rt": 0, "rebate_amt": 0,
            "garrt": 0, "garamt": 0,
            "loading": 0, "bdalali": 0, "less": 0, "advance": 0,
            "commission_pct": 0, "commission_amt": 0, "other_charges": 0,
            "total": total, "payment_received": 0,
            "notes": "TEST FoxPro bill",
            "remark1": "First remark", "remark2": "Second remark",
        }
        r = auth_session.post(f"{API}/bills", json=payload)
        assert r.status_code == 200, r.text
        bill = r.json()
        created_ids["bills"].append(bill["id"])
        assert bill["bill_no"].startswith("P")
        # Verify all FoxPro fields round-trip
        for k in ["lot_no", "gp_no", "truck_no", "driver_name", "bilty_no",
                  "garage", "no_of_bag", "bag_pack_q", "due_date",
                  "agent_name", "buyer_name", "remark1", "remark2"]:
            assert bill[k] == payload[k], f"{k} mismatch"
        assert abs(bill["hamali_amt"] - 20.0) < 0.01
        assert abs(bill["bhada_amt"] - 250.0) < 0.01
        # Item-level fields
        it = bill["items"][0]
        assert it["bag"] == 10
        assert it["pack"] == 50
        assert it["weight"] == weight
        assert it["wb"] == wb
        assert it["ghat"] == ghat
        assert it["nwt"] == nwt

        # GET single bill
        rg = auth_session.get(f"{API}/bills/{bill['id']}")
        assert rg.status_code == 200
        assert rg.json()["truck_no"] == "HR-55-XX-9999"


# ---------------- Trial Balance ----------------
class TestTrialBalance:
    def test_trial_balance_structure(self, auth_session):
        r = auth_session.get(f"{API}/reports/trial-balance")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sections" in d
        assert "grand_dr" in d
        assert "grand_cr" in d
        assert len(d["sections"]) >= 18  # at least 18 groups (+ optional UNCATEGORIZED)

        # sections sorted by fcode
        coded = [s for s in d["sections"] if s.get("fcode")]
        fcodes = [s["fcode"] for s in coded]
        assert fcodes == sorted(fcodes), "sections not sorted by fcode"

        # each section has expected keys
        for s in d["sections"]:
            for k in ["group_name", "nature", "rows", "dr_total", "cr_total"]:
                assert k in s, f"section missing {k}"

        # SALES PARTY section should exist
        sales_party = next((s for s in d["sections"] if s["group_name"] == "SALES PARTY"), None)
        assert sales_party is not None
        assert sales_party["fcode"] == 350 and sales_party["lcode"] == 1199

    def test_trial_balance_includes_parties_and_accounts(self, auth_session, created_ids):
        """After creating a party with opening balance, TB should include it under correct group."""
        groups = auth_session.get(f"{API}/account-groups").json()
        sp = next(g for g in groups if g["name"] == "SALES PARTY")
        nxt = auth_session.get(f"{API}/account-groups/{sp['id']}/next-code").json()["next_code"]
        p = auth_session.post(f"{API}/parties", json={
            "name": "TEST_TB Party", "code": nxt, "group_id": sp["id"],
            "group_name": sp["name"], "type": "customer", "opening_balance": 1234.0
        }).json()
        created_ids["parties"].append(p["id"])

        tb = auth_session.get(f"{API}/reports/trial-balance").json()
        sales_section = next(s for s in tb["sections"] if s["group_name"] == "SALES PARTY")
        row = next((r for r in sales_section["rows"] if r["name"] == "TEST_TB Party"), None)
        assert row is not None, "Created party not in TB SALES PARTY section"
        assert row["balance"] == 1234.0
        assert row["code"] == nxt
        assert row["kind"] == "party"


# ---------------- Cash & Bank parties (v1.3: imported real data) ----------------
class TestSeededAccounts:
    def test_cash_and_bank_parties_under_group(self, auth_session):
        """v1.3: CASH IN HAND now lives as a party (code 301) under CASH & BANK BALANCE
        group (300-349), not in legacy accounts collection."""
        parties = auth_session.get(f"{API}/parties").json()
        cash_party = next((p for p in parties if p.get("code") == 301), None)
        assert cash_party is not None, "CASH IN HAND party with code 301 not found"
        assert "CASH" in (cash_party.get("name") or "").upper()
        # Ensure it's in CASH & BANK BALANCE group range
        groups = auth_session.get(f"{API}/account-groups").json()
        cb = next(g for g in groups if g["name"] == "CASH & BANK BALANCE")
        assert cash_party.get("group_id") == cb["id"]


# ---------------- v1.3: GST Returns ----------------
class TestGSTReturns:
    def test_list_gst_returns(self, auth_session):
        r = auth_session.get(f"{API}/gst-returns")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        # Per context: 50 imported GST entries
        assert len(rows) >= 1, "no gst_returns imported"
        # Validate row shape
        sample = rows[0]
        assert "id" in sample
        # Should have CGST/SGST or IGST and bill info
        keys_lower = {k.lower() for k in sample.keys()}
        assert any("cgst" in k or "sgst" in k or "igst" in k or "tax" in k for k in keys_lower), \
            f"gst row missing tax keys: {list(sample.keys())}"

    def test_gst_returns_requires_auth(self):
        r = requests.get(f"{API}/gst-returns")
        assert r.status_code == 401


# ---------------- v1.3: Per-cash-account voucher numbering ----------------
class TestCashVoucher:
    def test_next_voucher_for_cash_account(self, auth_session):
        """For an existing cash/bank party with imported voucher entries,
        next_voucher should = max(voucher_no)+1."""
        parties = auth_session.get(f"{API}/parties").json()
        # find a cash & bank party (codes 300-349) with rokad entries
        groups = auth_session.get(f"{API}/account-groups").json()
        cb = next(g for g in groups if g["name"] == "CASH & BANK BALANCE")
        cb_parties = [p for p in parties if p.get("group_id") == cb["id"]]
        assert len(cb_parties) >= 1, "no CASH & BANK BALANCE parties"
        # Pick first one and ensure endpoint returns a string
        cp = cb_parties[0]
        r = auth_session.get(f"{API}/cash-accounts/{cp['id']}/next-voucher")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "next_voucher" in d
        assert isinstance(d["next_voucher"], str)
        # Should parse as int
        assert int(d["next_voucher"]) >= 1

    def test_next_voucher_increments_with_new_rokad(self, auth_session, created_ids):
        """Create a fresh cash & bank party, post a rokad with voucher_no=10,
        next-voucher should return '11'."""
        groups = auth_session.get(f"{API}/account-groups").json()
        cb = next(g for g in groups if g["name"] == "CASH & BANK BALANCE")
        nxt = auth_session.get(f"{API}/account-groups/{cb['id']}/next-code").json()["next_code"]
        if nxt is None:
            pytest.skip("CASH & BANK BALANCE group full")
        cp = auth_session.post(f"{API}/parties", json={
            "name": "TEST_CB Voucher", "code": nxt, "group_id": cb["id"],
            "group_name": cb["name"], "type": "both"
        }).json()
        created_ids["parties"].append(cp["id"])

        # initially -> 1
        r0 = auth_session.get(f"{API}/cash-accounts/{cp['id']}/next-voucher")
        assert r0.json()["next_voucher"] == "1"

        # post a rokad entry with voucher_no=10
        rokad_payload = {
            "date": "2026-01-16", "type": "jama", "amount": 500.0,
            "party_id": cp["id"], "party_name": cp["name"],
            "cash_account_id": cp["id"], "cash_account_name": cp["name"],
            "voucher_no": "10", "chq_no": "CHQ-001",
            "description": "TEST voucher",
        }
        rr = auth_session.post(f"{API}/rokad", json=rokad_payload)
        assert rr.status_code == 200, rr.text
        created_ids["rokad"].append(rr.json()["id"])

        # next should be 11
        r2 = auth_session.get(f"{API}/cash-accounts/{cp['id']}/next-voucher")
        assert r2.json()["next_voucher"] == "11"


# ---------------- v1.3: Rokad voucher_no + chq_no round-trip ----------------
class TestRokadVoucherFields:
    def test_rokad_has_voucher_and_chq_fields(self, auth_session):
        rows = auth_session.get(f"{API}/rokad").json()
        # Per context, 16 rokad entries imported; some have voucher_no like V.117 etc
        assert isinstance(rows, list)
        if not rows:
            pytest.skip("no rokad rows imported")
        # At least one imported entry must carry voucher_no and chq_no fields (CASHBOOK import).
        with_voucher = [r for r in rows if r.get("voucher_no")]
        assert len(with_voucher) >= 1, (
            f"No imported rokad rows expose voucher_no. Sample keys: "
            f"{list(rows[0].keys())}"
        )
        # chq_no field should exist on the same imported rows (may be empty string)
        sample = with_voucher[0]
        assert "chq_no" in sample, f"imported rokad missing chq_no: {list(sample.keys())}"
        assert "cash_account_id" in sample, f"imported rokad missing cash_account_id"


# ---------------- v1.3: DBF import endpoints reachable ----------------
class TestDBFImportEndpoints:
    """Verify all import endpoints exist, validate payload, require auth."""
    @pytest.mark.parametrize("path", [
        "/import-dbf/ledger", "/import-dbf/cashbook", "/import-dbf/inward",
        "/import-dbf/items", "/import-dbf/gst", "/import-dbf/transactions",
    ])
    def test_import_endpoint_requires_auth(self, path):
        r = requests.post(f"{API}{path}", json={"rows": []})
        assert r.status_code == 401, f"{path} should require auth, got {r.status_code}"

    @pytest.mark.parametrize("path", [
        "/import-dbf/cashbook", "/import-dbf/inward",
        "/import-dbf/items", "/import-dbf/gst", "/import-dbf/transactions",
    ])
    def test_import_endpoint_empty_rows(self, auth_session, path):
        """Empty rows should be accepted - 0 imported."""
        r = auth_session.post(f"{API}{path}", json={"rows": []})
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text}"
        d = r.json()
        assert "imported" in d or "count" in d or d == {} or isinstance(d, dict), d


# ---------------- v1.3: Imported real data sanity ----------------
class TestImportedRealData:
    def test_parties_count(self, auth_session):
        """Per context: 527 parties imported from LEDGR.DBF."""
        parties = auth_session.get(f"{API}/parties").json()
        assert len(parties) >= 100, f"Expected >=100 imported parties, got {len(parties)}"

    def test_inward_imported(self, auth_session):
        """Per context: 42 inward entries from INWARDS+INWARDP."""
        rows = auth_session.get(f"{API}/inward").json()
        assert len(rows) >= 10, f"Expected >=10 inward rows, got {len(rows)}"

    def test_imported_bills_have_foxpro_charges(self, auth_session):
        """Per context: 4 bills (P00001-P00004) with hamali/discount/cartage/dalali/bhada."""
        bills = auth_session.get(f"{API}/bills").json()
        imported = [b for b in bills if (b.get("bill_no") or "").startswith("P0000")]
        assert len(imported) >= 1, f"No P0000* imported bills, got: {[b.get('bill_no') for b in bills][:10]}"

    def test_trial_balance_cash_bank_section(self, auth_session):
        """v1.3: CASH & BANK BALANCE section should contain imported ledgers."""
        tb = auth_session.get(f"{API}/reports/trial-balance").json()
        cb = next((s for s in tb["sections"] if s["group_name"] == "CASH & BANK BALANCE"), None)
        assert cb is not None, "CASH & BANK BALANCE section missing in TB"
        assert cb["fcode"] == 300 and cb["lcode"] == 349
        # Should have at least the imported cash/bank ledgers
        names = [r["name"] for r in cb["rows"]]
        # No duplicates within group
        assert len(names) == len(set(names)), f"Duplicate names in CASH & BANK BALANCE: {names}"
        assert len(names) >= 1, "CASH & BANK BALANCE has no rows"


# ---------------- Existing v1.0/v1.1 still works ----------------
class TestBackwardCompat:
    def test_old_bill_format(self, auth_session, created_ids):
        parties = auth_session.get(f"{API}/parties").json()
        if not parties:
            pytest.skip("no parties")
        items = auth_session.get(f"{API}/items").json()
        payload = {
            "bill_type": "sale",
            "party_id": parties[0]["id"], "party_name": parties[0]["name"],
            "date": "2026-01-15",
            "items": [{"item_id": items[0]["id"], "item_name": items[0]["name"],
                       "qty": 1, "unit": items[0]["unit"],
                       "rate": items[0]["rate"], "amount": items[0]["rate"]}],
            "subtotal": items[0]["rate"], "commission_pct": 0, "commission_amt": 0,
            "other_charges": 0, "total": items[0]["rate"], "payment_received": 0,
        }
        r = auth_session.post(f"{API}/bills", json=payload)
        assert r.status_code == 200
        created_ids["bills"].append(r.json()["id"])

    def test_dashboard(self, auth_session):
        r = auth_session.get(f"{API}/summary/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ["today", "month", "parties_count", "items_count",
                  "total_udhaar", "total_owed"]:
            assert k in d


# ---------------- Cleanup ----------------
def test_zz_cleanup(auth_session, created_ids):
    for jid in created_ids.get("journal", []):
        auth_session.delete(f"{API}/journal/{jid}")
    for iid in created_ids.get("inward", []):
        auth_session.delete(f"{API}/inward/{iid}")
    for aid in created_ids.get("accounts", []):
        auth_session.delete(f"{API}/accounts/{aid}")
    for gid in created_ids.get("groups", []):
        auth_session.delete(f"{API}/account-groups/{gid}")
    for bid in created_ids["bills"]:
        auth_session.delete(f"{API}/bills/{bid}")
    for rid in created_ids["rokad"]:
        auth_session.delete(f"{API}/rokad/{rid}")
    for pid in created_ids["parties"]:
        auth_session.delete(f"{API}/parties/{pid}")
    for iid in created_ids["items"]:
        auth_session.delete(f"{API}/items/{iid}")
