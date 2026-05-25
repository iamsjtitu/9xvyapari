# Galla Bahi – Hisab Kitab Software (PRD)

## Original Problem Statement
User chahta hai ek desktop-grade Hisab Kitab software (Electron-based) for Galla / Kaccha Arhat businessmen — exactly like his old DOS-based FoxPro 2.6 system. Same 18-group ledger structure, detailed Purchase/Sale entry with Hamali/Dalali/Bhada/Mandi Tax etc., DOS-style A4 landscape Jama/Kharch print, Rokad Panna (cash book) bank-wise filtering, Trial Balance, GST Returns, and DBF data import. Hindi/Hinglish UI.

## Tech Stack
- Frontend: React + Tailwind + Shadcn UI (`/app/frontend`)
- Backend: FastAPI + Motor MongoDB (`/app/backend/server.py`)
- DBF parsing: `dbfread`
- Exports: PDF/Print (CSS), XLSX (`xlsx`), Word (`docx`)
- Auth: JWT (admin@galla.com / admin123 — see `/app/memory/test_credentials.md`)

## What's Implemented
- FoxPro-matching schema: 18 Account Groups, Parties, Items, detailed Bills with 30+ fields
- DBF Import for LEDGR/CASHBOOK/TRANSPR/TRANSPUR
- Rokad Panna (Cash Book) with bank-wise filter, opening/closing balance, per-cash voucher numbering
- DOS-style Jama/Kharch side-by-side A4 landscape print/PDF
- Trial Balance grouped by FoxPro master ranges
- GST Returns, Inward Register, Journal Entry, Galla Master
- Global keyboard shortcuts (Alt+C, Alt+M, etc.) + ShortcutHelp overlay
- Arrow-key table navigation (`useTableNav.js`)
- Payment Cond → auto-compute Due Date in bills
- Dashboard "Bills Due" notifications (overdue / today / 7-day soon)
- PDF/Excel/Word exports on every register
- **NEW (Feb 2026): Auto-suggesting Party fields in Sale/Purchase entry**
  - Sale and Purchase forms now both show 3 fields: Seller Party* / Buyer Party (Final Customer) / Agent (Dalal)
  - Each field has type-ahead autocomplete (`PartyAutocomplete.jsx`) — code + name + place, keyboard nav (Up/Down/Enter/Esc/Tab)

## Architecture
```
/app
├── backend/server.py          # Single-file FastAPI app
└── frontend/src
    ├── components/
    │   ├── Layout.jsx
    │   ├── ExportBar.jsx
    │   ├── ShortcutHelp.jsx
    │   └── PartyAutocomplete.jsx   # NEW – reusable name autosuggest
    ├── hooks/
    │   ├── useKeyboardShortcuts.js
    │   └── useTableNav.js
    └── pages/
        ├── Dashboard.jsx, Login.jsx, Settings.jsx, Backup.jsx
        ├── RokadPanna.jsx (Cash Book), PartyKhata.jsx, PartyLedger.jsx
        ├── Accounts.jsx, AccountGroups.jsx, GallaMaster.jsx
        ├── NayaBill.jsx (Sale + Purchase entry)
        ├── BillView.jsx, Inward.jsx, JournalEntry.jsx
        ├── TrialBalance.jsx, GSTReturns.jsx, Reports.jsx
        └── ImportDBF.jsx
```

## Roadmap / Backlog
- **P0**: Electron desktop packaging (.exe for Windows) — user's original ask, deferred
- **P1**: Per-party ledger printout in FoxPro Mahajani format
- **P1**: Auto-suggest items in line-item dropdown (same pattern as PartyAutocomplete)
- **P2**: Year-end carry-forward of balances
- **P2**: Multi-user / role-based access
- **P2**: SMS/WhatsApp reminders for overdue bills

## Verification Status
- Web app smoke-tested via screenshot tool — login/dashboard/bill modal all working.
- Last feature (PartyAutocomplete) verified live: 12 suggestions on "tar", selection populates field, both Sale and Purchase modes show all 3 party fields.

## Test Credentials
See `/app/memory/test_credentials.md`
- admin@galla.com / admin123
