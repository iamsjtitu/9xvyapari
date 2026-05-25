# Galla Bahi – Hisab Kitab Software (PRD)

## Original Problem Statement
User chahta hai ek desktop-grade Hisab Kitab software (Electron-based) for Galla / Kaccha Arhat businessmen — exactly like his old DOS-based FoxPro 2.6 system. Same 18-group ledger structure, detailed Purchase/Sale entry with Hamali/Dalali/Bhada/Mandi Tax etc., DOS-style A4 landscape Jama/Kharch print, Rokad Panna (cash book) bank-wise filtering, Trial Balance, GST Returns, and complete DBF data migration from his old workspace at `/tmp/galla_audit/FOXPRO2/WS2026/`. Hindi/Hinglish UI.

## Tech Stack
- Frontend: React + Tailwind + Shadcn UI (`/app/frontend`)
- Backend: FastAPI + Motor MongoDB (`/app/backend/server.py`)
- DBF parsing: `dbfread`
- Exports: PDF/Print (CSS), XLSX (`xlsx`), Word (`docx`)
- Auth: JWT (admin@galla.com / admin123 — see `/app/memory/test_credentials.md`)

## What's Implemented
- FoxPro-matching schema: 18 Account Groups, Parties, Items, detailed Bills with 30+ fields
- DBF Import for LEDGR/CASHBOOK/TRANSPR/TRANSPUR/PROFIT/INWARDS/AAGSTRET/AN
- Rokad Panna (Cash Book) with bank-wise filter, opening/closing balance, per-cash voucher numbering
- DOS-style Jama/Kharch side-by-side A4 landscape print/PDF
- Trial Balance grouped by FoxPro master ranges
- GST Returns, Inward Register, Journal Entry, Galla Master
- Global keyboard shortcuts + ShortcutHelp overlay
- Arrow-key table navigation (`useTableNav.js`)
- Payment Cond → auto-compute Due Date in bills
- Dashboard "Bills Due" notifications (overdue / today / 7-day soon)
- PDF/Excel/Word exports on every register

### Feb 2026 Additions
- **Auto-suggesting Party fields in Sale/Purchase entry** (Seller / Buyer / Agent — all 3 in both modes) with inline "+ Add as new party" — `PartyAutocomplete.jsx`
- **Item autocomplete in line-items** with same "+ Add as new item" pattern (`NayaBill.jsx`)
- **Mahajani Party Ledger Printout** — traditional Hindi bahi-khata format with Devanagari numerals, "॥ श्री गणेशाय नमः ॥" header, parchment-style sheet, नाम/जमा/बाकी columns. Toggle inline preview + dedicated "Mahajani Print" button (`PartyLedger.jsx`)
- **Complete DOS Data Migration** — one-click button on Import (DBF) page that reads all DBFs from `/tmp/galla_audit/FOXPRO2/WS2026/` and runs every importer in sequence. **Idempotent** — composite keys ensure re-runs don't duplicate. New endpoint `POST /api/migrate-dos-data` and `POST /api/import-dbf/journal` for AN.DBF. Migration covers:
  - LEDGR.DBF (526 parties), PROFIT.DBF (9 items), CASHBOOK+CASHTEM (15 rokad), INWARDP+INWARDS (42 inward), AAGSTRET (50 GST), TRANSTEM (4 bills), **AN.DBF (126 journal/transaction history rows → `dos_journal` collection)**.

## Database Counts (post-migration)
| Collection | Rows |
|---|---|
| account_groups | 18 |
| parties | 528 |
| items | 15 |
| bills | 4 |
| rokad | 16 |
| inward | 42 |
| gst_returns | 50 |
| **dos_journal (AN.DBF)** | **126** |

## Architecture
```
/app
├── backend/server.py          # Single-file FastAPI app
└── frontend/src
    ├── components/
    │   ├── Layout.jsx, ExportBar.jsx, ShortcutHelp.jsx
    │   └── PartyAutocomplete.jsx   # generic name-search + inline create
    ├── hooks/
    │   ├── useKeyboardShortcuts.js
    │   └── useTableNav.js
    └── pages/
        ├── Dashboard.jsx, Login.jsx, Settings.jsx, Backup.jsx
        ├── RokadPanna.jsx (Cash Book), PartyKhata.jsx, PartyLedger.jsx (Mahajani)
        ├── Accounts.jsx, AccountGroups.jsx, GallaMaster.jsx
        ├── NayaBill.jsx (Sale + Purchase, autosuggest everywhere)
        ├── BillView.jsx, Inward.jsx, JournalEntry.jsx
        ├── TrialBalance.jsx, GSTReturns.jsx, Reports.jsx
        └── ImportDBF.jsx (one-click "Migrate Complete DOS Data")
```

## Roadmap / Backlog
- **P0**: Electron desktop packaging (.exe for Windows) — user's original ask, still deferred
- **P1**: Render `dos_journal` history in a dedicated "DOS Transactions" register page (data is in MongoDB, just needs UI)
- **P2**: Year-end carry-forward of balances
- **P2**: Multi-user / role-based access
- **P2**: SMS/WhatsApp reminders for overdue bills

## Verification Status
- Party autocomplete: ✅ verified live (suggestions on "tar", inline create)
- Item autocomplete: ✅ verified live (suggestions on "geh" → Gehu, inline create works)
- Mahajani print: ✅ verified screenshot (Hindi headers, Devanagari numerals, parchment look)
- Complete migration: ✅ verified via curl + DB counts; idempotent (2 successive runs produce same DB state)

## Test Credentials
See `/app/memory/test_credentials.md`
- admin@galla.com / admin123
