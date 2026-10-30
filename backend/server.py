from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, field_validator

import backup_crypto as bkc
from security import LoginThrottle, client_ip, cookie_policy, csrf_block_reason

# --- Mongo ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# --- JWT ---
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MIN = 60 * 24  # 1 day (desktop usage – long session)
REFRESH_TOKEN_DAYS = 30
COOKIE = cookie_policy()
DEFAULT_ADMIN_PASSWORD = "admin123"
login_throttle = LoginThrottle()

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "username": username, "iat": int(now.timestamp()),
               "exp": now + timedelta(minutes=ACCESS_TOKEN_MIN),
               "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": int(now.timestamp()),
               "exp": now + timedelta(days=REFRESH_TOKEN_DAYS),
               "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE["secure"], samesite=COOKIE["samesite"],
                        max_age=ACCESS_TOKEN_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE["secure"], samesite=COOKIE["samesite"],
                        max_age=REFRESH_TOKEN_DAYS * 86400, path="/")

def _password_changed_ts(user: dict) -> int:
    try:
        return int(datetime.fromisoformat(user.get("password_changed_at") or "").timestamp())
    except ValueError:
        return 0

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
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Tokens issued before the last password change are revoked
    if int(payload.get("iat") or 0) < _password_changed_ts(user):
        raise HTTPException(status_code=401, detail="Password badla gaya hai – dobara login karein")
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


# --- Models ---
class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    new_username: Optional[str] = Field(default=None, min_length=3, max_length=32)

class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
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
    remark: Optional[str] = ""          # free note: "160000 me tutaya", "JCB wala", etc.

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
    inv_no: Optional[str] = ""            # party's invoice / bill number (free text, shown next to V.No.)
    chq_no: Optional[str] = ""             # cheque number
    ref_party_id: Optional[str] = None     # "kiska?" — eg. INTEREST RECEIVED entry tagged with the party who paid (memo only)
    ref_party_name: Optional[str] = ""

    @field_validator("inv_no", mode="before")
    @classmethod
    def _trim_inv(cls, v):
        return v.strip() if isinstance(v, str) else v
    settle: bool = False                   # Account Settled: post the leftover to the "Account Clear" ledger → party = 0 as on date
    settle_account_id: Optional[str] = None  # which linked Account Clear ledger (None → default from Settings)

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

class SettleLedger(BaseModel):
    id: str
    name: str = ""

class SettingsIn(BaseModel):
    firm_name: Optional[str] = None   # None → unchanged on partial PUTs (pickers send only their own field)
    fy_start: str = ""   # ISO date
    fy_end: str = ""     # ISO date
    current_date: str = ""
    settle_account_id: Optional[str] = None     # default "Account Clear" ledger used by Account Settled
    settle_account_name: Optional[str] = ""
    settle_accounts: Optional[List[SettleLedger]] = None   # all linked Account Clear ledgers (entry form lets user pick one)
    investment_group_ids: Optional[List[str]] = None       # Aay-Vyay report: which asset groups count as "Investment"


# --- App / Router ---
_docs_on = os.environ.get("ENABLE_DOCS") == "1"  # interactive API docs off unless explicitly enabled
app = FastAPI(docs_url="/docs" if _docs_on else None, redoc_url=None, openapi_url="/openapi.json" if _docs_on else None)
api = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- AUTH (single-user, username based, no public registration) ----------
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$")


def _norm_username(u: str) -> str:
    return (u or "").strip().lower()


def _user_out(user: dict, access: Optional[str] = None, backup_key: Optional[dict] = None) -> dict:
    out = {"id": user["id"], "username": user.get("username") or "", "name": user.get("name", ""),
           "role": user.get("role", "user"), "must_change_password": bool(user.get("must_change_password")),
           # backups are password-locked → the gate opens right after the login password is set
           "must_set_backup_password": not user.get("must_change_password") and backup_key is None}
    if access:
        out["access_token"] = access
    return out


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, response: Response, current=Depends(get_current_user)):
    """Change password and/or username (current password required). Issues fresh tokens (old ones get revoked)."""
    user = await db.users.find_one({"id": current["id"]})
    if not user or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Purana password galat hai")
    if not body.new_password and not body.new_username:
        raise HTTPException(status_code=400, detail="Naya password ya naya username dein")
    if user.get("must_change_password") and not body.new_password:
        raise HTTPException(status_code=400, detail="Pehle naya password set karein")
    updates = {}
    if body.new_password:
        if body.current_password == body.new_password or body.new_password == DEFAULT_ADMIN_PASSWORD:
            raise HTTPException(status_code=400, detail="Naya password purane/default se alag hona chahiye")
        updates["password_hash"] = hash_password(body.new_password)
        updates["password_changed_at"] = now_iso()
        updates["must_change_password"] = False
    if body.new_username:
        uname = _norm_username(body.new_username)
        if not USERNAME_RE.match(uname):
            raise HTTPException(status_code=400, detail="Username 3-32 chars: sirf a-z, 0-9, . _ - allowed")
        clash = await db.users.find_one({"username": uname, "id": {"$ne": user["id"]}})
        if clash:
            raise HTTPException(status_code=400, detail="Yeh username pehle se hai")
        updates["username"] = uname
    await db.users.update_one({"id": current["id"]}, {"$set": updates})
    username = updates.get("username") or user.get("username")
    access = create_access_token(user["id"], username)
    set_auth_cookies(response, access, create_refresh_token(user["id"]))
    return {"ok": True, "username": username, "access_token": access, "must_change_password": False,
            "must_set_backup_password": (await _backup_key()) is None}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    uname = _norm_username(body.username)
    ip = client_ip(request.headers, request.client.host if request.client else "")
    wait = login_throttle.locked_for(ip, uname)
    if wait:
        raise HTTPException(status_code=429, detail=f"Bahut baar galat password. {max(1, wait // 60)} minute baad try karein.")
    user = await db.users.find_one({"username": uname})
    if not user or not verify_password(body.password, user["password_hash"]):
        left = login_throttle.failed(ip, uname)
        hint = f" ({left} koshish baaki)" if 0 < left <= 2 else (" – 15 minute ke liye lock" if left == 0 else "")
        raise HTTPException(status_code=401, detail=f"Username ya password galat hai{hint}")
    login_throttle.succeeded(ip, uname)
    access = create_access_token(user["id"], uname)
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return _user_out(user, access, await _backup_key())

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return _user_out(current, None, await _backup_key())


# ---------- PARTIES ----------
@api.get("/parties")
async def list_parties(lite: int = 0, current=Depends(get_current_user)):
    parties = await db.parties.find({}, {"_id": 0}).sort("name", 1).to_list(20000)
    if lite:   # pickers / autocompletes: names + groups only, no balance maths
        return parties
    # latest Account Settled date per party (settlement journals: party line + Account Clear line)
    sids = await _settle_ids()
    settled_upto: dict = {}
    async for j in db.journal.find({"settles_rokad_id": {"$exists": True}}, {"_id": 0, "date": 1, "lines.account_id": 1}):
        for ln in j.get("lines", []):
            aid = ln.get("account_id")
            if aid and aid not in sids:
                settled_upto[aid] = max(settled_upto.get(aid, ""), (j.get("date") or "")[:10])
    # live balances — one bulk pass for all parties
    bals = await _bulk_party_balances(parties=parties)
    for p in parties:
        bal = bals.get(p["id"], float(p.get("opening_balance") or 0))
        p["balance"] = bal
        p["settled_upto"] = settled_upto.get(p["id"])
        p["settled"] = bool(p["settled_upto"]) and abs(bal) < 0.005   # cleared via Account Settled and still at 0
    return parties

