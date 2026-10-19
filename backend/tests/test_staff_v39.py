"""Staff v39: attendance/today reminder API + monthly staff report (/staff/report) incl. direct Rokad payment as advance.
Set STAFF39_KEEP=1 to keep the data (A paid, B credited) for UI testing; ids written to /tmp/staff39.json."""
import json
import os
import pytest
import requests
from pathlib import Path

for line in Path("/app/frontend/.env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
M = "2026-06"
KEEP = os.environ.get("STAFF39_KEEP") == "1"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json"})
    r = ses.post(f"{BASE}/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    assert r.status_code == 200, r.text
    d = r.json()
    ses.headers.update({"Authorization": f"Bearer {d.get('access_token') or d.get('token')}"})
    return ses


def _mark(s, sid, d, m):
    r = s.put(f"{BASE}/staff/attendance", json={"staff_id": sid, "date": d, "mark": m})
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def ctx(s):
    c = {"rokad": [], "pay": [], "att": []}
    a = s.post(f"{BASE}/staff", json={"name": "QA SLIP A", "salary_type": "monthly", "salary": 9000})
    b = s.post(f"{BASE}/staff", json={"name": "QA SLIP B", "salary_type": "daily", "salary": 500})
    assert a.status_code == 200 and b.status_code == 200, a.text + b.text
    c["A"], c["B"] = a.json(), b.json()
    marks = ["P"] * 20 + ["H"] * 2 + ["A"] * 3 + ["C"]
    for i, m in enumerate(marks, 1):
        d = f"{M}-{i:02d}"; _mark(s, c["A"]["id"], d, m); c["att"].append((c["A"]["id"], d))
    for i in range(1, 11):
        d = f"{M}-{i:02d}"; _mark(s, c["B"]["id"], d, "P"); c["att"].append((c["B"]["id"], d))
    r = s.post(f"{BASE}/staff/advance", json={"staff_id": c["A"]["id"], "amount": 1000, "date": f"{M}-05"})
    assert r.status_code == 200, r.text; c["rokad"].append(r.json()["id"])
    r = s.post(f"{BASE}/rokad", json={"date": f"{M}-07", "type": "kharch", "amount": 200, "party_id": c["A"]["ledger_id"],
                                      "party_name": c["A"]["name"], "description": "QA direct payment"})
    assert r.status_code == 200, r.text; c["rokad"].append(r.json()["id"])
    yield c
    if KEEP:
        Path("/tmp/staff39.json").write_text(json.dumps(c, default=str)); return
    for pid in c["pay"]:
        s.delete(f"{BASE}/staff/salary/{pid}")
    for rid in c["rokad"]:
        s.delete(f"{BASE}/rokad/{rid}")
    for sid, d in c["att"]:
        s.put(f"{BASE}/staff/attendance", json={"staff_id": sid, "date": d, "mark": None})
    for k in ("A", "B"):
        s.delete(f"{BASE}/staff/{c[k]['id']}")
        s.delete(f"{BASE}/parties/{c[k]['ledger_id']}")


def _rep(s):
    r = s.get(f"{BASE}/staff/report", params={"month": M})
    assert r.status_code == 200, r.text
    return r.json()


def _row(rep, sid):
    return next(x for x in rep["rows"] if x["id"] == sid)


# attendance reminder API
def test_attendance_today(s, ctx):
    r = s.get(f"{BASE}/staff/attendance/today")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["date"] == "2026-10-19"
    ids = {x["id"] for x in d["unmarked"]}
    assert ctx["A"]["id"] in ids and ctx["B"]["id"] in ids
    assert d["total"] >= 2 and d["marked"] == d["total"] - len(d["unmarked"])
    assert set(d["counts"].keys()) == {"P", "H", "A", "C"}


# monthly report before paying
def test_report_before_pay(s, ctx):
    a = _row(_rep(s), ctx["A"]["id"])
    assert a["counts"] == {"P": 20, "H": 2, "A": 3, "C": 1}
    assert a["paid_days"] == 22 and a["per_day"] == 300
    assert a["gross"] == 0 and a["expected_gross"] == 6600 and a["status"] == "pending"
    assert a["advance_amount"] == 1200 and a["advance_count"] == 2
    assert a["advance_due"] == 1200 and a["cash_out"] == 1200


def test_report_invalid_month(s):
    assert s.get(f"{BASE}/staff/report", params={"month": "2026-13"}).status_code == 400
    assert s.get(f"{BASE}/staff/report", params={"month": "abc"}).status_code == 400


# pay A (default deduct) + credit B, then report
def test_pay_and_report(s, ctx):
    r = s.post(f"{BASE}/staff/salary/pay", json={"staff_id": ctx["A"]["id"], "month": M, "pay_now": True})
    assert r.status_code == 200, r.text
    p = r.json(); ctx["pay"].append(p["id"])
    assert p["gross"] == 6600 and p["advance_deducted"] == 1200 and p["net"] == 5400 and p["paid_now"]
    r = s.post(f"{BASE}/staff/salary/pay", json={"staff_id": ctx["B"]["id"], "month": M, "pay_now": False})
    assert r.status_code == 200, r.text
    ctx["pay"].append(r.json()["id"])
    rep = _rep(s)
    a, b = _row(rep, ctx["A"]["id"]), _row(rep, ctx["B"]["id"])
    assert (a["gross"], a["deduct"], a["net"], a["status"], a["cash_out"], a["advance_due"]) == (6600, 1200, 5400, "paid", 6600, 0)
    assert a["advance_amount"] == 1200 and a["advance_count"] == 2
    assert (b["gross"], b["net"], b["status"], b["salary_due"], b["cash_out"]) == (5000, 5000, "credited", 5000, 0)
    t = rep["totals"]
    assert (t["gross"], t["deduct"], t["net"], t["advance"], t["cash_out"], t["advance_due"], t["salary_due"]) == \
           (11600, 1200, 10400, 1200, 6600, 0, 5000), t
