# Cleanup for iteration 42 UI test data (TEST_ZZQ42 parties, rokad, journal J00002 today)
import os, requests, datetime
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
t = requests.post(f"{B}/auth/login", json={"username": "admin", "password": "Vyapari@2026"}).json()["access_token"]
H = {"Authorization": f"Bearer {t}"}
today = datetime.date.today().isoformat()
r = requests.get(f"{B}/rokad", headers=H, params={"date_from": today, "date_to": today}).json()
r = r if isinstance(r, list) else r.get("entries", r.get("items", []))
for e in r:
    if "TEST_ZZQ42" in str(e):
        print("del rokad", e["id"], requests.delete(f"{B}/rokad/{e['id']}", headers=H).status_code)
j = requests.get(f"{B}/journal", headers=H).json()
j = j if isinstance(j, list) else j.get("entries", j.get("items", []))
for e in j:
    if e.get("date") == today and abs(float(e.get("total", e.get("amount", 5)) or 5) - 5) < 0.01 and not e.get("narration"):
        print("del journal", e.get("vno") or e.get("voucher_no"), requests.delete(f"{B}/journal/{e['id']}", headers=H).status_code)
for p in requests.get(f"{B}/parties", headers=H).json():
    if str(p.get("name", "")).startswith("TEST_ZZQ42"):
        print("del party", p["name"], requests.delete(f"{B}/parties/{p['id']}", headers=H).status_code)
