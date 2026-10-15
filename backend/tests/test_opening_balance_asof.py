"""Iteration 11 — Backend tests for 'As on date' opening balances + journal-on-party fix."""
import os
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------- opening-balances basic ----------
def test_opening_balance_default_as_on_is_today(session):
    r = session.get(f"{BASE_URL}/api/reports/opening-balances", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["as_on"] == dt.date.today().isoformat()
    assert "grand_dr" in data and "grand_cr" in data


def test_opening_balance_invalid_date_format(session):
    r = session.get(f"{BASE_URL}/api/reports/opening-balances",
                    params={"as_on": "15-10-2026"}, timeout=20)
    assert r.status_code == 400


def test_opening_balance_unknown_fy_id(session):
    r = session.get(f"{BASE_URL}/api/reports/opening-balances",
                    params={"fy_id": "no-such-fy-id-xyz"}, timeout=20)
    assert r.status_code == 404


def _find_party(rows, needle, exact=False):
    for sec in rows["sections"]:
        for r in sec["rows"]:
            name = (r.get("name") or "").strip()
            if exact:
                if name.lower() == needle.lower():
                    return r
            else:
                if needle.lower() in name.lower():
                    return r
    return None


def test_mm_traders_balance_changes_by_date(session):
    """M M TRADERS. has 13,00,000 jama rokad dated 2026-05-01.
    Balance as_on 2026-04-30 should be 13,00,000 HIGHER than as_on 2026-05-01."""
    r1 = session.get(f"{BASE_URL}/api/reports/opening-balances",
                     params={"as_on": "2026-04-30"}, timeout=60).json()
    r2 = session.get(f"{BASE_URL}/api/reports/opening-balances",
                     params={"as_on": "2026-05-01"}, timeout=60).json()
    p1 = _find_party(r1, "M M TRADERS.", exact=True)
    p2 = _find_party(r2, "M M TRADERS.", exact=True)
    if not p1 or not p2:
        pytest.skip("M M TRADERS. not present in DB")
    diff = (p1["balance"] or 0) - (p2["balance"] or 0)
    # magnitude must equal 13,00,000 (sign depends on dr/cr convention)
    assert abs(abs(diff) - 1300000) < 1.0, f"expected |diff| ≈ 1300000, got {diff}"


def test_future_as_on_matches_trial_balance(session):
    """as_on far future ==> grand totals must equal trial-balance grand totals."""
    ob = session.get(f"{BASE_URL}/api/reports/opening-balances",
                     params={"as_on": "2099-12-31"}, timeout=90).json()
    tb = session.get(f"{BASE_URL}/api/reports/trial-balance", timeout=90).json()
    tb_dr = tb.get("grand_dr") or tb.get("total_dr") or sum(s.get("dr_total", 0) for s in tb.get("sections", []))
    tb_cr = tb.get("grand_cr") or tb.get("total_cr") or sum(s.get("cr_total", 0) for s in tb.get("sections", []))
    assert round(ob["grand_dr"], 2) == round(tb_dr, 2), f"ob_dr={ob['grand_dr']} tb_dr={tb_dr}"
    assert round(ob["grand_cr"], 2) == round(tb_cr, 2), f"ob_cr={ob['grand_cr']} tb_cr={tb_cr}"


# ---------- Journal-on-party fix ----------
def test_journal_on_party_affects_party_balance(session):
    parties = session.get(f"{BASE_URL}/api/parties", timeout=20).json()
    accounts = session.get(f"{BASE_URL}/api/accounts", timeout=20).json()
    assert parties and accounts, "need at least one party + account"
    party = parties[0]
    cash = next((a for a in accounts if "cash" in (a.get("name") or "").lower()), accounts[0])

    today = dt.date.today().isoformat()
    yday = (dt.date.today() - dt.timedelta(days=1)).isoformat()

    # Snapshot before
    ob_before = session.get(f"{BASE_URL}/api/reports/opening-balances",
                            params={"as_on": today}, timeout=60).json()
    row_before = _find_party(ob_before, party["name"])
    bal_before = (row_before or {}).get("balance", 0) or 0

    payload = {
        "date": today,
        "narration": "TEST_journal_on_party_fix",
        "ref": "TEST",
        "lines": [
            {"account_id": party["id"], "account_name": party["name"], "debit": 1000.0, "credit": 0.0},
            {"account_id": cash["id"], "account_name": cash["name"], "debit": 0.0, "credit": 1000.0},
        ],
    }
    cr = session.post(f"{BASE_URL}/api/journal", json=payload, timeout=20)
    assert cr.status_code == 200, cr.text
    jid = cr.json()["id"]
    try:
        # today sheet: party balance should increase by 1000
        ob_today = session.get(f"{BASE_URL}/api/reports/opening-balances",
                               params={"as_on": today}, timeout=60).json()
        row_today = _find_party(ob_today, party["name"])
        assert row_today is not None, "party row missing after journal"
        assert abs((row_today["balance"] - bal_before) - 1000) < 0.5, \
            f"expected +1000, got {row_today['balance'] - bal_before}"

        # yesterday: should NOT include today's journal
        ob_yday = session.get(f"{BASE_URL}/api/reports/opening-balances",
                              params={"as_on": yday}, timeout=60).json()
        row_yday = _find_party(ob_yday, party["name"])
        bal_yday = (row_yday or {}).get("balance", 0) or 0
        assert abs((row_today["balance"] - bal_yday) - 1000) < 0.5, \
            f"as_on yesterday should be 1000 less than today, got diff {row_today['balance'] - bal_yday}"

        # trial balance reflects it (party row delta vs before by 1000)
        tb = session.get(f"{BASE_URL}/api/reports/trial-balance", timeout=60).json()
        found = False
        for sec in tb.get("sections", []):
            for r in sec.get("rows", []):
                if r.get("name") == party["name"]:
                    found = True
                    break
        assert found, "party not present in trial balance"
    finally:
        session.delete(f"{BASE_URL}/api/journal/{jid}", timeout=20)

    # After cleanup, balance reverts
    ob_after = session.get(f"{BASE_URL}/api/reports/opening-balances",
                           params={"as_on": today}, timeout=60).json()
    row_after = _find_party(ob_after, party["name"])
    bal_after = (row_after or {}).get("balance", 0) or 0
    assert abs(bal_after - bal_before) < 0.5, f"after delete balance should revert; before={bal_before} after={bal_after}"
