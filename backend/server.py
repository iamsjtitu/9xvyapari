from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# --- Mongo ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# --- JWT ---
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MIN = 60 * 24  # 1 day (desktop usage – long session)
REFRESH_TOKEN_DAYS = 30

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MIN),
               "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
               "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TOKEN_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_TOKEN_DAYS * 86400, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# --- Models ---
class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class PartyIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    address2: Optional[str] = ""
    place: Optional[str] = ""           # GL_PLACE
    type: Literal["customer", "supplier", "both"] = "both"
    opening_balance: float = 0.0
    opening_qty: float = 0.0
    rate: float = 0.0
    gstin: Optional[str] = ""           # F_G_L_NO
    pan: Optional[str] = ""
    cstno: Optional[str] = ""
    mpstno: Optional[str] = ""
    code: Optional[int] = None          # numeric ledger code (auto-assigned)
    group_id: Optional[str] = None      # which AccountGroup it belongs to
    group_name: Optional[str] = ""
    alt_name: Optional[str] = ""        # GL_NAME1

class PartyOut(PartyIn):
    id: str
    created_at: str

class ItemIn(BaseModel):
    name: str
    unit: str = "Quintal"
    rate: float = 0.0
    hsn: Optional[str] = ""
    sale_acc_code: Optional[int] = None      # link to SALES A/C ledger code
    purchase_acc_code: Optional[int] = None  # link to PURCHASE A/C ledger code
    opening_qty: float = 0.0

class ItemOut(ItemIn):
    id: str
    created_at: str

class BillItem(BaseModel):
    item_id: str
    item_name: str
    bag: float = 0.0            # number of bags
    pack: float = 0.0           # weight per bag (Kg)
    bag_pack: Optional[str] = ""
    weight: float = 0.0         # declared weight (Quintal)
    wb: float = 0.0             # weight bridge (Kanta) (Quintal)
    ghat: float = 0.0           # weight loss
    nwt: float = 0.0            # net weight
    unit: str = "Quintal"
    rate: float = 0.0
    amount: float = 0.0
    qty: float = 0.0            # backward compat

class BillIn(BaseModel):
    bill_type: Literal["sale", "purchase"]
    party_id: str
    party_name: str
    date: str                                # E.Date (entry date)
    s_date: Optional[str] = ""               # supply / bill date
    due_date: Optional[str] = ""             # payment due date
    lot_no: Optional[str] = ""               # LOTNO
    gp_no: Optional[str] = ""                # gate-pass no
    truck_no: Optional[str] = ""             # TNO
    driver_name: Optional[str] = ""          # DNAME
    bilty_no: Optional[str] = ""             # BUILTY
    garage: Optional[str] = ""               # GARAGE
    no_of_bag: Optional[str] = ""            # NOFBAG (display text)
    bag_pack_q: Optional[str] = ""           # BPQ
    payment_cond: Optional[str] = ""         # PAYCOND
    agent_id: Optional[str] = None
    agent_name: Optional[str] = ""
    buyer_id: Optional[str] = None           # for purchase: final buyer (the customer)
    buyer_name: Optional[str] = ""
    items: List[BillItem]
    subtotal: float
    # itemised charges
    advance: float = 0.0
    less: float = 0.0
    hamali_rt: float = 0.0
    hamali_amt: float = 0.0
    cartage_rt: float = 0.0
    cartage_amt: float = 0.0
    discount_rt: float = 0.0
    discount_amt: float = 0.0
    rebate_rt: float = 0.0
    rebate_amt: float = 0.0
    dalali_rt: float = 0.0
    dalali_amt: float = 0.0
    bhada_rt: float = 0.0
    bhada_amt: float = 0.0
    loading: float = 0.0
    bdalali: float = 0.0
    garrt: float = 0.0
    garamt: float = 0.0
    mandirt: float = 0.0
    mandiamt: float = 0.0
    # original commission
    commission_pct: float = 0.0
    commission_amt: float = 0.0
    other_charges: float = 0.0
    total: float
    payment_received: float = 0.0
    notes: Optional[str] = ""
    remark1: Optional[str] = ""
    remark2: Optional[str] = ""

class BillOut(BillIn):
    id: str
    bill_no: str
    balance: float
    created_at: str

class RokadIn(BaseModel):
    date: str
    type: Literal["jama", "kharch"]
    amount: float
    party_id: Optional[str] = None
    party_name: Optional[str] = ""
    description: str = ""
    ref_bill_id: Optional[str] = None
    mode: str = "Cash"  # Cash, UPI, Bank, Cheque
    cash_account_id: Optional[str] = None
    cash_account_name: Optional[str] = ""
    counter_account_id: Optional[str] = None
    counter_account_name: Optional[str] = ""
    voucher_no: Optional[str] = ""        # per-cash-account voucher number
    chq_no: Optional[str] = ""             # cheque number

class RokadOut(RokadIn):
    id: str
    created_at: str


class AccountGroupIn(BaseModel):
    name: str
    nature: Literal["asset", "liability", "income", "expense"] = "asset"
    fcode: Optional[int] = None    # first code (FCODE)
    lcode: Optional[int] = None    # last code  (LCODE)
    ecode: Optional[int] = None    # next-available code (ECODE)

class InwardIn(BaseModel):
    date: str                      # TR_DATE
    ref_no: Optional[str] = ""     # TR_REF_NO
    lot_no: str                    # LOT
    cold_storage_id: str           # TR_GL_CODE - linked party (cold storage)
    cold_storage_name: str         # PARTY_NAME
    bags: int = 0                  # SBAG
    weight: float = 0.0            # WGT (Quintal)
    item_id: Optional[str] = None
    item_name: Optional[str] = ""
    notes: Optional[str] = ""

class StockItemIn(BaseModel):
    name: str
    sale_acc_code: Optional[int] = None
    purchase_acc_code: Optional[int] = None
    opening_qty: float = 0.0
    closing_qty: float = 0.0

class AccountIn(BaseModel):
    name: str
    group_id: str
    opening_balance: float = 0.0
    phone: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""

class JournalLine(BaseModel):
    account_id: str
    account_name: str
    debit: float = 0.0
    credit: float = 0.0

class JournalIn(BaseModel):
    date: str
    narration: str = ""
    lines: List[JournalLine]
    ref: Optional[str] = ""

