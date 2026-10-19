"""Staff Attendance & Payments (v36): master, attendance, salary (÷30 / daily), advance, cleanup."""
import os
import pytest
import requests
from pathlib import Path


def _load_env():
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_env()
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
M = "2026-06"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json"})
    r = ses.post(f"{BASE}/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    assert r.status_code == 200, r.text
    d = r.json()
    ses.headers.update({"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"})
    return ses


@pytest.fixture(scope="module")
def ctx(s):
    c = {"staff": [], "ledgers": [], "rokad": [], "att": [], "pay": []}
    yield c
    # cleanup
    for pid in c["pay"]:
        s.delete(f"{BASE}/staff/salary/{pid}")
    for rid in c["rokad"]:
        s.delete(f"{BASE}/rokad/{rid}")
    for sid, d in c["att"]:
        s.put(f"{BASE}/staff/attendance", json={"staff_id": sid, "date": d, "mark": None})
    for sid in c["staff"]:
        s.delete(f"{BASE}/staff/{sid}")
    for lid in c["ledgers"]:
        s.delete(f"{BASE}/parties/{lid}")


def mark(s, ctx, sid, d, m):
    r = s.put(f"{BASE}/staff/attendance", json={"staff_id": sid, "date": d, "mark": m})
    assert r.status_code == 200, r.text
    if m:
        ctx["att"].append((sid, d))
    return r


# --- settings
def test_settings_autosetup(s):
    r = s.get(f"{BASE}/staff/settings")
    assert r.status_code == 200
    d = r.json()
    assert d["staff_group_name"] == "STAFF ADVANCE"
    assert d["salary_expense_name"] == "STAFF SALARY"


# --- master
def test_create_staff_and_ledger(s, ctx):
    r = s.post(f"{BASE}/staff", json={"name": "test_qa ramu", "phone": "9", "salary_type": "monthly", "salary": 9000, "join_date": "2026-06-01"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["name"] == "TEST_QA RAMU"
    assert d["ledger_id"] and d["advance_due"] == 0
    ctx["staff"].append(d["id"]); ctx["ledgers"].append(d["ledger_id"])
    ctx["ramu"] = d
    parties = s.get(f"{BASE}/parties").json()
    p = next(p for p in parties if p["id"] == d["ledger_id"])
    assert p["group_name"] == "STAFF ADVANCE" and p["name"] == "TEST_QA RAMU"
    lst = s.get(f"{BASE}/staff").json()
    assert any(x["id"] == d["id"] for x in lst["staff"]) and lst["setup"]["staff_group_name"] == "STAFF ADVANCE"


def test_duplicate_and_empty(s, ctx):
    assert s.post(f"{BASE}/staff", json={"name": "TEST_QA RAMU", "salary": 1}).status_code == 409
    assert s.post(f"{BASE}/staff", json={"name": "  ", "salary": 1}).status_code == 422


def test_create_daily_staff(s, ctx):
    r = s.post(f"{BASE}/staff", json={"name": "TEST_QA SHYAM", "salary_type": "daily", "salary": 500})
    assert r.status_code == 200, r.text
    d = r.json(); ctx["staff"].append(d["id"]); ctx["ledgers"].append(d["ledger_id"]); ctx["shyam"] = d


def test_update_staff(s, ctx):
    sh = ctx["shyam"]
    r = s.put(f"{BASE}/staff/{sh['id']}", json={"name": "TEST_QA SHYAM", "phone": "777", "salary_type": "daily", "salary": 500, "active": True})
    assert r.status_code == 200 and r.json()["phone"] == "777"


# --- advance
def test_give_advance(s, ctx):
    r = s.post(f"{BASE}/staff/advance", json={"staff_id": ctx["ramu"]["id"], "amount": 1000, "date": "2026-06-05", "note": "ghar"})
    assert r.status_code == 200, r.text
    d = r.json(); ctx["rokad"].append(d["id"]); ctx["adv_id"] = d["id"]
    assert d["type"] == "kharch" and d["amount"] == 1000
    assert d["description"] == "Advance · ghar" and d["staff_kind"] == "advance"
    assert d["voucher_no"] and d["advance_due"] == 1000
    assert d["party_id"] == ctx["ramu"]["ledger_id"]
    assert s.post(f"{BASE}/staff/advance", json={"staff_id": ctx["ramu"]["id"], "amount": 0, "date": "2026-06-05"}).status_code == 400


# --- attendance
def test_attendance_marks(s, ctx):
    sid = ctx["ramu"]["id"]
    for d in range(1, 21):
        mark(s, ctx, sid, f"{M}-{d:02d}", "P")
    for d in (21, 22):
        mark(s, ctx, sid, f"{M}-{d}", "H")
    for d in (23, 24, 25):
        mark(s, ctx, sid, f"{M}-{d}", "A")
    mark(s, ctx, sid, f"{M}-26", "C")
    mark(s, ctx, sid, f"{M}-26", None)
    mark(s, ctx, sid, f"{M}-26", "C")
    r = s.get(f"{BASE}/staff/attendance", params={"month": M}).json()
    row = next(x for x in r["rows"] if x["id"] == sid)
    assert row["counts"] == {"P": 20, "H": 2, "A": 3, "C": 1}
    assert row["paid_days"] == 22 and row["unmarked"] == 4
    assert r["days"] == 30 and len(r["weekdays"]) == 30 and r["weekdays"][0] == "Mon"
    assert row["marks"][f"{M}-26"] == "C"


def test_attendance_validation(s, ctx):
    assert s.put(f"{BASE}/staff/attendance", json={"staff_id": ctx["ramu"]["id"], "date": "bad", "mark": "P"}).status_code == 400
    assert s.put(f"{BASE}/staff/attendance", json={"staff_id": "nope", "date": "2026-06-01", "mark": "P"}).status_code == 404
    assert s.put(f"{BASE}/staff/attendance", json={"staff_id": ctx["ramu"]["id"], "date": "2026-06-01", "mark": "X"}).status_code == 422
    assert s.get(f"{BASE}/staff/attendance", params={"month": "2026-13"}).status_code == 400


def test_attendance_future_date_rejected(s, ctx):
    """Review asked for future-proof validation — far-future mark should be rejected."""
    r = s.put(f"{BASE}/staff/attendance", json={"staff_id": ctx["ramu"]["id"], "date": "2030-01-01", "mark": "P"})
    if r.status_code == 200:
        s.put(f"{BASE}/staff/attendance", json={"staff_id": ctx["ramu"]["id"], "date": "2030-01-01", "mark": None})
    assert r.status_code == 400, f"future date accepted: {r.status_code}"


def test_bulk_only_unmarked(s, ctx):
    sid, shy = ctx["ramu"]["id"], ctx["shyam"]["id"]
    r = s.post(f"{BASE}/staff/attendance/bulk", json={"date": f"{M}-01", "mark": "A", "staff_ids": [sid, shy]})
    assert r.json()["marked"] == 1  # ramu already P
    ctx["att"].append((shy, f"{M}-01"))
    att = s.get(f"{BASE}/staff/attendance", params={"month": M}).json()
    assert next(x for x in att["rows"] if x["id"] == sid)["marks"][f"{M}-01"] == "P"
    # shyam: 3 P in June
    for d in (1, 2, 3):
        mark(s, ctx, shy, f"{M}-{d:02d}", "P")


# --- salary
def test_salary_sheet(s, ctx):
    d = s.get(f"{BASE}/staff/salary", params={"month": M}).json()
    r = next(x for x in d["rows"] if x["id"] == ctx["ramu"]["id"])
    assert r["per_day"] == 300 and r["paid_days"] == 22 and r["gross"] == 6600
    assert r["advance_due"] == 1000 and r["suggested_deduct"] == 1000 and r["net"] == 5600 and r["paid"] is None
    sh = next(x for x in d["rows"] if x["id"] == ctx["shyam"]["id"])
    assert sh["per_day"] == 500 and sh["gross"] == 1500 and sh["net"] == 1500


def test_pay_validation(s, ctx):
    sid = ctx["ramu"]["id"]
    assert s.post(f"{BASE}/staff/salary/pay", json={"staff_id": sid, "month": M, "deduct_advance": 1200}).status_code == 400
    assert s.post(f"{BASE}/staff/salary/pay", json={"staff_id": ctx["shyam"]["id"], "month": M, "deduct_advance": 10}).status_code == 400
    assert s.post(f"{BASE}/staff/salary/pay", json={"staff_id": sid, "month": "2026-05"}).status_code == 400  # no attendance
    assert s.post(f"{BASE}/staff/salary/pay", json={"staff_id": sid, "month": M, "deduct_advance": -1}).status_code == 400


def test_pay_salary_and_accounting(s, ctx):
    sid, lid = ctx["ramu"]["id"], ctx["ramu"]["ledger_id"]
    r = s.post(f"{BASE}/staff/salary/pay", json={"staff_id": sid, "month": M, "deduct_advance": 600})
    assert r.status_code == 200, r.text
    p = r.json(); ctx["pay"].append(p["id"]); ctx["pay_id"] = p["id"]
    assert p["gross"] == 6600 and p["advance_deducted"] == 600 and p["net"] == 6000
    assert p["paid_now"] is True and p["date"] == "2026-06-30" and p["voucher_no"]
    assert s.post(f"{BASE}/staff/salary/pay", json={"staff_id": sid, "month": M}).status_code == 409
    st = next(x for x in s.get(f"{BASE}/staff").json()["staff"] if x["id"] == sid)
    assert st["advance_due"] == 400
    js = s.get(f"{BASE}/journal", params={"date_from": f"{M}-01", "date_to": f"{M}-30"}).json()
    j = next(x for x in js if x.get("salary_payment_id") == p["id"])
    assert j["narration"].startswith("Salary Jun 2026 · TEST_QA RAMU · P20 H2 A3 C1 = 22 din")
    lines = {(l["account_name"], l["debit"], l["credit"]) for l in j["lines"]}
    assert ("STAFF SALARY", 6600, 0) in lines and ("TEST_QA RAMU", 0, 6600) in lines
    rk = [x for x in s.get(f"{BASE}/rokad").json() if x.get("salary_payment_id") == p["id"]]
    assert len(rk) == 1 and rk[0]["type"] == "kharch" and rk[0]["amount"] == 6000 and rk[0]["party_id"] == lid
    hist = s.get(f"{BASE}/staff/salary/history", params={"staff_id": sid}).json()
    assert any(h["id"] == p["id"] for h in hist)
    sheet = s.get(f"{BASE}/staff/salary", params={"month": M}).json()
    assert sheet["totals"]["net"] >= 6000


def test_advance_list_excludes_salary(s, ctx):
    d = s.get(f"{BASE}/staff/advance", params={"month": M, "staff_id": ctx["ramu"]["id"]}).json()
    assert [r["amount"] for r in d["rows"]] == [1000] and d["total"] == 1000
    due = next(x for x in d["dues"] if x["id"] == ctx["ramu"]["id"])
    assert due["advance_due"] == 400


def test_delete_staff_in_use(s, ctx):
    assert s.delete(f"{BASE}/staff/{ctx['ramu']['id']}").status_code == 400


def test_delete_salary_reverts(s, ctx):
    pid = ctx["pay_id"]
    assert s.delete(f"{BASE}/staff/salary/{pid}").status_code == 200
    ctx["pay"].remove(pid)
    assert s.delete(f"{BASE}/staff/salary/{pid}").status_code == 404
    st = next(x for x in s.get(f"{BASE}/staff").json()["staff"] if x["id"] == ctx["ramu"]["id"])
    assert st["advance_due"] == 1000
    assert not [x for x in s.get(f"{BASE}/rokad").json() if x.get("salary_payment_id") == pid]


def test_pay_credit_only_daily(s, ctx):
    r = s.post(f"{BASE}/staff/salary/pay", json={"staff_id": ctx["shyam"]["id"], "month": M, "pay_now": False})
    assert r.status_code == 200, r.text
    p = r.json(); ctx["pay"].append(p["id"])
    assert p["gross"] == 1500 and p["paid_now"] is False and p["rokad_id"] is None
    st = next(x for x in s.get(f"{BASE}/staff").json()["staff"] if x["id"] == ctx["shyam"]["id"])
    assert st["salary_due"] == 1500


def test_full_cleanup_then_delete(s, ctx):
    for pid in list(ctx["pay"]):
        assert s.delete(f"{BASE}/staff/salary/{pid}").status_code == 200
        ctx["pay"].remove(pid)
    for rid in list(ctx["rokad"]):
        s.delete(f"{BASE}/rokad/{rid}"); ctx["rokad"].remove(rid)
    for sid, d in list(ctx["att"]):
        s.put(f"{BASE}/staff/attendance", json={"staff_id": sid, "date": d, "mark": None})
    ctx["att"].clear()
    for sid in list(ctx["staff"]):
        r = s.delete(f"{BASE}/staff/{sid}")
        assert r.status_code == 200, r.text
        assert r.json()["ledger_id"] in ctx["ledgers"]
        ctx["staff"].remove(sid)
    ids = {p["id"] for p in s.get(f"{BASE}/parties").json()}
    assert all(l in ids for l in ctx["ledgers"])  # ledger kept
