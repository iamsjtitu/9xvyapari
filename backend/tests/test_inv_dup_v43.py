# Iteration 43: GET /api/rokad/invoice-check (invoice duplicate alert, party-scoped, case/space-insensitive)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("access_token")
    sess.cookies.clear()
    sess.headers.update({"Authorization": f"Bearer {tok}"})
    return sess


@pytest.fixture(scope="module")
def data(s):
    tag = uuid.uuid4().hex[:6]
    pa = s.post(f"{BASE_URL}/api/parties", json={"name": f"TEST_dupA_{tag}"}).json()
    pb = s.post(f"{BASE_URL}/api/parties", json={"name": f"TEST_dupB_{tag}"}).json()
    e1 = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-01-10", "type": "kharch", "amount": 500,
                "party_id": pa["id"], "party_name": pa["name"], "inv_no": f"INV-{tag}"}).json()
    e2 = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-01-11", "type": "kharch", "amount": 300,
                "party_id": pa["id"], "party_name": pa["name"], "inv_no": f"  inv-{tag} "}).json()
    yield {"tag": tag, "pa": pa, "pb": pb, "e1": e1, "e2": e2}
    for e in (e1, e2):
        s.delete(f"{BASE_URL}/api/rokad/{e['id']}")
    for p in (pa, pb):
        s.delete(f"{BASE_URL}/api/parties/{p['id']}")


def chk(s, **params):
    r = s.get(f"{BASE_URL}/api/rokad/invoice-check", params=params)
    assert r.status_code == 200, r.text
    return [d["id"] for d in r.json()["duplicates"]], r.json()["duplicates"]


def test_same_party_case_space(s, data):
    ids, rows = chk(s, party_id=data["pa"]["id"], inv_no=f" Inv-{data['tag']} ")
    assert set(ids) == {data["e1"]["id"], data["e2"]["id"]}
    assert all("_id" not in r for r in rows)
    r1 = [r for r in rows if r["id"] == data["e1"]["id"]][0]
    assert r1["amount"] == 500 and r1["type"] == "kharch" and r1.get("voucher_no")


def test_exclude_id(s, data):
    ids, _ = chk(s, party_id=data["pa"]["id"], inv_no=f"INV-{data['tag']}", exclude_id=data["e1"]["id"])
    assert ids == [data["e2"]["id"]]


def test_other_party_empty(s, data):
    ids, _ = chk(s, party_id=data["pb"]["id"], inv_no=f"INV-{data['tag']}")
    assert ids == []


def test_empty_inv(s, data):
    ids, _ = chk(s, party_id=data["pa"]["id"], inv_no="  ")
    assert ids == []


def test_partial_no_match_and_regex_safe(s, data):
    assert chk(s, party_id=data["pa"]["id"], inv_no="INV")[0] == []
    assert chk(s, party_id=data["pa"]["id"], inv_no=".*")[0] == []


def test_requires_auth():
    r = requests.get(f"{BASE_URL}/api/rokad/invoice-check", params={"party_id": "x", "inv_no": "y"})
    assert r.status_code in (401, 403)
