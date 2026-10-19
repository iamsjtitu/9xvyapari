# Iteration 18: inline party create from Rokad form + rokad by-voucher + journal filter regression
import os, time, datetime
import pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return ss


# Party create -> rokad with party -> delete both
def test_party_and_rokad_crud(s):
    name = f"TEST_API_PARTY_{int(time.time())}"
    r = s.post(f"{BASE_URL}/api/parties", json={"name": name})
    assert r.status_code in (200, 201), r.text
    p = r.json()
    assert p["name"] == name and isinstance(p["id"], str)
    assert "_id" not in p
    pid = p["id"]
    assert any(x["id"] == pid for x in s.get(f"{BASE_URL}/api/parties").json())

    accs = s.get(f"{BASE_URL}/api/accounts").json()
    cash = next((a for a in accs if "CASH IN HAND" in (a.get("name") or "").upper()), None)
    today = datetime.date.today().isoformat()
    payload = {"date": today, "type": "jama", "amount": 123.45, "party_id": pid, "party_name": name,
               "description": "TEST_API rokad", "mode": "Cash"}
    if cash:
        payload["account_id"] = cash["id"]
        payload["account_name"] = cash["name"]
    r = s.post(f"{BASE_URL}/api/rokad", json=payload)
    assert r.status_code in (200, 201), r.text
    e = r.json()
    eid = e["id"]
    try:
        assert e["party_id"] == pid
        lst = s.get(f"{BASE_URL}/api/rokad", params={"date_from": today, "date_to": today}).json()
        rows = lst if isinstance(lst, list) else lst.get("entries", lst.get("items", []))
        got = next(x for x in rows if x["id"] == eid)
        assert got["party_id"] == pid and got["party_name"] == name
        # party delete should be blocked while referenced
        r = s.delete(f"{BASE_URL}/api/parties/{pid}")
        assert r.status_code == 409, r.text
    finally:
        assert s.delete(f"{BASE_URL}/api/rokad/{eid}").status_code in (200, 204)
        assert s.delete(f"{BASE_URL}/api/parties/{pid}").status_code in (200, 204)
    assert not any(x["id"] == pid for x in s.get(f"{BASE_URL}/api/parties").json())


def test_party_create_empty_name(s):
    r = s.post(f"{BASE_URL}/api/parties", json={"name": ""})
    if r.status_code in (200, 201):
        s.delete(f"{BASE_URL}/api/parties/{r.json()['id']}")
    assert r.status_code in (400, 422), f"empty name accepted: {r.status_code}"


def test_rokad_by_voucher(s):
    r = s.get(f"{BASE_URL}/api/rokad/by-voucher", params={"voucher_no": 1})
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        d = r.json()
        assert d is not None


def test_journal_filter_by_account(s):
    j = s.get(f"{BASE_URL}/api/journal").json()
    rows = j if isinstance(j, list) else j.get("entries", [])
    if not rows:
        pytest.skip("no journal entries")
    first = rows[0]
    aid = first.get("debit_account_id") or first.get("account_id") or (first.get("lines") or [{}])[0].get("account_id")
    if not aid:
        pytest.skip(f"cannot infer account id from {list(first.keys())}")
    r = s.get(f"{BASE_URL}/api/journal", params={"account_id": aid})
    assert r.status_code == 200
    fr = r.json()
    fr = fr if isinstance(fr, list) else fr.get("entries", [])
    assert 0 < len(fr) <= len(rows)
