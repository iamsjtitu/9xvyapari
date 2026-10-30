# Byaj Due reminder endpoint (/api/reports/byaj/due) + byaj report regression — iteration 53
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
IDS = open("/tmp/demo_ids").read().split()
GRP, INT_ID, LABBU, SURAJ, KAMLA, RAMESH = IDS[:6]


@pytest.fixture(scope="module")
def h():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip("login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def by_id(rows):
    return {r["id"]: r for r in rows}


# current-month due list
def test_due_current(h):
    r = requests.get(f"{BASE_URL}/api/reports/byaj/due", headers=h)
    assert r.status_code == 200
    d = r.json()
    assert d["month"] == "2026-10"
    assert d["default_ledger_id"] == INT_ID
    assert any(l["id"] == INT_ID for l in d["ledgers"])
    ids = [p["id"] for p in d["pending"]]
    assert ids == [LABBU, RAMESH, KAMLA], [p["name"] for p in d["pending"]]
    p = by_id(d["pending"])
    assert p[LABBU]["balance"] == 500000 and p[LABBU]["rate"] == 0.9 and p[LABBU]["expected"] == 4500
    assert p[LABBU]["last_date"][:10] == "2026-06-05" and p[LABBU]["last_amount"] == 4500
    assert p[RAMESH]["balance"] == 200000 and p[RAMESH]["rate"] is None and p[RAMESH]["expected"] is None
    assert p[RAMESH]["last_date"][:10] == "2026-07-10" and p[RAMESH]["last_amount"] == 2000
    assert p[KAMLA]["balance"] == 100000 and p[KAMLA]["last_date"] is None
    for row in d["pending"]:
        assert row["side"] == "lena"
    done = by_id(d["done"])
    assert list(done) == [SURAJ]
    assert done[SURAJ]["month_received"] == 26000
    assert d["totals"] == {"pending_count": 3, "expected_total": 4500, "received_total": 26000, "paid_total": 0}
    assert "_id" not in d and all("_id" not in row for row in d["pending"] + d["done"])


# explicit month switches LABBU/SURAJ
def test_due_june(h):
    d = requests.get(f"{BASE_URL}/api/reports/byaj/due?month=2026-06", headers=h).json()
    assert d["month"] == "2026-06"
    done = by_id(d["done"])
    assert LABBU in done and done[LABBU]["month_received"] == 4500
    assert SURAJ in by_id(d["pending"])


@pytest.mark.parametrize("m", ["bad", "2026-13", "2026-1", "202610"])
def test_due_bad_month(h, m):
    r = requests.get(f"{BASE_URL}/api/reports/byaj/due?month={m}", headers=h)
    assert r.status_code == 400


def test_due_noauth():
    assert requests.get(f"{BASE_URL}/api/reports/byaj/due").status_code == 401


# regression: byaj report
def test_byaj_report(h):
    r = requests.get(f"{BASE_URL}/api/reports/byaj?date_from=2026-04-01&date_to=2026-12-31", headers=h)
    assert r.status_code == 200
    ids = {g["ref_party_id"] for g in r.json()["groups"]}
    assert {LABBU, SURAJ, RAMESH} <= ids
