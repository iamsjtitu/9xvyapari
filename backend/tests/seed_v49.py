# Seed / cleanup helper for iteration 49 (confirm dialog + pdf names UI test)
import os, sys, json, requests
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
s = requests.Session()
tok = s.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"}).json()["access_token"]
s.headers["Authorization"] = f"Bearer {tok}"
mode = sys.argv[1]
if mode == "seed":
    out = {}
    p = s.post(f"{BASE}/api/parties", json={"name": "TEST_CONF_PARTY", "type": "both"}); out["party"] = p.json().get("id"); print(p.status_code, p.text[:200])
    p2 = s.post(f"{BASE}/api/parties", json={"name": "TEST_DEL_PARTY", "type": "both"}); out["del_party"] = p2.json().get("id")
    it = s.post(f"{BASE}/api/items", json={"name": "TEST_DEL_ITEM", "unit": "Qtl"}); print("item", it.status_code, it.text[:200]); out["item"] = it.json().get("id")
    ca = s.get(f"{BASE}/api/cash-accounts").json()
    print("cash accounts:", [(a["id"], a["name"]) for a in ca][:10])
    out["cash"] = ca[0]["id"]
    json.dump(out, open("/tmp/seed49.json", "w")); print(out)
elif mode == "cleanup":
    for e in s.get(f"{BASE}/api/rokad", params={"date_from": "2000-01-01", "date_to": "2100-01-01"}).json() if isinstance(s.get(f"{BASE}/api/rokad").json(), list) else []:
        pass
    parties = s.get(f"{BASE}/api/parties").json()
    tp = [p for p in parties if str(p.get("name", "")).startswith("TEST_")]
    print("test parties", [(p["id"], p["name"]) for p in tp])
    for p in tp:
        r = s.delete(f"{BASE}/api/parties/{p['id']}"); print("del party", p["name"], r.status_code, r.text[:150])
    items = s.get(f"{BASE}/api/items").json()
    for i in [i for i in items if str(i.get("name", "")).startswith("TEST_")]:
        r = s.delete(f"{BASE}/api/items/{i['id']}"); print("del item", i["name"], r.status_code)
