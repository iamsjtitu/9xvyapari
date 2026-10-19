# Iteration 44: inv_no trimmed server-side on POST/PUT /api/rokad + invoice-check still works
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
def party(s):
    p = s.post(f"{BASE_URL}/api/parties", json={"name": f"TEST_trim_{uuid.uuid4().hex[:6]}"}).json()
    yield p
    for e in s.get(f"{BASE_URL}/api/rokad", params={"party_id": p["id"]}).json() if False else []:
        pass
    s.delete(f"{BASE_URL}/api/parties/{p['id']}")


def _find(s, eid):
    r = s.get(f"{BASE_URL}/api/rokad")
    assert r.status_code == 200
    d = r.json()
    rows = d if isinstance(d, list) else (d.get("entries") or d.get("items") or d.get("rows") or [])
    return next((x for x in rows if x["id"] == eid), None)


def test_post_put_trim(s, party):
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-01-12", "type": "kharch", "amount": 90,
               "party_id": party["id"], "party_name": party["name"], "inv_no": "  INV-900  "})
    assert r.status_code in (200, 201), r.text
    e = r.json()
    try:
        assert e.get("inv_no") == "INV-900"
        got = _find(s, e["id"])
        assert got is not None and got["inv_no"] == "INV-900"
        body = {k: v for k, v in got.items() if k not in ("id", "_id")}
        body["inv_no"] = " INV-901 "
        r2 = s.put(f"{BASE_URL}/api/rokad/{e['id']}", json=body)
        assert r2.status_code == 200, r2.text
        got2 = _find(s, e["id"])
        assert got2["inv_no"] == "INV-901"
        # check excludes itself
        c = s.get(f"{BASE_URL}/api/rokad/invoice-check", params={"party_id": party["id"], "inv_no": "inv-901"}).json()
        assert [d["id"] for d in c["duplicates"]] == [e["id"]]
        c = s.get(f"{BASE_URL}/api/rokad/invoice-check", params={"party_id": party["id"], "inv_no": "inv-901", "exclude_id": e["id"]}).json()
        assert c["duplicates"] == []
    finally:
        s.delete(f"{BASE_URL}/api/rokad/{e['id']}")


def test_no_inv_no_ok(s, party):
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-01-12", "type": "kharch", "amount": 5,
               "party_id": party["id"], "party_name": party["name"]})
    assert r.status_code in (200, 201), r.text
    assert (r.json().get("inv_no") or "") == ""
    s.delete(f"{BASE_URL}/api/rokad/{r.json()['id']}")
