# Iteration 54: Tally standard Dr/Cr convention — ledger balance + outstanding dr_cr
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CASH_ID = "3811380b-f2ca-407b-9478-e77b69909c25"


def _ids():
    with open("/tmp/demo_ids") as f:
        return f.read().split()


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    ss = requests.Session()
    ss.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return ss


# Ledger balance endpoint
def test_dimpy_balance_cr(s):
    pid = _ids()[0]
    d = s.get(f"{BASE_URL}/api/ledgers/{pid}/balance").json()
    assert d["balance"] == -3250000.0
    assert d["dr_cr"] == "Cr"
    assert d["kind"] == "party"


def test_cash_balance_dr(s):
    d = s.get(f"{BASE_URL}/api/ledgers/{CASH_ID}/balance").json()
    assert d["kind"] in ("account", "party")
    assert d["balance"] > 0
    assert d["dr_cr"] == "Dr"


def test_cash_balance_as_on(s):
    d = s.get(f"{BASE_URL}/api/ledgers/{CASH_ID}/balance", params={"as_on": "2026-10-18"}).json()
    assert d["dr_cr"] == ("Dr" if d["balance"] > 0 else "Cr" if d["balance"] < 0 else "")


def test_balance_bad_date(s):
    assert s.get(f"{BASE_URL}/api/ledgers/{CASH_ID}/balance", params={"as_on": "xx"}).status_code == 400


def test_balance_404(s):
    assert s.get(f"{BASE_URL}/api/ledgers/nonexistent-id/balance").status_code == 404


# Outstanding report dr_cr
def test_outstanding_drcr_rule(s):
    r = s.get(f"{BASE_URL}/api/reports/outstanding", params={"as_on": "2026-11-01"})
    assert r.status_code == 200
    data = r.json()
    rows = [x for sec in data["sections"] for x in sec["rows"]]
    assert len(rows) > 0
    assert data["grand_dr"] >= 0 and data["grand_cr"] >= 3250000
    for row in rows:
        if row["balance"] > 0:
            assert row["dr_cr"] == "Dr", row
        elif row["balance"] < 0:
            assert row["dr_cr"] == "Cr", row
    pid = _ids()[0]
    dimpy = [x for x in rows if x.get("id") == pid or x.get("party_id") == pid]
    assert dimpy, "DIMPY not in outstanding"
    assert dimpy[0]["balance"] == -3250000.0 and dimpy[0]["dr_cr"] == "Cr"


def test_outstanding_side_dena(s):
    pid = _ids()[0]
    r = s.get(f"{BASE_URL}/api/reports/outstanding", params={"as_on": "2026-11-01", "side": "cr"})
    assert r.status_code == 200
    data = r.json()
    rows = [x for sec in data["sections"] for x in sec["rows"]]
    assert all(x["balance"] < 0 for x in rows)
    assert any((x.get("id") == pid or x.get("party_id") == pid) for x in rows)


# Regression
@pytest.mark.parametrize("path", ["/api/reports/trial-balance", "/api/dashboard"])
def test_regression_endpoints(s, path):
    r = s.get(f"{BASE_URL}{path}")
    assert r.status_code in (200, 404), r.text[:200]
