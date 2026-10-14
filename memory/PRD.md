# 9x Vyapari – Hisab Kitab Software (PRD)

## Original Problem Statement
User chahta hai ek desktop-grade Hisab Kitab software (Electron-based) for Galla / Kaccha Arhat businessmen — exactly like his old DOS-based FoxPro 2.6 system. Same 18-group ledger structure, detailed Purchase/Sale entry with Hamali/Dalali/Bhada/Mandi Tax etc., DOS-style A4 landscape Jama/Kharch print, Rokad Panna (cash book) bank-wise filtering, Trial Balance, GST Returns, and complete DBF data migration. Hindi/Hinglish UI.

**Branding (Jun 2026):** App ka naam **"9x Vyapari"** (pehle "Galla Bahi"). **Single-user software** — register option hata diya, password change Settings me.

## Tech Stack
- Frontend: React + Tailwind + Shadcn UI (`/app/frontend`) — fonts self-hosted via `@fontsource` (offline ready)
- Backend: FastAPI + Motor MongoDB (`/app/backend/server.py`)
- DBF parsing: `dbfread`
- Exports: PDF/Print (CSS), XLSX (`xlsx`), Word (`docx`)
- Auth: JWT + bcrypt (admin@galla.com / admin123 — see `/app/memory/test_credentials.md`). No registration.
- **Desktop: Electron 33 + electron-builder 25 + electron-updater** (`/app/electron`), backend via **PyInstaller** (`backend/desktop.spec`, entry `backend/desktop_main.py`), **MongoDB 4.4.29** mongod.exe bundled (no-AVX CPUs supported)
- CI: `.github/workflows/build-desktop.yml` — Windows build on every push → GitHub Release (`1.0.<run_number>`)

## What's Implemented
- FoxPro-matching schema: 18 Account Groups, Parties, Items, detailed Bills with 30+ fields
- DBF Import for LEDGR/CASHBOOK/TRANSPR/TRANSPUR/PROFIT/INWARDS/AAGSTRET/AN (+ one-click complete migration, idempotent; `DOS_BACKUP_DIR` env configurable)
- Rokad Panna (Cash Book) with bank-wise filter, opening/closing balance
- DOS-style Jama/Kharch side-by-side A4 landscape print/PDF
- Trial Balance, GST Returns, Inward Register, Journal Entry, Galla Master
- Global keyboard shortcuts + ShortcutHelp overlay, arrow-key table nav
- Party & Item autocomplete with inline create (`PartyAutocomplete.jsx`)
- Dashboard "Bills Due" notifications, PDF/Excel/Word exports

### Jun 2026 – Desktop release work
- **Electron offline desktop app** (`/app/electron`): spawns bundled `mongod.exe` + PyInstaller backend on free ports, backend serves React build (same-origin, `REACT_APP_DESKTOP=1` → `window.location.origin`), splash screen, Hinglish menu (Print, folders, Data Folder badlein, Update check, About), single-instance lock, graceful MongoDB shutdown via `POST /api/desktop/shutdown` (token-protected), parent-PID watchdog in backend (no orphan processes)
- **Data Folder chooser** on every start (remembers last + recent list; `VYAPARI_DATA_DIR` env skips). Layout: `<root>/mongo`, `/backups`, `/dos_backup`, `/logs`, `/config.json`
- **3 Windows targets**: NSIS installer (auto-update via GitHub Releases, `releaseType: release`), Portable single exe (checks GitHub API, opens release page), Portable folder zip. Private-repo updates via `UPDATE_TOKEN` secret → `update-config.json`
- **Auto backup on logout** → `POST /api/backup/auto` writes `vyapari-backup_<stamp>_<reason>.json` to `BACKUP_DIR` (keeps 30). `GET /api/backup/files`, `POST /api/backup/restore-file`. Backup page shows list + Restore + "Abhi Backup Lein". Backup now covers inward/gst_returns/dos_journal too
- **Change password**: `POST /api/auth/change-password` + `ChangePasswordCard` in Settings. `/auth/register` removed. Admin seed no longer overwrites a changed password
- **NayaBill line-items grid** widened (`items-grid` CSS: no number spinners, tighter cell padding, fixed column widths)
- Branding → 9x Vyapari (Layout, Login, BillView, index.html title, favicon, default firm name), app icon generated (`electron/build/icon.ico|png`)

### Jun 2026 – Year-End Carry Forward (Naya Saal)
- Page `/year-end` (nav "Naya Saal (Year-End)", Alt+Y): preview of every ledger's closing → new opening (asset/liability carry forward; income/expense P&L ledgers reset to 0 with "reset (P&L)" tag), counts of entries to archive, carry Dr/Cr totals, type-to-confirm ("NAYA SAAL") + checkbox guard
- `POST /api/year-end/close`: full backup (`yearend_<fy>`) → snapshot into `fiscal_years` → move bills/rokad/journal/dos_journal/inward/gst_returns into `archive_*` (tagged `fy_id`) → set `opening_balance` on parties & accounts → settings FY/current_date advanced
- `POST /api/year-end/undo` (only while new year has no entries) restores everything exactly; `GET /api/year-end/history`, `GET /api/year-end/{id}` (closed-year closing balances viewer in UI). Backups now include `fiscal_years` + `archive_*`
- Verified: backend pytest 12/12 (iteration_6), UI close→undo cycle verified by screenshot, DB left in original state

### Jun 2026 – Opening Balance Sheet (DOS print)
- Page `/opening-balance` (nav "Opening Balance", Alt+O): DOS-style monospace 2-column sheet grouped by account group (code, ledger, Dr, Cr, group totals, grand totals, difference, signature lines), A4 landscape print via FoxProPrintHeader, Excel export
- `GET /api/reports/opening-balances?fy_id=` → live openings or a closed year's carried-forward snapshot (selector on page; "Opening Print" link per closed year on Year-End page)
- Verified via curl (live + snapshot after close/undo) and screenshots (screen + print media)

## Verification (Jun 2026)
- Packaged PyInstaller backend tested on Linux: SPA serving, API, login, graceful mongo shutdown ✅
- Full Electron packaged run under Xvfb (Linux build): chooser → services → login → dashboard (version badge "Desktop v1.0.0") → logout → backup file in `<root>/backups` ✅; SIGKILL Electron → watchdog stops backend+mongod ✅
- Windows .exe can only be produced by GitHub Actions (Windows runner) or on a Windows PC — see `/app/electron/README.md`

## Roadmap / Backlog
- **P1**: First real GitHub Actions run — verify Save to GitHub pushes `.github/workflows` (may need manual add if token lacks `workflow` scope)
- ~~Multi-user RBAC~~ — dropped, user wants single-user
- **P2**: Render `dos_journal` history in a dedicated register page
- **P3**: SMS/WhatsApp reminders for overdue bills

## Test Credentials
See `/app/memory/test_credentials.md` — admin@galla.com / admin123
