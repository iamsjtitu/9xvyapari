#!/bin/bash
# Smoke test: staff master → attendance → salary (÷30, advance deduction) → advance → cleanup
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)/api
TOKEN=$(curl -s -X POST "$API_URL/auth/login" -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" -d '{"username":"admin","password":"Vyapari@2026"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('token') or d.get('access_token'))")
auth() { curl -s "$@" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest"; }
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
echo "--- settings"; auth "$API_URL/staff/settings" | J "d"
echo "--- create staff"; S=$(auth -X POST "$API_URL/staff" -d '{"name":"qa ramu","phone":"9","salary_type":"monthly","salary":9000,"join_date":"2026-06-01"}'); echo "$S" | J "d['name'], d['ledger_id'] is not None, d['advance_due']"; SID=$(echo "$S" | J "d['id']"); LID=$(echo "$S" | J "d['ledger_id']")
echo "--- dup → 409"; auth -X POST "$API_URL/staff" -d '{"name":"QA RAMU","salary":1}' | J "d"
echo "--- ledger in STAFF group?"; auth "$API_URL/parties" | J "[(p['name'],p.get('group_name')) for p in d if p['id']=='$LID']"
echo "--- advance 1000 on 2026-06-05"; auth -X POST "$API_URL/staff/advance" -d "{\"staff_id\":\"$SID\",\"amount\":1000,\"date\":\"2026-06-05\",\"note\":\"ghar\"}" | J "d['type'], d['amount'], d['description'], d['voucher_no']!='', d['advance_due']"
echo "--- attendance: 20 P, 2 H, 3 A, 1 C in June"; 
for d in $(seq -w 1 20); do auth -X PUT "$API_URL/staff/attendance" -d "{\"staff_id\":\"$SID\",\"date\":\"2026-06-$d\",\"mark\":\"P\"}" >/dev/null; done
for d in 21 22; do auth -X PUT "$API_URL/staff/attendance" -d "{\"staff_id\":\"$SID\",\"date\":\"2026-06-$d\",\"mark\":\"H\"}" >/dev/null; done
for d in 23 24 25; do auth -X PUT "$API_URL/staff/attendance" -d "{\"staff_id\":\"$SID\",\"date\":\"2026-06-$d\",\"mark\":\"A\"}" >/dev/null; done
auth -X PUT "$API_URL/staff/attendance" -d "{\"staff_id\":\"$SID\",\"date\":\"2026-06-26\",\"mark\":\"C\"}" >/dev/null
auth -X PUT "$API_URL/staff/attendance" -d "{\"staff_id\":\"$SID\",\"date\":\"2026-06-26\",\"mark\":null}" >/dev/null   # clear → then re-mark
auth -X PUT "$API_URL/staff/attendance" -d "{\"staff_id\":\"$SID\",\"date\":\"2026-06-26\",\"mark\":\"C\"}" >/dev/null
auth "$API_URL/staff/attendance?month=2026-06" | J "[(r['counts'], r['paid_days'], r['unmarked']) for r in d['rows'] if r['id']=='$SID'], d['days'], d['weekdays'][:3]"
echo "--- bulk mark 27-30 P (only_unmarked)"; auth -X POST "$API_URL/staff/attendance/bulk" -d "{\"date\":\"2026-06-27\",\"mark\":\"P\",\"staff_ids\":[\"$SID\"]}" | J "d"
echo "--- salary sheet: paid_days = 21P + 2*0.5 + 1C = 23 → gross 9000/30*23 = 6900; advance_due 1000 → net 5900"
auth "$API_URL/staff/salary?month=2026-06" | J "[(r['paid_days'], r['per_day'], r['gross'], r['advance_due'], r['suggested_deduct'], r['net'], r['paid']) for r in d['rows'] if r['id']=='$SID']"
echo "--- pay salary (deduct 600 instead of 1000)"; P=$(auth -X POST "$API_URL/staff/salary/pay" -d "{\"staff_id\":\"$SID\",\"month\":\"2026-06\",\"deduct_advance\":600}"); echo "$P" | J "d['gross'], d['advance_deducted'], d['net'], d['paid_now'], d['date'], d['voucher_no']!=''"; PID=$(echo "$P" | J "d['id']")
echo "--- dup pay → 409"; auth -X POST "$API_URL/staff/salary/pay" -d "{\"staff_id\":\"$SID\",\"month\":\"2026-06\"}" | J "d"
echo "--- staff ledger balance now: 1000 adv Dr - 6900 Cr + 6300 net Dr = 400 Dr (bacha advance)"; auth "$API_URL/staff" | J "[(s['advance_due'], s['salary_due']) for s in d['staff'] if s['id']=='$SID']"
echo "--- journal lines"; auth "$API_URL/journal?date_from=2026-06-01&date_to=2026-06-30" | J "[(j['narration'][:60], [(l['account_name'], l['debit'], l['credit']) for l in j['lines']]) for j in d if j.get('staff_kind')=='salary']"
echo "--- advance list (June) excludes salary rokad"; auth "$API_URL/staff/advance?month=2026-06" | J "[(r['amount'], r['description']) for r in d['rows']], d['total'], [(x['name'], x['advance_due']) for x in d['dues'] if x['id']=='$SID']"
echo "--- delete staff while in use → 400"; auth -X DELETE "$API_URL/staff/$SID" | J "d"
echo "--- delete salary → journal+rokad gone; balance back to 1000 Dr"; auth -X DELETE "$API_URL/staff/salary/$PID" | J "d"; auth "$API_URL/staff" | J "[(s['advance_due']) for s in d['staff'] if s['id']=='$SID']"
echo "--- cleanup"; 
for d in $(seq -w 1 27); do auth -X PUT "$API_URL/staff/attendance" -d "{\"staff_id\":\"$SID\",\"date\":\"2026-06-$d\",\"mark\":null}" >/dev/null; done
RID=$(auth "$API_URL/staff/advance?staff_id=$SID" | J "d['rows'][0]['id']"); auth -X DELETE "$API_URL/rokad/$RID" >/dev/null
auth -X DELETE "$API_URL/staff/$SID" | J "d"; auth -X DELETE "$API_URL/parties/$LID" | J "d"
