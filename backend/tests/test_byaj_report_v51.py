# Byaj (interest) report v51 - /api/reports/byaj grouped by Kiska? ref party
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
IDS = open("/tmp/demo_ids").read().split()
GID, IR, IP, SURAJ, LABBU, R1, R2, R3, R4, R5 = IDS[:10]


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ss.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return ss


def _get(s, **p):
    return s.get(f"{BASE_URL}/api/reports/byaj", params=p)


class TestByaj:
    def test_full_range(self, s):
        r = _get(s, date_from="2026-04-01", date_to="2026-12-31")
        assert r.status_code == 200
        d = r.json()
        assert d["date_from"] == "2026-04-01" and d["date_to"] == "2026-12-31"
        assert "firm_name" in d
        names = sorted(l["name"] for l in d["ledgers"])
        assert names == ["INTEREST PAID", "INTEREST RECEIVED"], names
        assert d["count"] == 5
        assert d["total_received"] == 56700 and d["total_paid"] == 8000 and d["net"] == 48700
        g = d["groups"]
        assert [x["ref_party_id"] for x in g] == [LABBU, SURAJ, None]
        assert (g[0]["received"], g[0]["paid"], g[0]["net"], g[0]["count"]) == (4500, 8000, -3500, 2)
        assert (g[1]["received"], g[1]["paid"], g[1]["net"], g[1]["count"]) == (51000, 0, 51000, 2)
        assert (g[2]["received"], g[2]["paid"], g[2]["net"], g[2]["count"]) == (1200, 0, 1200, 1)
        assert g[1]["ref_party_name"] == "SURAJ [BARTAN]"
        assert g[2]["ref_party_name"].startswith("BINA NAAM")
        ids = {e["id"] for x in g for e in x["entries"]}
        assert ids == {R1, R2, R3, R4, R5}
        e = g[0]["entries"][0]
        for k in ("id", "date", "type", "amount", "ledger_id", "ledger_name"):
            assert k in e
        # entries sorted by date
        assert [e["date"] for e in g[1]["entries"]] == ["2026-06-05", "2026-07-05"]

    def test_date_from_filter(self, s):
        d = _get(s, date_from="2026-07-01", date_to="2026-12-31").json()
        assert d["count"] == 1 and len(d["groups"]) == 1
        assert d["groups"][0]["ref_party_id"] == SURAJ
        assert d["groups"][0]["entries"][0]["id"] == R2
        assert d["total_received"] == 26000 and d["total_paid"] == 0

    def test_date_inclusive(self, s):
        d = _get(s, date_from="2026-06-05", date_to="2026-06-05").json()
        assert d["count"] == 1 and d["groups"][0]["entries"][0]["id"] == R1

    def test_no_params(self, s):
        d = _get(s).json()
        assert d["count"] >= 5

    def test_invalid_date(self, s):
        assert _get(s, date_from="2026-13-45").status_code == 400
        assert _get(s, date_to="abc").status_code == 400

    def test_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/reports/byaj")
        assert r.status_code == 401
