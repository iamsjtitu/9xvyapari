# Aay-Vyay (Income & Expense) report — /api/reports/income-expense + settings.investment_group_ids (iteration 45)
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]).rstrip("/")
EXP_HEAD = "4bf7372e-6c35-464b-ab29-44b983978630"     # BANK CHARGES. (INDIRECT EXP.)
SAL_HEAD = "63a4cfe3-e7c7-4770-91a0-6653298269b1"     # ABHISHEK HARPAL (SALARY A/C)
INC_HEAD = "ec991b7b-f511-40ec-83c6-39acd96e07b9"     # BHOLENATH TRADERS(SHOP RENT) (INDIRECT INCOMES)
CASH = "3811380b-f2ca-407b-9478-e77b69909c25"         # CASH IN HAND
FIXED_GRP = "7991b611-d6ce-4f23-8417-0d4399bc1f25"    # FIXED ASSETS
INC_GRP = "e92b66ba-0920-470b-8e14-a8cf0d4bc652"
URL = f"{BASE_URL}/api/reports/income-expense"


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ss.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return ss


@pytest.fixture(scope="module")
def seed(s):
    created = {"rokad": [], "journal": [], "parties": []}
    orig_settings = s.get(f"{BASE_URL}/api/settings").json()
    orig_inv = s.get(URL, params={"period": "monthly"}).json()["investment_group_ids"]

    def rok(date, typ, amt, pid, pname):
        r = s.post(f"{BASE_URL}/api/rokad", json={"date": date, "type": typ, "amount": amt, "party_id": pid, "party_name": pname,
                                                  "description": "TEST_IE45", "cash_account_id": CASH, "cash_account_name": "CASH IN HAND"})
        assert r.status_code in (200, 201), r.text
        created["rokad"].append(r.json()["id"])
        return r.json()
    rok("2026-08-03", "kharch", 1200, EXP_HEAD, "BANK CHARGES.")
    rok("2026-08-18", "kharch", 9000, SAL_HEAD, "ABHISHEK HARPAL")
    rok("2026-08-10", "jama", 15000, INC_HEAD, "BHOLENATH TRADERS(SHOP RENT)")
    rok("2026-09-05", "kharch", 800, EXP_HEAD, "BANK CHARGES.")
    yield {"created": created, "rok": rok, "orig_inv": orig_inv, "orig_settings": orig_settings}
    for rid in created["rokad"]:
        s.delete(f"{BASE_URL}/api/rokad/{rid}")
    for jid in created["journal"]:
        s.delete(f"{BASE_URL}/api/journal/{jid}")
    for pid in created["parties"]:
        s.delete(f"{BASE_URL}/api/parties/{pid}")
    s.put(f"{BASE_URL}/api/settings", json={"investment_group_ids": orig_inv,
                                             "firm_name": orig_settings.get("firm_name") or "9x Vyapari"})


def rep(s, period, f, t):
    r = s.get(URL, params={"period": period, "date_from": f, "date_to": t})
    assert r.status_code == 200, r.text
    return r.json()


# --- monthly buckets + totals + heads
def test_monthly(s, seed):
    d = rep(s, "monthly", "2026-08-01", "2026-09-30")
    rows = {r["key"]: r for r in d["rows"]}
    assert list(rows) == ["2026-08-01", "2026-09-01"]
    aug, sep = rows["2026-08-01"], rows["2026-09-01"]
    assert aug["label"] == "Aug 2026"
    assert (aug["expense"], aug["income"], aug["net"]) == (10200, 15000, 4800)
    assert sep["expense"] == 800 and sep["net"] == -800
    assert d["totals"]["expense"] == 11000 and d["totals"]["income"] == 15000 and d["totals"]["net"] == 4000
    ex = d["heads"]["expense"]
    assert {g["group_name"] for g in ex} == {"SALARY A/C", "INDIRECT EXP."}
    assert abs(sum(g["share"] for g in ex) - 100) < 0.2
    assert ex[0]["group_name"] == "SALARY A/C" and ex[0]["total"] == 9000
    inc = d["heads"]["income"]
    assert len(inc) == 1 and inc[0]["total"] == 15000 and inc[0]["share"] == 100
    assert inc[0]["rows"][0]["id"] == INC_HEAD and inc[0]["rows"][0]["share"] == 100
    # bucket-scoped heads
    assert sum(g["total"] for g in aug["heads"]["expense"]) == 10200
    assert sep["heads"]["income"] == []


