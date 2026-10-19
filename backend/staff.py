"""Staff Attendance & Payments — staff master (linked ledger), daily attendance, salary (÷30), advances.
Wired from server.py via make_staff_router(...) so it can reuse the accounting helpers."""
import calendar
import uuid
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MARKS = ("P", "H", "A", "C")  # Present · Half day · Absent (unpaid) · Choot (paid leave)
PAID_WEIGHT = {"P": 1.0, "H": 0.5, "A": 0.0, "C": 1.0}


class StaffIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    salary_type: Literal["monthly", "daily"] = "monthly"
    salary: float = 0.0                 # monthly salary or daily rate
    join_date: Optional[str] = ""
    active: bool = True
    notes: Optional[str] = ""
    ledger_id: Optional[str] = None     # link an existing ledger; else auto-created in the STAFF group


class MarkIn(BaseModel):
    staff_id: str
    date: str
    mark: Optional[Literal["P", "H", "A", "C"]] = None   # None → clear


class BulkMarkIn(BaseModel):
    date: str
    mark: Literal["P", "H", "A", "C"]
    staff_ids: list[str]
    only_unmarked: bool = True


class SalaryPayIn(BaseModel):
    staff_id: str
    month: str                          # YYYY-MM
    deduct_advance: Optional[float] = None   # default = suggested (min(advance_due, gross))
    pay_now: bool = True
    cash_account_id: Optional[str] = None
    mode: Optional[str] = "Cash"
    date: Optional[str] = None          # default: month end (or today if the month is current)
    note: Optional[str] = ""


class AdvanceIn(BaseModel):
    staff_id: str
    amount: float
    date: str
    cash_account_id: Optional[str] = None
    mode: Optional[str] = "Cash"
    note: Optional[str] = ""


def _month_ok(m: str) -> bool:
    try:
        datetime.strptime(m, "%Y-%m"); return True
    except ValueError:
        return False


def _month_label(m: str) -> str:
    y, mm = m.split("-"); return f"{MONTHS[int(mm) - 1]} {y}"