class SettingsIn(BaseModel):
    firm_name: Optional[str] = "Galla Bahi"
    fy_start: str = ""   # ISO date
    fy_end: str = ""     # ISO date
    current_date: str = ""


# --- App / Router ---
app = FastAPI()
api = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- AUTH ----------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email pehle se registered hai")
    uid = str(uuid.uuid4())
    doc = {"id": uid, "email": email, "name": body.name,
           "password_hash": hash_password(body.password),
           "role": "user", "created_at": now_iso()}
    await db.users.insert_one(doc)
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": body.name, "role": "user",
            "access_token": access}

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(user["id"], email)
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"id": user["id"], "email": user["email"], "name": user["name"],
            "role": user.get("role", "user"), "access_token": access}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return {"id": current["id"], "email": current["email"],
            "name": current["name"], "role": current.get("role", "user")}


# ---------- PARTIES ----------
@api.get("/parties")
async def list_parties(current=Depends(get_current_user)):
    parties = await db.parties.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    # compute live balance
    for p in parties:
        bal = await _compute_party_balance(p["id"], p.get("opening_balance", 0.0))
        p["balance"] = bal
    return parties

@api.post("/parties")
async def create_party(body: PartyIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.parties.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api.put("/parties/{pid}")
async def update_party(pid: str, body: PartyIn, current=Depends(get_current_user)):
    res = await db.parties.update_one({"id": pid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Party not found")
    doc = await db.parties.find_one({"id": pid}, {"_id": 0})
    return doc

@api.delete("/parties/{pid}")
async def delete_party(pid: str, current=Depends(get_current_user)):
    await db.parties.delete_one({"id": pid})
    return {"ok": True}

async def _compute_party_balance(party_id: str, opening: float) -> float:
    bal = opening
    bills = await db.bills.find({"party_id": party_id}, {"_id": 0}).to_list(5000)
    for b in bills:
        # sale: party owes us total - payment_received
        # purchase: we owe party total - payment_received => subtract
        if b["bill_type"] == "sale":
            bal += b["total"] - b.get("payment_received", 0)
        else:
            bal -= b["total"] - b.get("payment_received", 0)
    rokads = await db.rokad.find({"party_id": party_id}, {"_id": 0}).to_list(5000)
    for r in rokads:
        if r.get("ref_bill_id"):
            continue  # already counted in bill payment_received
        if r["type"] == "jama":
            bal -= r["amount"]  # party paid us
        else:
            bal += r["amount"]  # we paid party
    return round(bal, 2)


# ---------- ITEMS (GALLA) ----------
@api.get("/items")
async def list_items(current=Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    return items

@api.post("/items")
async def create_item(body: ItemIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.items.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api.put("/items/{iid}")
async def update_item(iid: str, body: ItemIn, current=Depends(get_current_user)):
    res = await db.items.update_one({"id": iid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Item not found")
    return await db.items.find_one({"id": iid}, {"_id": 0})

@api.delete("/items/{iid}")
async def delete_item(iid: str, current=Depends(get_current_user)):
    await db.items.delete_one({"id": iid})
    return {"ok": True}


# ---------- BILLS ----------
async def _next_bill_no(bill_type: str) -> str:
    prefix = "S" if bill_type == "sale" else "P"
    count = await db.bills.count_documents({"bill_type": bill_type})
    return f"{prefix}{(count + 1):05d}"

@api.get("/bills")
async def list_bills(bill_type: Optional[str] = None, party_id: Optional[str] = None,
                     current=Depends(get_current_user)):
    q = {}
    if bill_type:
        q["bill_type"] = bill_type
    if party_id:
        q["party_id"] = party_id
    bills = await db.bills.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return bills

@api.get("/bills/{bid}")
async def get_bill(bid: str, current=Depends(get_current_user)):
    b = await db.bills.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bill not found")
    return b

@api.post("/bills")
async def create_bill(body: BillIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["bill_no"] = await _next_bill_no(body.bill_type)
    doc["balance"] = round(body.total - body.payment_received, 2)
    doc["created_at"] = now_iso()
    await db.bills.insert_one(doc.copy())
    # auto rokad entry for payment received/paid
    if body.payment_received and body.payment_received > 0:
        rokad = {
            "id": str(uuid.uuid4()),
            "date": body.date,
            "type": "jama" if body.bill_type == "sale" else "kharch",
            "amount": body.payment_received,
            "party_id": body.party_id,
            "party_name": body.party_name,
            "description": f"Bill {doc['bill_no']} ke against payment",
            "ref_bill_id": doc["id"],
            "mode": "Cash",
            "created_at": now_iso(),
        }
        await db.rokad.insert_one(rokad.copy())
    doc.pop("_id", None)
    return doc

@api.delete("/bills/{bid}")
async def delete_bill(bid: str, current=Depends(get_current_user)):
    await db.bills.delete_one({"id": bid})
    await db.rokad.delete_many({"ref_bill_id": bid})
    return {"ok": True}


# ---------- ROKAD PANNA ----------
@api.get("/rokad")
async def list_rokad(date_from: Optional[str] = None, date_to: Optional[str] = None,
                     current=Depends(get_current_user)):
    q = {}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    entries = await db.rokad.find(q, {"_id": 0}).sort("date", -1).to_list(5000)
    return entries

@api.post("/rokad")
async def create_rokad(body: RokadIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.rokad.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api.delete("/rokad/{rid}")
async def delete_rokad(rid: str, current=Depends(get_current_user)):
    await db.rokad.delete_one({"id": rid})
    return {"ok": True}


# ---------- REPORTS / SUMMARY ----------
@api.get("/summary/dashboard")
async def dashboard_summary(current=Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    month_start = today[:8] + "01"

    # Today jama / kharch
    today_jama = 0.0
    today_kharch = 0.0
    month_jama = 0.0
    month_kharch = 0.0
    async for r in db.rokad.find({}, {"_id": 0}):
        if r["date"] == today:
            if r["type"] == "jama":
                today_jama += r["amount"]
            else:
                today_kharch += r["amount"]
        if r["date"] >= month_start:
            if r["type"] == "jama":
                month_jama += r["amount"]
            else:
                month_kharch += r["amount"]

    parties_count = await db.parties.count_documents({})
    items_count = await db.items.count_documents({})

    # total udhaar (sum of positive party balances)
    parties = await db.parties.find({}, {"_id": 0}).to_list(5000)
    total_udhaar = 0.0
    total_owed = 0.0
    for p in parties:
        bal = await _compute_party_balance(p["id"], p.get("opening_balance", 0.0))
        if bal > 0:
            total_udhaar += bal
        elif bal < 0:
            total_owed += abs(bal)

    sales_month = await db.bills.find({"bill_type": "sale",
                                       "date": {"$gte": month_start}},
                                      {"_id": 0, "total": 1}).to_list(5000)
    purchase_month = await db.bills.find({"bill_type": "purchase",
                                          "date": {"$gte": month_start}},
                                         {"_id": 0, "total": 1}).to_list(5000)
    total_sales = sum(b["total"] for b in sales_month)
    total_purchase = sum(b["total"] for b in purchase_month)

    return {
        "today": {"jama": round(today_jama, 2), "kharch": round(today_kharch, 2),
                  "baki": round(today_jama - today_kharch, 2)},
        "month": {"jama": round(month_jama, 2), "kharch": round(month_kharch, 2),
                  "sales": round(total_sales, 2), "purchase": round(total_purchase, 2)},
        "parties_count": parties_count,
        "items_count": items_count,
        "total_udhaar": round(total_udhaar, 2),
        "total_owed": round(total_owed, 2),
    }


@api.get("/summary/party/{pid}")
async def party_ledger(pid: str, current=Depends(get_current_user)):
    party = await db.parties.find_one({"id": pid}, {"_id": 0})
    if not party:
        raise HTTPException(404, "Party not found")
    bills = await db.bills.find({"party_id": pid}, {"_id": 0}).sort("date", 1).to_list(5000)
    rokads = await db.rokad.find({"party_id": pid}, {"_id": 0}).sort("date", 1).to_list(5000)
    party["balance"] = await _compute_party_balance(pid, party.get("opening_balance", 0.0))
    return {"party": party, "bills": bills, "rokad": rokads}


# ---------- ACCOUNT GROUPS ----------
@api.get("/account-groups")
async def list_groups(current=Depends(get_current_user)):
    groups = await db.account_groups.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return groups

@api.post("/account-groups")
async def create_group(body: AccountGroupIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.account_groups.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api.put("/account-groups/{gid}")
async def update_group(gid: str, body: AccountGroupIn, current=Depends(get_current_user)):
    res = await db.account_groups.update_one({"id": gid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Group not found")
    return await db.account_groups.find_one({"id": gid}, {"_id": 0})

@api.delete("/account-groups/{gid}")
async def delete_group(gid: str, current=Depends(get_current_user)):
    in_use = await db.accounts.count_documents({"group_id": gid})
    if in_use:
        raise HTTPException(400, f"{in_use} accounts is group me hain – pehle hatayein")
    await db.account_groups.delete_one({"id": gid})
    return {"ok": True}


# ---------- ACCOUNTS (Chart of Accounts) ----------
@api.get("/accounts")
async def list_accounts(group_id: Optional[str] = None, current=Depends(get_current_user)):
    q = {}
    if group_id:
        q["group_id"] = group_id
    accounts = await db.accounts.find(q, {"_id": 0}).sort("name", 1).to_list(2000)
    # join group name + compute live balance
    group_map = {g["id"]: g for g in await db.account_groups.find({}, {"_id": 0}).to_list(500)}
    for a in accounts:
        g = group_map.get(a.get("group_id"))
        a["group_name"] = g["name"] if g else ""
        a["balance"] = await _compute_account_balance(a["id"], a.get("opening_balance", 0.0))
    return accounts

@api.post("/accounts")
async def create_account(body: AccountIn, current=Depends(get_current_user)):
    if not await db.account_groups.find_one({"id": body.group_id}):
        raise HTTPException(400, "Group invalid hai")
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.accounts.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api.put("/accounts/{aid}")
async def update_account(aid: str, body: AccountIn, current=Depends(get_current_user)):
    res = await db.accounts.update_one({"id": aid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Account not found")
    return await db.accounts.find_one({"id": aid}, {"_id": 0})

@api.delete("/accounts/{aid}")
async def delete_account(aid: str, current=Depends(get_current_user)):
    await db.accounts.delete_one({"id": aid})
    return {"ok": True}

async def _compute_account_balance(aid: str, opening: float) -> float:
    """Compute account balance from journal entries + rokad with cash_account_id."""
    bal = opening
    # journal lines
    async for j in db.journal.find({}, {"_id": 0}):
        for line in j.get("lines", []):
            if line.get("account_id") == aid:
                bal += line.get("debit", 0) - line.get("credit", 0)
    # rokad mapped to this cash account
    async for r in db.rokad.find({"cash_account_id": aid}, {"_id": 0}):
        if r["type"] == "jama":
            bal += r["amount"]    # receipt – cash account debited (increases)
        else:
            bal -= r["amount"]    # payment – cash account credited (decreases)
    return round(bal, 2)


# ---------- JOURNAL ENTRIES ----------
@api.get("/journal")
async def list_journal(date_from: Optional[str] = None, date_to: Optional[str] = None,
                       current=Depends(get_current_user)):
    q = {}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    entries = await db.journal.find(q, {"_id": 0}).sort("date", -1).to_list(5000)
    return entries

@api.post("/journal")
async def create_journal(body: JournalIn, current=Depends(get_current_user)):
    # double-entry validation
    tot_d = sum(ln.debit for ln in body.lines)
    tot_c = sum(ln.credit for ln in body.lines)
    if round(tot_d, 2) != round(tot_c, 2):
        raise HTTPException(400, f"Debit ({tot_d}) aur Credit ({tot_c}) match nahi karte")
    if tot_d <= 0:
        raise HTTPException(400, "Amount > 0 hona chahiye")
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["voucher_no"] = f"J{(await db.journal.count_documents({}) + 1):05d}"
    doc["total"] = round(tot_d, 2)
    doc["created_at"] = now_iso()
    await db.journal.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api.delete("/journal/{jid}")
async def delete_journal(jid: str, current=Depends(get_current_user)):
    await db.journal.delete_one({"id": jid})
    return {"ok": True}


# ---------- SETTINGS (Financial Year etc.) ----------
@api.get("/settings")
async def get_settings(current=Depends(get_current_user)):
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    if not s:
        # default FY: Apr 1 – Mar 31 of current year
        today = datetime.now(timezone.utc).date()
        fy_year = today.year if today.month >= 4 else today.year - 1
        s = {
            "id": "default",
            "firm_name": "Galla Bahi",
            "fy_start": f"{fy_year}-04-01",
            "fy_end": f"{fy_year + 1}-03-31",
            "current_date": today.isoformat(),
        }
        await db.settings.insert_one(s.copy())
        s.pop("_id", None)
    return s

@api.put("/settings")
async def update_settings(body: SettingsIn, current=Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v not in (None, "")}
    await db.settings.update_one({"id": "default"}, {"$set": update}, upsert=True)
    return await db.settings.find_one({"id": "default"}, {"_id": 0})


# ---------- BACKUP / RESTORE ----------
@api.get("/backup")
async def backup(current=Depends(get_current_user)):
    """Export full database (except users) as JSON."""
    collections = ["account_groups", "accounts", "parties", "items",
                   "bills", "rokad", "journal", "settings"]
    data = {"exported_at": now_iso(), "version": "1.1", "data": {}}
    for c in collections:
        data["data"][c] = await db[c].find({}, {"_id": 0}).to_list(50000)
    return data

@api.post("/restore")
async def restore(payload: dict, current=Depends(get_current_user)):
    """Restore from backup JSON. Wipes existing app data (not users)."""
    data = payload.get("data") or {}
    collections = ["account_groups", "accounts", "parties", "items",
                   "bills", "rokad", "journal", "settings"]
    summary = {}
    for c in collections:
        await db[c].delete_many({})
        docs = data.get(c, [])
        if docs:
            await db[c].insert_many(docs)
        summary[c] = len(docs)
    return {"ok": True, "restored": summary}


# Add cash_account_id to rokad – update field if not set by client (handled in model fallback)


# ---------- INWARD REGISTER (Cold Storage) ----------
@api.get("/inward")
async def list_inward(date_from: Optional[str] = None, date_to: Optional[str] = None,
                      cold_storage_id: Optional[str] = None,
                      current=Depends(get_current_user)):
    q = {}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    if cold_storage_id:
        q["cold_storage_id"] = cold_storage_id
    rows = await db.inward.find(q, {"_id": 0}).sort("date", -1).to_list(5000)
    return rows

@api.post("/inward")
async def create_inward(body: InwardIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.inward.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api.put("/inward/{iid}")
async def update_inward(iid: str, body: InwardIn, current=Depends(get_current_user)):
    res = await db.inward.update_one({"id": iid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Inward not found")
    return await db.inward.find_one({"id": iid}, {"_id": 0})

@api.delete("/inward/{iid}")
async def delete_inward(iid: str, current=Depends(get_current_user)):
    await db.inward.delete_one({"id": iid})
    return {"ok": True}


# ---------- TRIAL BALANCE ----------
@api.get("/reports/trial-balance")
async def trial_balance(current=Depends(get_current_user)):
    """Trial Balance grouped by Account Group, with Dr / Cr columns.
    Combines parties (sales/purchase parties) + accounts (cash/bank etc.)."""
    groups = await db.account_groups.find({}, {"_id": 0}).to_list(500)
    groups_by_id = {g["id"]: g for g in groups}

    # Build all ledgers (parties + accounts) with computed balance
    ledgers = []

    # Parties (treat all as ledgers under their group)
    for p in await db.parties.find({}, {"_id": 0}).to_list(5000):
        bal = await _compute_party_balance(p["id"], p.get("opening_balance", 0.0))
        gid = p.get("group_id")
        g = groups_by_id.get(gid) if gid else None
        ledgers.append({
            "code": p.get("code") or 0,
            "name": p.get("name", ""),
            "group_id": gid,
            "group_name": (g["name"] if g else (p.get("group_name") or "SALES PARTY")),
            "nature": (g["nature"] if g else "asset"),
            "balance": bal,
            "kind": "party",
        })

    # Accounts (cash, bank, expense, income etc.)
    for a in await db.accounts.find({}, {"_id": 0}).to_list(5000):
        bal = await _compute_account_balance(a["id"], a.get("opening_balance", 0.0))
        g = groups_by_id.get(a.get("group_id"))
        ledgers.append({
            "code": a.get("code") or 0,
            "name": a.get("name", ""),
            "group_id": a.get("group_id"),
            "group_name": (g["name"] if g else ""),
            "nature": (g["nature"] if g else "asset"),
            "balance": bal,
            "kind": "account",
        })

    # group rows together
    sections = []
    for g in sorted(groups, key=lambda x: x.get("fcode") or 0):
        rows = [row for row in ledgers if row["group_id"] == g["id"]]
        rows.sort(key=lambda x: x["code"])
        dr_total = sum(row["balance"] for row in rows if row["balance"] > 0)
        cr_total = sum(-row["balance"] for row in rows if row["balance"] < 0)
        sections.append({
            "group_id": g["id"],
            "group_name": g["name"],
            "nature": g["nature"],
            "fcode": g.get("fcode"),
            "lcode": g.get("lcode"),
            "rows": rows,
            "dr_total": round(dr_total, 2),
            "cr_total": round(cr_total, 2),
        })

    # rows without group
    orphan = [row for row in ledgers if not row["group_id"]]
    if orphan:
        sections.append({
            "group_id": None, "group_name": "UNCATEGORIZED", "nature": "asset",
            "fcode": 0, "lcode": 0, "rows": orphan,
            "dr_total": round(sum(row["balance"] for row in orphan if row["balance"] > 0), 2),
            "cr_total": round(sum(-row["balance"] for row in orphan if row["balance"] < 0), 2),
        })

    grand_dr = sum(s["dr_total"] for s in sections)
    grand_cr = sum(s["cr_total"] for s in sections)
    return {"sections": sections, "grand_dr": round(grand_dr, 2), "grand_cr": round(grand_cr, 2)}


# ---------- NEXT FREE CODE in a group ----------
@api.get("/account-groups/{gid}/next-code")
async def next_code_in_group(gid: str, current=Depends(get_current_user)):
    g = await db.account_groups.find_one({"id": gid}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    f = g.get("fcode") or 1
    l_code = g.get("lcode") or 9999
    # find max used code in this group across parties + accounts
    used = []
    async for p in db.parties.find({"group_id": gid}, {"_id": 0, "code": 1}):
        if p.get("code"):
            used.append(p["code"])
    async for a in db.accounts.find({"group_id": gid}, {"_id": 0, "code": 1}):
        if a.get("code"):
            used.append(a["code"])
    nxt = max(used) + 1 if used else f
    if nxt < f:
        nxt = f
    if nxt > l_code:
        return {"next_code": None, "error": "Group code range exhausted"}
    return {"next_code": nxt, "fcode": f, "lcode": l_code}


# ---------- DBF IMPORT (from original FoxPro software) ----------
@api.post("/import-dbf/ledger")
async def import_dbf_ledger(payload: dict, current=Depends(get_current_user)):
    """Import LEDGR.DBF rows into parties.
    Expects: {rows: [{TR_GL_CODE, GL_NAME, GL_NAME1, GL_PLACE, ADDRESS_1, ADDRESS_2,
                      F_G_L_NO, PHONE, MPSTNO, CSTNO, GL_Y_OP, QTY, TR_GL_CD1, RATE}, ...]}
    Group is auto-detected from numeric code falling in account_group fcode-lcode range.
    Returns: {imported, skipped, errors}
    """
    rows = payload.get("rows") or []
    if not rows:
        raise HTTPException(400, "Koi rows nahi hain")

    groups = await db.account_groups.find({}, {"_id": 0}).to_list(500)

    def group_for_code(code):
        for g in groups:
            f, lc = g.get("fcode"), g.get("lcode")
            if f and lc and f <= code <= lc:
                return g
        return None

    imported, skipped, errors = 0, 0, []
    for r in rows:
        try:
            code = int(r.get("TR_GL_CODE") or 0)
            name = (r.get("GL_NAME") or "").strip()
            gl_type = (r.get("GL_TYPE") or "A").strip().upper()
            if not name or gl_type == "M" or code <= 0:
                skipped += 1
                continue
            g = group_for_code(code)
            existing = await db.parties.find_one({"code": code}, {"_id": 0})
            doc = {
                "name": name,
                "alt_name": (r.get("GL_NAME1") or "").strip(),
                "place": (r.get("GL_PLACE") or "").strip(),
                "address": (r.get("ADDRESS_1") or "").strip(),
                "address2": (r.get("ADDRESS_2") or "").strip(),
                "gstin": (r.get("F_G_L_NO") or "").strip(),
                "phone": (r.get("PHONE") or "").strip(),
                "mpstno": (r.get("MPSTNO") or "").strip(),
                "cstno": (r.get("CSTNO") or "").strip(),
                "pan": "",
                "type": "both",
                "opening_balance": float(r.get("GL_Y_OP") or 0),
                "opening_qty": float(r.get("QTY") or 0),
                "rate": float(r.get("RATE") or 0),
                "code": code,
                "group_id": g["id"] if g else None,
                "group_name": g["name"] if g else "",
            }
            if existing:
                await db.parties.update_one({"id": existing["id"]}, {"$set": doc})
            else:
                doc["id"] = str(uuid.uuid4())
                doc["created_at"] = now_iso()
                await db.parties.insert_one(doc)
            imported += 1
        except Exception as e:
            errors.append({"code": r.get("TR_GL_CODE"), "error": str(e)})
            skipped += 1
    return {"imported": imported, "skipped": skipped, "errors": errors[:20]}


@api.post("/import-dbf/upload")
async def import_dbf_upload(payload: dict, current=Depends(get_current_user)):
    """Parse uploaded .DBF base64 file. Returns list of row dicts.
    payload: {file_b64: str, table: str}
    table = 'LEDGR' | 'GROUPTEM' | 'CASHBOOK' etc. (FoxPro DBF table name)
    """
    file_b64 = payload.get("file_b64") or ""
    table = payload.get("table") or "TABLE"
    import base64
    import tempfile
    try:
        from dbfread import DBF
    except ImportError:
        raise HTTPException(500, "dbfread library not installed")

    try:
        binary = base64.b64decode(file_b64)
    except Exception as e:
        raise HTTPException(400, f"Invalid base64: {e}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".DBF") as tmp:
        tmp.write(binary)
        tmp_path = tmp.name
    try:
        dbf = DBF(tmp_path, ignore_missing_memofile=True, char_decode_errors="ignore")
        rows = []
        for r in dbf:
            row = {}
            for k, v in r.items():
                if hasattr(v, "isoformat"):
                    v = v.isoformat()
                row[k] = v
            rows.append(row)
        return {"table": table, "count": len(rows),
                "fields": [(f.name, f.type, f.length) for f in dbf.fields],
                "rows": rows}
    finally:
        import os as _os
        _os.unlink(tmp_path)


# ---------- PER-CASH-ACCOUNT VOUCHER NUMBERING ----------
@api.get("/cash-accounts/{pid}/next-voucher")
async def next_cash_voucher(pid: str, current=Depends(get_current_user)):
    """Returns next voucher number for a cash/bank ledger (party).
    FoxPro per-account voucher numbering (every cash a/c has own seq).
    """
    rows = await db.rokad.find(
        {"cash_account_id": pid, "voucher_no": {"$exists": True, "$ne": ""}},
        {"_id": 0, "voucher_no": 1}
    ).to_list(10000)
    max_num = 0
    for r in rows:
        try:
            n = int(str(r.get("voucher_no", "")).strip())
            if n > max_num:
                max_num = n
        except Exception:
            pass
    return {"next_voucher": str(max_num + 1)}


# ---------- DBF IMPORT: CASHBOOK ----------
@api.post("/import-dbf/cashbook")
async def import_dbf_cashbook(payload: dict, current=Depends(get_current_user)):
    """Import CASHBOOK.DBF / CASHTEM.DBF rows into rokad collection.
    Mapping:
      TR_GL_CODE = cash account code (e.g. 307 = SBIMM)
      TR_GL_CD   = other party code (debit/credit counter)
      TR_CRDB    = 'D' -> receipt (jama, cash debited)
                   'C' -> payment (kharch, cash credited)
      TR_AMNT_DB / TR_AMNT_CD = amount on each side
      TR_REF_NO  = voucher number (per cash account)
      CHQ_NO     = cheque number
    """
    rows = payload.get("rows") or []
    party_by_code = {}
    async for p in db.parties.find({}, {"_id": 0}):
        if p.get("code"):
            party_by_code[p["code"]] = p

    imported, skipped, errors = 0, 0, []
    for r in rows:
        try:
            cash_code = int(r.get("TR_GL_CODE") or 0) or None
            other_code = int(r.get("TR_GL_CD") or 0) or None
            cash_party = party_by_code.get(cash_code) if cash_code else None
            other_party = party_by_code.get(other_code) if other_code else None
            crdb = (r.get("TR_CRDB") or "").upper().strip()
            amt_db = float(r.get("TR_AMNT_DB") or 0)
            amt_cd = float(r.get("TR_AMNT_CD") or 0)
            amount = amt_db if crdb == "D" else amt_cd
            if not amount or amount <= 0:
                skipped += 1
                continue

            # D = cash debited = money came IN to cash a/c = Receipt (jama)
            # C = cash credited = money went OUT from cash a/c = Payment (kharch)
            entry_type = "jama" if crdb == "D" else "kharch"

            date = r.get("TR_DATE") or ""
            if hasattr(date, "isoformat"):
                date = date.isoformat()

            desc_parts = []
            for k in ("TR_DESCR", "TR_DESCR1", "TR_DESCR2", "TR_DESCR3"):
                v = (r.get(k) or "")
                if isinstance(v, str) and v.strip():
                    desc_parts.append(v.strip())
            description = " · ".join(desc_parts)[:300]

            chq_no = str(r.get("CHQ_NO") or "").strip()
            doc = {
                "id": str(uuid.uuid4()),
                "date": str(date),
                "type": entry_type,
                "amount": round(amount, 2),
                "party_id": (other_party["id"] if other_party else None),
                "party_name": (other_party["name"] if other_party else
                               (r.get("GL_NAME") or "").strip()),
                "description": description,
                "ref_bill_id": None,
                "mode": ("Cheque" if chq_no else "Cash"),
                "cash_account_id": (cash_party["id"] if cash_party else None),
                "cash_account_name": (cash_party["name"] if cash_party else ""),
                "voucher_no": str(r.get("TR_REF_NO") or "").strip(),
                "chq_no": chq_no,
                "imported_from": "cashbook",
                "created_at": now_iso(),
            }
            await db.rokad.insert_one(doc.copy())
            imported += 1
        except Exception as e:
            errors.append({"ref": r.get("TR_REF_NO"), "error": str(e)})
            skipped += 1
    return {"imported": imported, "skipped": skipped, "errors": errors[:20]}


# ---------- DBF IMPORT: INWARD ----------
@api.post("/import-dbf/inward")
async def import_dbf_inward_dbf(payload: dict, current=Depends(get_current_user)):
    """Import INWARDS.DBF / INWARDP.DBF rows into inward collection."""
    rows = payload.get("rows") or []
    party_by_code = {}
    async for p in db.parties.find({}, {"_id": 0}):
        if p.get("code"):
            party_by_code[p["code"]] = p

    imported, skipped, errors = 0, 0, []
    for r in rows:
        try:
            code = int(r.get("TR_GL_CODE") or 0) or None
            cs_party = party_by_code.get(code) if code else None
            date = r.get("TR_DATE") or ""
            if hasattr(date, "isoformat"):
                date = date.isoformat()
            lot_no = str(r.get("LOT") or "").strip()
            if not lot_no:
                skipped += 1
                continue
            doc = {
                "id": str(uuid.uuid4()),
                "date": str(date),
                "ref_no": str(r.get("TR_REF_NO") or "").strip(),
                "lot_no": lot_no,
                "cold_storage_id": (cs_party["id"] if cs_party else ""),
                "cold_storage_name": (cs_party["name"] if cs_party else
                                      (r.get("PARTY_NAME") or "").strip()),
                "bags": int(r.get("SBAG") or 0),
                "weight": float(r.get("WGT") or 0),
                "item_id": None,
                "item_name": "",
                "notes": "Imported from FoxPro INWARDS",
                "imported_from": "inwards",
                "created_at": now_iso(),
            }
            await db.inward.insert_one(doc.copy())
            imported += 1
        except Exception as e:
            errors.append({"lot": r.get("LOT"), "error": str(e)})
            skipped += 1
    return {"imported": imported, "skipped": skipped, "errors": errors[:20]}


# ---------- DBF IMPORT: STOCK ITEMS (PROFIT.DBF) ----------
@api.post("/import-dbf/items")
async def import_dbf_items(payload: dict, current=Depends(get_current_user)):
    """Import PROFIT.DBF as galla items."""
    rows = payload.get("rows") or []
    imported, skipped = 0, 0
    for r in rows:
        try:
            name = (r.get("GL_NAME") or "").strip()
            if not name:
                skipped += 1
                continue
            existing = await db.items.find_one({"name": name})
            doc = {
                "name": name,
                "unit": "Quintal",
                "rate": 0.0,
                "hsn": "",
                "sale_acc_code": int(r.get("TR_GL_CD") or 0) or None,
                "purchase_acc_code": int(r.get("TR_GL_CODE") or 0) or None,
                "opening_qty": float(r.get("GL_Y_OP") or 0),
            }
            if existing:
                await db.items.update_one({"id": existing["id"]}, {"$set": doc})
            else:
                doc["id"] = str(uuid.uuid4())
                doc["created_at"] = now_iso()
                await db.items.insert_one(doc)
            imported += 1
        except Exception:
            skipped += 1
    return {"imported": imported, "skipped": skipped}


# ---------- DBF IMPORT: GST RETURNS (AAGSTRET.DBF) ----------
@api.post("/import-dbf/gst")
async def import_dbf_gst(payload: dict, current=Depends(get_current_user)):
    rows = payload.get("rows") or []
    if payload.get("replace"):
        await db.gst_returns.delete_many({})
    imported = 0
    bulk = []
    for r in rows:
        try:
            bulk.append({
                "id": str(uuid.uuid4()),
                "bill_date": str(r.get("BILLDATE") or "").strip(),
                "particular": (r.get("PARTICULAR") or "").strip(),
                "gstin": (r.get("GSTIN") or "").strip(),
                "invoice_no": (r.get("INVOICE_NO") or "").strip(),
                "taxable": float(r.get("TAXABLE") or 0),
                "integrated": float(r.get("INTEGRATED") or 0),
                "central": float(r.get("CENTRAL") or 0),
                "state": float(r.get("STATE") or 0),
                "inv_amt": float(r.get("INV_AMT") or 0),
                "created_at": now_iso(),
            })
            imported += 1
        except Exception:
            pass
    if bulk:
        await db.gst_returns.insert_many(bulk)
    return {"imported": imported}


# ---------- DBF IMPORT: PURCHASE/SALE TRANSACTIONS ----------
@api.post("/import-dbf/transactions")
async def import_dbf_transactions(payload: dict, current=Depends(get_current_user)):
    """Import TRANSPR / TRANSPUR / TRANSTEM rows as bills (purchase entries).
    Maps the full FoxPro TRANSPR.DBF fields onto our bills collection.
    """
    rows = payload.get("rows") or []
    bill_type = payload.get("bill_type") or "purchase"
    party_by_code = {}
    item_by_code = {}
    async for p in db.parties.find({}, {"_id": 0}):
        if p.get("code"):
            party_by_code[p["code"]] = p
    async for it in db.items.find({}, {"_id": 0}):
        for k in ("sale_acc_code", "purchase_acc_code"):
            c = it.get(k)
            if c:
                item_by_code[c] = it

    imported, skipped, errors = 0, 0, []
    for r in rows:
        try:
            party_code = int(r.get("TR_GL_CODE") or 0) or None
            buyer_code = int(r.get("BUYER_CD") or 0) or None
            agent_code = int(r.get("AGENT") or 0) or None
            item_code = int(r.get("ITEM") or 0) or None
            seller = party_by_code.get(party_code)
            buyer = party_by_code.get(buyer_code) if buyer_code else None
            agent = party_by_code.get(agent_code) if agent_code else None
            item = item_by_code.get(item_code) if item_code else None

            if not seller:
                skipped += 1
                continue

            d_in = r.get("TR_DATE") or ""
            if hasattr(d_in, "isoformat"):
                d_in = d_in.isoformat()
            d_due = r.get("DUEDATE") or ""
            if hasattr(d_due, "isoformat"):
                d_due = d_due.isoformat()
            d_recv = r.get("R_DATE") or ""
            if hasattr(d_recv, "isoformat"):
                d_recv = d_recv.isoformat()

            bag = float(r.get("BAG") or 0)
            pack = float(r.get("PACK") or 0)
            wgt = float(r.get("WGT") or 0)
            rate = float(r.get("RATE") or 0)
            amt = float(r.get("AMT") or 0)
            line = {
                "item_id": (item["id"] if item else ""),
                "item_name": (item["name"] if item else (r.get("ITEM_NAME") or "").strip()),
                "bag": bag, "pack": pack,
                "bag_pack": (r.get("BPQ") or "").strip(),
                "weight": wgt, "wb": wgt, "ghat": 0, "nwt": wgt,
                "unit": "Quintal",
                "rate": rate, "amount": amt,
                "qty": bag,
            }

            subtotal = amt
            hamali_amt = float(r.get("HAMALI") or 0)
            cartage_amt = float(r.get("CARTAGE") or 0)
            discount_amt = float(r.get("DISCOUNT") or 0)
            rebate_amt = float(r.get("REBATE") or 0)
            dalali_amt = float(r.get("DALALI") or 0)
            bhada_amt = float(r.get("BHADA") or 0)
            garamt = float(r.get("GARAMT") or 0)
            loading = float(r.get("LOADING") or 0)
            bdalali = float(r.get("BDALALI") or 0)
            advance = float(r.get("ADVANCE") or 0)
            less = float(r.get("LESS") or 0)
            r_amount = float(r.get("R_AMOUNT") or 0)

            additions = (hamali_amt + cartage_amt + bhada_amt + garamt +
                         loading + bdalali + max(0, dalali_amt))
            deductions = (discount_amt + rebate_amt + less + advance +
                          max(0, -dalali_amt))
            total = round(subtotal + additions - deductions, 2)

            existing = await db.bills.find_one({"imported_ref": str(r.get("TR_REF_NO") or ""),
                                                 "bill_type": bill_type})
            bill_no = (existing["bill_no"] if existing
                       else await _next_bill_no(bill_type))

            doc = {
                "id": (existing["id"] if existing else str(uuid.uuid4())),
                "bill_type": bill_type,
                "bill_no": bill_no,
                "party_id": seller["id"], "party_name": seller["name"],
                "buyer_id": (buyer["id"] if buyer else None),
                "buyer_name": (buyer["name"] if buyer else ""),
                "agent_id": (agent["id"] if agent else None),
                "agent_name": (agent["name"] if agent else ""),
                "date": str(d_in), "s_date": str(d_in),
                "due_date": str(d_due),
                "lot_no": str(r.get("LOTNO") or "").strip(),
                "gp_no": "", "truck_no": (r.get("TNO") or "").strip(),
                "driver_name": (r.get("DNAME") or "").strip(),
                "bilty_no": (r.get("BUILTY") or "").strip(),
                "garage": (r.get("GARAGE") or "").strip(),
                "no_of_bag": (r.get("NOFBAG") or "").strip(),
                "bag_pack_q": (r.get("BPQ") or "").strip(),
                "payment_cond": (r.get("F_P") or "").strip(),
                "items": [line],
                "subtotal": subtotal,
                "hamali_rt": float(r.get("HAMALIRT") or 0), "hamali_amt": hamali_amt,
                "cartage_rt": float(r.get("CARTAGERT") or 0), "cartage_amt": cartage_amt,
                "bhada_rt": float(r.get("BHADART") or 0), "bhada_amt": bhada_amt,
                "mandirt": float(r.get("MANDIRT") or 0), "mandiamt": float(r.get("MANDIAMT") or 0),
                "discount_rt": float(r.get("DISCOUNTRT") or 0), "discount_amt": discount_amt,
                "rebate_rt": float(r.get("REBATERT") or 0), "rebate_amt": rebate_amt,
                "dalali_rt": float(r.get("DALALIRT") or 0), "dalali_amt": dalali_amt,
                "garrt": float(r.get("GRT") or 0), "garamt": garamt,
                "loading": loading, "bdalali": bdalali,
                "less": less, "advance": advance,
                "commission_pct": 0, "commission_amt": 0,
                "other_charges": float(r.get("OTHER") or 0),
                "total": total,
                "payment_received": r_amount,
                "balance": round(total - r_amount, 2),
                "notes": "Imported from FoxPro",
                "remark1": (r.get("REMARK") or "").strip(),
                "remark2": (r.get("REMARK1") or "").strip(),
                "imported_ref": str(r.get("TR_REF_NO") or ""),
                "imported_from": "transactions",
                "created_at": (existing["created_at"] if existing else now_iso()),
            }
            if existing:
                await db.bills.replace_one({"id": existing["id"]}, doc)
            else:
                await db.bills.insert_one(doc.copy())
            imported += 1
        except Exception as e:
            errors.append({"ref": r.get("TR_REF_NO"), "error": str(e)})
            skipped += 1
    return {"imported": imported, "skipped": skipped, "errors": errors[:20]}


# ---------- GST RETURNS LIST ----------
@api.get("/gst-returns")
async def list_gst_returns(current=Depends(get_current_user)):
    rows = await db.gst_returns.find({}, {"_id": 0}).sort("bill_date", 1).to_list(5000)
    return rows


# ---------- ROOT ----------
@api.get("/")
async def root():
    return {"app": "Galla Hisab-Kitab", "status": "ok"}


app.include_router(api)

# CORS – cookies + credentials require explicit origins
origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_start():
    # indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.parties.create_index("id", unique=True)
    await db.items.create_index("id", unique=True)
    await db.bills.create_index("id", unique=True)
    await db.rokad.create_index("id", unique=True)
    await db.account_groups.create_index("id", unique=True)
    await db.accounts.create_index("id", unique=True)
    await db.journal.create_index("id", unique=True)
    await db.inward.create_index("id", unique=True)
    await db.gst_returns.create_index("id", unique=True)

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@galla.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": now_iso(),
        })
        logger.info(f"Seeded admin: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info(f"Updated admin password: {admin_email}")

    # Seed sample galla items if empty
    if await db.items.count_documents({}) == 0:
        samples = [
            {"name": "Gehu (Wheat)", "unit": "Quintal", "rate": 2200, "hsn": "1001"},
            {"name": "Chana (Gram)", "unit": "Quintal", "rate": 5400, "hsn": "0713"},
            {"name": "Sarson (Mustard)", "unit": "Quintal", "rate": 5800, "hsn": "1207"},
            {"name": "Chawal (Rice)", "unit": "Quintal", "rate": 3200, "hsn": "1006"},
            {"name": "Bajra", "unit": "Quintal", "rate": 2100, "hsn": "1008"},
            {"name": "Makka (Maize)", "unit": "Quintal", "rate": 1900, "hsn": "1005"},
        ]
        for s in samples:
            s["id"] = str(uuid.uuid4())
            s["created_at"] = now_iso()
        await db.items.insert_many(samples)
        logger.info("Seeded sample galla items")

    # Seed default Account Groups – matching original FoxPro GROUPTEM.DBF
    if await db.account_groups.count_documents({}) == 0:
        # nature derived from code range:
        # 1-1999 = Asset/Liability mix (Indian Tally style: codes 1-50 Capital is liability)
        groups = [
            {"name": "CAPITAL A/C",         "nature": "liability", "fcode": 1,    "lcode": 50,   "ecode": 3},
            {"name": "LOANS (LIABILITY)",   "nature": "liability", "fcode": 51,   "lcode": 100,  "ecode": 52},
            {"name": "OTHER DEPOSITS",      "nature": "asset",     "fcode": 101,  "lcode": 200,  "ecode": 107},
            {"name": "FIXED ASSETS",        "nature": "asset",     "fcode": 201,  "lcode": 250,  "ecode": 202},
            {"name": "CURRENT ASSETS",      "nature": "asset",     "fcode": 251,  "lcode": 299,  "ecode": 252},
            {"name": "CASH & BANK BALANCE", "nature": "asset",     "fcode": 300,  "lcode": 349,  "ecode": 308},
            {"name": "SALES PARTY",         "nature": "asset",     "fcode": 350,  "lcode": 1199, "ecode": 599},
            {"name": "PURCHASE PARTY",      "nature": "liability", "fcode": 1200, "lcode": 2199, "ecode": 1405},
            {"name": "COLD STORAGE",        "nature": "asset",     "fcode": 2200, "lcode": 2400, "ecode": 2238},
            {"name": "LOANS & ADVANCES",    "nature": "asset",     "fcode": 2500, "lcode": 2899, "ecode": 2501},
            {"name": "SALES A/C",           "nature": "income",    "fcode": 3001, "lcode": 3034, "ecode": 3028},
            {"name": "INDIRECT INCOMES",    "nature": "income",    "fcode": 3035, "lcode": 3049, "ecode": 3037},
            {"name": "PURCHASE A/C",        "nature": "expense",   "fcode": 3050, "lcode": 3099, "ecode": 3052},
            {"name": "INDIRECT EXP.",       "nature": "expense",   "fcode": 3100, "lcode": 3149, "ecode": 3104},
            {"name": "OTHER EXP",           "nature": "expense",   "fcode": 3150, "lcode": 3199, "ecode": 3154},
            {"name": "SALARY A/C",          "nature": "expense",   "fcode": 3200, "lcode": 3249, "ecode": 3212},
            {"name": "DIRECT EXPENSES",     "nature": "expense",   "fcode": 3250, "lcode": 3299, "ecode": 3253},
            {"name": "STAFF ADVANCE",       "nature": "asset",     "fcode": 3300, "lcode": 3400, "ecode": 3302},
        ]
        for g in groups:
            g["id"] = str(uuid.uuid4())
            g["created_at"] = now_iso()
        await db.account_groups.insert_many(groups)
        logger.info("Seeded 18 default account groups (FoxPro GROUPTEM)")

    # Seed default cash + bank account ledgers only if NO party with cash code 301 exists yet
    has_cash_in_parties = await db.parties.find_one({"code": 301})
    if not has_cash_in_parties and await db.accounts.count_documents({}) == 0:
        cash_group = await db.account_groups.find_one({"name": "CASH & BANK BALANCE"}, {"_id": 0})
        if cash_group:
            await db.accounts.insert_many([
                {"id": str(uuid.uuid4()), "name": "CASH IN HAND", "code": 301,
                 "group_id": cash_group["id"], "opening_balance": 0.0,
                 "phone": "", "address": "", "notes": "Default cash account",
                 "created_at": now_iso()},
                {"id": str(uuid.uuid4()), "name": "BANK A/C", "code": 302,
                 "group_id": cash_group["id"], "opening_balance": 0.0,
                 "phone": "", "address": "", "notes": "",
                 "created_at": now_iso()},
            ])
        logger.info("Seeded default cash/bank accounts")


@app.on_event("shutdown")
async def shutdown():
    client.close()
