# Iteration 30: setup / cleanup helper for ledger delete-row UI test (python qa30_setup.py setup|cleanup|state)
import os, sys, json, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PID = "640f05fe-107a-4c69-8752-eef837c70f77"
PNAME = "SETTLE TEST PARTY"
CLEAR_ID = "e00cbcee-8be5-4ca1-a90a-566488022450"
F = "/tmp/qa30.json"

r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"})
s = requests.Session()
s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}", "X-Requested-With": "XMLHttpRequest"})


def state():
    out = {}
    for d in ["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13"]:
        rk = s.get(f"{BASE_URL}/api/rokad", params={"date_from": d, "date_to": d}).json()
        rk = rk if isinstance(rk, list) else rk.get("entries", rk)
        out[d] = [(e["id"], e["amount"], e.get("settle")) for e in rk if e.get("party_id") == PID]
    js = s.get(f"{BASE_URL}/api/journal").json()
    js = js if isinstance(js, list) else js.get("entries", js)
    out["journals"] = [(j["id"], j.get("narration"), j.get("date")) for j in js
                       if any(l.get("account_id") == PID for l in j.get("lines", []))]
    bl = s.get(f"{BASE_URL}/api/bills").json()
    bl = bl if isinstance(bl, list) else bl.get("bills", bl)
    out["bills"] = [(b["id"], b.get("bill_no"), b.get("date")) for b in bl if b.get("party_id") == PID]
    led = s.get(f"{BASE_URL}/api/ledger/party/{PID}").status_code
    out["ledger_status"] = led
    print(json.dumps(out, indent=1))
    return out


cmd = sys.argv[1]
if cmd == "setup":
    ids = {}
    accs = s.get(f"{BASE_URL}/api/accounts").json()
    cash = next(a for a in accs if "CASH" in (a.get("name") or "").upper())
    base = {"type": "jama", "party_id": PID, "party_name": PNAME, "mode": "Cash",
            "cash_account_id": cash["id"], "cash_account_name": cash["name"]}
    r = s.post(f"{BASE_URL}/api/rokad", json={**base, "date": "2026-06-10", "amount": 300, "settle": False}); assert r.ok, r.text
    ids["rokad_a"] = r.json()["id"]
    r = s.post(f"{BASE_URL}/api/journal", json={"date": "2026-06-11", "narration": "QA del jrnl", "lines": [
        {"account_id": PID, "account_name": PNAME, "debit": 20, "credit": 0},
        {"account_id": CLEAR_ID, "account_name": "ACCOUNT CLEAR", "debit": 0, "credit": 20}]}); assert r.ok, r.text
    ids["journal_b"] = r.json()["id"]
    r = s.post(f"{BASE_URL}/api/rokad", json={**base, "date": "2026-06-12", "amount": 700, "settle": True}); assert r.ok, r.text
    ids["rokad_c"] = r.json()["id"]
    ids["settle_journal"] = (r.json().get("settlement") or {}).get("journal_id")
    ids["settlement"] = r.json().get("settlement")
    item = s.get(f"{BASE_URL}/api/items").json()[0]
    bill = {"bill_type": "sale", "party_id": PID, "party_name": PNAME, "date": "2026-06-13",
            "items": [{"item_id": item["id"], "item_name": item["name"], "weight": 1, "nwt": 1, "rate": 100, "amount": 100}],
            "subtotal": 100, "total": 100}
    r = s.post(f"{BASE_URL}/api/bills", json=bill); assert r.ok, r.text
    ids["bill_d"] = r.json()["id"]; ids["bill_no"] = r.json()["bill_no"]
    json.dump(ids, open(F, "w")); print(json.dumps(ids, indent=1))
elif cmd == "cleanup":
    ids = json.load(open(F))
    for k, u in [("bill_d", "bills"), ("journal_b", "journal"), ("rokad_c", "rokad"), ("rokad_a", "rokad")]:
        print(k, s.delete(f"{BASE_URL}/api/{u}/{ids[k]}").status_code)
    state()
elif cmd == "bill":
    ids = json.load(open(F)); print(s.get(f"{BASE_URL}/api/bills/{ids['bill_d']}").status_code)
else:
    state()
