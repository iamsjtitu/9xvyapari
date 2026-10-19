"""Seed/cleanup helper for v37 UI tests: python seed_v37_ui.py seed|clean"""
import json, os, sys, requests
from pathlib import Path
for line in Path("/app/frontend/.env").read_text().splitlines():
    if "=" in line:
        k, v = line.split("=", 1); os.environ.setdefault(k, v)
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session(); s.headers["X-Requested-With"] = "XMLHttpRequest"
t = s.post(B + "/auth/login", json={"username": "admin", "password": "Vyapari@2026"}).json()
s.headers["Authorization"] = "Bearer " + (t.get("access_token") or t.get("token"))
F = Path("/tmp/v37_seed.json")
M = "2026-09"
if sys.argv[1] == "seed":
    out = {}
    for k, nm in (("x", "TEST_QA37 XUI"), ("y", "TEST_QA37 YUI")):
        d = s.post(B + "/staff", json={"name": nm, "salary_type": "monthly", "salary": 9000}).json()
        out[k] = {"id": d["id"], "ledger_id": d["ledger_id"]}
        for i in range(1, 23):
            s.put(B + "/staff/attendance", json={"staff_id": d["id"], "date": f"{M}-{i:02d}", "mark": "P"})
    F.write_text(json.dumps(out)); print(out)
else:
    out = json.loads(F.read_text())
    for p in s.get(B + "/staff/salary/history").json():
        if p["staff_name"].startswith("TEST_QA37"):
            s.delete(B + f"/staff/salary/{p['id']}")
    for v in out.values():
        for r in s.get(B + "/rokad").json():
            if r.get("party_id") == v["ledger_id"]:
                print("del rokad", s.delete(B + f"/rokad/{r['id']}").status_code)
        for i in range(1, 31):
            s.put(B + "/staff/attendance", json={"staff_id": v["id"], "date": f"{M}-{i:02d}", "mark": None})
        print("staff", s.delete(B + f"/staff/{v['id']}").status_code, "party", s.delete(B + f"/parties/{v['ledger_id']}").status_code)
