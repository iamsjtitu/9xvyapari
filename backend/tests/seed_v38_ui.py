"""Seed/clean QA BANKY staff for v38 UI test. usage: python seed_v38_ui.py seed|clean|info"""
import json, os, sys, requests
from pathlib import Path
for line in Path("/app/frontend/.env").read_text().splitlines():
    if "=" in line:
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session(); s.headers.update({"X-Requested-With": "XMLHttpRequest"})
t = s.post(f"{B}/auth/login", json={"username": "admin", "password": "Vyapari@2026"}).json()
s.headers["Authorization"] = f"Bearer {t.get('access_token') or t.get('token')}"
F = Path("/tmp/v38_seed.json")
cmd = sys.argv[1]
if cmd == "seed":
    st = s.post(f"{B}/staff", json={"name": "QA BANKY", "salary_type": "monthly", "salary": 6000}).json()
    F.write_text(json.dumps(st)); print(st["id"], st["ledger_id"])
elif cmd == "info":
    st = json.loads(F.read_text())
    rk = [x for x in s.get(f"{B}/rokad").json() if x.get("staff_id") == st["id"]]
    for x in rk:
        print({k: x.get(k) for k in ("id", "date", "amount", "staff_kind", "cash_account_name", "voucher_no", "cash_account_id")})
    print("salary", s.get(f"{B}/staff/salary", params={"month": "2026-06"}).json().get("totals"))
elif cmd == "clean":
    st = json.loads(F.read_text())
    sal = s.get(f"{B}/staff/salary", params={"month": "2026-06"}).json()
    for r in sal.get("rows", []):
        p = r.get("paid") or {}
        if r.get("id") == st["id"] and p.get("id"):
            print("unpay", s.delete(f"{B}/staff/salary/{p['id']}").status_code)
    for x in s.get(f"{B}/rokad").json():
        if x.get("staff_id") == st["id"]:
            print("del rokad", s.delete(f"{B}/rokad/{x['id']}").status_code)
    for d in range(1, 31):
        s.put(f"{B}/staff/attendance", json={"staff_id": st["id"], "date": f"2026-06-{d:02d}", "mark": None})
    print("del staff", s.delete(f"{B}/staff/{st['id']}").status_code)
    print("del ledger", s.delete(f"{B}/parties/{st['ledger_id']}").status_code)