# --- weekly Mon-Sun buckets
def test_weekly(s, seed):
    d = rep(s, "weekly", "2026-08-01", "2026-08-31")
    rows = {r["key"]: r for r in d["rows"]}
    assert list(rows) == ["2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]
    assert rows["2026-07-27"]["start"] == "2026-08-01"   # clipped to range
    assert rows["2026-08-03"]["label"] == "03 Aug – 09 Aug 2026"
    assert rows["2026-08-03"]["expense"] == 1200
    assert rows["2026-08-10"]["income"] == 15000
    assert rows["2026-08-17"]["expense"] == 9000
    assert rows["2026-08-24"]["expense"] == 0 and rows["2026-08-24"]["income"] == 0


# --- yearly FY buckets
def test_yearly(s, seed):
    d = rep(s, "yearly", "2025-04-01", "2026-10-25")
    labels = [r["label"] for r in d["rows"]]
    assert labels == ["FY 2025-26", "FY 2026-27"]
    assert d["rows"][1]["expense"] >= 11000


# --- journal Dr expense adds; jama rokad to expense head reduces
def test_journal_and_jama_reduce(s, seed):
    base = rep(s, "monthly", "2026-08-01", "2026-08-31")["rows"][0]["expense"]
    j = s.post(f"{BASE_URL}/api/journal", json={"date": "2026-08-20", "narration": "TEST_IE45", "lines": [
        {"account_id": EXP_HEAD, "account_name": "BANK CHARGES.", "debit": 500, "credit": 0},
        {"account_id": CASH, "account_name": "CASH IN HAND", "debit": 0, "credit": 500}]})
    assert j.status_code in (200, 201), j.text
    seed["created"]["journal"].append(j.json()["id"])
    assert rep(s, "monthly", "2026-08-01", "2026-08-31")["rows"][0]["expense"] == base + 500
    seed["rok"]("2026-08-25", "jama", 300, EXP_HEAD, "BANK CHARGES.")
    assert rep(s, "monthly", "2026-08-01", "2026-08-31")["rows"][0]["expense"] == base + 200


# --- validation
@pytest.mark.parametrize("params", [{"period": "daily"}, {"period": "monthly", "date_from": "2026-13-01"}, {"period": "monthly", "date_to": "abc"}])
def test_invalid(s, params):
    assert s.get(URL, params=params).status_code == 400


def test_swapped_dates(s, seed):
    d = rep(s, "monthly", "2026-09-30", "2026-08-01")
    assert d["date_from"] == "2026-08-01" and len(d["rows"]) == 2


# --- investment groups setting
def test_investment_groups(s, seed):
    assert FIXED_GRP in seed["orig_inv"]
    p = s.post(f"{BASE_URL}/api/parties", json={"name": "TEST_IE45 FIXED ASSET", "group_id": FIXED_GRP})
    assert p.status_code in (200, 201), p.text
    pid = p.json()["id"]
    seed["created"]["parties"].append(pid)
    assert p.json().get("group_id") == FIXED_GRP
    seed["rok"]("2026-08-12", "kharch", 7000, pid, "TEST_IE45 FIXED ASSET")
    r = s.put(f"{BASE_URL}/api/settings", json={"investment_group_ids": [FIXED_GRP]})
    assert r.status_code == 200
    d = rep(s, "monthly", "2026-04-01", "2026-09-30")
    assert d["investment_group_ids"] == [FIXED_GRP]
    rows = {x["key"]: x for x in d["rows"]}
    assert rows["2026-08-01"]["investment"] == 7000
    assert d["totals"]["investment"] == 7000   # OTHER DEPOSITS (Apr/May legacy) excluded now
    assert [g["group_id"] for g in d["heads"]["investment"]] == [FIXED_GRP]
    # restore original
    s.put(f"{BASE_URL}/api/settings", json={"investment_group_ids": seed["orig_inv"]})
    assert rep(s, "monthly", "2026-08-01", "2026-08-31")["investment_group_ids"] == seed["orig_inv"]


# --- PUT settings with only investment_group_ids must not clobber firm_name
def test_settings_partial_put_keeps_firm_name(s, seed):
    orig = seed["orig_settings"].get("firm_name")
    s.put(f"{BASE_URL}/api/settings", json={"firm_name": "TEST_IE45 FIRM"})
    s.put(f"{BASE_URL}/api/settings", json={"investment_group_ids": seed["orig_inv"]})
    after = s.get(f"{BASE_URL}/api/settings").json().get("firm_name")
    s.put(f"{BASE_URL}/api/settings", json={"firm_name": orig or "9x Vyapari"})
    assert after == "TEST_IE45 FIRM", f"firm_name reset to {after!r} by partial settings PUT"
