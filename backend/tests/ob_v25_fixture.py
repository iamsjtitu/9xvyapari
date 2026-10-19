# Iteration 25 fixture helper: QA settle rokad (2026-06-20) + ACCOUNT CLEAR opening toggle
import os, sys, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CLEAR_ID = "e00cbcee-8be5-4ca1-a90a-566488022450"
STP_ID = "640f05fe-107a-4c69-8752-eef837c70f77"


def login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
    r.raise_for_status()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})
    return s


def set_opening(s, val):
    p = s.get(f"{BASE_URL}/api/parties/{CLEAR_ID}")
    if p.status_code != 200:
        p = next(x for x in s.get(f"{BASE_URL}/api/parties").json() if x["id"] == CLEAR_ID)
    else:
        p = p.json()
    body = {k: v for k, v in p.items() if k not in ("_id", "id", "created_at", "updated_at", "balance")}
    body["opening_balance"] = val
    r = s.put(f"{BASE_URL}/api/parties/{CLEAR_ID}", json=body)
    print("PUT opening", val, r.status_code, r.text[:200])


def cleanup(s):
    for x in s.get(f"{BASE_URL}/api/rokad", params={"date_from": "2026-06-20", "date_to": "2026-06-20"}).json():
        if x.get("party_id") == STP_ID:
            print("del", x["id"], s.delete(f"{BASE_URL}/api/rokad/{x['id']}").status_code)


def setup(s):
    cleanup(s)
    cash = s.get(f"{BASE_URL}/api/accounts").json()[0]
    r = s.post(f"{BASE_URL}/api/rokad", json={"date": "2026-06-20", "type": "jama", "amount": 940, "party_id": STP_ID,
               "party_name": "SETTLE TEST PARTY", "mode": "Cash", "cash_account_id": cash["id"],
               "cash_account_name": cash["name"], "settle": True})
    print("rokad", r.status_code, r.text[:300])


def show(s, d):
    ob = s.get(f"{BASE_URL}/api/reports/opening-balances", params={"as_on": d}).json()
    row = next((r for sec in ob["sections"] for r in sec["rows"] if r.get("id") == CLEAR_ID), None)
    ac = s.get(f"{BASE_URL}/api/reports/account-clear", params={"date_to": d}).json()
    print(d, "head", row and row["balance"], "rows", [(x.get("party_name"), x.get("side"), x.get("amount"), x.get("date")) for x in ac.get("rows", [])])


if __name__ == "__main__":
    s = login()
    cmd = sys.argv[1]
    if cmd == "setup": setup(s)
    elif cmd == "cleanup": cleanup(s)
    elif cmd == "open": set_opening(s, float(sys.argv[2]))
    elif cmd == "show":
        for d in sys.argv[2:]: show(s, d)
