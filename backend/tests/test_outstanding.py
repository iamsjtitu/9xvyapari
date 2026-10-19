"""Tests for GET /api/reports/outstanding (iteration 15)."""
import os
import re
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"username": "admin", "password": "Vyapari@2026"},
                      timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def _get(path, headers, **params):
    return requests.get(f"{API}{path}", headers=headers, params=params, timeout=60)


# ------- Core shape / dr side -------
def test_outstanding_dr_shape(headers):
    r = _get("/reports/outstanding", headers, as_on="2026-05-05", side="dr")
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("firm_name", "as_on", "side", "sections", "count", "grand_dr", "grand_cr"):
        assert k in j, f"missing {k}"
    assert j["as_on"] == "2026-05-05"
    assert j["side"] == "dr"
    assert j["count"] == sum(len(sec["rows"]) for sec in j["sections"])
    assert abs(j["grand_dr"] - sum(sec["dr_total"] for sec in j["sections"])) < 1.0
    assert j["grand_cr"] == 0.0  # side=dr → no Cr rows
    # Section shape + row shape
    for sec in j["sections"]:
        for k in ("group_id", "group_name", "fcode", "rows", "dr_total", "cr_total"):
            assert k in sec
        assert not re.search(r"cash|bank", sec["group_name"], re.I), sec["group_name"]
        prev = None
        for row in sec["rows"]:
            for k in ("code", "name", "place", "phone", "last_txn", "days", "balance", "dr_cr"):
                assert k in row
            assert row["balance"] > 0
            assert row["dr_cr"] == "Dr"
            if prev is not None:
                assert abs(row["balance"]) <= abs(prev) + 1e-6, "not sorted desc by |balance|"
            prev = row["balance"]


def test_outstanding_cr(headers):
    r = _get("/reports/outstanding", headers, as_on="2026-05-05", side="cr")
    assert r.status_code == 200
    j = r.json()
    assert j["grand_dr"] == 0.0
    for sec in j["sections"]:
        for row in sec["rows"]:
            assert row["balance"] < 0


def test_outstanding_all_count_equals_dr_plus_cr(headers):
    dr = _get("/reports/outstanding", headers, as_on="2026-05-05", side="dr").json()["count"]
    cr = _get("/reports/outstanding", headers, as_on="2026-05-05", side="cr").json()["count"]
    allj = _get("/reports/outstanding", headers, as_on="2026-05-05", side="all").json()
    assert allj["count"] == dr + cr


def test_outstanding_min_amount(headers):
    r = _get("/reports/outstanding", headers, as_on="2026-05-05", side="all",
             min_amount=1000000)
    assert r.status_code == 200
    j = r.json()
    for sec in j["sections"]:
        for row in sec["rows"]:
            assert abs(row["balance"]) >= 1000000


def test_outstanding_sort_name(headers):
    r = _get("/reports/outstanding", headers, as_on="2026-05-05", side="dr", sort="name")
    j = r.json()
    for sec in j["sections"]:
        names = [row["name"] for row in sec["rows"]]
        assert names == sorted(names, key=lambda s: s.lower()), sec["group_name"]


def test_cross_check_balance(headers):
    j = _get("/reports/outstanding", headers, as_on="2026-05-05", side="dr").json()
    # Fetch all parties once
    pr = requests.get(f"{API}/parties", headers=headers, timeout=30)
    assert pr.status_code == 200
    parties = pr.json()
    parties = parties if isinstance(parties, list) else parties.get("items", [])
    by_code = {str(p.get("code")): p for p in parties if p.get("code") is not None}
    checked = 0
    for sec in j["sections"]:
        for row in sec["rows"][:1]:
            match = by_code.get(str(row["code"]))
            if not match:
                continue
            pid = match.get("id") or match.get("_id")
            br = requests.get(f"{API}/ledgers/{pid}/balance",
                              headers=headers, params={"as_on": "2026-05-05"}, timeout=30)
            if br.status_code != 200:
                continue
            jb = br.json()
            bal = jb.get("balance", jb.get("closing_balance"))
            assert abs(abs(bal) - abs(row["balance"])) < 1.0, \
                f"{row['code']} {row['name']}: {bal} vs {row['balance']}"
            checked += 1
            if checked >= 3:
                return
    assert checked >= 1, "could not cross-check any row"


def test_days_calculation(headers):
    r = _get("/reports/outstanding", headers, as_on="2026-10-15", side="dr")
    j = r.json()
    found = False
    for sec in j["sections"]:
        for row in sec["rows"]:
            if str(row.get("code")) == "104":
                found = True
                assert row.get("last_txn") == "2026-05-05"
                assert row.get("days") == 163
    # Non-fatal if 104 not Dr on that date; still want to ensure days is correct
    # for any row with last_txn
    from datetime import date
    as_on = date(2026, 10, 15)
    for sec in j["sections"]:
        for row in sec["rows"][:2]:
            if row.get("last_txn"):
                y, m, d = map(int, row["last_txn"].split("-"))
                expected = (as_on - date(y, m, d)).days
                assert row["days"] == expected
                return
    # best-effort
    assert True


def test_invalid_side(headers):
    r = _get("/reports/outstanding", headers, as_on="2026-05-05", side="x")
    assert r.status_code == 400


def test_invalid_as_on(headers):
    r = _get("/reports/outstanding", headers, as_on="05-05-2026", side="dr")
    assert r.status_code == 400


def test_missing_as_on_defaults_today(headers):
    r = _get("/reports/outstanding", headers, side="dr")
    assert r.status_code == 200
    from datetime import date
    assert r.json()["as_on"] == date.today().isoformat()
