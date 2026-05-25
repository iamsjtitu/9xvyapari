# Galla Bahi – Kaccha Arhat Hisab Kitab

## Original Problem Statement
"Ek hisab kitab software banana h mujhe electron based galla businessman ke liye same jaise jama kharch rokad panna banate h"

User clarifications:
- Platform: Electron-style desktop (delivered as web app, can be wrapped in Electron later)
- Language: Hinglish (UI in English script with traditional terms)
- Scope: Full Kaccha Arhat workflow (commission agent in Indian grain mandi)

## Architecture
- **Backend**: FastAPI + MongoDB (motor async driver), UUID-string IDs, JWT auth (httpOnly cookies + Bearer fallback). All routes under `/api`.
- **Frontend**: React 19, React Router 7, Tailwind, shadcn primitives, Phosphor icons, IBM Plex Sans/Mono + Work Sans fonts, sonner toasts. Parchment + terracotta "digital Bahi-Khata" theme.
- **DB Collections**: `users`, `parties`, `items`, `bills`, `rokad`.

## User Personas
- **Galla Arhati / Commission Agent**: Records daily cash (Jama/Kharch), creates Sale & Purchase bills with arhat commission, tracks party-wise udhaar.
- **Farmer / Kisan & Trader / Grahak**: Reflected as Parties (supplier / customer / both).

## Core Requirements (static)
- Daily Rokad Panna (two-column Jama | Kharch ledger with daily summary)
- Party Khata (CRUD + chronological ledger per party with running balance)
- Galla Master (items with unit + rate)
- Naya Bill (Sale/Purchase) with multi-line items, arhat %, other charges, partial payment
- Bill view + Print (browser print → PDF)
- Reports (date-range Jama/Kharch totals, Sales/Purchase totals, commission earned, daily breakup)
- Dashboard KPIs (today, this month, udhaar, owed)
- Auth (email/password JWT)

## What's Implemented (2026-02-23 — v1.0)
- ✅ Full auth flow (login, register, logout, /me) with cookies + Bearer fallback
- ✅ Admin seeding from `.env` (admin@galla.com / admin123)
- ✅ 6 sample galla items auto-seeded (Gehu, Chana, Sarson, Chawal, Bajra, Makka)
- ✅ Parties CRUD with computed live balance
- ✅ Items CRUD
- ✅ Bills (Sale + Purchase) with bill_no auto-generation (S00001 / P00001), commission, payment, balance
- ✅ Auto rokad entry creation when bill has `payment_received > 0`
- ✅ Rokad entries CRUD with date filter
- ✅ Dashboard summary, party ledger summary
- ✅ Reports page with KPIs + daily breakup
- ✅ Printable bill view (PDF via browser print)
- ✅ Desktop-style dense UI: dark sidebar, parchment paper background, two-column rokad ledger, IBM Plex Mono numbers, terracotta accents
- ✅ Full data-testid coverage on interactive elements
- ✅ 100% backend + frontend test pass (20-test pytest suite)

## v1.2 (2026-02-23) — Deep FoxPro Audit + Replication
User shared original FoxPro 2.6 DOS-based "Galla Hisab" software (ZIP with `.DBF`, `.FXP`, `.PRG` files). Did full audit of the 544-row LEDGR.DBF, GROUPTEM.DBF, TRANSPR.DBF (purchase entry with 40+ fields), CASHBOOK.DBF, PARAMET.DBF, INWARDS.DBF, AAGSTRET.DBF.

