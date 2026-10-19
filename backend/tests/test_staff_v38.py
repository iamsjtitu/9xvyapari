"""Staff v38 retest: advance / salary pay honour selected Cash/Bank ledger; unknown id -> 404."""
import os
import pytest
import requests
from pathlib import Path

for line in Path("/app/frontend/.env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
M = "2026-04"


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
    c = {"rokad": [], "pay": [], "att": []}
    r = s.post(f"{BASE}/staff", json={"name": "TEST_QA38 BANK", "salary_type": "monthly", "salary": 6000})
    assert r.status_code == 200, r.text
    st = r.json(); c["st"] = st
    parties = s.get(f"{BASE}/parties").json()
    c["hdfc"] = next(p for p in parties if p.get("code") == 302)
    c["axis"] = next(p for p in parties if p.get("code") == 304)
    c["cust"] = next((p for p in parties if (p.get("code") or 0) > 1000), None)
    yield c
    for pid in c["pay"]:
        s.delete(f"{BASE}/staff/salary/{pid}")
    for rid in c["rokad"]:
        s.delete(f"{BASE}/rokad/{rid}")
    for d in c["att"]:
        s.put(f"{BASE}/staff/attendance", json={"staff_id": st["id"], "date": d, "mark": None})
    s.delete(f"{BASE}/staff/{st['id']}")
    s.delete(f"{BASE}/parties/{st['ledger_id']}")


def test_advance_axis(s, ctx):
    r = s.post(f"{BASE}/staff/advance", json={"staff_id": ctx["st"]["id"], "amount": 500, "date": "2026-03-03", "cash_account_id": ctx["axis"]["id"]})
    assert r.status_code == 200, r.text
    d = r.json(); ctx["rokad"].append(d["id"])
    assert d["cash_account_id"] == ctx["axis"]["id"] and d["cash_account_name"] == ctx["axis"]["name"]
    rk = next(x for x in s.get(f"{BASE}/rokad").json() if x["id"] == d["id"])
    assert rk["cash_account_id"] == ctx["axis"]["id"]
    print("AXIS voucher", rk.get("voucher_no"))


def test_unknown_account_404(s, ctx):
    r = s.post(f"{BASE}/staff/advance", json={"staff_id": ctx["st"]["id"], "amount": 10, "date": f"{M}-03", "cash_account_id": "nope-xyz"})
    assert r.status_code == 404


def test_salary_pay_hdfc(s, ctx):
    for d in (f"{M}-01", f"{M}-02"):
        assert s.put(f"{BASE}/staff/attendance", json={"staff_id": ctx["st"]["id"], "date": d, "mark": "P"}).status_code == 200
        ctx["att"].append(d)
    r = s.post(f"{BASE}/staff/salary/pay", json={"staff_id": ctx["st"]["id"], "month": M, "pay_now": True, "deduct_advance": 0, "cash_account_id": ctx["hdfc"]["id"]})
    assert r.status_code == 200, r.text
    p = r.json(); ctx["pay"].append(p["id"]); print("PAY", {k: p.get(k) for k in ("gross","net","rokad_id","cash_account_name")})
    rk = next(x for x in s.get(f"{BASE}/rokad").json() if x["id"] == p["rokad_id"])
    assert rk["cash_account_id"] == ctx["hdfc"]["id"], rk.get("cash_account_name")


def test_non_cash_party_rejected_probe(s, ctx):
    """Probe: a customer/non CASH&BANK party should not be accepted as cash account."""
    if not ctx["cust"]:
        pytest.skip("no customer")
    r = s.post(f"{BASE}/staff/advance", json={"staff_id": ctx["st"]["id"], "amount": 10, "date": f"{M}-04", "cash_account_id": ctx["cust"]["id"]})
    if r.status_code == 200:
        ctx["rokad"].append(r.json()["id"])
    print("non-cash party status", r.status_code, r.text[:200], ctx["cust"].get("name"), ctx["cust"].get("group_name"))
    assert r.status_code in (400, 404)
