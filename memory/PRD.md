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
