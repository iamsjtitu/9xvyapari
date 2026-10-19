# Iteration 27: Outstanding List 'Settled chhupao' (hide_settled / settled_hidden / settled_upto)
# Setup creates a settled rokad for SETTLE TEST PARTY (2026-06-25) + QA OS PARTY (settled then re-opened). KEEP_DATA=1 keeps data for UI tests.
import os
import pytest, requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
STP_ID = "640f05fe-107a-4c69-8752-eef837c70f77"
QA = "QA OS PARTY"


def login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    r.raise_for_status()
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})
    return ss


def cleanup(s):
    for x in s.get(f"{BASE_URL}/api/rokad", params={"date_from": "2026-06-25", "date_to": "2026-06-27"}).json():
        if x.get("party_name") in (QA, "SETTLE TEST PARTY"):
            s.delete(f"{BASE_URL}/api/rokad/{x['id']}")
    for p in s.get(f"{BASE_URL}/api/parties").json():
        if p.get("name") == QA:
            s.delete(f"{BASE_URL}/api/parties/{p['id']}")


@pytest.fixture(scope="module")
def s():
    try:
        return login()
    except Exception as e:
        pytest.skip(f"login failed {e}")


@pytest.fixture(scope="module")
def setup(s):
    cleanup(s)
    cash = s.get(f"{BASE_URL}/api/accounts").json()[0]
    base = {"mode": "Cash", "cash_account_id": cash["id"], "cash_account_name": cash["name"]}
    r = s.post(f"{BASE_URL}/api/rokad", json={**base, "date": "2026-06-25", "type": "jama", "amount": 940, "party_id": STP_ID,
                                              "party_name": "SETTLE TEST PARTY", "settle": True})
    assert r.status_code == 200, r.text
    p = s.post(f"{BASE_URL}/api/parties", json={"name": QA, "opening_balance": 500})
    assert p.status_code == 200, p.text
    qid = p.json()["id"]
    r2 = s.post(f"{BASE_URL}/api/rokad", json={**base, "date": "2026-06-26", "type": "jama", "amount": 450, "party_id": qid,
                                               "party_name": QA, "settle": True})
    assert r2.status_code == 200, r2.text
    r3 = s.post(f"{BASE_URL}/api/rokad", json={**base, "date": "2026-06-27", "type": "kharch", "amount": 70, "party_id": qid,
                                               "party_name": QA})
    assert r3.status_code == 200, r3.text
    yield {"qid": qid}
    if os.environ.get("KEEP_DATA") != "1":
        cleanup(s)


def os_get(s, **params):
    r = s.get(f"{BASE_URL}/api/reports/outstanding", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def rows(d):
    return {r["id"]: r for sec in d["sections"] for r in sec["rows"]}


def test_balances_after_setup(s, setup):
    ps = {p["id"]: p for p in s.get(f"{BASE_URL}/api/parties").json()}
    assert abs(ps[STP_ID]["balance"]) < 0.005 and ps[STP_ID]["settled"] is True
    assert abs(ps[setup["qid"]]["balance"] - 70) < 0.01 and ps[setup["qid"]]["settled"] is False


def test_unhidden_list_has_settled_row(s, setup):
    d = os_get(s, as_on="2026-06-24", side="dr")
    assert d["hide_settled"] is False and d["settled_hidden"] == 0
    rr = rows(d)
    assert STP_ID in rr and abs(rr[STP_ID]["balance"] - 1000) < 0.01
    assert rr[STP_ID]["settled_upto"] == "2026-06-25"
    assert setup["qid"] in rr and abs(rr[setup["qid"]]["balance"] - 500) < 0.01
    assert rr[setup["qid"]]["settled_upto"] is None


def test_hide_settled_removes_row(s, setup):
    a = os_get(s, as_on="2026-06-24", side="dr")
    b = os_get(s, as_on="2026-06-24", side="dr", hide_settled="true")
    assert b["hide_settled"] is True and b["settled_hidden"] == 1
    assert STP_ID not in rows(b)
    assert b["count"] == a["count"] - 1
    assert abs(a["grand_dr"] - b["grand_dr"] - 1000) < 0.01
    ra, rb = rows(a), rows(b)
    ra.pop(STP_ID)
    assert set(ra) == set(rb)
    assert all(abs(ra[k]["balance"] - rb[k]["balance"]) < 0.01 for k in ra)
    assert setup["qid"] in rb  # reopened party stays


def test_today_not_counted(s, setup):
    d = os_get(s, as_on=date.today().isoformat(), side="dr", hide_settled="true")
    assert d["settled_hidden"] == 0
    assert STP_ID not in rows(d)


def test_side_all_and_bad_date(s, setup):
    d = os_get(s, as_on="2026-06-24", side="all", hide_settled="true")
    assert d["settled_hidden"] == 1
    assert s.get(f"{BASE_URL}/api/reports/outstanding", params={"as_on": "bad"}).status_code == 400
    assert s.get(f"{BASE_URL}/api/reports/outstanding", params={"side": "xx"}).status_code == 400
