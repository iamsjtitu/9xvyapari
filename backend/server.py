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
    type: Literal["customer", "supplier", "both"] = "both"
    opening_balance: float = 0.0  # +ve = party owes us (udhaar), -ve = we owe party

class PartyOut(PartyIn):
    id: str
    created_at: str

class ItemIn(BaseModel):
    name: str
    unit: str = "Quintal"  # Quintal, Kg, Bag
    rate: float = 0.0
    hsn: Optional[str] = ""

class ItemOut(ItemIn):
    id: str
    created_at: str

class BillItem(BaseModel):
    item_id: str
    item_name: str
    qty: float
    unit: str
    rate: float
    amount: float

class BillIn(BaseModel):
    bill_type: Literal["sale", "purchase"]
    party_id: str
    party_name: str
    date: str  # ISO date
    items: List[BillItem]
    subtotal: float
    commission_pct: float = 0.0
    commission_amt: float = 0.0
    other_charges: float = 0.0
    total: float
    payment_received: float = 0.0
    notes: Optional[str] = ""

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
    mode: str = "Cash"  # Cash, UPI, Bank

class RokadOut(RokadIn):
    id: str
    created_at: str


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


@app.on_event("shutdown")
async def shutdown():
    client.close()
