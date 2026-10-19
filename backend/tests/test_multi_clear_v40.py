"""Multi Account Clear ledgers: link 2, settle into a chosen one, report filter, legacy save still works."""
import os, uuid, requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "Vyapari@2026"}); assert r.ok, r.text
tok = r.json().get("access_token") or r.json().get("token")
if tok: s.headers["Authorization"] = f"Bearer {tok}"

def party(name, **kw):
    r = s.post(f"{BASE}/api/parties", json={"name": name, "type": "both", **kw})
    if r.status_code == 409:
        return next(p for p in s.get(f"{BASE}/api/parties").json() if p["name"].upper() == name.upper())
    assert r.ok, r.text; return r.json()

tag = uuid.uuid4().hex[:5].upper()
orig = s.get(f"{BASE}/api/settings").json()
rk = rk2 = None
P = P2 = L1 = L2 = L3 = None
try:
    L1 = party(f"AC CLEAR ONE {tag}"); L2 = party(f"AC CLEAR TWO {tag}")
    P = party(f"QA MULTI {tag}", opening_balance=1000)   # party owes 1000 Dr
    cash = next(a for a in s.get(f"{BASE}/api/parties").json() if a.get("code") == 301 or "CASH IN HAND" in (a.get("name") or "").upper())

    # 1) link both, L1 default
    st = s.put(f"{BASE}/api/settings", json={"settle_accounts": [{"id": L1["id"], "name": L1["name"]}, {"id": L2["id"], "name": L2["name"]}], "settle_account_id": L1["id"]}).json()
    assert st["settle_account_id"] == L1["id"] and [a["id"] for a in st["settle_accounts"]] == [L1["id"], L2["id"]], st
    # 2) make L2 default without resending list order
    st = s.put(f"{BASE}/api/settings", json={"settle_accounts": st["settle_accounts"], "settle_account_id": L2["id"]}).json()
    assert st["settle_account_id"] == L2["id"] and st["settle_account_name"] == L2["name"]
    # 3) rokad settle → explicitly chosen L1 (not default)
    base = {"date": "2026-06-15", "type": "jama", "party_id": P["id"], "party_name": P["name"], "mode": "Cash", "cash_account_id": cash["id"], "cash_account_name": cash["name"]}
    r = s.post(f"{BASE}/api/rokad", json={**base, "amount": 400, "settle": True, "settle_account_id": L1["id"]}); assert r.ok, r.text
    rk = r.json(); assert rk["settlement"]["ledger_id"] == L1["id"] and rk["settlement"]["amount"] == 600, rk["settlement"]
    got = s.get(f"{BASE}/api/rokad", params={"date_from": "2026-06-15", "date_to": "2026-06-15"}).json()
    me = next(e for e in got if e["id"] == rk["id"]); assert me["settle_account_id"] == L1["id"] and me["settle_account_name"] == L1["name"], me
    # 4) party ledger = 0 as on date, settled_upto set
    bal = s.get(f"{BASE}/api/ledgers/{P['id']}/balance", params={"as_on": "2026-06-15"}).json(); assert abs(bal["balance"]) < 0.005, bal
    pl = next(p for p in s.get(f"{BASE}/api/parties").json() if p["id"] == P["id"]); assert pl["settled_upto"] == "2026-06-15", pl
    # 5) default (no settle_account_id) → L2
    P2 = party(f"QA MULTI B {tag}", opening_balance=500)
    r = s.post(f"{BASE}/api/rokad", json={**base, "party_id": P2["id"], "party_name": P2["name"], "amount": 100, "settle": True}); assert r.ok, r.text
    assert r.json()["settlement"]["ledger_id"] == L2["id"], r.json()["settlement"]
    rk2 = r.json()
    # 6) unlinked ledger rejected
    r = s.post(f"{BASE}/api/rokad", json={**base, "amount": 10, "settle": True, "settle_account_id": P2["id"]}); assert r.status_code == 400, r.text
    # 7) report: all vs filtered
    rep = s.get(f"{BASE}/api/reports/account-clear", params={"date_from": "2026-06-15", "date_to": "2026-06-15"}).json()
    assert len(rep["ledgers"]) == 2 and rep["ledger"]["id"] is None, rep["ledger"]
    mine = [x for x in rep["rows"] if x["rokad_id"] in (rk["id"], rk2["id"])]
    assert {x["ledger_id"] for x in mine} == {L1["id"], L2["id"]} and all(x["ledger_name"] for x in mine), mine
    rep1 = s.get(f"{BASE}/api/reports/account-clear", params={"date_from": "2026-06-15", "date_to": "2026-06-15", "ledger_id": L1["id"]}).json()
    assert rep1["ledger"]["id"] == L1["id"] and all(x["ledger_id"] == L1["id"] for x in rep1["rows"]) and any(x["rokad_id"] == rk["id"] for x in rep1["rows"])
    assert s.get(f"{BASE}/api/reports/account-clear", params={"ledger_id": P2["id"]}).status_code == 400
    # 8) TB / OB expose both ids
    tb = s.get(f"{BASE}/api/reports/trial-balance").json(); assert set(tb["settle_account_ids"]) >= {L1["id"], L2["id"]}
    ob = s.get(f"{BASE}/api/reports/opening-balances", params={"as_on": "2026-06-15"}).json(); assert set(ob["settle_account_ids"]) >= {L1["id"], L2["id"]}
    # 9) edit: switch ledger L1 → L2 rebuilds journal
    r = s.put(f"{BASE}/api/rokad/{rk['id']}", json={**base, "amount": 400, "settle": True, "settle_account_id": L2["id"]}); assert r.ok, r.text
    assert r.json()["settlement"]["ledger_id"] == L2["id"]
    rep1 = s.get(f"{BASE}/api/reports/account-clear", params={"date_from": "2026-06-15", "date_to": "2026-06-15", "ledger_id": L1["id"]}).json()
    assert not any(x["rokad_id"] == rk["id"] for x in rep1["rows"])
    # 10) legacy single save adds to list
    L3 = party(f"AC CLEAR THREE {tag}")
    st = s.put(f"{BASE}/api/settings", json={"settle_account_id": L3["id"], "settle_account_name": L3["name"]}).json()
    assert st["settle_account_id"] == L3["id"] and any(a["id"] == L3["id"] for a in st["settle_accounts"]) and len(st["settle_accounts"]) == 3
    # 11) unlink all → unset
    st = s.put(f"{BASE}/api/settings", json={"settle_accounts": []}).json()
    assert not st.get("settle_account_id") and st["settle_accounts"] == []
    r = s.post(f"{BASE}/api/rokad", json={**base, "amount": 10, "settle": True}); assert r.status_code == 400

finally:
    # cleanup (also after a failed assert) so the shared preview DB is not polluted
    for e in (rk, rk2):
        if e: s.delete(f"{BASE}/api/rokad/{e['id']}")
    for p in (P, P2, L1, L2, L3):
        if p: s.delete(f"{BASE}/api/parties/{p['id']}")
    restore = {k: orig.get(k) for k in ("settle_account_id", "settle_account_name") if orig.get(k)}
    restore["settle_accounts"] = orig.get("settle_accounts") or ([{"id": orig["settle_account_id"], "name": orig.get("settle_account_name", "")}] if orig.get("settle_account_id") else [])
    s.put(f"{BASE}/api/settings", json=restore)
    print("ALL OK")
