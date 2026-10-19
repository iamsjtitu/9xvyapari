"""Staff v37 retest: future-date guard, bulk unknown ids, salary-lock on rokad/journal, totals split, cash/bank ledger selection."""
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
M = "2026-05"


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


def test_setup_staff(s, ctx):
    for nm in ("TEST_QA37 A", "TEST_QA37 B"):
        r = s.post(f"{BASE}/staff", json={"name": nm, "salary_type": "monthly", "salary": 9000})
        assert r.status_code == 200, r.text
        d = r.json(); ctx["staff"].append(d["id"]); ctx["ledgers"].append(d["ledger_id"])
    ctx["a"], ctx["b"] = ctx["staff"]
    for sid in ctx["staff"]:
        for d in range(1, 11):
            r = s.put(f"{BASE}/staff/attendance", json={"staff_id": sid, "date": f"{M}-{d:02d}", "mark": "P"})
            assert r.status_code == 200
            ctx["att"].append((sid, f"{M}-{d:02d}"))


# --- future date guard
def test_future_put_rejected(s, ctx):
    r = s.put(f"{BASE}/staff/attendance", json={"staff_id": ctx["a"], "date": "2030-01-01", "mark": "P"})
    assert r.status_code == 400


def test_future_bulk_rejected(s, ctx):
    r = s.post(f"{BASE}/staff/attendance/bulk", json={"date": "2030-01-01", "mark": "P", "staff_ids": [ctx["a"]]})
    assert r.status_code == 400


def test_bulk_unknown_staff(s, ctx):
    r = s.post(f"{BASE}/staff/attendance/bulk", json={"date": f"{M}-11", "mark": "P", "staff_ids": ["nope-xyz"]})
    assert r.status_code == 200 and r.json()["marked"] == 0
    r = s.post(f"{BASE}/staff/attendance/bulk", json={"date": f"{M}-11", "mark": "P", "staff_ids": ["nope-xyz", ctx["a"]]})
    assert r.json()["marked"] == 1
    ctx["att"].append((ctx["a"], f"{M}-11"))


# --- pay + lock
def test_pay_and_lock(s, ctx):
    r = s.post(f"{BASE}/staff/salary/pay", json={"staff_id": ctx["a"], "month": M, "pay_now": True})
    assert r.status_code == 200, r.text
    p = r.json(); ctx["pay"].append(p["id"]); ctx["pa"] = p
    assert p["rokad_id"] and p["journal_id"] and p["gross"] == 3300
    rk = next(x for x in s.get(f"{BASE}/rokad").json() if x["id"] == p["rokad_id"])
    ctx["rk"] = rk
    body = {k: rk[k] for k in ("date", "type", "amount", "party_id", "description", "mode", "cash_account_id") if k in rk}
    body["amount"] = 1
    r = s.put(f"{BASE}/rokad/{rk['id']}", json=body)
    assert r.status_code == 400 and "Staff Salary" in r.text, r.text
    r = s.delete(f"{BASE}/rokad/{rk['id']}")
    assert r.status_code == 400 and "Staff Salary" in r.text
    js = s.get(f"{BASE}/journal", params={"date_from": f"{M}-01", "date_to": f"{M}-31"}).json()
    j = next(x for x in js if x["id"] == p["journal_id"])
    r = s.put(f"{BASE}/journal/{j['id']}", json={"date": j["date"], "narration": "x", "lines": j["lines"]})
    assert r.status_code == 400 and "Staff Salary" in r.text, r.text
    r = s.delete(f"{BASE}/journal/{j['id']}")
    assert r.status_code == 400 and "Staff Salary" in r.text
    # still present
    assert any(x["id"] == rk["id"] for x in s.get(f"{BASE}/rokad").json())


def test_default_cash_is_301(s, ctx):
    parties = s.get(f"{BASE}/parties").json()
    p301 = next(p for p in parties if p.get("code") == 301)
    assert ctx["rk"]["cash_account_id"] == p301["id"], ctx["rk"].get("cash_account_name")


def test_totals_split(s, ctx):
    r = s.post(f"{BASE}/staff/salary/pay", json={"staff_id": ctx["b"], "month": M, "pay_now": False})
    assert r.status_code == 200, r.text
    ctx["pay"].append(r.json()["id"])
    t = s.get(f"{BASE}/staff/salary", params={"month": M}).json()["totals"]
    assert t["paid_count"] >= 1 and t["credited_count"] >= 1
    assert t["paid_net"] >= 3300 and t["credited_net"] >= 3000
    assert abs(t["net"] - (t["paid_net"] + t["credited_net"])) < 0.01


def test_advance_with_bank_ledger(s, ctx):
    """Selecting a bank ledger (party in CASH & BANK group) must be honoured, not fall back to 301."""
    parties = s.get(f"{BASE}/parties").json()
    bank = next((p for p in parties if p.get("code") in (302, 304)), None)
    if not bank:
        pytest.skip("no bank ledger")
    r = s.post(f"{BASE}/staff/advance", json={"staff_id": ctx["a"], "amount": 50, "date": f"{M}-12", "cash_account_id": bank["id"]})
    assert r.status_code == 200, r.text
    d = r.json(); ctx["rokad"].append(d["id"])
    assert d["cash_account_id"] == bank["id"], f"selected {bank['name']} but got {d['cash_account_name']}"


def test_delete_salary_removes_both(s, ctx):
    p = ctx["pa"]
    assert s.delete(f"{BASE}/staff/salary/{p['id']}").status_code == 200
    ctx["pay"].remove(p["id"])
    assert not any(x["id"] == p["rokad_id"] for x in s.get(f"{BASE}/rokad").json())
    js = s.get(f"{BASE}/journal", params={"date_from": f"{M}-01", "date_to": f"{M}-31"}).json()
    assert not any(x["id"] == p["journal_id"] for x in js)
