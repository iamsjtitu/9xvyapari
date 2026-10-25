# Iteration 47 UI seed / cleanup helper: python qa47_setup.py setup|cleanup
import os, sys, json, requests
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
CASH = "3811380b-f2ca-407b-9478-e77b69909c25"
F = "/tmp/qa47.json"
s = requests.Session()
t = s.post(f"{B}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"}).json()["access_token"]
s.headers["Authorization"] = f"Bearer {t}"
if sys.argv[1] == "setup":
    pid = s.post(f"{B}/api/parties", json={"name": "QA REG PARTY", "type": "both"}).json()["id"]
    base = {"date": "2026-06-20", "mode": "Cash", "cash_account_id": CASH, "party_id": pid, "party_name": "QA REG PARTY", "description": "QA"}
    r = s.post(f"{B}/api/rokad", json={**base, "type": "jama", "amount": 5000}).json()["id"]
    p = s.post(f"{B}/api/rokad", json={**base, "type": "kharch", "amount": 1200}).json()["id"]
    json.dump({"pid": pid, "r": r, "p": p}, open(F, "w")); print(json.dumps({"pid": pid, "r": r, "p": p}))
elif sys.argv[1] == "list":
    d = json.load(open(F))
    es = s.get(f"{B}/api/rokad", params={"date_from": "2026-01-01", "date_to": "2026-12-31"}).json()
    print([ (e["id"], e["type"], e["amount"], e["date"]) for e in es if e.get("party_id") == d["pid"]])
else:
    d = json.load(open(F))
    es = s.get(f"{B}/api/rokad", params={"date_from": "2000-01-01", "date_to": "2099-12-31"}).json()
    for e in es:
        if e.get("party_id") == d["pid"]:
            print("del", e["id"], s.delete(f"{B}/api/rokad/{e['id']}").status_code)
    print("party del", s.delete(f"{B}/api/parties/{d['pid']}").status_code)