- ✅ **18 exact account groups with FCODE-LCODE code ranges** (CAPITAL A/C 1-50, LOANS 51-100, OTHER DEPOSITS 101-200, FIXED ASSETS 201-250, CURRENT ASSETS 251-299, CASH & BANK BALANCE 300-349, SALES PARTY 350-1199, PURCHASE PARTY 1200-2199, COLD STORAGE 2200-2400, LOANS & ADVANCES 2500-2899, SALES A/C 3001-3034, INDIRECT INCOMES 3035-3049, PURCHASE A/C 3050-3099, INDIRECT EXP 3100-3149, OTHER EXP 3150-3199, SALARY A/C 3200-3249, DIRECT EXPENSES 3250-3299, STAFF ADVANCE 3300-3400)
- ✅ **Unified Master Ledger** (parties = LEDGR.DBF) with `code` (numeric), `group_id`, `place`, `gstin` (F_G_L_NO), `pan`, `cstno`, `mpstno`, `opening_balance`, `opening_qty`, `rate`, `alt_name` (GL_NAME1), `address`, `address2`
- ✅ **Auto next-code suggestion** when creating ledger under a group
- ✅ **Detailed Purchase Entry** with full TRANSPR.DBF fields: E.Date, S.Date, Lot No., GP No., Due Date, Payment Cond., Seller Party, Buyer Party, Agent/Dalal, Truck No (TNO), Driver Name, Bilty No (BUILTY), Garage, No. of Bags, Bag Pack Q; per-line **Bag, Pack, Weight, W.B., Ghat, Net Wt, Rate, Amount**; charges sections **Additions** (Hamali rt+amt × bags, Cartage rt+amt × bags, Bhada rt+amt × Qtl, Mandi Tax %, Dalali/Arhat %, Garage rt+amt, Loading, Brokerage Dalali, Other) + **Deductions** (Discount rt+amt × Qtl, Rebate rt+amt × Qtl, Less, Advance); Remark 1, Remark 2
- ✅ **Inward Register** (cold storage stock tracking with Lot, Bags, Weight)
- ✅ **Trial Balance Report** (matches FoxPro AA.TXT) — grouped sections sorted by fcode with Code/Narration/Debit/Credit columns + Group totals + Grand totals
- ✅ **DBF Import** (parses uploaded `.DBF` files; LEDGR.DBF auto-imports as parties with group auto-detected by code range) — successfully imported user's 544-row LEDGR.DBF → 526 ledgers
- ✅ Sidebar reorganized with Import (DBF) in Maintenance section
- ✅ 100% backend (31/31 tests) + frontend pass on iteration_3
- ✅ **Account Groups** (Tally-style chart of accounts) – 13 default groups seeded by nature (Asset / Liability / Income / Expense)
- ✅ **Accounts (Khate)** – non-party accounts (Cash, Bank A/C seeded by default) with computed balance from journal + rokad
- ✅ **Journal Entry** – double-entry voucher with debit==credit validation, voucher_no J00001
- ✅ **Detailed Purchase Entry** – added fields: E.Date, S.Date, GP No., Truck No., Seller Party, Payment Condition, Bag/Tin Pack, Qty (Bags), Weight, W.B. (Kanta / Weight Bridge)
- ✅ **Backup / Restore** – full JSON export of all 8 collections (no users), restore round-trip preserves users
- ✅ **Financial Year settings** – default Apr 1 – Mar 31, firm name, current working date
- ✅ **Sidebar reorganized** into Operations / Setup / Maintenance sections with keyboard-shortcut letter badges (M, C, D, E, F, G, A, B, P, I, H, J)
- ✅ **Cash Register** can pick from Cash / Bank accounts
- ✅ 100% backend (40 tests) + frontend test pass

## Prioritized Backlog
### P1 (next)
- Atomic bill_no generation (counter collection) to prevent race condition under concurrent creates
- Brute-force lockout on `/api/auth/login` (5 fails → 15 min lock)
- Bill edit (currently only create + delete)
- GST/Tax fields on bill (separate from arhat)

### P2
- Export reports to Excel/CSV
- Stock tracking per item (running balance from bills)
- Multi-user roles (manager vs munim)
- Backup / restore JSON
- Keyboard shortcuts (Ctrl+N for new bill, etc.)
- Replace native `<select>` with shadcn Select where dense lookup is heavy

### P3 (future)
- Electron desktop packaging (wrap React build in Electron shell)
- WhatsApp share for bill (via wa.me link)
- Multi-firm support
- E-invoicing / e-way bill generation

## Next Action Items
1. Wait for user feedback on what they want next (edit bills, GST, exports, etc.)
2. Optionally optimize dashboard balance aggregation for >100 parties
3. Optionally add atomic bill_no counter before scaling