def make_staff_router(db, get_current_user, now_iso, compute_party_balance, next_voucher, next_journal_vno, is_date, default_cash_account):
    r = APIRouter(prefix="/staff", tags=["staff"])

    # ---------- setup: STAFF ledger group + salary expense ledger ----------
    async def _group_by_name(pattern: str):
        return await db.account_groups.find_one({"name": {"$regex": pattern, "$options": "i"}}, {"_id": 0})

    async def _ensure_setup() -> dict:
        s = await db.settings.find_one({"id": "default"}, {"_id": 0}) or {}
        changed = {}
        gid = s.get("staff_group_id")
        if not gid or not await db.account_groups.find_one({"id": gid}):
            g = await _group_by_name(r"^staff") or await _group_by_name(r"staff advance")
            if not g:
                g = {"id": str(uuid.uuid4()), "name": "STAFF", "nature": "asset", "fcode": 3300, "lcode": 3400, "ecode": 3300, "created_at": now_iso()}
                await db.account_groups.insert_one(dict(g))
                g.pop("_id", None)
            changed["staff_group_id"] = g["id"]; changed["staff_group_name"] = g["name"]
        sid = s.get("salary_expense_id")
        led = await db.parties.find_one({"id": sid}, {"_id": 0}) if sid else None
        if not led:
            led = await db.parties.find_one({"name": {"$regex": r"^(staff )?salary( expense| a/c)?$", "$options": "i"}}, {"_id": 0})
            if not led:
                eg = await _group_by_name(r"salary") or await _group_by_name(r"indirect exp") or await _group_by_name(r"exp")
                led = {"id": str(uuid.uuid4()), "name": "STAFF SALARY", "type": "both", "phone": "", "address": "", "opening_balance": 0.0,
                       "group_id": eg["id"] if eg else None, "group_name": eg["name"] if eg else "", "created_at": now_iso()}
                await db.parties.insert_one(dict(led))
                led.pop("_id", None)
            changed["salary_expense_id"] = led["id"]; changed["salary_expense_name"] = led["name"]
        if changed:
            await db.settings.update_one({"id": "default"}, {"$set": changed}, upsert=True)
            s.update(changed)
        return {"staff_group_id": s["staff_group_id"], "staff_group_name": s.get("staff_group_name", ""),
                "salary_expense_id": s["salary_expense_id"], "salary_expense_name": s.get("salary_expense_name", "")}

    async def _ledger_balance(ledger_id: str, as_on: Optional[str] = None) -> float:
        p = await db.parties.find_one({"id": ledger_id}, {"_id": 0, "opening_balance": 1})
        if not p:
            return 0.0
        return round(await compute_party_balance(ledger_id, float(p.get("opening_balance") or 0), as_on), 2)

    def _with_dues(st: dict, bal: float) -> dict:
        # staff ledger Dr = advance given not yet adjusted; Cr = salary credited but not paid
        st["ledger_balance"] = bal
        st["advance_due"] = round(bal, 2) if bal > 0 else 0.0
        st["salary_due"] = round(-bal, 2) if bal < 0 else 0.0
        return st

    async def _staff_or_404(sid: str) -> dict:
        st = await db.staff.find_one({"id": sid}, {"_id": 0})
        if not st:
            raise HTTPException(404, "Staff nahi mila")
        return st

    async def _cash_account(cash_account_id: Optional[str]) -> dict:
        acc = await db.accounts.find_one({"id": cash_account_id}, {"_id": 0, "id": 1, "name": 1}) if cash_account_id else None
        if not acc:
            acc = await default_cash_account()
        if not acc:
            raise HTTPException(400, "Koi Cash/Bank account nahi mila — pehle Accounts me banayein")
        return acc

    async def _rokad_payment(st: dict, amount: float, date: str, acc: dict, mode: str, description: str, kind: str, extra: dict) -> dict:
        doc = {"id": str(uuid.uuid4()), "date": date, "type": "kharch", "amount": round(amount, 2),
               "party_id": st["ledger_id"], "party_name": st["name"], "description": description, "mode": mode or "Cash",
               "cash_account_id": acc["id"], "cash_account_name": acc["name"], "voucher_no": await next_voucher(acc["id"]),
               "chq_no": "", "settle": False, "staff_id": st["id"], "staff_kind": kind, "created_at": now_iso(), **extra}
        await db.rokad.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    # ---------- settings ----------
    @r.get("/settings")
    async def staff_settings(current=Depends(get_current_user)):
        return await _ensure_setup()

    class StaffSettingsIn(BaseModel):
        salary_expense_id: Optional[str] = None

    @r.put("/settings")
    async def update_staff_settings(body: StaffSettingsIn, current=Depends(get_current_user)):
        if body.salary_expense_id:
            led = await db.parties.find_one({"id": body.salary_expense_id}, {"_id": 0, "id": 1, "name": 1})
            if not led:
                raise HTTPException(404, "Ledger nahi mila")
            await db.settings.update_one({"id": "default"}, {"$set": {"salary_expense_id": led["id"], "salary_expense_name": led["name"]}}, upsert=True)
        return await _ensure_setup()

    # ---------- attendance ----------
    @r.get("/attendance")
    async def get_attendance(month: str, current=Depends(get_current_user)):
        if not _month_ok(month):
            raise HTTPException(400, "month YYYY-MM format me do")
        y, m = (int(x) for x in month.split("-"))
        days = calendar.monthrange(y, m)[1]
        staff = await db.staff.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
        marks: dict = {}
        async for a in db.attendance.find({"date": {"$gte": f"{month}-01", "$lte": f"{month}-{days:02d}"}}, {"_id": 0}):
            marks.setdefault(a["staff_id"], {})[a["date"]] = a["mark"]
        rows = []
        for st in staff:
            mm = marks.get(st["id"], {})
            if not st.get("active", True) and not mm:
                continue
            counts = {k: sum(1 for v in mm.values() if v == k) for k in MARKS}
            paid_days = sum(PAID_WEIGHT[v] for v in mm.values())
            rows.append({**st, "marks": mm, "counts": counts, "paid_days": paid_days, "unmarked": days - len(mm)})
        today = datetime.now().date().isoformat()
        return {"month": month, "label": _month_label(month), "days": days, "today": today, "rows": rows,
                "weekdays": [calendar.day_abbr[datetime(y, m, d).weekday()] for d in range(1, days + 1)]}

    @r.put("/attendance")
    async def mark_attendance(body: MarkIn, current=Depends(get_current_user)):
        if not is_date(body.date):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
        await _staff_or_404(body.staff_id)
        if body.mark is None:
            await db.attendance.delete_one({"staff_id": body.staff_id, "date": body.date})
        else:
            await db.attendance.update_one({"staff_id": body.staff_id, "date": body.date},
                                           {"$set": {"mark": body.mark, "updated_at": now_iso()},
                                            "$setOnInsert": {"id": str(uuid.uuid4()), "staff_id": body.staff_id, "date": body.date}}, upsert=True)
        return {"ok": True, "staff_id": body.staff_id, "date": body.date, "mark": body.mark}

    @r.post("/attendance/bulk")
    async def bulk_attendance(body: BulkMarkIn, current=Depends(get_current_user)):
        if not is_date(body.date):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
        n = 0
        for sid in body.staff_ids:
            if body.only_unmarked and await db.attendance.find_one({"staff_id": sid, "date": body.date}):
                continue
            await db.attendance.update_one({"staff_id": sid, "date": body.date},
                                           {"$set": {"mark": body.mark, "updated_at": now_iso()},
                                            "$setOnInsert": {"id": str(uuid.uuid4()), "staff_id": sid, "date": body.date}}, upsert=True)
            n += 1
        return {"ok": True, "marked": n}

    # ---------- salary ----------
    async def _salary_rows(month: str) -> dict:
        y, m = (int(x) for x in month.split("-"))
        days = calendar.monthrange(y, m)[1]
        month_end = f"{month}-{days:02d}"
        staff = await db.staff.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
        marks: dict = {}
        async for a in db.attendance.find({"date": {"$gte": f"{month}-01", "$lte": month_end}}, {"_id": 0}):
            marks.setdefault(a["staff_id"], {})[a["date"]] = a["mark"]
        paid = {p["staff_id"]: p async for p in db.salary_payments.find({"month": month}, {"_id": 0})}
        rows, totals = [], {"gross": 0.0, "deduct": 0.0, "net": 0.0, "paid_count": 0}
        for st in staff:
            mm = marks.get(st["id"], {})
            rec = paid.get(st["id"])
            if not st.get("active", True) and not mm and not rec:
                continue
            counts = {k: sum(1 for v in mm.values() if v == k) for k in MARKS}
            paid_days = sum(PAID_WEIGHT[v] for v in mm.values())
            rate = float(st.get("salary") or 0)
            per_day = round(rate / 30.0, 2) if st.get("salary_type") == "monthly" else rate
            gross = round(per_day * paid_days, 2)
            bal = await _ledger_balance(st["ledger_id"], month_end) if st.get("ledger_id") else 0.0
            advance_due = round(bal, 2) if bal > 0 else 0.0
            suggested = round(min(advance_due, gross), 2)
            row = {**st, "counts": counts, "paid_days": paid_days, "unmarked": days - len(mm), "per_day": per_day, "gross": gross,
                   "advance_due": advance_due, "salary_due": round(-bal, 2) if bal < 0 else 0.0,
                   "suggested_deduct": suggested, "net": round(gross - suggested, 2), "paid": rec}
            if rec:
                totals["gross"] += rec["gross"]; totals["deduct"] += rec["advance_deducted"]; totals["net"] += rec["net"]; totals["paid_count"] += 1
            rows.append(row)
        return {"month": month, "label": _month_label(month), "days": days, "month_end": month_end, "rows": rows,
                "totals": {k: round(v, 2) if isinstance(v, float) else v for k, v in totals.items()}}

    @r.get("/salary")
    async def get_salary(month: str, current=Depends(get_current_user)):
        if not _month_ok(month):
            raise HTTPException(400, "month YYYY-MM format me do")
        return await _salary_rows(month)

    @r.post("/salary/pay")
    async def pay_salary(body: SalaryPayIn, current=Depends(get_current_user)):
        if not _month_ok(body.month):
            raise HTTPException(400, "month YYYY-MM format me do")
        st = await _staff_or_404(body.staff_id)
        if await db.salary_payments.find_one({"staff_id": st["id"], "month": body.month}):
            raise HTTPException(409, f"{st['name']} ki {_month_label(body.month)} salary pehle se ban chuki hai — pehle use delete karein")
        setup = await _ensure_setup()
        data = await _salary_rows(body.month)
        row = next((x for x in data["rows"] if x["id"] == st["id"]), None)
        if not row or row["gross"] <= 0:
            raise HTTPException(400, "Is mahine ki attendance nahi hai — pehle attendance bharein (gross 0)")
        deduct = row["suggested_deduct"] if body.deduct_advance is None else round(float(body.deduct_advance), 2)
        if deduct < 0 or deduct > row["gross"] + 0.005:
            raise HTTPException(400, "Advance katauti 0 se gross ke beech honi chahiye")
        if deduct > row["advance_due"] + 0.005:
            raise HTTPException(400, f"Bacha advance sirf ₹{row['advance_due']:,.2f} hai — usse zyada nahi kat sakte")
        net = round(row["gross"] - deduct, 2)
        today = datetime.now().date().isoformat()
        date = body.date or (data["month_end"] if data["month_end"] < today else today)
        if not is_date(date):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
        c = row["counts"]
        att = f"P{c['P']} H{c['H']} A{c['A']} C{c['C']} = {row['paid_days']:g} din"
        narr = f"Salary {_month_label(body.month)} · {st['name']} · {att} · gross ₹{row['gross']:,.2f}" + (f" · advance kata ₹{deduct:,.2f}" if deduct else "")
        pid = str(uuid.uuid4())
        j = {"id": str(uuid.uuid4()), "date": date, "narration": narr, "ref": f"Salary {body.month}",
             "lines": [{"account_id": setup["salary_expense_id"], "account_name": setup["salary_expense_name"], "debit": row["gross"], "credit": 0.0},
                       {"account_id": st["ledger_id"], "account_name": st["name"], "debit": 0.0, "credit": row["gross"]}],
             "total": row["gross"], "voucher_no": await next_journal_vno(), "created_at": now_iso(),
             "staff_id": st["id"], "staff_kind": "salary", "salary_payment_id": pid}
        await db.journal.insert_one(dict(j))
        rok = None
        if body.pay_now and net > 0:
            acc = await _cash_account(body.cash_account_id)
            desc = f"Salary {_month_label(body.month)}" + (f" (advance ₹{deduct:,.2f} kata)" if deduct else "") + (f" · {body.note}" if body.note else "")
            rok = await _rokad_payment(st, net, date, acc, body.mode or "Cash", desc, "salary", {"salary_payment_id": pid})
        rec = {"id": pid, "staff_id": st["id"], "staff_name": st["name"], "month": body.month, "date": date, "counts": c,
               "paid_days": row["paid_days"], "per_day": row["per_day"], "gross": row["gross"], "advance_deducted": deduct, "net": net,
               "paid_now": bool(rok), "journal_id": j["id"], "rokad_id": rok["id"] if rok else None,
               "cash_account_name": rok["cash_account_name"] if rok else "", "voucher_no": rok["voucher_no"] if rok else "",
               "note": body.note or "", "created_at": now_iso()}
        await db.salary_payments.insert_one(dict(rec))
        rec.pop("_id", None)
        return rec

    @r.get("/salary/history")
    async def salary_history(staff_id: Optional[str] = None, current=Depends(get_current_user)):
        q = {"staff_id": staff_id} if staff_id else {}
        return await db.salary_payments.find(q, {"_id": 0}).sort([("month", -1), ("staff_name", 1)]).to_list(2000)

    @r.delete("/salary/{pid}")
    async def delete_salary(pid: str, current=Depends(get_current_user)):
        rec = await db.salary_payments.find_one({"id": pid}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Salary record nahi mila")
        await db.journal.delete_many({"salary_payment_id": pid})
        await db.rokad.delete_many({"salary_payment_id": pid})
        await db.salary_payments.delete_one({"id": pid})
        return {"ok": True}

    # ---------- advance ----------
    @r.get("/advance")
    async def list_advances(month: Optional[str] = None, staff_id: Optional[str] = None, current=Depends(get_current_user)):
        staff = await db.staff.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
        by_ledger = {s["ledger_id"]: s for s in staff if s.get("ledger_id")}
        q: dict = {"party_id": {"$in": list(by_ledger.keys())}, "type": "kharch", "staff_kind": {"$ne": "salary"}}
        if staff_id:
            st = await _staff_or_404(staff_id); q["party_id"] = st["ledger_id"]
        if month:
            if not _month_ok(month):
                raise HTTPException(400, "month YYYY-MM format me do")
            y, m = (int(x) for x in month.split("-"))
            q["date"] = {"$gte": f"{month}-01", "$lte": f"{month}-{calendar.monthrange(y, m)[1]:02d}"}
        rows = []
        async for e in db.rokad.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]):
            s = by_ledger.get(e["party_id"], {})
            rows.append({**e, "staff_id": s.get("id"), "staff_name": s.get("name", e.get("party_name", ""))})
        dues = []
        for s in staff:
            if not s.get("active", True) or not s.get("ledger_id"):
                continue
            dues.append(_with_dues({"id": s["id"], "name": s["name"], "ledger_id": s["ledger_id"]}, await _ledger_balance(s["ledger_id"])))
        return {"rows": rows, "total": round(sum(x["amount"] for x in rows), 2), "dues": dues}

    @r.post("/advance")
    async def give_advance(body: AdvanceIn, current=Depends(get_current_user)):
        if body.amount <= 0:
            raise HTTPException(400, "Amount daalein")
        if not is_date(body.date):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
        st = await _staff_or_404(body.staff_id)
        acc = await _cash_account(body.cash_account_id)
        desc = "Advance" + (f" · {body.note}" if body.note else "")
        rok = await _rokad_payment(st, body.amount, body.date, acc, body.mode or "Cash", desc, "advance", {})
        return {**rok, "advance_due": (await _ledger_balance(st["ledger_id"]))}

    # ---------- master (path-param routes LAST) ----------
    @r.get("")
    async def list_staff(current=Depends(get_current_user)):
        setup = await _ensure_setup()
        out = []
        for st in await db.staff.find({}, {"_id": 0}).sort("name", 1).to_list(1000):
            out.append(_with_dues(st, await _ledger_balance(st["ledger_id"]) if st.get("ledger_id") else 0.0))
        return {"staff": out, "setup": setup}

    @r.post("")
    async def create_staff(body: StaffIn, current=Depends(get_current_user)):
        name = (body.name or "").strip().upper()
        if not name:
            raise HTTPException(422, "Naam zaroori hai")
        if await db.staff.find_one({"name": name}):
            raise HTTPException(409, f"Staff '{name}' pehle se hai")
        setup = await _ensure_setup()
        ledger_id = body.ledger_id
        if ledger_id:
            if not await db.parties.find_one({"id": ledger_id}):
                raise HTTPException(404, "Link kiya hua ledger nahi mila")
            if await db.staff.find_one({"ledger_id": ledger_id}):
                raise HTTPException(409, "Yeh ledger pehle se kisi staff se juda hai")
        else:
            existing = await db.parties.find_one({"name": name}, {"_id": 0, "id": 1})
            if existing and not await db.staff.find_one({"ledger_id": existing["id"]}):
                ledger_id = existing["id"]
            else:
                led = {"id": str(uuid.uuid4()), "name": name, "type": "both", "phone": body.phone or "", "address": "", "opening_balance": 0.0,
                       "group_id": setup["staff_group_id"], "group_name": setup["staff_group_name"], "remark": "Staff ledger", "created_at": now_iso()}
                await db.parties.insert_one(dict(led))
                ledger_id = led["id"]
        doc = {**body.model_dump(), "name": name, "id": str(uuid.uuid4()), "ledger_id": ledger_id, "created_at": now_iso()}
        await db.staff.insert_one(dict(doc))
        doc.pop("_id", None)
        return _with_dues(doc, await _ledger_balance(ledger_id))

    @r.put("/{sid}")
    async def update_staff(sid: str, body: StaffIn, current=Depends(get_current_user)):
        st = await _staff_or_404(sid)
        name = (body.name or "").strip().upper()
        if not name:
            raise HTTPException(422, "Naam zaroori hai")
        if await db.staff.find_one({"name": name, "id": {"$ne": sid}}):
            raise HTTPException(409, f"Staff '{name}' pehle se hai")
        upd = {**body.model_dump(), "name": name, "ledger_id": st.get("ledger_id"), "updated_at": now_iso()}
        await db.staff.update_one({"id": sid}, {"$set": upd})
        if st.get("ledger_id") and name != st.get("name"):
            await db.parties.update_one({"id": st["ledger_id"]}, {"$set": {"name": name}})
            await db.rokad.update_many({"party_id": st["ledger_id"]}, {"$set": {"party_name": name}})
            await db.journal.update_many({"lines.account_id": st["ledger_id"]}, {"$set": {"lines.$[l].account_name": name}}, array_filters=[{"l.account_id": st["ledger_id"]}])
        doc = await db.staff.find_one({"id": sid}, {"_id": 0})
        return _with_dues(doc, await _ledger_balance(doc["ledger_id"]) if doc.get("ledger_id") else 0.0)

    @r.delete("/{sid}")
    async def delete_staff(sid: str, current=Depends(get_current_user)):
        st = await _staff_or_404(sid)
        used = await db.attendance.count_documents({"staff_id": sid}) + await db.salary_payments.count_documents({"staff_id": sid}) \
            + (await db.rokad.count_documents({"party_id": st.get("ledger_id")}) if st.get("ledger_id") else 0)
        if used:
            raise HTTPException(400, f"{st['name']} ki {used} entries (attendance / salary / payment) hain — delete ki jagah 'Inactive' karein")
        await db.staff.delete_one({"id": sid})
        return {"ok": True, "ledger_id": st.get("ledger_id"), "note": "Staff ka ledger (Party Khata) waise hi rakha gaya hai"}

    return r