@api.post("/parties")
async def create_party(body: PartyIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    doc["name"] = (doc.get("name") or "").strip()
    if not doc["name"]:
        raise HTTPException(422, "Party ka naam zaroori hai")
    dup = await db.parties.find_one({"name": {"$regex": f"^{re.escape(doc['name'])}$", "$options": "i"}}, {"_id": 0, "id": 1, "name": 1})
    if dup:
        raise HTTPException(409, f"Party \"{dup['name']}\" pehle se hai")
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
    party = await db.parties.find_one({"id": pid}, {"_id": 0, "name": 1})
    if not party:
        raise HTTPException(404, "Party not found")
    await _ensure_ledger_unused(pid, party["name"])
    await db.parties.delete_one({"id": pid})
    return {"ok": True}


async def _ledger_usage(lid: str) -> dict:
    """Where a ledger (party or account) is referenced: counts + a few sample entries."""
    cash_or_party = {"$or": [{"cash_account_id": lid}, {"party_id": lid}]}
    bills_q = {"$or": [{"party_id": lid}, {"agent_id": lid}, {"buyer_id": lid}]}
    counts = {
        "rokad": await db.rokad.count_documents(cash_or_party),
        "bills": await db.bills.count_documents(bills_q),
        "journal": await db.journal.count_documents({"lines.account_id": lid}),
        "dos_journal": await db.dos_journal.count_documents({"$or": [{"party_id": lid}, {"counter_party_id": lid}]}),
        "inward": await db.inward.count_documents({"$or": [{"cold_storage_id": lid}, {"party_id": lid}]}),
        "staff": await db.staff.count_documents({"ledger_id": lid}),
    }
    # Linked as an "Account Clear" ledger in Settings → unlink there first
    counts["settings"] = 1 if lid in await _settle_ids() else 0
    samples = []
    async for r in db.rokad.find(cash_or_party, {"_id": 0}).sort("date", -1).limit(5):
        role = "Cash A/C" if r.get("cash_account_id") == lid else "Party"
        samples.append({"kind": "rokad", "date": r.get("date"), "amount": r.get("amount"),
                        "text": f"{'Jama' if r.get('type') == 'jama' else 'Kharch'} · {role} · {r.get('party_name') or r.get('description') or ''}"
                                + (f" · V.No {r['voucher_no']}" if r.get("voucher_no") else "")})
    async for b in db.bills.find(bills_q, {"_id": 0}).sort("date", -1).limit(5):
        samples.append({"kind": "bill", "date": b.get("date"), "amount": b.get("total"),
                        "text": f"{'Sale' if b.get('bill_type') == 'sale' else 'Purchase'} Bill {b.get('bill_no')} · {b.get('party_name', '')}"})
    async for j in db.journal.find({"lines.account_id": lid}, {"_id": 0}).sort("date", -1).limit(5):
        samples.append({"kind": "journal", "date": j.get("date"), "amount": j.get("total"),
                        "text": f"Journal {j.get('voucher_no', '')} · {j.get('narration', '')}"})
    if len(samples) < 5:
        async for j in db.dos_journal.find({"$or": [{"party_id": lid}, {"counter_party_id": lid}]}, {"_id": 0}).sort("date", -1).limit(5):
            amt = float(j.get("debit") or 0) or float(j.get("credit") or 0)
            samples.append({"kind": "dos", "date": j.get("date"), "amount": amt,
                            "text": f"DOS {j.get('sgn') or ''} {j.get('ref_no') or ''} · {j.get('narration') or j.get('account_name') or ''}".strip()})
    return {"total": sum(counts.values()), "counts": counts, "samples": samples[:8]}


async def _ensure_ledger_unused(lid: str, name: str):
    usage = await _ledger_usage(lid)
    if usage["total"]:
        c = usage["counts"]
        if c.get("settings"):
            hint = "Yeh Settings me 'Account Clear' ledger ke roop me link hai — pehle wahan se unlink karein."
        elif c.get("staff"):
            hint = "Yeh kisi Staff ka ledger hai — pehle Staff Master me us staff ko hatayein ya doosra ledger dein."
        else:
            hint = "Pehle woh entries hatayein ya kisi aur account par shift karein."
        raise HTTPException(409, {"message": f'"{name}" delete nahi ho sakta — {usage["total"]} jagah use ho raha hai. {hint}',
                                  "name": name, **usage})


@api.get("/ledgers/{lid}/usage")
async def ledger_usage(lid: str, current=Depends(get_current_user)):
    return await _ledger_usage(lid)


@api.get("/ledgers/{lid}/balance")
async def ledger_balance(lid: str, as_on: Optional[str] = None, current=Depends(get_current_user)):
    """Quick current balance of a party or account (for 'party select karte hi balance dikhe')."""
    if as_on and not _is_date(as_on):
        raise HTTPException(400, "as_on date YYYY-MM-DD format me do")
    p = await db.parties.find_one({"id": lid}, {"_id": 0, "id": 1, "name": 1, "code": 1, "opening_balance": 1, "group_name": 1})
    if p:
        bal = await _compute_party_balance(lid, float(p.get("opening_balance") or 0), as_on)
        kind = "party"
    else:
        p = await db.accounts.find_one({"id": lid}, {"_id": 0, "id": 1, "name": 1, "code": 1, "opening_balance": 1, "group_name": 1})
        if not p:
            raise HTTPException(404, "Ledger nahi mila")
        bal = await _compute_account_balance(lid, float(p.get("opening_balance") or 0), as_on)
        kind = "account"
    # dr_cr follows the app-wide PASSBOOK rule (frontend lib/drcr.js): +ve = Cr (lena / paisa hai), -ve = Dr
    return {"id": lid, "name": p.get("name", ""), "code": p.get("code"), "kind": kind, "group_name": p.get("group_name", ""),
            "balance": round(bal, 2), "dr_cr": "Cr" if bal > 0 else "Dr" if bal < 0 else "", "as_on": as_on}


def _is_date(s: str) -> bool:
    try:
        return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", s)) and date.fromisoformat(s) is not None
    except ValueError:
        return False


def _upto(as_on: Optional[str]) -> dict:
    return {"date": {"$lte": as_on}} if as_on else {}


async def _bulk_party_balances(as_on: Optional[str] = None, parties: Optional[list] = None) -> dict:
    """Same maths as _compute_party_balance, but for ALL parties in 6 aggregations (not 5 queries × N parties).
    Big DOS-imported books (lakhs of entries) went from minutes to well under a second."""
    if parties is None:
        parties = await db.parties.find({}, {"_id": 0, "id": 1, "opening_balance": 1}).to_list(50000)
    bal = {p["id"]: float(p.get("opening_balance") or 0) for p in parties}
    m = _upto(as_on)

    def add(pid, v):
        if pid in bal:
            bal[pid] += float(v or 0)

    async for r in db.bills.aggregate([{"$match": m}, {"$group": {"_id": {"p": "$party_id", "t": "$bill_type"},
                                       "s": {"$sum": {"$subtract": ["$total", {"$ifNull": ["$payment_received", 0]}]}}}}]):
        add(r["_id"]["p"], r["s"] if r["_id"]["t"] == "sale" else -r["s"])
    async for r in db.rokad.aggregate([{"$match": {**m, "ref_bill_id": {"$in": [None, ""]}}},
                                       {"$group": {"_id": {"p": "$party_id", "t": "$type"}, "s": {"$sum": "$amount"}}}]):
        add(r["_id"]["p"], -r["s"] if r["_id"]["t"] == "jama" else r["s"])
    async for r in db.rokad.aggregate([{"$match": {**m, "cash_account_id": {"$nin": [None, ""]}, "$expr": {"$ne": ["$cash_account_id", "$party_id"]}}},
                                       {"$group": {"_id": {"p": "$cash_account_id", "t": "$type"}, "s": {"$sum": "$amount"}}}]):
        add(r["_id"]["p"], r["s"] if r["_id"]["t"] == "jama" else -r["s"])
    async for r in db.journal.aggregate([{"$match": m}, {"$unwind": "$lines"},
                                         {"$group": {"_id": "$lines.account_id", "d": {"$sum": {"$ifNull": ["$lines.debit", 0]}},
                                                     "c": {"$sum": {"$ifNull": ["$lines.credit", 0]}}}}]):
        add(r["_id"], r["d"] - r["c"])
    dsum = {"d": {"$sum": {"$ifNull": ["$debit", 0]}}, "c": {"$sum": {"$ifNull": ["$credit", 0]}}}
    async for r in db.dos_journal.aggregate([{"$match": m}, {"$group": {"_id": "$party_id", **dsum}}]):
        add(r["_id"], r["d"] - r["c"])
    async for r in db.dos_journal.aggregate([{"$match": {**m, "counter_party_id": {"$nin": [None, ""]}, "$expr": {"$ne": ["$party_id", "$counter_party_id"]}}},
                                             {"$group": {"_id": "$counter_party_id", **dsum}}]):
        add(r["_id"], r["c"] - r["d"])   # counter side has the opposite effect
    return {k: round(v, 2) for k, v in bal.items()}

async def _compute_party_balance(party_id: str, opening: float, as_on: Optional[str] = None) -> float:
    bal = opening
    bills = await db.bills.find({"party_id": party_id, **_upto(as_on)}, {"_id": 0}).to_list(5000)
    for b in bills:
        # sale: party owes us total - payment_received
        # purchase: we owe party total - payment_received => subtract
        if b["bill_type"] == "sale":
            bal += b["total"] - b.get("payment_received", 0)
        else:
            bal -= b["total"] - b.get("payment_received", 0)
    rokads = await db.rokad.find({"party_id": party_id, **_upto(as_on)}, {"_id": 0}).to_list(5000)
    for r in rokads:
        if r.get("ref_bill_id"):
            continue  # already counted in bill payment_received
        if r["type"] == "jama":
            bal -= r["amount"]  # party paid us
        else:
            bal += r["amount"]  # we paid party
    # Cash/bank ledgers are parties too: receipts debit the cash a/c, payments credit it
    async for r in db.rokad.find({"cash_account_id": party_id, **_upto(as_on)}, {"_id": 0, "type": 1, "amount": 1, "party_id": 1}):
        if r.get("party_id") == party_id:
            continue
        bal += r["amount"] if r["type"] == "jama" else -r["amount"]
    # Journal vouchers can post directly to a party ledger (Dr = party owes more)
    async for j in db.journal.find({"lines.account_id": party_id, **_upto(as_on)}, {"_id": 0, "lines": 1}):
        for line in j.get("lines", []):
            if line.get("account_id") == party_id:
                bal += float(line.get("debit") or 0) - float(line.get("credit") or 0)
    # Imported DOS journal entries (AN.DBF) for this party
    # Match where this party is EITHER the primary (party_id) OR the counter-party
    # For counter-party entries we flip debit/credit (since the other side has the
    # opposite effect on this party's balance).
    dosj = await db.dos_journal.find(
        {"$or": [{"party_id": party_id}, {"counter_party_id": party_id}], **_upto(as_on)},
        {"_id": 0}
    ).to_list(5000)
    for j in dosj:
        is_primary = (j.get("party_id") == party_id)
        d = float(j.get("debit") or 0)
        c = float(j.get("credit") or 0)
        if is_primary:
            bal += d - c
        else:
            # Counter side has opposite effect
            bal += c - d
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
    item = await db.items.find_one({"id": iid}, {"_id": 0, "name": 1})
    if not item:
        raise HTTPException(404, "Item nahi mila")
    # Usage guard: an item used in saved bills / cold-storage inward can NOT be deleted (bill history must stay readable)
    bills = await db.bills.count_documents({"items.item_id": iid})
    inward = await db.inward.count_documents({"item_id": iid})
    if bills or inward:
        where = " aur ".join(filter(None, [f"{bills} bill" if bills else "", f"{inward} cold-storage entry" if inward else ""]))
        raise HTTPException(400, f"'{item['name']}' {where} me use ho raha hai — delete nahi ho sakta. Pehle wo entries badlein/hatayein.")
    await db.items.delete_one({"id": iid})
    return {"ok": True}


@api.get("/items/{iid}/usage")
async def item_usage(iid: str, current=Depends(get_current_user)):
    return {"bills": await db.bills.count_documents({"items.item_id": iid}),
            "inward": await db.inward.count_documents({"item_id": iid})}


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

async def _sync_bill_payment_rokad(doc: dict):
    """Keep the auto 'payment against bill' rokad entry in sync with the bill (create/replace/remove)."""
    await db.rokad.delete_many({"ref_bill_id": doc["id"]})
    paid = float(doc.get("payment_received") or 0)
    if paid <= 0:
        return
    cash = await _default_cash_account()
    await db.rokad.insert_one({
        "id": str(uuid.uuid4()),
        "date": doc["date"],
        "type": "jama" if doc["bill_type"] == "sale" else "kharch",
        "amount": paid,
        "party_id": doc["party_id"],
        "party_name": doc["party_name"],
        "description": f"Bill {doc['bill_no']} ke against payment",
        "ref_bill_id": doc["id"],
        "mode": "Cash",
        "cash_account_id": cash["id"] if cash else None,
        "cash_account_name": cash["name"] if cash else "",
        "created_at": now_iso(),
    })


@api.post("/bills")
async def create_bill(body: BillIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["bill_no"] = await _next_bill_no(body.bill_type)
    doc["balance"] = round(body.total - body.payment_received, 2)
    doc["created_at"] = now_iso()
    await db.bills.insert_one(doc.copy())
    await _sync_bill_payment_rokad(doc)
    doc.pop("_id", None)
    return doc


@api.put("/bills/{bid}")
async def update_bill(bid: str, body: BillIn, current=Depends(get_current_user)):
    existing = await db.bills.find_one({"id": bid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Bill nahi mila")
    doc = body.model_dump()
    doc["id"] = bid
    doc["bill_no"] = existing["bill_no"]  # number never changes on edit
    doc["bill_type"] = existing["bill_type"]
    doc["balance"] = round(body.total - body.payment_received, 2)
    doc["created_at"] = existing.get("created_at")
    doc["updated_at"] = now_iso()
    await db.bills.update_one({"id": bid}, {"$set": doc})
    await _sync_bill_payment_rokad(doc)
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


@api.get("/rokad/descriptions")
async def rokad_descriptions(q: Optional[str] = None, party_id: Optional[str] = None, limit: int = 12, current=Depends(get_current_user)):
    """Vivran (note) auto-suggest: previously used descriptions — this party's first, then most used / most recent."""
    match: dict = {"description": {"$nin": [None, ""]}}
    if q and q.strip():
        match["description"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    mine = {"$cond": [{"$eq": ["$party_id", party_id]}, 1, 0]} if party_id else {"$literal": 0}
    pipeline = [
        {"$match": match},
        {"$addFields": {"mine": mine}},
        {"$group": {"_id": {"$toLower": {"$trim": {"input": "$description"}}}, "text": {"$last": "$description"},
                    "count": {"$sum": 1}, "last": {"$max": "$date"}, "mine": {"$max": "$mine"}}},
        {"$sort": {"mine": -1, "count": -1, "last": -1}},
        {"$limit": max(1, min(int(limit), 30))},
    ]
    rows = await db.rokad.aggregate(pipeline).to_list(30)
    return [{"text": (r.get("text") or "").strip(), "count": r["count"], "last": (r.get("last") or "")[:10], "mine": bool(r.get("mine"))} for r in rows if (r.get("text") or "").strip()]


@api.get("/rokad/invoice-check")
async def rokad_invoice_check(party_id: str, inv_no: str, exclude_id: Optional[str] = None, current=Depends(get_current_user)):
    """Same Invoice No. already entered for this party? (double-payment guard; case-insensitive, trimmed)"""
    v = inv_no.strip()
    if not v or not party_id:
        return {"duplicates": []}
    q: dict = {"party_id": party_id, "inv_no": {"$regex": f"^\\s*{re.escape(v)}\\s*$", "$options": "i"}}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    rows = await db.rokad.find(q, {"_id": 0, "id": 1, "date": 1, "amount": 1, "type": 1, "voucher_no": 1, "cash_account_name": 1, "inv_no": 1}).sort("date", -1).to_list(20)
    return {"duplicates": rows}


@api.get("/rokad/by-voucher")
async def rokad_by_voucher(voucher_no: str, cash_account_id: Optional[str] = None, current=Depends(get_current_user)):
    """Voucher lookup: entries carrying this V.No. or Invoice No. (per-account numbering → may hit several accounts)."""
    v = voucher_no.strip()
    if not v:
        raise HTTPException(400, "Voucher number daalein")
    variants = {v, v.lstrip("0") or "0"}
    q: dict = {"$or": [{"voucher_no": {"$in": list(variants)}}, {"inv_no": {"$regex": f"^{re.escape(v)}$", "$options": "i"}}]}
    if cash_account_id:
        q["cash_account_id"] = cash_account_id
    rows = await db.rokad.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(50)
    return {"voucher_no": v, "entries": rows}


async def _next_voucher(cash_account_id: str) -> str:
    """FoxPro-style per-cash-account running voucher number (max numeric V.No. + 1)."""
    max_num = 0
    async for r in db.rokad.find({"cash_account_id": cash_account_id, "voucher_no": {"$exists": True, "$ne": ""}},
                                 {"_id": 0, "voucher_no": 1}):
        try:
            max_num = max(max_num, int(str(r.get("voucher_no", "")).strip()))
        except ValueError:
            pass
    return str(max_num + 1)

async def _default_cash_account() -> Optional[dict]:
    """Primary CASH IN HAND ledger: party code 301 → cash-named party in cash group → accounts collection."""
    p = await db.parties.find_one({"code": 301}, {"_id": 0, "id": 1, "name": 1})
    if p:
        return p
    cash_group = await db.account_groups.find_one({"name": "CASH & BANK BALANCE"}, {"_id": 0, "id": 1})
    if cash_group:
        p = await db.parties.find_one({"group_id": cash_group["id"], "name": {"$regex": "cash", "$options": "i"}},
                                      {"_id": 0, "id": 1, "name": 1})
        if p:
            return p
    a = await db.accounts.find_one({"code": 301}, {"_id": 0, "id": 1, "name": 1})
    if a:
        return a
    return await db.accounts.find_one({"name": {"$regex": "cash", "$options": "i"}}, {"_id": 0, "id": 1, "name": 1})


PARTY_REQUIRED_MSG = "Party chunna zaroori hai — bina party ke Rokad entry nahi hogi"


async def _require_party(doc: dict):
    """Rokad party is mandatory: must be a real party/ledger; fills party_name when the client sent only the id."""
    pid = (doc.get("party_id") or "").strip()
    if not pid:
        raise HTTPException(400, PARTY_REQUIRED_MSG)
    p = await db.parties.find_one({"id": pid}, {"_id": 0, "name": 1, "group_id": 1}) or await db.accounts.find_one({"id": pid}, {"_id": 0, "name": 1, "group_id": 1})
    if not p:
        raise HTTPException(400, "Party nahi mili — list se chunein ya nayi party banayein")
    doc["party_id"] = pid
    doc["party_name"] = (doc.get("party_name") or "").strip() or p["name"]
    # "Kiska?" reference: only meaningful when the party is an income/expense ledger; name always from the record
    rid = (doc.get("ref_party_id") or "").strip()
    doc["ref_party_id"], doc["ref_party_name"] = None, ""
    if rid and rid != pid:
        grp = await db.account_groups.find_one({"id": p.get("group_id")}, {"_id": 0, "nature": 1}) if p.get("group_id") else None
        rp = await db.parties.find_one({"id": rid}, {"_id": 0, "name": 1})
        if rp and grp and grp.get("nature") in ("income", "expense"):
            doc["ref_party_id"], doc["ref_party_name"] = rid, rp["name"]
    cid = doc.get("cash_account_id")
    if cid and not (doc.get("cash_account_name") or "").strip():
        c = await db.parties.find_one({"id": cid}, {"_id": 0, "name": 1}) or await db.accounts.find_one({"id": cid}, {"_id": 0, "name": 1})
        if c:
            doc["cash_account_name"] = c["name"]


@api.post("/rokad")
async def create_rokad(body: RokadIn, current=Depends(get_current_user)):
    doc = body.model_dump()
    await _require_party(doc)
    if not doc.get("cash_account_id"):
        cash = await _default_cash_account()
        if cash:
            doc["cash_account_id"] = cash["id"]
            doc["cash_account_name"] = doc.get("cash_account_name") or cash["name"]
    if not (doc.get("voucher_no") or "").strip() and doc.get("cash_account_id"):
        doc["voucher_no"] = await _next_voucher(doc["cash_account_id"])  # auto V.No. per cash a/c
    await _settle_targets(doc)  # validate Account Settled BEFORE anything is written
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.rokad.insert_one(doc.copy())
    doc.pop("_id", None)
    doc["settlement"] = await _apply_settlement(doc)
    return doc


# ---- Account Settled: leftover balance → "Account Clear" ledger so the party stands at 0 as on the entry date ----
async def _settle_accounts() -> list:
    """All linked Account Clear ledgers [{id, name}], default (settings.settle_account_id) first."""
    s = await db.settings.find_one({"id": "default"}, {"_id": 0, "settle_account_id": 1, "settle_account_name": 1, "settle_accounts": 1}) or {}
    accs = [{"id": a["id"], "name": a.get("name") or ""} for a in (s.get("settle_accounts") or []) if a.get("id")]
    sid = s.get("settle_account_id")
    if sid and all(a["id"] != sid for a in accs):
        accs.insert(0, {"id": sid, "name": s.get("settle_account_name") or ""})
    accs.sort(key=lambda a: a["id"] != sid)
    return accs


async def _settle_ids() -> set:
    return {a["id"] for a in await _settle_accounts()}


async def _settle_account(chosen: Optional[str] = None) -> dict:
    accs = await _settle_accounts()
    if not accs:
        raise HTTPException(400, "Pehle 'Account Clear' ledger link karein (Settings ya entry form me) — tabhi Account Settled chalega")
    if chosen and all(a["id"] != chosen for a in accs):
        raise HTTPException(400, "Chuna hua ledger Account Clear me link nahi hai — Settings me pehle link karein")
    sid = chosen or accs[0]["id"]
    led = await db.parties.find_one({"id": sid}, {"_id": 0, "id": 1, "name": 1}) or await db.accounts.find_one({"id": sid}, {"_id": 0, "id": 1, "name": 1})
    if not led:
        raise HTTPException(400, "Link kiya hua 'Account Clear' ledger nahi mila — Settings me dobara chunein")
    return led


async def _settle_targets(rok: dict) -> Optional[tuple]:
    """Validate an Account Settled request → (party, clear_ledger), or None when settle is off."""
    if not rok.get("settle"):
        return None
    if not rok.get("party_id"):
        raise HTTPException(400, "Account Settled ke liye party chunna zaroori hai")
    party = await db.parties.find_one({"id": rok["party_id"]}, {"_id": 0, "id": 1, "name": 1, "opening_balance": 1})
    if not party:
        raise HTTPException(400, "Account Settled sirf party ledger ke saath ho sakta hai")
    led = await _settle_account(rok.get("settle_account_id"))
    if led["id"] == party["id"]:
        raise HTTPException(400, "Party aur 'Account Clear' ledger ek hi nahi ho sakte")
    return party, led


async def _next_journal_vno() -> str:
    cur = db.journal.find({"voucher_no": {"$regex": "^J\\d+$"}}, {"_id": 0, "voucher_no": 1})
    mx = 0
    async for j in cur:
        try: mx = max(mx, int(j["voucher_no"][1:]))
        except ValueError: pass
    return f"J{mx + 1:05d}"


async def _apply_settlement(rok: dict) -> Optional[dict]:
    """(Re)build the settlement journal for a rokad entry. Returns the journal summary or None."""
    rid = rok["id"]
    await db.journal.delete_many({"settles_rokad_id": rid})  # recompute from scratch (edit / un-tick)
    targets = await _settle_targets(rok)
    if not targets:
        await db.rokad.update_one({"id": rid}, {"$unset": {"settle_journal_id": "", "settled_amount": ""}})
        return None
    party, led = targets
    rem = round(await _compute_party_balance(party["id"], float(party.get("opening_balance") or 0), rok["date"]), 2)
    if abs(rem) < 0.005:
        await db.rokad.update_one({"id": rid}, {"$set": {"settled_amount": 0}, "$unset": {"settle_journal_id": ""}})
        return {"amount": 0, "note": "Ledger pehle se 0 hai — koi adjustment nahi"}
    amt = abs(rem)
    # rem > 0 → party still owes: Dr Account Clear / Cr Party. rem < 0 → we owe party: Dr Party / Cr Account Clear
    lines = ([{"account_id": led["id"], "account_name": led["name"], "debit": amt, "credit": 0.0},
              {"account_id": party["id"], "account_name": party["name"], "debit": 0.0, "credit": amt}]
             if rem > 0 else
             [{"account_id": party["id"], "account_name": party["name"], "debit": amt, "credit": 0.0},
              {"account_id": led["id"], "account_name": led["name"], "debit": 0.0, "credit": amt}])
    d = rok["date"][:10].split("-")
    narr = f"Account cleared upto {d[2]}-{d[1]}-{d[0]} · {party['name']} · baki ₹{amt:,.2f} {'Dr' if rem > 0 else 'Cr'} → {led['name']}"
    j = {"id": str(uuid.uuid4()), "date": rok["date"], "narration": narr, "lines": lines, "total": amt,
         "ref": f"Rokad V.{rok.get('voucher_no') or ''}".strip(), "settles_rokad_id": rid,
         "voucher_no": await _next_journal_vno(), "created_at": now_iso(), "auto": "settle"}
    await db.journal.insert_one(j.copy())
    j.pop("_id", None)
    await db.rokad.update_one({"id": rid}, {"$set": {"settle_journal_id": j["id"], "settled_amount": amt if rem > 0 else -amt,
                                                     "settle_account_id": led["id"], "settle_account_name": led["name"]}})
    return {"journal_id": j["id"], "voucher_no": j["voucher_no"], "amount": amt, "side": "Dr" if rem > 0 else "Cr",
            "ledger": led["name"], "ledger_id": led["id"], "narration": narr}


SALARY_LOCK_MSG = "Yeh Staff Salary ki entry hai — isse seedha badal/hata nahi sakte. Staff Salary Payments page se us mahine ki salary delete karein"


@api.put("/rokad/{rid}")
async def update_rokad(rid: str, body: RokadIn, current=Depends(get_current_user)):
    existing = await db.rokad.find_one({"id": rid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Entry nahi mili")
    if existing.get("salary_payment_id"):
        raise HTTPException(400, SALARY_LOCK_MSG)
    if existing.get("contra_id"):
        raise HTTPException(400, "Yeh Transfer (contra) entry hai – ise Transfer form se edit karein")
    doc = body.model_dump()
    await _require_party(doc)
    if not doc.get("cash_account_id"):
        cash = await _default_cash_account()
        if cash:
            doc["cash_account_id"] = cash["id"]
            doc["cash_account_name"] = doc.get("cash_account_name") or cash["name"]
    doc["updated_at"] = now_iso()
    merged = {**existing, **doc}
    await _settle_targets(merged)  # validate before writing
    await db.rokad.update_one({"id": rid}, {"$set": doc})
    merged["settlement"] = await _apply_settlement(merged)
    return merged


@api.post("/rokad/{rid}/reopen")
async def reopen_rokad(rid: str, current=Depends(get_current_user)):
    """Undo Account Settled on an entry: remove the adjustment journal so the party's baki comes back."""
    rok = await db.rokad.find_one({"id": rid}, {"_id": 0})
    if not rok:
        raise HTTPException(404, "Entry nahi mili")
    if not rok.get("settle") and not rok.get("settle_journal_id"):
        raise HTTPException(400, "Yeh entry settled nahi hai")
    removed = abs(float(rok.get("settled_amount") or 0))
    await db.journal.delete_many({"settles_rokad_id": rid})
    await db.rokad.update_one({"id": rid}, {"$set": {"settle": False, "updated_at": now_iso()},
                                            "$unset": {"settle_journal_id": "", "settled_amount": ""}})
    return {"ok": True, "removed_amount": removed, "party_id": rok.get("party_id"), "party_name": rok.get("party_name", "")}


@api.get("/reports/income-expense")
async def income_expense_report(period: str = "monthly", date_from: Optional[str] = None, date_to: Optional[str] = None,
                                current=Depends(get_current_user)):
    """Aay-Vyay: income & expense heads (group nature income/expense) bucketed weekly / monthly / yearly (FY),
    with head-wise breakdown ("kahan kahan gaya") per bucket and for the whole range."""
    if period not in ("weekly", "monthly", "yearly"):
        raise HTTPException(400, "period: weekly | monthly | yearly")
    s = await db.settings.find_one({"id": "default"}, {"_id": 0}) or {}
    today = date.today().isoformat()
    d_from = date_from or s.get("fy_start") or f"{today[:4]}-04-01"
    d_to = date_to or today
    for d in (d_from, d_to):
        if not _is_date(d):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
    if d_from > d_to:
        d_from, d_to = d_to, d_from
    groups = {g["id"]: g for g in await db.account_groups.find({}, {"_id": 0}).to_list(500)}
    # investment = asset groups the user picked in Settings (default: fixed assets / deposits / loans & advances / cold storage)
    inv_ids = s.get("investment_group_ids")
    if inv_ids is None:
        inv_ids = [g["id"] for g in groups.values() if g.get("nature") == "asset"
                   and re.search(r"fixed|deposit|loan|advance|invest|cold|fd\b", g.get("name", ""), re.I)
                   and not re.search(r"staff|salary|cash|bank|party", g.get("name", ""), re.I)]
    inv_set = set(inv_ids)

    def category(g: dict) -> Optional[str]:
        if g["id"] in inv_set: return "investment"
        return g.get("nature") if g.get("nature") in ("income", "expense") else None

    heads: dict = {}
    for coll in ("parties", "accounts"):
        async for doc in db[coll].find({}, {"_id": 0, "id": 1, "name": 1, "group_id": 1, "code": 1}):
            g = groups.get(doc.get("group_id"))
            cat = category(g) if g else None
            if cat:
                heads[doc["id"]] = {"id": doc["id"], "name": doc.get("name", ""), "code": doc.get("code") or 0,
                                    "group_id": g["id"], "group_name": g["name"], "nature": cat}
    ids = list(heads)
    rng = {"date": {"$gte": d_from, "$lte": d_to}}
    moves: list = []   # (date, head_id, dr_movement)
    if ids:
        async for r in db.rokad.find({"party_id": {"$in": ids}, **rng}, {"_id": 0, "date": 1, "party_id": 1, "type": 1, "amount": 1, "ref_bill_id": 1}):
            if r.get("ref_bill_id"):
                continue
            amt = float(r.get("amount") or 0)
            moves.append((r["date"][:10], r["party_id"], amt if r.get("type") == "kharch" else -amt))
        async for j in db.journal.find({"lines.account_id": {"$in": ids}, **rng}, {"_id": 0, "date": 1, "lines": 1}):
            for ln in j.get("lines", []):
                if ln.get("account_id") in heads:
                    moves.append((j["date"][:10], ln["account_id"], float(ln.get("debit") or 0) - float(ln.get("credit") or 0)))
        async for j in db.dos_journal.find({"$or": [{"party_id": {"$in": ids}}, {"counter_party_id": {"$in": ids}}], **rng},
                                           {"_id": 0, "date": 1, "party_id": 1, "counter_party_id": 1, "debit": 1, "credit": 1}):
            dr, cr = float(j.get("debit") or 0), float(j.get("credit") or 0)
            if j.get("party_id") in heads:
                moves.append((j["date"][:10], j["party_id"], dr - cr))
            if j.get("counter_party_id") in heads:
                moves.append((j["date"][:10], j["counter_party_id"], cr - dr))
        async for b in db.bills.find({"party_id": {"$in": ids}, **rng}, {"_id": 0, "date": 1, "party_id": 1, "bill_type": 1, "total": 1, "payment_received": 1}):
            net = float(b.get("total") or 0) - float(b.get("payment_received") or 0)
            moves.append((b["date"][:10], b["party_id"], net if b.get("bill_type") == "sale" else -net))

    # ---- buckets ----
    fy_start = s.get("fy_start") or f"{today[:4]}-04-01"
    fm, fd = int(fy_start[5:7]), int(fy_start[8:10])
    MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    def bucket_of(iso: str) -> tuple:
        d = datetime.fromisoformat(iso).date()
        if period == "monthly":
            start = d.replace(day=1)
            end = (start.replace(month=start.month % 12 + 1, day=1) if start.month < 12 else start.replace(year=start.year + 1, month=1, day=1)) - timedelta(days=1)
            return start.isoformat(), end.isoformat(), f"{MON[d.month - 1]} {d.year}"
        if period == "weekly":
            start = d - timedelta(days=d.weekday())
            end = start + timedelta(days=6)
            return start.isoformat(), end.isoformat(), f"{start.day:02d} {MON[start.month - 1]} – {end.day:02d} {MON[end.month - 1]} {end.year}"
        # yearly = financial year from settings (e.g. 01-Apr → 31-Mar)
        y = d.year if (d.month, d.day) >= (fm, fd) else d.year - 1
        start = date(y, fm, fd)
        end = date(y + 1, fm, fd) - timedelta(days=1)
        return start.isoformat(), end.isoformat(), f"FY {y}-{str(y + 1)[2:]}" if (fm, fd) != (1, 1) else str(y)

    # every bucket in range (even empty ones) so the table reads like a calendar
    buckets: dict = {}
    cur = d_from
    while cur <= d_to:
        bs, be, label = bucket_of(cur)
        buckets[bs] = {"key": bs, "label": label, "start": max(bs, d_from), "end": min(be, d_to),
                       "income": 0.0, "expense": 0.0, "investment": 0.0, "heads": {}}
        cur = (datetime.fromisoformat(be).date() + timedelta(days=1)).isoformat()

    overall: dict = {}
    for iso, hid, dr in moves:
        bs, _, _ = bucket_of(iso)
        b = buckets.get(bs)
        if b is None:
            continue
        h = heads[hid]
        val = -dr if h["nature"] == "income" else dr     # income = Cr movement; expense / investment = Dr movement (paisa gaya)
        b[h["nature"]] += val
        b["heads"][hid] = b["heads"].get(hid, 0.0) + val
        overall[hid] = overall.get(hid, 0.0) + val

    def head_rows(acc: dict) -> dict:
        """{income|expense|investment: [{group_name, total, share, rows:[{id,name,amount,share}]}]} — group-wise, biggest first."""
        out = {"expense": [], "income": [], "investment": []}
        by_group: dict = {}
        for hid, amt in acc.items():
            if abs(amt) < 0.005:
                continue
            h = heads[hid]
            by_group.setdefault((h["nature"], h["group_id"]), {"group_id": h["group_id"], "group_name": h["group_name"], "rows": []})["rows"].append(
                {"id": hid, "name": h["name"], "amount": round(amt, 2)})
        for (nat, _gid), g in by_group.items():
            g["total"] = round(sum(r["amount"] for r in g["rows"]), 2)
            g["rows"].sort(key=lambda r: -r["amount"])
            out[nat].append(g)
        for nat in out:
            tot = sum(g["total"] for g in out[nat]) or 0
            out[nat].sort(key=lambda g: -g["total"])
            for g in out[nat]:
                g["share"] = round(g["total"] / tot * 100, 1) if tot else 0.0
                for r in g["rows"]:
                    r["share"] = round(r["amount"] / tot * 100, 1) if tot else 0.0
        return out

    rows = []
    for b in buckets.values():
        rows.append({"key": b["key"], "label": b["label"], "start": b["start"], "end": b["end"],
                     "income": round(b["income"], 2), "expense": round(b["expense"], 2), "investment": round(b["investment"], 2),
                     "net": round(b["income"] - b["expense"], 2), "heads": head_rows(b["heads"])})
    ti = round(sum(r["income"] for r in rows), 2); te = round(sum(r["expense"] for r in rows), 2); tv = round(sum(r["investment"] for r in rows), 2)
    return {"period": period, "date_from": d_from, "date_to": d_to, "firm_name": s.get("firm_name", ""),
            "rows": rows, "heads": head_rows(overall), "head_count": len(heads),
            "groups": [{"id": g["id"], "name": g["name"], "nature": g.get("nature", "")} for g in sorted(groups.values(), key=lambda x: x.get("fcode") or 0)],
            "investment_group_ids": list(inv_ids),
            "totals": {"income": ti, "expense": te, "investment": tv, "net": round(ti - te, 2)}}


BYAJ_LEDGER_RX = re.compile(r"interest|byaj|vyaj|ब्याज", re.I)

@api.get("/reports/byaj")
async def byaj_report(date_from: Optional[str] = None, date_to: Optional[str] = None, current=Depends(get_current_user)):
    """Interest received / paid (Rokad entries on ledgers whose NAME says interest/byaj) grouped by the "Kiska?" reference party."""
    for d in (date_from, date_to):
        if d and not _is_date(d):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
    st = await db.settings.find_one({"id": "default"}, {"_id": 0}) or {}
    ledgers = []
    for coll in (db.parties, db.accounts):
        async for p in coll.find({"name": {"$regex": BYAJ_LEDGER_RX.pattern, "$options": "i"}}, {"_id": 0, "id": 1, "name": 1, "group_name": 1}):
            ledgers.append(p)
    out = {"firm_name": st.get("firm_name", ""), "date_from": date_from, "date_to": date_to, "ledgers": ledgers,
           "groups": [], "count": 0, "total_received": 0.0, "total_paid": 0.0, "net": 0.0}
    if not ledgers:
        return out
    q: dict = {"party_id": {"$in": [l["id"] for l in ledgers]}}
    rng = {}
    if date_from: rng["$gte"] = date_from
    if date_to: rng["$lte"] = date_to
    if rng: q["date"] = rng
    groups: dict = {}
    async for r in db.rokad.find(q, {"_id": 0}).sort([("date", 1), ("created_at", 1)]):
        key = r.get("ref_party_id") or ""
        g = groups.setdefault(key, {"ref_party_id": key or None, "ref_party_name": r.get("ref_party_name") or "", "received": 0.0, "paid": 0.0, "entries": []})
        amt = float(r.get("amount") or 0)
        if r.get("type") == "jama": g["received"] += amt
        else: g["paid"] += amt
        g["entries"].append({"id": r["id"], "date": (r.get("date") or "")[:10], "type": r.get("type"), "amount": amt,
                             "voucher_no": r.get("voucher_no") or "", "inv_no": r.get("inv_no") or "", "chq_no": r.get("chq_no") or "",
                             "ledger_id": r.get("party_id"), "ledger_name": r.get("party_name") or "", "description": r.get("description") or "",
                             "cash_account_name": r.get("cash_account_name") or "", "mode": r.get("mode") or ""})
        out["count"] += 1
    if "" in groups:
        groups[""]["ref_party_name"] = "BINA NAAM — 'Kiska?' nahi bhara"
    for g in groups.values():
        g["received"] = round(g["received"], 2); g["paid"] = round(g["paid"], 2); g["net"] = round(g["received"] - g["paid"], 2)
        g["count"] = len(g["entries"])
    named = sorted((g for k, g in groups.items() if k), key=lambda g: g["ref_party_name"].upper())
    out["groups"] = named + ([groups[""]] if "" in groups else [])
    out["total_received"] = round(sum(g["received"] for g in out["groups"]), 2)
    out["total_paid"] = round(sum(g["paid"] for g in out["groups"]), 2)
    out["net"] = round(out["total_received"] - out["total_paid"], 2)
    return out


@api.get("/reports/account-clear")
async def account_clear_report(date_from: Optional[str] = None, date_to: Optional[str] = None, ledger_id: Optional[str] = None,
                               current=Depends(get_current_user)):
    """Everything posted to the Account Clear ledger(s) (auto settlements + manual journals) in a date range.
    ledger_id: one linked ledger; omitted → all linked ledgers together (rows carry ledger_id/ledger_name)."""
    for d in (date_from, date_to):
        if d and not _is_date(d):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
    st = await db.settings.find_one({"id": "default"}, {"_id": 0}) or {}
    accs = await _settle_accounts()
    empty = {"ledger": None, "ledgers": accs, "ledger_id": ledger_id, "date_from": date_from, "date_to": date_to, "rows": [], "count": 0,
             "total_off": 0.0, "total_back": 0.0, "net": 0.0, "firm_name": st.get("firm_name", "")}
    if not accs:
        return empty
    async for p in db.parties.find({"id": {"$in": [a["id"] for a in accs]}}, {"_id": 0, "id": 1, "name": 1}):
        for a in accs:
            if a["id"] == p["id"]: a["name"] = p["name"]
    sel = [a for a in accs if a["id"] == ledger_id] if ledger_id else accs
    if not sel:
        raise HTTPException(400, "Yeh ledger Account Clear me link nahi hai")
    ids = {a["id"] for a in sel}
    names = {a["id"]: a["name"] for a in accs}
    led = sel[0] if len(sel) == 1 else {"id": None, "name": f"Sab Account Clear ledgers ({len(sel)})"}
    q: dict = {"lines.account_id": {"$in": list(ids)}}
    rng = {}
    if date_from: rng["$gte"] = date_from
    if date_to: rng["$lte"] = date_to
    if rng: q["date"] = rng
    rows, total_off, total_back = [], 0.0, 0.0
    rokad_ids = set()
    async for j in db.journal.find(q, {"_id": 0}).sort([("date", 1), ("created_at", 1)]):
        mine = [ln for ln in j.get("lines", []) if ln.get("account_id") in ids]
        others = [ln for ln in j.get("lines", []) if ln.get("account_id") not in ids]
        dr = sum(float(ln.get("debit") or 0) for ln in mine)
        cr = sum(float(ln.get("credit") or 0) for ln in mine)
        amt = round(dr - cr, 2)
        if abs(amt) < 0.005:
            continue
        side = "off" if amt > 0 else "back"   # Dr Account Clear = party ka baki chhoda (written off); Cr = humne apna dena chhoda
        if side == "off": total_off += amt
        else: total_back += -amt
        rid = j.get("settles_rokad_id")
        if rid: rokad_ids.add(rid)
        lid = mine[0].get("account_id")
        rows.append({"journal_id": j["id"], "date": (j.get("date") or "")[:10], "voucher_no": j.get("voucher_no", ""),
                     "party_id": others[0].get("account_id") if others else None,
                     "party_name": ", ".join(o.get("account_name", "") for o in others) or "—",
                     "ledger_id": lid, "ledger_name": names.get(lid) or mine[0].get("account_name", ""),
                     "amount": abs(amt), "side": side, "narration": j.get("narration", ""),
                     "rokad_id": rid, "auto": bool(rid)})
    if rokad_ids:
        vmap = {r["id"]: r async for r in db.rokad.find({"id": {"$in": list(rokad_ids)}}, {"_id": 0, "id": 1, "voucher_no": 1, "inv_no": 1, "cash_account_name": 1, "amount": 1, "type": 1})}
        for r in rows:
            rk = vmap.get(r.get("rokad_id"))
            if rk:
                r["rokad_vno"] = rk.get("voucher_no", ""); r["cash_account_name"] = rk.get("cash_account_name", "")
                r["rokad_inv"] = rk.get("inv_no", "")
                r["rokad_amount"] = rk.get("amount"); r["rokad_type"] = rk.get("type")
    return {**empty, "ledger": led, "rows": rows, "count": len(rows),
            "total_off": round(total_off, 2), "total_back": round(total_back, 2), "net": round(total_off - total_back, 2)}


@api.delete("/rokad/{rid}")
async def delete_rokad(rid: str, current=Depends(get_current_user)):
    existing = await db.rokad.find_one({"id": rid}, {"_id": 0, "contra_id": 1, "salary_payment_id": 1})
    if existing and existing.get("salary_payment_id"):
        raise HTTPException(400, SALARY_LOCK_MSG)
    await db.journal.delete_many({"settles_rokad_id": rid})  # its Account Settled adjustment goes with it
    if existing and existing.get("contra_id"):
        await db.rokad.delete_many({"contra_id": existing["contra_id"]})  # both legs go together
    else:
        await db.rokad.delete_one({"id": rid})
    return {"ok": True}


# ---- Cash/Bank transfer (contra): two linked rokad legs — kharch on FROM, jama on TO ----
class TransferIn(BaseModel):
    date: str
    from_account_id: str
    to_account_id: str
    amount: float = Field(gt=0)
    description: str = ""
    voucher_no: Optional[str] = ""
    chq_no: Optional[str] = ""
    mode: str = "Bank"


async def _transfer_legs(body: TransferIn, contra_id: str) -> list:
    if body.from_account_id == body.to_account_id:
        raise HTTPException(400, "From aur To account alag hone chahiye")
    ledgers = {l["id"]: l for l in await _cash_ledgers()}
    src, dst = ledgers.get(body.from_account_id), ledgers.get(body.to_account_id)
    if not src or not dst:
        raise HTTPException(400, "Sirf Cash/Bank group ke accounts ke beech transfer ho sakta hai")
    common = {"contra_id": contra_id, "date": body.date, "amount": body.amount, "description": body.description,
              "voucher_no": body.voucher_no or "", "chq_no": body.chq_no or "", "mode": body.mode,
              "party_id": None, "ref_bill_id": None}
    return [
        {**common, "type": "kharch", "cash_account_id": src["id"], "cash_account_name": src["name"],
         "counter_account_id": dst["id"], "counter_account_name": dst["name"], "party_name": f"Transfer → {dst['name']}"},
        {**common, "type": "jama", "cash_account_id": dst["id"], "cash_account_name": dst["name"],
         "counter_account_id": src["id"], "counter_account_name": src["name"], "party_name": f"Transfer ← {src['name']}"},
    ]


def _transfer_out(legs: list) -> dict:
    out_leg = next(l for l in legs if l["type"] == "kharch")
    in_leg = next(l for l in legs if l["type"] == "jama")
    return {"contra_id": out_leg["contra_id"], "date": out_leg["date"], "amount": out_leg["amount"],
            "from_account_id": out_leg["cash_account_id"], "from_account_name": out_leg["cash_account_name"],
            "to_account_id": in_leg["cash_account_id"], "to_account_name": in_leg["cash_account_name"],
            "description": out_leg.get("description", ""), "voucher_no": out_leg.get("voucher_no", ""),
            "chq_no": out_leg.get("chq_no", ""), "mode": out_leg.get("mode", "Bank"),
            "legs": [{"id": l["id"], "type": l["type"], "cash_account_id": l["cash_account_id"]} for l in legs]}


@api.post("/rokad/transfer")
async def create_transfer(body: TransferIn, current=Depends(get_current_user)):
    contra_id = str(uuid.uuid4())
    legs = await _transfer_legs(body, contra_id)
    ts = now_iso()
    for leg in legs:
        leg.update({"id": str(uuid.uuid4()), "created_at": ts})
        if not (leg.get("voucher_no") or "").strip():
            leg["voucher_no"] = await _next_voucher(leg["cash_account_id"])
    await db.rokad.insert_many([l.copy() for l in legs])
    return _transfer_out(legs)


@api.get("/rokad/transfer/{contra_id}")
async def get_transfer(contra_id: str, current=Depends(get_current_user)):
    legs = await db.rokad.find({"contra_id": contra_id}, {"_id": 0}).to_list(2)
    if len(legs) != 2:
        raise HTTPException(404, "Transfer entry nahi mili")
    return _transfer_out(legs)


@api.put("/rokad/transfer/{contra_id}")
async def update_transfer(contra_id: str, body: TransferIn, current=Depends(get_current_user)):
    old = await db.rokad.find({"contra_id": contra_id}, {"_id": 0}).to_list(2)
    if len(old) != 2:
        raise HTTPException(404, "Transfer entry nahi mili")
    legs = await _transfer_legs(body, contra_id)
    ts = now_iso()
    for leg, prev in zip(legs, sorted(old, key=lambda l: l["type"] != "kharch")):  # keep leg ids: kharch first
        leg.update({"id": prev["id"], "created_at": prev.get("created_at", ts), "updated_at": ts})
        if not (leg.get("voucher_no") or "").strip():
            leg["voucher_no"] = prev.get("voucher_no", "") if prev.get("cash_account_id") == leg["cash_account_id"] else await _next_voucher(leg["cash_account_id"])
        await db.rokad.replace_one({"id": prev["id"]}, leg.copy())
    return _transfer_out(legs)


async def _cash_ledgers() -> list:
    """Cash/bank ledgers = parties in the CASH & BANK group + legacy accounts in cash/bank groups."""
    groups = {g["id"]: g for g in await db.account_groups.find({}, {"_id": 0}).to_list(500)}
    cash_gids = {gid for gid, g in groups.items() if re.search(r"cash|bank", g.get("name", ""), re.I)}
    out = []
    for p in await db.parties.find({"group_id": {"$in": list(cash_gids)}}, {"_id": 0}).sort("code", 1).to_list(500):
        out.append({"id": p["id"], "name": p["name"], "code": p.get("code"), "kind": "party",
                    "group_name": groups.get(p.get("group_id"), {}).get("name", ""), "opening_balance": float(p.get("opening_balance") or 0)})
    for a in await db.accounts.find({"group_id": {"$in": list(cash_gids)}}, {"_id": 0}).sort("name", 1).to_list(500):
        out.append({"id": a["id"], "name": a["name"], "code": a.get("code"), "kind": "account",
                    "group_name": groups.get(a.get("group_id"), {}).get("name", ""), "opening_balance": float(a.get("opening_balance") or 0)})
    return out


@api.get("/rokad/accounts-summary")
async def rokad_accounts_summary(date_from: str, date_to: str, current=Depends(get_current_user)):
    """Opening (as on day before date_from) / Jama / Kharch / Closing (as on date_to) per cash & bank ledger —
    same balance engine as the Balance Sheet so closing figures always match."""
    for d in (date_from, date_to):
        if not _is_date(d):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
    day_before = (datetime.fromisoformat(date_from).date() - timedelta(days=1)).isoformat()
    rows = []
    for led in await _cash_ledgers():
        calc = _compute_party_balance if led["kind"] == "party" else _compute_account_balance
        opening = await calc(led["id"], led["opening_balance"], day_before)
        closing = await calc(led["id"], led["opening_balance"], date_to)
        jama = kharch = 0.0
        async for r in db.rokad.find({"cash_account_id": led["id"], "date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0, "type": 1, "amount": 1}):
            if r["type"] == "jama":
                jama += r["amount"]
            else:
                kharch += r["amount"]
        other = round(closing - opening - jama + kharch, 2)  # journal / DOS entries touching this ledger
        rows.append({**led, "opening": opening, "jama": round(jama, 2), "kharch": round(kharch, 2), "other": other, "closing": closing})
    total = {k: round(sum(r[k] for r in rows), 2) for k in ("opening", "jama", "kharch", "other", "closing")}
    return {"date_from": date_from, "date_to": date_to, "rows": rows, "total": total}


# ---------- REPORTS / SUMMARY ----------
# NOTE: keep this AFTER every literal /rokad/<name> GET route (e.g. /rokad/accounts-summary) so it does not shadow them
@api.get("/rokad/{rid}")
async def get_rokad(rid: str, current=Depends(get_current_user)):
    doc = await db.rokad.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Entry nahi mili")
    return doc


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
    parties = await db.parties.find({}, {"_id": 0}).to_list(50000)
    total_udhaar = 0.0
    total_owed = 0.0
    _bals = await _bulk_party_balances(parties=parties)
    for p in parties:
        bal = _bals.get(p["id"], float(p.get("opening_balance") or 0))
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


async def _journal_rows(pid: str, upto: dict) -> list:
    journal = []
    async for j in db.journal.find({"lines.account_id": pid, **upto}, {"_id": 0}).sort("date", 1):
        for ln in j.get("lines", []):
            if ln.get("account_id") == pid:
                other = ", ".join(x.get("account_name", "") for x in j.get("lines", []) if x.get("account_id") != pid)
                journal.append({"id": j["id"], "date": j.get("date"), "voucher_no": j.get("voucher_no", ""),
                                "narration": j.get("narration", ""), "other": other,
                                "debit": float(ln.get("debit") or 0), "credit": float(ln.get("credit") or 0),
                                "settles_rokad_id": j.get("settles_rokad_id"), "auto": j.get("auto"), "created_at": j.get("created_at", "")})
    return journal


async def _settled_upto(pid: str, as_on: Optional[str]) -> Optional[str]:
    """Date of the latest Account Settled adjustment for this party (as on date)."""
    q = {"settles_rokad_id": {"$exists": True}, "lines.account_id": pid, **_upto(as_on)}
    j = await db.journal.find(q, {"_id": 0, "date": 1}).sort("date", -1).limit(1).to_list(1)
    return (j[0].get("date") or "")[:10] if j else None


async def _account_ledger(acc: dict, as_on: Optional[str], date_from: Optional[str], upto: dict) -> dict:
    """Ledger view for a Chart-of-Accounts ledger (cash/bank a/c made in Accounts page, not a party)."""
    grp = await db.account_groups.find_one({"id": acc.get("group_id")}, {"_id": 0, "name": 1})
    acc["group_name"] = (grp or {}).get("name", acc.get("group_name", ""))
    acc.setdefault("type", "account")
    opening = float(acc.get("opening_balance") or 0)
    acc["balance"] = await _compute_account_balance(acc["id"], opening, as_on)
    cash_rokad = await db.rokad.find({"cash_account_id": acc["id"], **upto}, {"_id": 0}).sort("date", 1).to_list(5000)
    if date_from:
        day_before = (datetime.fromisoformat(date_from).date() - timedelta(days=1)).isoformat()
        opening = await _compute_account_balance(acc["id"], opening, day_before)
    return {"party": acc, "kind": "account", "as_on": as_on, "date_from": date_from, "opening": opening, "bills": [], "rokad": [],
            "cash_rokad": cash_rokad, "journal": await _journal_rows(acc["id"], upto), "dos_journal": []}


@api.get("/summary/party/{pid}")
async def party_ledger(pid: str, as_on: Optional[str] = None, date_from: Optional[str] = None, current=Depends(get_current_user)):
    for d in (as_on, date_from):
        if d and not _is_date(d):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
    upto = _upto(as_on)
    if date_from:  # statement range: entries from date_from, opening = balance the day before
        upto = {"date": {**upto.get("date", {}), "$gte": date_from}}
    party = await db.parties.find_one({"id": pid}, {"_id": 0})
    if not party:
        acc = await db.accounts.find_one({"id": pid}, {"_id": 0})
        if not acc:
            raise HTTPException(404, "Party / account nahi mila")
        return await _account_ledger(acc, as_on, date_from, upto)
    bills = await db.bills.find({"party_id": pid, **upto}, {"_id": 0}).sort("date", 1).to_list(5000)
    rokads = await db.rokad.find({"party_id": pid, **upto}, {"_id": 0}).sort("date", 1).to_list(5000)
    # Entries where this ledger is the cash/bank account side (cash-group parties)
    cash_rokad = [r for r in await db.rokad.find({"cash_account_id": pid, **upto}, {"_id": 0}).sort("date", 1).to_list(5000)
                  if r.get("party_id") != pid]
    journal = await _journal_rows(pid, upto)
    # Imported DOS journal entries (AN.DBF) - match primary OR counter-party
    dos_raw = await db.dos_journal.find(
        {"$or": [{"party_id": pid}, {"counter_party_id": pid}], **upto},
        {"_id": 0}
    ).sort([("date", 1), ("ref_no", 1)]).to_list(5000)
    # Flip debit/credit for counter-party rows so the ledger displays correctly
    dos_journal = []
    for j in dos_raw:
        is_primary = (j.get("party_id") == pid)
        entry = dict(j)
        if not is_primary:
            entry["debit"], entry["credit"] = j.get("credit", 0), j.get("debit", 0)
            entry["is_counter_side"] = True
            # Show the primary party as "other side" in narration
            entry["other_party_name"] = j.get("account_name") or ""
        else:
            entry["is_counter_side"] = False
            entry["other_party_name"] = j.get("counter_party_name") or ""
        dos_journal.append(entry)
    party["balance"] = await _compute_party_balance(pid, party.get("opening_balance", 0.0), as_on)
    opening = float(party.get("opening_balance") or 0)
    if date_from:
        day_before = (datetime.fromisoformat(date_from).date() - timedelta(days=1)).isoformat()
        opening = await _compute_party_balance(pid, opening, day_before)
    # Memo rows: Rokad booked to an income/expense ledger (eg. INTEREST RECEIVED) with this party as "kiska" reference —
    # informational only, never touches this party's balance
    memo_rokad = await db.rokad.find({"ref_party_id": pid, **upto}, {"_id": 0}).sort("date", 1).to_list(5000)
    return {"party": party, "as_on": as_on, "date_from": date_from, "opening": opening, "bills": bills, "rokad": rokads,
            "cash_rokad": cash_rokad, "journal": journal, "dos_journal": dos_journal, "memo_rokad": memo_rokad,
            "settled_upto": await _settled_upto(pid, as_on)}


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
    acc = await db.accounts.find_one({"id": aid}, {"_id": 0, "name": 1})
    if not acc:
        raise HTTPException(404, "Account not found")
    await _ensure_ledger_unused(aid, acc["name"])
    await db.accounts.delete_one({"id": aid})
    return {"ok": True}

async def _compute_account_balance(aid: str, opening: float, as_on: Optional[str] = None) -> float:
    """Compute account balance from journal entries + rokad with cash_account_id."""
    bal = opening
    # journal lines
    async for j in db.journal.find({"lines.account_id": aid, **_upto(as_on)}, {"_id": 0}):
        for line in j.get("lines", []):
            if line.get("account_id") == aid:
                bal += line.get("debit", 0) - line.get("credit", 0)
    # rokad mapped to this cash account
    async for r in db.rokad.find({"cash_account_id": aid, **_upto(as_on)}, {"_id": 0}):
        if r["type"] == "jama":
            bal += r["amount"]    # receipt – cash account debited (increases)
        else:
            bal -= r["amount"]    # payment – cash account credited (decreases)
    return round(bal, 2)


# ---------- JOURNAL ENTRIES ----------
@api.get("/journal")
async def list_journal(date_from: Optional[str] = None, date_to: Optional[str] = None,
                       account_id: Optional[str] = None, current=Depends(get_current_user)):
    q = {}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    if account_id:
        q["lines.account_id"] = account_id  # only vouchers touching this ledger
    entries = await db.journal.find(q, {"_id": 0}).sort("date", -1).to_list(5000)
    return entries

def _validate_journal(body: JournalIn) -> float:
    tot_d = sum(ln.debit for ln in body.lines)
    tot_c = sum(ln.credit for ln in body.lines)
    if round(tot_d, 2) != round(tot_c, 2):
        raise HTTPException(400, f"Debit ({tot_d}) aur Credit ({tot_c}) match nahi karte")
    if tot_d <= 0:
        raise HTTPException(400, "Amount > 0 hona chahiye")
    return round(tot_d, 2)


@api.post("/journal")
async def create_journal(body: JournalIn, current=Depends(get_current_user)):
    total = _validate_journal(body)
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["voucher_no"] = await _next_journal_vno()
    doc["total"] = total
    doc["created_at"] = now_iso()
    await db.journal.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.get("/journal/{jid}")
async def get_journal(jid: str, current=Depends(get_current_user)):
    doc = await db.journal.find_one({"id": jid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Journal entry nahi mili")
    return doc


@api.put("/journal/{jid}")
async def update_journal(jid: str, body: JournalIn, current=Depends(get_current_user)):
    existing = await db.journal.find_one({"id": jid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Journal entry nahi mili")
    if existing.get("settles_rokad_id"):
        raise HTTPException(400, "Yeh Account Settled ka auto journal hai — isse seedha edit nahi kar sakte. Rokad entry edit karein, yeh apne aap dobara banega")
    if existing.get("salary_payment_id"):
        raise HTTPException(400, SALARY_LOCK_MSG)
    total = _validate_journal(body)
    doc = body.model_dump()
    doc["total"] = total
    doc["updated_at"] = now_iso()
    await db.journal.update_one({"id": jid}, {"$set": doc})
    return {**existing, **doc}

@api.delete("/journal/{jid}")
async def delete_journal(jid: str, current=Depends(get_current_user)):
    if await db.journal.find_one({"id": jid, "salary_payment_id": {"$exists": True, "$ne": None}}, {"_id": 0, "id": 1}):
        raise HTTPException(400, SALARY_LOCK_MSG)
    await db.journal.delete_one({"id": jid})
    await db.rokad.update_one({"settle_journal_id": jid}, {"$set": {"settle": False}, "$unset": {"settle_journal_id": "", "settled_amount": ""}})
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
            "firm_name": "9x Vyapari",
            "fy_start": f"{fy_year}-04-01",
            "fy_end": f"{fy_year + 1}-03-31",
            "current_date": today.isoformat(),
        }
        await db.settings.insert_one(s.copy())
        s.pop("_id", None)
    return s

@api.put("/settings")
async def update_settings(body: SettingsIn, current=Depends(get_current_user)):
    data = body.model_dump()
    accounts = data.pop("settle_accounts", None)
    update = {k: v for k, v in data.items() if v not in (None, "")}
    op: dict = {"$set": update}
    if accounts is not None:
        # full list of linked Account Clear ledgers; default = settle_account_id if it is in the list, else the first one
        seen, clean = set(), []
        for a in accounts:
            if a["id"] and a["id"] not in seen:
                seen.add(a["id"]); clean.append({"id": a["id"], "name": a.get("name") or ""})
        update["settle_accounts"] = clean
        default = next((a for a in clean if a["id"] == data.get("settle_account_id")), clean[0] if clean else None)
        if default:
            update["settle_account_id"], update["settle_account_name"] = default["id"], default["name"]
        else:
            update.pop("settle_account_id", None); update.pop("settle_account_name", None)
            op["$unset"] = {"settle_account_id": "", "settle_account_name": ""}
    elif update.get("settle_account_id"):
        # legacy single-ledger save → make sure it is part of the linked list too
        cur = await _settle_accounts()
        if all(a["id"] != update["settle_account_id"] for a in cur):
            cur.append({"id": update["settle_account_id"], "name": update.get("settle_account_name") or ""})
        update["settle_accounts"] = cur
    await db.settings.update_one({"id": "default"}, op, upsert=True)
    return await db.settings.find_one({"id": "default"}, {"_id": 0})


# ---------- BACKUP / RESTORE ----------
BACKUP_EXCLUDE = {"backup_key"}  # encryption key never travels inside the file it protects
BACKUP_COLLECTIONS = ["account_groups", "accounts", "parties", "items", "bills", "rokad",
                      "journal", "settings", "inward", "gst_returns", "dos_journal",
                      "fiscal_years", "archive_bills", "archive_rokad", "archive_journal",
                      "archive_dos_journal", "archive_inward", "archive_gst_returns", "users"]  # minimum set; dump is dynamic


async def _backup_collection_names() -> list:
    """Every collection in the DB (so nothing is ever left out) + the known set, minus excluded."""
    names = set(BACKUP_COLLECTIONS)
    for n in await db.list_collection_names():
        if not n.startswith("system.") and re.fullmatch(r"[a-z][a-z0-9_]*", n):
            names.add(n)
    return sorted(n for n in names if n not in BACKUP_EXCLUDE)
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR") or (ROOT_DIR / "backups"))
BACKUP_KEEP = 30  # default retention (files) — user can change via /backup/retention

RETENTION_FILE_CHOICES = (0, 10, 20, 30, 60, 100)   # 0 = kabhi delete na karo
RETENTION_DAY_CHOICES = (0, 7, 15, 30, 60, 90, 180, 365)  # 0 = off


async def _retention() -> dict:
    s = await db.settings.find_one({"id": "default"}, {"_id": 0, "backup_keep_files": 1, "backup_keep_days": 1}) or {}
    kf, kd = s.get("backup_keep_files"), s.get("backup_keep_days")
    return {"keep_files": BACKUP_KEEP if kf is None else int(kf), "keep_days": 0 if kd is None else int(kd)}


def _prune_backups(policy: dict, protect: Optional[Path] = None) -> list:
    """Auto-delete old backups: beyond keep_files (newest kept) and/or older than keep_days. Newest file always survives."""
    files = sorted(_all_backup_files(), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return []
    keep_files, keep_days = int(policy.get("keep_files") or 0), int(policy.get("keep_days") or 0)
    cutoff = datetime.now().timestamp() - keep_days * 86400 if keep_days > 0 else None
    doomed = []
    for idx, p in enumerate(files):
        if idx == 0 or p == protect:
            continue
        if (keep_files > 0 and idx >= keep_files) or (cutoff is not None and p.stat().st_mtime < cutoff):
            doomed.append(p)
    for p in doomed:
        p.unlink(missing_ok=True)
    if doomed:
        logger.info(f"Backup auto-delete: removed {len(doomed)} old file(s)")
    return [p.name for p in doomed]


class RetentionIn(BaseModel):
    keep_files: int = Field(ge=0, le=1000)
    keep_days: int = Field(ge=0, le=3650)


@api.get("/backup/retention")
async def backup_retention(current=Depends(get_current_user)):
    files = _all_backup_files()
    oldest = min((p.stat().st_mtime for p in files), default=None)
    return {**(await _retention()), "file_choices": RETENTION_FILE_CHOICES, "day_choices": RETENTION_DAY_CHOICES,
            "count": len(files), "total_size": sum(p.stat().st_size for p in files),
            "oldest_at": datetime.fromtimestamp(oldest, tz=timezone.utc).isoformat() if oldest else None}


@api.put("/backup/retention")
async def set_backup_retention(body: RetentionIn, current=Depends(get_current_user)):
    await db.settings.update_one({"id": "default"}, {"$set": {"backup_keep_files": body.keep_files, "backup_keep_days": body.keep_days}}, upsert=True)
    deleted = _prune_backups(body.model_dump())
    return {"ok": True, "deleted": deleted, **(await backup_retention(current))}


async def _dump_all() -> dict:
    data = {"exported_at": now_iso(), "version": "1.3", "app": "9x Vyapari", "data": {}}
    for c in await _backup_collection_names():
        data["data"][c] = await db[c].find({}, {"_id": 0}).to_list(500000)
    return data


async def _restore_all(data: dict) -> dict:
    """DB becomes exactly the backup: every non-excluded collection is wiped, then the file's collections are loaded.
    `users` is kept when an older backup has none (never lock the user out)."""
    incoming = {c: (docs or []) for c, docs in (data or {}).items()
                if c not in BACKUP_EXCLUDE and re.fullmatch(r"[a-z][a-z0-9_]*", c) and isinstance(docs, list)}
    summary = {}
    for c in await _backup_collection_names():
        if c == "users" and "users" not in incoming:
            continue
        await db[c].delete_many({})
    for c, docs in incoming.items():
        if docs:
            await db[c].insert_many(docs)
        summary[c] = len(docs)
    return summary


def _backup_file_info(p: Path) -> dict:
    st = p.stat()
    info = {"name": p.name, "size": st.st_size, "encrypted": p.suffix == ".vbk", "hint": "",
            "created_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()}
    if info["encrypted"]:
        try:
            with p.open("rb") as fh:
                info["hint"] = bkc.parse_header(fh.read(320))["hint"]
        except Exception:
            pass
    return info


# ---------- BACKUP PASSWORD (every .vbk needs this software + this password) ----------
async def _backup_key() -> Optional[dict]:
    return await db.backup_key.find_one({"id": "backup"}, {"_id": 0})


def _backup_key_out(k: Optional[dict]) -> dict:
    return {"configured": bool(k), "hint": (k or {}).get("hint", ""),
            "set_at": (k or {}).get("set_at"), "changed_at": (k or {}).get("changed_at")}


def _plain_backup_files() -> list:
    return sorted(BACKUP_DIR.glob("vyapari-backup_*.json")) if BACKUP_DIR.is_dir() else []


def _encrypt_plain_backups(k: dict) -> int:
    """One-time migration: old plain JSON backups → .vbk (same timestamp), JSON deleted."""
    import json
    done = 0
    for p in _plain_backup_files():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            st = p.stat()
            target = p.with_suffix(".vbk")
            target.write_bytes(bkc.pack(data, bytes.fromhex(k["key"]), bytes.fromhex(k["salt"]), k.get("hint", "")))
            os.utime(target, (st.st_atime, st.st_mtime))
            p.unlink()
            done += 1
        except Exception as e:  # keep the plain file rather than lose a backup
            logger.warning(f"Backup encrypt failed for {p.name}: {e}")
    if done:
        logger.info(f"Encrypted {done} plain backup file(s) → .vbk")
    return done


class BackupPasswordIn(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)
    current_password: Optional[str] = ""   # when changing
    login_password: Optional[str] = ""     # forgot flow: prove identity with the login password instead
    hint: Optional[str] = Field(default="", max_length=120)


@api.get("/backup/security")
async def backup_security(current=Depends(get_current_user)):
    return {**_backup_key_out(await _backup_key()), "plain_files": len(_plain_backup_files()), "folder": str(BACKUP_DIR)}


@api.get("/backup/contents")
async def backup_contents(current=Depends(get_current_user)):
    """What goes into every backup file: every collection + document count (users included, encryption key excluded)."""
    names = await _backup_collection_names()
    return {"collections": {c: await db[c].count_documents({}) for c in names}, "excluded": sorted(BACKUP_EXCLUDE)}


@api.post("/backup/password")
async def set_backup_password(body: BackupPasswordIn, current=Depends(get_current_user)):
    k = await _backup_key()
    if k:
        if body.current_password:
            if not bkc.key_matches(body.current_password, bytes.fromhex(k["salt"]), bytes.fromhex(k["key"])):
                raise HTTPException(400, "Purana backup password galat hai")
        elif body.login_password:
            user = await db.users.find_one({"id": current["id"]})
            if not user or not verify_password(body.login_password, user["password_hash"]):
                raise HTTPException(400, "Login password galat hai")
        else:
            raise HTTPException(400, "Purana backup password (ya login password) dein")
    if body.new_password == DEFAULT_ADMIN_PASSWORD:
        raise HTTPException(400, "Default password backup ke liye allowed nahi hai")
    salt = os.urandom(16)
    doc = {"id": "backup", "salt": salt.hex(), "key": bkc.derive_key(body.new_password, salt).hex(),
           "hint": (body.hint or "").strip(), "set_at": (k or {}).get("set_at") or now_iso(), "changed_at": now_iso()}
    await db.backup_key.replace_one({"id": "backup"}, doc, upsert=True)
    migrated = _encrypt_plain_backups(doc)
    return {"ok": True, **_backup_key_out(doc), "migrated": migrated, "changed": bool(k)}


async def _require_backup_key() -> dict:
    k = await _backup_key()
    if not k:
        raise HTTPException(409, "Pehle Backup Password set karein (Settings → Backup Password). Bina iske backup nahi ban sakta.")
    return k


async def _encrypted_dump() -> bytes:
    k = await _require_backup_key()
    return bkc.pack(await _dump_all(), bytes.fromhex(k["key"]), bytes.fromhex(k["salt"]), k.get("hint", ""))


def _decode_backup(blob: bytes, password: str, name: str = "") -> dict:
    """.vbk → needs password; legacy plain .json still restorable."""
    import json
    if bkc.is_vbk(blob):
        if not password:
            raise HTTPException(400, "Backup password dein")
        try:
            return bkc.unpack(blob, password)
        except (bkc.WrongPassword, bkc.NotVbk) as e:
            raise HTTPException(400, str(e))
    try:
        return json.loads(blob.decode("utf-8"))
    except Exception:
        raise HTTPException(400, f"{name or 'File'} 9x Vyapari backup nahi hai")


@api.get("/backup")
async def backup(current=Depends(get_current_user)):
    """Download full database (except users) as an encrypted .vbk file."""
    blob = await _encrypted_dump()
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    return Response(content=blob, media_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="vyapari-backup_{stamp}_download.vbk"'})


async def _restore_with_safety(data: dict, name: str) -> dict:
    """Pre-restore safety backup of the current state (so a wrong file never loses today's work), then restore."""
    safety = None
    if await _backup_key():
        try:
            safety = (await _write_backup("pre-restore"))["name"]
        except Exception as e:
            logger.warning(f"Pre-restore safety backup failed: {e}")
    summary = await _restore_all(data.get("data") or {})
    return {"ok": True, "restored": summary, "name": name, "safety_backup": safety}


@api.post("/restore")
async def restore(file: UploadFile = File(...), password: str = Form(""), current=Depends(get_current_user)):
    """Restore from an uploaded .vbk (password) or legacy .json backup. DB becomes exactly the backup."""
    data = _decode_backup(await file.read(), password, file.filename or "")
    return await _restore_with_safety(data, file.filename or "")


async def _write_backup(reason: str) -> dict:
    blob = await _encrypted_dump()
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    target = BACKUP_DIR / f"vyapari-backup_{stamp}_{reason}.vbk"
    target.write_bytes(blob)
    deleted = _prune_backups(await _retention(), protect=target)
    counts = {c: await db[c].count_documents({}) for c in await _backup_collection_names()}
    return {"ok": True, "folder": str(BACKUP_DIR), **_backup_file_info(target), "counts": counts, "deleted": deleted}


def _all_backup_files() -> list:
    if not BACKUP_DIR.is_dir():
        return []
    return [p for p in BACKUP_DIR.iterdir() if p.name.startswith("vyapari-backup_") and p.suffix in (".vbk", ".json")]


@api.post("/backup/auto")
async def backup_auto(payload: Optional[dict] = None, current=Depends(get_current_user)):
    """Write a timestamped encrypted backup to BACKUP_DIR (used on logout). Keeps last BACKUP_KEEP files."""
    reason = "".join(ch for ch in str((payload or {}).get("reason") or "manual") if ch.isalnum() or ch in "-_")[:40]
    return await _write_backup(reason or "manual")


@api.get("/backup/files")
async def backup_files(current=Depends(get_current_user)):
    files = sorted(_all_backup_files(), key=lambda p: p.stat().st_mtime, reverse=True)
    return {"folder": str(BACKUP_DIR), "files": [_backup_file_info(p) for p in files]}


@api.post("/backup/restore-file")
async def backup_restore_file(payload: dict, current=Depends(get_current_user)):
    name = Path(str(payload.get("name") or "")).name
    target = BACKUP_DIR / name
    if not name.startswith("vyapari-backup_") or target.suffix not in (".vbk", ".json") or not target.is_file():
        raise HTTPException(404, "Backup file nahi mili")
    data = _decode_backup(target.read_bytes(), str(payload.get("password") or ""), name)
    return await _restore_with_safety(data, name)


# ---------- YEAR-END (Naya Saal / Carry Forward) ----------
ARCHIVE_COLLECTIONS = ["bills", "rokad", "journal", "dos_journal", "inward", "gst_returns"]
YEAREND_CONFIRM = "NAYA SAAL"


class YearEndCloseIn(BaseModel):
    new_fy_start: str
    new_fy_end: str
    confirm: str = ""


def _shift_year(iso: str) -> str:
    d = datetime.fromisoformat(iso).date()
    try:
        return d.replace(year=d.year + 1).isoformat()
    except ValueError:  # 29 Feb
        return d.replace(year=d.year + 1, day=28).isoformat()


async def _yearend_snapshot():
    """Closing balance of every ledger. Asset/liability ledgers carry forward; income/expense reset to 0."""
    groups = {g["id"]: g for g in await db.account_groups.find({}, {"_id": 0}).to_list(500)}

    def nature_of(doc):
        g = groups.get(doc.get("group_id"))
        return g["nature"] if g else "asset"

    def row(doc, closing):
        nat = nature_of(doc)
        carry = nat in ("asset", "liability")
        return {"id": doc["id"], "code": doc.get("code") or 0, "name": doc.get("name", ""), "nature": nat,
                "opening_before": float(doc.get("opening_balance") or 0), "closing": closing,
                "carry": carry, "new_opening": closing if carry else 0.0}

    _plist = await db.parties.find({}, {"_id": 0}).sort("code", 1).to_list(50000)
    _bals = await _bulk_party_balances(parties=_plist)
    parties = [row(p, _bals.get(p["id"], float(p.get("opening_balance") or 0))) for p in _plist]
    accounts = [row(a, await _compute_account_balance(a["id"], a.get("opening_balance", 0.0)))
                for a in await db.accounts.find({}, {"_id": 0}).sort("code", 1).to_list(5000)]
    counts = {c: await db[c].count_documents({}) for c in ARCHIVE_COLLECTIONS}
    return parties, accounts, counts


@api.get("/year-end/preview")
async def yearend_preview(current=Depends(get_current_user)):
    s = await get_settings(current)
    parties, accounts, counts = await _yearend_snapshot()
    pending_bills = await db.bills.count_documents({"$expr": {"$lt": [{"$ifNull": ["$payment_received", 0]}, "$total"]}})
    rows = parties + accounts
    return {
        "fy_start": s.get("fy_start"), "fy_end": s.get("fy_end"),
        "suggested": {"fy_start": _shift_year(s["fy_start"]), "fy_end": _shift_year(s["fy_end"])},
        "counts": counts, "pending_bills": pending_bills,
        "parties": parties, "accounts": accounts,
        "totals": {
            "carry_dr": round(sum(r["new_opening"] for r in rows if r["new_opening"] > 0), 2),
            "carry_cr": round(sum(-r["new_opening"] for r in rows if r["new_opening"] < 0), 2),
            "reset_count": sum(1 for r in rows if not r["carry"] and r["closing"] != 0),
        },
        "confirm_text": YEAREND_CONFIRM,
    }


@api.post("/year-end/close")
async def yearend_close(body: YearEndCloseIn, current=Depends(get_current_user)):
    if body.confirm.strip().upper() != YEAREND_CONFIRM:
        raise HTTPException(400, f'Confirm karne ke liye "{YEAREND_CONFIRM}" likhein')
    s = await get_settings(current)
    try:
        ns, ne = datetime.fromisoformat(body.new_fy_start).date(), datetime.fromisoformat(body.new_fy_end).date()
    except ValueError:
        raise HTTPException(400, "Nayi FY dates galat hain")
    if ns >= ne:
        raise HTTPException(400, "FY end, FY start ke baad hona chahiye")
    if body.new_fy_start <= (s.get("fy_end") or ""):
        raise HTTPException(400, "Naya saal purane saal ke khatam hone ke baad shuru hona chahiye")

    backup = await _write_backup(f"yearend_{s.get('fy_start')}_{s.get('fy_end')}")
    parties, accounts, counts = await _yearend_snapshot()
    fy_id = str(uuid.uuid4())

    for c in ARCHIVE_COLLECTIONS:
        docs = await db[c].find({}, {"_id": 0}).to_list(500000)
        if docs:
            for d in docs:
                d["fy_id"] = fy_id
            await db[f"archive_{c}"].insert_many(docs)
            await db[c].delete_many({})

    for p in parties:
        await db.parties.update_one({"id": p["id"]}, {"$set": {"opening_balance": p["new_opening"]}})
    for a in accounts:
        await db.accounts.update_one({"id": a["id"]}, {"$set": {"opening_balance": a["new_opening"]}})

    await db.settings.update_one({"id": "default"}, {"$set": {
        "fy_start": body.new_fy_start, "fy_end": body.new_fy_end, "current_date": body.new_fy_start}})

    doc = {"id": fy_id, "fy_start": s.get("fy_start"), "fy_end": s.get("fy_end"),
           "closed_at": now_iso(), "closed_by": current.get("username"), "backup_file": backup["name"],
           "new_fy_start": body.new_fy_start, "new_fy_end": body.new_fy_end,
           "prev_current_date": s.get("current_date"), "counts": counts,
           "parties": parties, "accounts": accounts}
    await db.fiscal_years.insert_one(doc.copy())
    logger.info(f"Year-end closed FY {s.get('fy_start')}..{s.get('fy_end')} -> {body.new_fy_start}")
    return {"ok": True, "fy_id": fy_id, "archived": counts, "backup_file": backup["name"],
            "carried": sum(1 for r in parties + accounts if r["carry"] and r["new_opening"] != 0),
            "new_fy": {"fy_start": body.new_fy_start, "fy_end": body.new_fy_end}}


@api.get("/year-end/history")
async def yearend_history(current=Depends(get_current_user)):
    years = await db.fiscal_years.find({}, {"_id": 0, "parties": 0, "accounts": 0}).sort("closed_at", -1).to_list(200)
    live = {c: await db[c].count_documents({}) for c in ARCHIVE_COLLECTIONS}
    return {"years": years, "undo_possible": bool(years) and not any(live.values()), "live_counts": live}


@api.get("/year-end/{fy_id}")
async def yearend_detail(fy_id: str, current=Depends(get_current_user)):
    doc = await db.fiscal_years.find_one({"id": fy_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fiscal year nahi mila")
    return doc


@api.post("/year-end/undo")
async def yearend_undo(current=Depends(get_current_user)):
    """Reverse the most recent year-end close. Only allowed while the new year has no entries."""
    last = await db.fiscal_years.find_one({}, {"_id": 0}, sort=[("closed_at", -1)])
    if not last:
        raise HTTPException(404, "Koi closed saal nahi hai")
    live = {c: await db[c].count_documents({}) for c in ARCHIVE_COLLECTIONS}
    if any(live.values()):
        busy = ", ".join(f"{k}: {v}" for k, v in live.items() if v)
        raise HTTPException(400, f"Naye saal me entries ho chuki hain ({busy}). Undo possible nahi.")
    for c in ARCHIVE_COLLECTIONS:
        docs = await db[f"archive_{c}"].find({"fy_id": last["id"]}, {"_id": 0}).to_list(500000)
        for d in docs:
            d.pop("fy_id", None)
        if docs:
            await db[c].insert_many(docs)
        await db[f"archive_{c}"].delete_many({"fy_id": last["id"]})
    for p in last.get("parties", []):
        await db.parties.update_one({"id": p["id"]}, {"$set": {"opening_balance": p["opening_before"]}})
    for a in last.get("accounts", []):
        await db.accounts.update_one({"id": a["id"]}, {"$set": {"opening_balance": a["opening_before"]}})
    await db.settings.update_one({"id": "default"}, {"$set": {
        "fy_start": last["fy_start"], "fy_end": last["fy_end"],
        "current_date": last.get("prev_current_date") or last["fy_end"]}})
    await db.fiscal_years.delete_one({"id": last["id"]})
    return {"ok": True, "restored_fy": {"fy_start": last["fy_start"], "fy_end": last["fy_end"]},
            "restored_counts": last.get("counts", {})}


@api.get("/reports/opening-balances")
async def opening_balances(fy_id: Optional[str] = None, as_on: Optional[str] = None, current=Depends(get_current_user)):
    """DOS-style Balance Sheet: live balances as on a date (opening + entries till then),
    or the carried-forward opening snapshot of a closed year."""
    s = await get_settings(current)
    groups = sorted(await db.account_groups.find({}, {"_id": 0}).to_list(500), key=lambda g: g.get("fcode") or 0)
    party_group = {p["id"]: p.get("group_id") for p in await db.parties.find({}, {"_id": 0, "id": 1, "group_id": 1}).to_list(20000)}
    acc_group = {a["id"]: a.get("group_id") for a in await db.accounts.find({}, {"_id": 0, "id": 1, "group_id": 1}).to_list(5000)}

    ledgers = []
    if fy_id:
        fy = await db.fiscal_years.find_one({"id": fy_id}, {"_id": 0})
        if not fy:
            raise HTTPException(404, "Fiscal year nahi mila")
        as_on, fy_text = fy["new_fy_start"], f"{fy['new_fy_start']} to {fy['new_fy_end']}"
        for r in fy.get("parties", []):
            ledgers.append({"id": r["id"], "code": r.get("code") or 0, "name": r.get("name", ""), "group_id": party_group.get(r["id"]),
                            "balance": float(r.get("new_opening") or 0), "kind": "party"})
        for r in fy.get("accounts", []):
            ledgers.append({"id": r["id"], "code": r.get("code") or 0, "name": r.get("name", ""), "group_id": acc_group.get(r["id"]),
                            "balance": float(r.get("new_opening") or 0), "kind": "account"})
    else:
        if as_on and not _is_date(as_on):
            raise HTTPException(400, "as_on date YYYY-MM-DD format me do")
        as_on = as_on or datetime.now().date().isoformat()  # local date of the machine running the app
        fy_text = f"{s.get('fy_start')} to {s.get('fy_end')}"
        _plist = await db.parties.find({}, {"_id": 0}).to_list(50000)
        _bals = await _bulk_party_balances(as_on, parties=_plist)
        for p in _plist:
            ledgers.append({"id": p["id"], "code": p.get("code") or 0, "name": p.get("name", ""), "group_id": p.get("group_id"),
                            "balance": _bals.get(p["id"], float(p.get("opening_balance") or 0)), "kind": "party"})
        for a in await db.accounts.find({}, {"_id": 0}).to_list(5000):
            ledgers.append({"id": a["id"], "code": a.get("code") or 0, "name": a.get("name", ""), "group_id": a.get("group_id"),
                            "balance": await _compute_account_balance(a["id"], float(a.get("opening_balance") or 0), as_on), "kind": "account"})

    ledgers = [l for l in ledgers if abs(l["balance"]) >= 0.005]
    sections = []
    seen = set()
    for g in groups + [{"id": None, "name": "OTHER / UNGROUPED", "nature": "", "fcode": "", "lcode": ""}]:
        rows = sorted([l for l in ledgers if (l["group_id"] == g["id"]) or (g["id"] is None and l["group_id"] not in seen)],
                      key=lambda x: (x["code"], x["name"]))
        seen.add(g["id"])
        if not rows:
            continue
        sections.append({"group_name": g["name"], "nature": g.get("nature", ""), "fcode": g.get("fcode"), "lcode": g.get("lcode"),
                         "rows": rows,
                         "dr_total": round(sum(r["balance"] for r in rows if r["balance"] > 0), 2),
                         "cr_total": round(sum(-r["balance"] for r in rows if r["balance"] < 0), 2)})
    grand_dr = round(sum(sec["dr_total"] for sec in sections), 2)
    grand_cr = round(sum(sec["cr_total"] for sec in sections), 2)
    return {"firm_name": s.get("firm_name") or "9x Vyapari", "as_on": as_on, "fy_text": fy_text, "fy_id": fy_id,
            "sections": sections, "grand_dr": grand_dr, "grand_cr": grand_cr,
            "difference": round(grand_dr - grand_cr, 2), "count": len(ledgers),
            "settle_account_id": s.get("settle_account_id"), "settle_account_ids": [a["id"] for a in await _settle_accounts()]}


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


# ---------- OUTSTANDING ----------
async def _settled_now_map() -> dict:
    """party_id → latest Account Settled date, only for parties whose ledger stands at 0 TODAY (cleared accounts)."""
    sids = await _settle_ids()
    upto: dict = {}
    async for j in db.journal.find({"settles_rokad_id": {"$exists": True}}, {"_id": 0, "date": 1, "lines.account_id": 1}):
        for ln in j.get("lines", []):
            aid = ln.get("account_id")
            if aid and aid not in sids:
                upto[aid] = max(upto.get(aid, ""), (j.get("date") or "")[:10])
    out = {}
    for pid, d in upto.items():
        p = await db.parties.find_one({"id": pid}, {"_id": 0, "opening_balance": 1})
        if p is not None and abs(await _compute_party_balance(pid, float(p.get("opening_balance") or 0))) < 0.005:
            out[pid] = d
    return out


@api.get("/reports/outstanding")
async def outstanding_report(as_on: Optional[str] = None, side: str = "all", min_amount: float = 0.0,
                             sort: str = "amount", hide_settled: bool = False, current=Depends(get_current_user)):
    """Collection-round list: every party with a pending Dr/Cr balance as on a date, grouped by account group.
    side = dr (lena hai) | cr (dena hai) | all. Cash/bank ledgers excluded.
    hide_settled: skip parties that have since been cleared via Account Settled (ledger 0 today)."""
    s = await get_settings(current)
    settled_now = await _settled_now_map()
    settled_hidden = 0
    if as_on and not _is_date(as_on):
        raise HTTPException(400, "as_on date YYYY-MM-DD format me do")
    as_on = as_on or datetime.now().date().isoformat()
    if side not in ("dr", "cr", "all"):
        raise HTTPException(400, "side dr | cr | all")
    groups = {g["id"]: g for g in await db.account_groups.find({}, {"_id": 0}).to_list(500)}
    cash_gids = {gid for gid, g in groups.items() if re.search(r"cash|bank", g.get("name", ""), re.I)}

    # last transaction date per party (one aggregate per collection, not per party)
    last_txn: dict = {}
    def _note(pid, d):
        if pid and d and d <= as_on and d > last_txn.get(pid, ""):
            last_txn[pid] = d
    for coll in (db.bills, db.rokad):
        async for r in coll.aggregate([{"$match": {"date": {"$lte": as_on}}}, {"$group": {"_id": "$party_id", "d": {"$max": "$date"}}}]):
            _note(r["_id"], r["d"])
    async for r in db.journal.aggregate([{"$match": {"date": {"$lte": as_on}}}, {"$unwind": "$lines"},
                                         {"$group": {"_id": "$lines.account_id", "d": {"$max": "$date"}}}]):
        _note(r["_id"], r["d"])
    for fld in ("$party_id", "$counter_party_id"):
        async for r in db.dos_journal.aggregate([{"$match": {"date": {"$lte": as_on}}}, {"$group": {"_id": fld, "d": {"$max": "$date"}}}]):
            _note(r["_id"], r["d"])

    as_on_date = datetime.fromisoformat(as_on).date()
    by_group: dict = {}
    _plist = await db.parties.find({}, {"_id": 0}).to_list(50000)
    _bals = await _bulk_party_balances(as_on, parties=_plist)
    for p in _plist:
        if p.get("group_id") in cash_gids:
            continue
        bal = _bals.get(p["id"], float(p.get("opening_balance") or 0))
        if abs(bal) < 0.005 or abs(bal) < min_amount:
            continue
        if (side == "dr" and bal <= 0) or (side == "cr" and bal >= 0):
            continue
        if hide_settled and p["id"] in settled_now:
            settled_hidden += 1
            continue
        lt = last_txn.get(p["id"])
        days = (as_on_date - datetime.fromisoformat(lt).date()).days if lt else None
        g = groups.get(p.get("group_id"), {})
        key = p.get("group_id") or "_none"
        sec = by_group.setdefault(key, {"group_id": key, "group_name": g.get("name") or p.get("group_name") or "OTHER / BINA GROUP",
                                         "fcode": g.get("fcode") or 9999, "rows": [], "dr_total": 0.0, "cr_total": 0.0})
        sec["rows"].append({"id": p["id"], "code": p.get("code") or 0, "name": p.get("name", ""), "place": p.get("place", ""),
                            "phone": p.get("phone", ""), "balance": round(bal, 2), "dr_cr": "Cr" if bal > 0 else "Dr",   # passbook: lena = Cr
                            "last_txn": lt, "days": days, "settled_upto": settled_now.get(p["id"])})
        if bal > 0:
            sec["dr_total"] += bal
        else:
            sec["cr_total"] += -bal

    sections = sorted(by_group.values(), key=lambda x: (x["fcode"], x["group_name"]))
    for sec in sections:
        sec["rows"].sort(key=(lambda r: -abs(r["balance"])) if sort == "amount" else (lambda r: (r["name"].upper(), r["code"])))
        sec["dr_total"], sec["cr_total"] = round(sec["dr_total"], 2), round(sec["cr_total"], 2)
    return {"firm_name": s.get("firm_name") or "9x Vyapari", "as_on": as_on, "side": side, "min_amount": min_amount, "sort": sort,
            "sections": sections, "count": sum(len(x["rows"]) for x in sections),
            "grand_dr": round(sum(x["dr_total"] for x in sections), 2), "grand_cr": round(sum(x["cr_total"] for x in sections), 2),
            "hide_settled": hide_settled, "settled_hidden": settled_hidden}


@api.get("/reports/trial-balance")
async def trial_balance(current=Depends(get_current_user)):
    """Trial Balance grouped by Account Group, with Dr / Cr columns.
    Combines parties (sales/purchase parties) + accounts (cash/bank etc.)."""
    groups = await db.account_groups.find({}, {"_id": 0}).to_list(500)
    groups_by_id = {g["id"]: g for g in groups}

    # Build all ledgers (parties + accounts) with computed balance
    ledgers = []

    # Parties (treat all as ledgers under their group)
    _plist = await db.parties.find({}, {"_id": 0}).to_list(50000)
    _bals = await _bulk_party_balances(parties=_plist)
    for p in _plist:
        bal = _bals.get(p["id"], float(p.get("opening_balance") or 0))
        gid = p.get("group_id")
        g = groups_by_id.get(gid) if gid else None
        ledgers.append({
            "id": p["id"],
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
            "id": a["id"],
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
    st = await db.settings.find_one({"id": "default"}, {"_id": 0, "settle_account_id": 1}) or {}
    return {"sections": sections, "grand_dr": round(grand_dr, 2), "grand_cr": round(grand_cr, 2),
            "settle_account_id": st.get("settle_account_id"), "settle_account_ids": [a["id"] for a in await _settle_accounts()]}


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
class RenumberIn(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    start: int = Field(default=1, ge=1, le=10_000_000)
    apply: bool = False  # false → preview only


def _vno_num(v) -> int:
    try:
        return int(str(v or "").strip())
    except ValueError:
        return 0


@api.post("/cash-accounts/{pid}/renumber-vouchers")
async def renumber_vouchers(pid: str, body: RenumberIn, current=Depends(get_current_user)):
    """Date-wise V.No. for one cash/bank a/c: entries sorted by date (then entry order) get start, start+1, …
    Preview (apply=false) returns the change list; apply=true writes it after a safety backup."""
    for d in (body.date_from, body.date_to):
        if d and not _is_date(d):
            raise HTTPException(400, "Date YYYY-MM-DD format me do")
    acc = await db.parties.find_one({"id": pid}, {"_id": 0, "name": 1}) or await db.accounts.find_one({"id": pid}, {"_id": 0, "name": 1})
    if not acc:
        raise HTTPException(404, "Cash/Bank account nahi mila")
    q: dict = {"cash_account_id": pid}
    if body.date_from or body.date_to:
        q["date"] = {**({"$gte": body.date_from} if body.date_from else {}), **({"$lte": body.date_to} if body.date_to else {})}
    rows = await db.rokad.find(q, {"_id": 0, "id": 1, "date": 1, "created_at": 1, "voucher_no": 1, "party_name": 1, "amount": 1, "type": 1}).to_list(100000)
    rows.sort(key=lambda r: ((r.get("date") or ""), (r.get("created_at") or ""), _vno_num(r.get("voucher_no"))))
    changes = []
    n = body.start
    for r in rows:
        new = str(n)
        if str(r.get("voucher_no") or "") != new:
            changes.append({"id": r["id"], "date": r.get("date"), "party_name": r.get("party_name", ""), "type": r.get("type"),
                            "amount": r.get("amount"), "old": str(r.get("voucher_no") or ""), "new": new})
        n += 1
    out = {"account": acc["name"], "total": len(rows), "changed": len(changes), "first_no": body.start,
           "last_no": body.start + len(rows) - 1 if rows else None, "sample": changes[:12], "applied": False, "safety_backup": None}
    if body.apply and changes:
        if await _backup_key():
            try:
                out["safety_backup"] = (await _write_backup("renumber"))["name"]
            except Exception as e:
                logger.warning(f"Renumber safety backup failed: {e}")
        ts = now_iso()
        for c in changes:
            await db.rokad.update_one({"id": c["id"]}, {"$set": {"voucher_no": c["new"], "updated_at": ts}})
        out["applied"] = True
        logger.info(f"Renumbered {len(changes)} vouchers for {acc['name']} ({body.date_from}..{body.date_to})")
    return out


@api.get("/cash-accounts/{pid}/next-voucher")
async def next_cash_voucher(pid: str, current=Depends(get_current_user)):
    """Next voucher number for a cash/bank ledger — FoxPro per-account numbering (every cash a/c has its own seq)."""
    return {"next_voucher": await _next_voucher(pid)}


# ---------- DUE BILLS NOTIFICATIONS ----------
@api.get("/summary/due-bills")
async def due_bills(current=Depends(get_current_user)):
    """Returns bills with balance > 0 grouped by due-date proximity:
       overdue, due_today, due_soon (within 7 days), upcoming (8-30 days)."""
    today = datetime.now(timezone.utc).date()
    today_s = today.isoformat()

    bills = await db.bills.find(
        {"balance": {"$gt": 0}, "due_date": {"$exists": True, "$ne": ""}},
        {"_id": 0}
    ).sort("due_date", 1).to_list(5000)

    overdue, due_today, due_soon, upcoming = [], [], [], []
    for b in bills:
        d = (b.get("due_date") or "").strip()
        if not d or len(d) < 10:
            continue
        d = d[:10]
        try:
            dd = datetime.fromisoformat(d).date()
        except Exception:
            continue
        days_diff = (dd - today).days
        item = {
            "id": b["id"], "bill_no": b.get("bill_no", ""),
            "bill_type": b.get("bill_type", ""),
            "date": b.get("date", ""),
            "due_date": d,
            "party_id": b.get("party_id", ""),
            "party_name": b.get("party_name", ""),
            "total": b.get("total", 0),
            "payment_received": b.get("payment_received", 0),
            "balance": b.get("balance", 0),
            "days_diff": days_diff,
        }
        if days_diff < 0:
            item["status"] = "overdue"
            overdue.append(item)
        elif days_diff == 0:
            item["status"] = "today"
            due_today.append(item)
        elif days_diff <= 7:
            item["status"] = "soon"
            due_soon.append(item)
        elif days_diff <= 30:
            item["status"] = "upcoming"
            upcoming.append(item)

    total_overdue_amt = sum(b["balance"] for b in overdue)
    total_today_amt = sum(b["balance"] for b in due_today)
    total_soon_amt = sum(b["balance"] for b in due_soon)

    return {
        "today": today_s,
        "overdue": overdue,
        "due_today": due_today,
        "due_soon": due_soon,
        "upcoming": upcoming,
        "totals": {
            "overdue_count": len(overdue),
            "overdue_amount": round(total_overdue_amt, 2),
            "today_count": len(due_today),
            "today_amount": round(total_today_amt, 2),
            "soon_count": len(due_soon),
            "soon_amount": round(total_soon_amt, 2),
        },
    }


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
            voucher_no = str(r.get("TR_REF_NO") or "").strip()
            # Idempotency: same (cash_account, voucher, type, date, amount) is same entry
            dedup_key = {
                "imported_from": "cashbook",
                "cash_account_id": (cash_party["id"] if cash_party else None),
                "voucher_no": voucher_no,
                "type": entry_type,
                "date": str(date),
                "amount": round(amount, 2),
            }
            doc = {
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
                "voucher_no": voucher_no,
                "chq_no": chq_no,
                "imported_from": "cashbook",
            }
            existing = await db.rokad.find_one(dedup_key)
            if existing:
                await db.rokad.update_one({"id": existing["id"]}, {"$set": doc})
            else:
                doc["id"] = str(uuid.uuid4())
                doc["created_at"] = now_iso()
                await db.rokad.insert_one(doc)
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
            }
            # Idempotency on (lot_no, date, cold_storage_id, ref_no)
            dedup_key = {
                "imported_from": "inwards",
                "lot_no": lot_no,
                "date": str(date),
                "cold_storage_id": doc["cold_storage_id"],
                "ref_no": doc["ref_no"],
            }
            existing = await db.inward.find_one(dedup_key)
            if existing:
                await db.inward.update_one({"id": existing["id"]}, {"$set": doc})
            else:
                doc["id"] = str(uuid.uuid4())
                doc["created_at"] = now_iso()
                await db.inward.insert_one(doc)
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


# ---------- AN.DBF (Journal / Transaction history) ----------
@api.post("/import-dbf/journal")
async def import_dbf_journal(payload: dict, current=Depends(get_current_user)):
    """Import AN.DBF / AN1.DBF (journal/transaction history) rows.
    Each row is one side of a double-entry transaction. We store them in
    `dos_journal` collection so the user retains every line; pairing into
    balanced journal entries is done lazily for display.
    """
    rows = payload.get("rows") or []
    source = (payload.get("source") or "AN.DBF").upper()
    if not rows:
        raise HTTPException(400, "Koi rows nahi hain")

    # Pre-fetch parties to attach names
    party_by_code = {}
    async for p in db.parties.find({}, {"_id": 0}):
        if p.get("code"):
            party_by_code[p["code"]] = p

    imported, skipped, errors = 0, 0, []
    for idx, r in enumerate(rows):
        try:
            code = int(r.get("TR_GL_CODE") or 0) or None
            # Counter-party code is in TR_GL_CD1 (TR_GL_CD is the cash/bank account)
            counter_code = int(r.get("TR_GL_CD1") or 0) or None
            if counter_code == code:
                counter_code = None  # same as primary, ignore
            d = r.get("TR_DATE")
            if hasattr(d, "isoformat"):
                d = d.isoformat()
            ref = str(r.get("TR_REF_NO") or "").strip()
            dr_amt = float(r.get("TR_AMNT_DB") or 0)
            cr_amt = float(r.get("TR_AMNT_CD") or 0)
            crdb = (r.get("TR_CRDB") or "").strip().upper()
            descr = " ".join(filter(None, [
                (r.get("TR_DESCR") or "").strip(),
                (r.get("TR_DESCR1") or "").strip(),
            ]))
            extra = " ".join(filter(None, [
                (r.get("TR_DESCR2") or "").strip(),
                (r.get("TR_DESCR3") or "").strip(),
            ]))
            party = party_by_code.get(code) if code else None
            counter_party = party_by_code.get(counter_code) if counter_code else None
            sgn = (r.get("SGN") or "").strip().upper()
            doc = {
                "date": str(d or ""),
                "ref_no": ref,
                "code": code,
                "counter_code": counter_code,
                "party_id": (party["id"] if party else None),
                "counter_party_id": (counter_party["id"] if counter_party else None),
                "counter_party_name": (counter_party["name"] if counter_party else ""),
                "account_name": (party["name"] if party else (r.get("GL_NAME") or "")),
                "narration": descr,
                "extra": extra,
                "sgn": sgn,
                "crdb": crdb,
                "debit": dr_amt if crdb == "D" else 0.0,
                "credit": cr_amt if crdb == "C" else 0.0,
                "chq_no": (r.get("CHQ_NO") or "").strip(),
                "weight": float(r.get("WGT") or 0),
                "rate": float(r.get("RATE") or 0),
                "imported_from": source,
                "row_index": idx,
            }
            # Upsert by (source file, row_index) — each row is unique
            key = {"row_index": idx, "imported_from": source}
            existing = await db.dos_journal.find_one(key)
            if existing:
                await db.dos_journal.update_one({"id": existing["id"]}, {"$set": doc})
            else:
                doc["id"] = str(uuid.uuid4())
                doc["created_at"] = now_iso()
                await db.dos_journal.insert_one(doc)
            imported += 1
        except Exception as e:
            errors.append({"ref": r.get("TR_REF_NO"), "error": str(e)})
            skipped += 1
    return {"imported": imported, "skipped": skipped, "errors": errors[:20]}


# ---------- DOS JOURNAL VIEW ----------
@api.get("/dos-journal")
async def list_dos_journal(date_from: Optional[str] = None, date_to: Optional[str] = None,
                            current=Depends(get_current_user)):
    q = {}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    rows = await db.dos_journal.find(q, {"_id": 0}).sort([("date", 1), ("ref_no", 1)]).to_list(5000)
    return rows


# ---------- COMPLETE DOS DATA MIGRATION (one-click) ----------
@api.post("/migrate-dos-data")
async def migrate_dos_data(payload: dict = None, current=Depends(get_current_user)):
    """One-click migration of all DBF data from the configured DOS folder.
    Reads every supported DBF from `/tmp/galla_audit/FOXPRO2/WS2026/`
    and runs the matching import logic in-process.
    """
    import os as _os
    try:
        from dbfread import DBF
    except ImportError:
        raise HTTPException(500, "dbfread not installed")

    dos_root = Path(os.environ.get("DOS_BACKUP_DIR") or (ROOT_DIR / "dos_backup")).resolve()
    requested = (payload or {}).get("folder")
    if requested:  # only sub-folders of the configured DOS backup folder are allowed
        folder = Path(requested).resolve()
        if dos_root not in (folder, *folder.parents):
            raise HTTPException(400, f"Folder sirf DOS backup folder ke andar ho sakta hai: {dos_root}")
    else:
        folder = next((c for c in (dos_root / "FOXPRO2" / "WS2026", dos_root) if c.is_dir()), dos_root)
    folder = str(folder)
    if not _os.path.isdir(folder):
        raise HTTPException(400, f"DOS folder not found: {folder}")

    # Map of DBF filename -> (importer endpoint function, extra payload)
    ORDER = [
        ("LEDGR.DBF",   "ledger",       {}),
        ("PROFIT.DBF",  "items",        {}),
        ("CASHBOOK.DBF","cashbook",     {}),
        ("CASHTEM.DBF", "cashbook",     {}),
        ("INWARDP.DBF", "inward",       {}),
        ("INWARDS.DBF", "inward",       {}),
        ("AAGSTRET.DBF","gst",          {"replace": True}),
        ("TRANSTEM - Copy.DBF", "transactions", {"bill_type": "purchase"}),
        ("TRANSTEM.DBF",        "transactions", {"bill_type": "purchase"}),
        ("AN.DBF",      "journal",      {}),
        ("AN1.DBF",     "journal",      {}),
        ("AN2.DBF",     "journal",      {}),
    ]

    def _read_dbf(path):
        t = DBF(path, lowernames=False, ignore_missing_memofile=True,
                char_decode_errors="ignore")
        out = []
        for r in t:
            row = {}
            for k, v in r.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
                elif isinstance(v, (bytes, bytearray)):
                    row[k] = v.decode("latin-1", errors="ignore")
                else:
                    row[k] = v
            out.append(row)
        return out

    # Importer dispatch — re-uses logic from individual endpoints
    DISPATCH = {
        "ledger":       import_dbf_ledger,
        "items":        import_dbf_items,
        "cashbook":     import_dbf_cashbook,
        "inward":       import_dbf_inward_dbf,
        "gst":          import_dbf_gst,
        "transactions": import_dbf_transactions,
        "journal":      import_dbf_journal,
    }

    report = {"steps": [], "total_imported": 0, "total_skipped": 0, "folder": folder}
    for fname, kind, extra in ORDER:
        path = _os.path.join(folder, fname)
        if not _os.path.exists(path):
            report["steps"].append({"file": fname, "kind": kind, "status": "missing"})
            continue
        try:
            rows = _read_dbf(path)
            if not rows:
                report["steps"].append({"file": fname, "kind": kind, "status": "empty",
                                        "count": 0})
                continue
            body = {"rows": rows, **extra}
            if kind == "journal":
                body["source"] = fname.upper()
            fn = DISPATCH.get(kind)
            if not fn:
                report["steps"].append({"file": fname, "kind": kind, "status": "unsupported"})
                continue
            result = await fn(body, current)
            report["steps"].append({
                "file": fname, "kind": kind, "status": "ok",
                "count": len(rows),
                "imported": result.get("imported", 0),
                "skipped": result.get("skipped", 0),
            })
            report["total_imported"] += result.get("imported", 0)
            report["total_skipped"] += result.get("skipped", 0)
        except Exception as e:
            report["steps"].append({
                "file": fname, "kind": kind, "status": "error",
                "error": str(e)[:300],
            })
    return report


# ---------- ROOT ----------
@api.get("/")
async def root():
    return {"app": "9x Vyapari", "status": "ok", "desktop": bool(os.environ.get("FRONTEND_DIST"))}


@api.post("/desktop/shutdown")
async def desktop_shutdown(request: Request):
    # Called only by the Electron shell (token passed via env) to stop bundled MongoDB gracefully
    token = os.environ.get("DESKTOP_TOKEN")
    if not token or request.headers.get("x-desktop-token") != token:
        raise HTTPException(404, "Not found")
    try:
        await client.admin.command("shutdown", force=True)
    except Exception:
        pass
    return {"ok": True}


from staff import make_staff_router  # noqa: E402  (needs the helpers above)
api.include_router(make_staff_router(db, get_current_user, now_iso, _compute_party_balance, _next_voucher, _next_journal_vno, _is_date, _default_cash_account))

app.include_router(api)

# CORS – cookies + credentials require explicit origins
origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    reason = csrf_block_reason(request.method, request.url.path, request.headers, request.cookies, origins, FRONTEND_URL)
    if reason:
        msg = "Request block hua: origin allowed nahi hai" if reason == "origin" else "Request block hua (CSRF check) – page refresh karke dobara try karein"
        return JSONResponse(status_code=403, content={"detail": msg})
    return await call_next(request)


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

# Desktop mode: serve the built React app from the same origin (set by Electron shell)
FRONTEND_DIST = os.environ.get("FRONTEND_DIST")
if FRONTEND_DIST and Path(FRONTEND_DIST).is_dir():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    _dist = Path(FRONTEND_DIST).resolve()
    if (_dist / "static").is_dir():
        app.mount("/static", StaticFiles(directory=_dist / "static"), name="static")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        target = (_dist / full_path).resolve()
        if full_path and str(target).startswith(str(_dist)) and target.is_file():
            return FileResponse(target)
        return FileResponse(_dist / "index.html")

    logger.info(f"Serving desktop frontend from {_dist}")


@app.on_event("startup")
async def on_start():
    # indexes
    await db.users.create_index("username", unique=True, sparse=True)
    await db.users.create_index("id", unique=True)
    await db.parties.create_index("id", unique=True)
    await db.items.create_index("id", unique=True)
    await db.bills.create_index("id", unique=True)
    await db.rokad.create_index("id", unique=True)
    await db.account_groups.create_index("id", unique=True)
    await db.accounts.create_index("id", unique=True)
    await db.journal.create_index("id", unique=True)
    await db.inward.create_index("id", unique=True)
    # Query indexes — ledger/balance lookups on big DOS-imported books (lakhs of rows) stay fast
    for coll, keys in (("rokad", ["party_id", "cash_account_id", "date", "contra_id"]), ("bills", ["party_id", "date"]),
                       ("journal", ["lines.account_id", "date", "settles_rokad_id"]),
                       ("dos_journal", ["party_id", "counter_party_id", "date"]), ("inward", ["party_id", "item_id", "date"]),
                       ("parties", ["name", "group_id", "code"])):
        for k in keys:
            await db[coll].create_index(k)
    await db.gst_returns.create_index("id", unique=True)
    await db.dos_journal.create_index("id", unique=True)

    # Plain JSON backups left by older versions → encrypt as soon as a backup password exists
    bk = await _backup_key()
    if bk:
        _encrypt_plain_backups(bk)
    elif _plain_backup_files():
        logger.warning("Plain JSON backups found – they will be encrypted once a Backup Password is set")

    # Seed admin only once – never overwrite a password the user changed in-app
    admin_username = _norm_username(os.environ.get("ADMIN_USERNAME", "admin"))
    admin_password = os.environ.get("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)
    legacy_email = os.environ.get("ADMIN_EMAIL", "admin@galla.com").lower()
    existing = await db.users.find_one({"username": admin_username})
    if not existing:
        legacy = await db.users.find_one({"email": legacy_email, "username": {"$exists": False}})
        if legacy:  # migrate old email-based admin to username login
            await db.users.update_one({"id": legacy["id"]}, {"$set": {"username": admin_username}})
            logger.info(f"Migrated admin {legacy_email} -> username '{admin_username}'")
            existing = await db.users.find_one({"username": admin_username})
        else:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "username": admin_username,
                "name": "Admin",
                "password_hash": hash_password(admin_password),
                "role": "admin",
                "must_change_password": admin_password == DEFAULT_ADMIN_PASSWORD,  # first run → force new password
                "created_at": now_iso(),
            })
            logger.info(f"Seeded admin: {admin_username}")
    # Existing installs: still on the well-known default password → force a change at next login
    if existing and "must_change_password" not in existing:
        weak = not existing.get("password_changed_at") and verify_password(DEFAULT_ADMIN_PASSWORD, existing["password_hash"])
        await db.users.update_one({"id": existing["id"]}, {"$set": {"must_change_password": weak}})
        if weak:
            logger.warning("Admin is using the default password – password change will be required at login")

    # Seed sample galla items ONLY on the very first run (flag in db.meta) — never re-create after the user deletes them
    if not await db.meta.find_one({"key": "items_seeded"}):
        fresh_install = (await db.items.count_documents({}) == 0 and await db.parties.count_documents({}) == 0
                         and await db.bills.count_documents({}) == 0)
        if fresh_install:
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
        await db.meta.update_one({"key": "items_seeded"}, {"$set": {"key": "items_seeded", "at": now_iso()}}, upsert=True)

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

    # Backfill: rokad entries saved without a cash/bank account belong to the default CASH IN HAND
    cash = await _default_cash_account()
    if cash:
        res = await db.rokad.update_many(
            {"$or": [{"cash_account_id": None}, {"cash_account_id": ""}, {"cash_account_id": {"$exists": False}}]},
            {"$set": {"cash_account_id": cash["id"], "cash_account_name": cash["name"]}})
        if res.modified_count:
            logger.info(f"Linked {res.modified_count} rokad entries to default cash account {cash['name']}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
