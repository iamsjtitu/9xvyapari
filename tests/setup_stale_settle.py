import os, sys, requests, json
BASE = "https://khata-book-18.preview.emergentagent.com/api"
PID = "640f05fe-107a-4c69-8752-eef837c70f77"
s = requests.Session()
s.headers.update({"X-Requested-With": "XMLHttpRequest"})
r = s.post(f"{BASE}/auth/login", json={"username": "admin", "password": "Vyapari@2026"}); print(r.status_code)
mode = sys.argv[1] if len(sys.argv) > 1 else "show"
def show():
    sm = s.get(f"{BASE}/summary/party/{PID}", params={"as_on": "2026-06-30"}).json()
    print("party bal", sm.get("party", {}).get("balance"))
    print("rokad", [(x["id"], x["date"], x["amount"], x.get("settle")) for x in sm.get("rokad", [])])
    print("journal", [(x.get("id"), x.get("date"), x.get("amount"), x.get("settles_rokad_id")) for x in sm.get("journal", [])])
if mode == "setup":
    for amt, d, st in [(300, "2026-06-10", False), (640, "2026-06-12", True)]:
        r = s.post(f"{BASE}/rokad", json={"date": d, "type": "jama", "amount": amt, "party_id": PID, "party_name": "SETTLE TEST PARTY", "mode": "Cash", "settle": st, "description": "TEST_stale"})
        print(r.status_code, json.dumps(r.json())[:400])
show()
