# 9x Vyapari – Hisab Kitab Software (PRD)

## Original Problem Statement
User chahta hai ek desktop-grade Hisab Kitab software (Electron-based) for Galla / Kaccha Arhat businessmen — exactly like his old DOS-based FoxPro 2.6 system. Same 18-group ledger structure, detailed Purchase/Sale entry with Hamali/Dalali/Bhada/Mandi Tax etc., DOS-style A4 landscape Jama/Kharch print, Rokad Panna (cash book) bank-wise filtering, Trial Balance, GST Returns, and complete DBF data migration. Hindi/Hinglish UI.

**Branding (Jun 2026):** App ka naam **"9x Vyapari"** (pehle "Galla Bahi"). **Single-user software** — register option hata diya, password change Settings me.

## Tech Stack
- Frontend: React + Tailwind + Shadcn UI (`/app/frontend`) — fonts self-hosted via `@fontsource` (offline ready)
- Backend: FastAPI + Motor MongoDB (`/app/backend/server.py`)
- DBF parsing: `dbfread`
- Exports: PDF/Print (CSS), XLSX (`xlsx`), Word (`docx`)
- Auth: JWT + bcrypt, **username-based** (admin / admin123 — see `/app/memory/test_credentials.md`). No email, no registration. Username + password changeable in Settings. Startup migrates legacy email admin → username `admin` (env `ADMIN_USERNAME`).
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

### Jun 2026 – Rokad fixes + Electron print preview
- Electron: Print/PDF buttons & Ctrl+P open a **PDF print-preview window** (`webContents.printToPDF` → Chromium PDF viewer with print/download), `lib/printing.js`; renderer `triggerPrint()` routes to `window.vyapari.printPreview` when desktop. Toasts hidden in print CSS.
- Rokad "All" view shows per-account Opening/Jama/Kharch/Closing table + TOTAL (click row → filter). Entries without cash account default to CASH IN HAND (code 301) on create/update; startup backfill links old unlinked entries; form preselects default cash.
- Rokad **edit** (`PUT /api/rokad/{id}`, pencil button → same modal in edit mode). Tested: iteration_7 (9/9 backend, full UI flow).

### Jun 2026 – Bill Edit
- Pencil button on every bill row + "Edit Bill" on bill view (`/bills?type=..&edit=<id>`) open the NayaBill modal in edit mode (title "EDIT BILL — <no>", type toggle locked, "Update Bill"). `PUT /api/bills/{id}` keeps bill_no/type, recomputes balance, `updated_at`, re-syncs auto payment rokad (`_sync_bill_payment_rokad`, linked to CASH IN HAND). DOS-imported bills: rates derived from stored amounts so totals don't drift on edit. Tested iteration_8 (6/6 backend + UI flow).

### Jun 2026 – Journal Edit + Auto-update fix
- Journal: pencil edit → same modal ("Journal Edit — J0000x", "Update Journal"); `PUT /api/journal/{id}` validates double entry, keeps voucher_no (iteration_9 passed).
- Auto-update: user's repo `iamsjtitu/9xvyapari` is PRIVATE → releases.atom 404. `lib/update-messages.js` (pure) gives Hinglish guidance (make public OR `UPDATE_TOKEN` fine-grained PAT secret), token used whenever present; CI writes `repoPrivate` + ::warning. README updated. (iteration_10 passed). **User must either make repo public or add UPDATE_TOKEN secret, then rebuild + install new Setup.**

### Jun 2026 – Branding footer / About / Copyright
- `frontend/src/lib/brand.js` (single source: developer 9x.design, contact 7587922222, © 2026 9x Vyapari) + `components/AppFooter.jsx`.
- Footer shown under main content (Layout, print:hidden) and on Login page; Help (?) overlay has "About 9x Vyapari" section; Electron Help → About dialog shows same lines; `electron/package.json` `build.copyright` + author set (exe metadata).
- Verified via screenshot (login footer, app footer, help-about section all render correct text).

### Jun 2026 – Security audit (read-only)
- Findings: SEC-001 HIGH CSRF (SameSite=None cookies, no CSRF token — web deployment only); SEC-002 MEDIUM default `admin123` + plaintext `config.json` in desktop. Hardening: login rate-limit, hide /docs in prod, honor `password_changed_at`, openExternal scheme allowlist, restrict migrate-dos-data folder, remove unused python-jose. **Not yet fixed — awaiting user decision.**

### Jun 2026 – In-app Update Banner + Progress, Balance Sheet "As on date"
- Auto-update UI: `electron/lib/update-status.js` (pure status builder, unit tests `scripts/test_update_status.js`), `updater.js` pushes `update:status` over IPC + `update:get-status` pull + `update:action` (check/install/openRelease); `preload.js` exposes `onUpdateStatus/getUpdateStatus/updateAction`. Frontend: `hooks/useDesktopUpdate.js` (also listens to window event `vyapari:update` for web simulation), `components/UpdateBanner.jsx` (bottom-right: available → downloading with MB/%/speed progress bar → "Update Taiyaar Hai" Restart/Baad Me; portable → Download page; manual error → retry + details), `components/SoftwareUpdateCard.jsx` on Settings (version, status, progress, "Update Check Karein"). `VYAPARI_SIMULATE_UPDATE=1` env runs a fake v9.9.9 flow. Verified in packaged Linux Electron via `scripts/e2e_update_banner.py` (pull + live push paths) + testing agent iteration_11.
- Opening Balance Sheet: user chose "As on date" (default today) → `/api/reports/opening-balances?as_on=YYYY-MM-DD` = opening + all entries ≤ date (`_compute_party_balance/_compute_account_balance` got `as_on`); fy_id snapshot mode unchanged. UI: date input + chips Aaj / Working Date / FY Start / FY End (URL `?as_on=`). Far-future as_on == Trial Balance totals exactly.
- Bug fixed: journal lines posted to a PARTY were ignored in party balance (ledger/TB/year-end). `todayISO()` now local date (was UTC → wrong before 05:30 IST).
- (Corrected) The 15 rokad rows' `cash_account_id` point to PARTY code 307 'SBICC-M M TRD.' — cash/bank accounts are parties in the CASH & BANK group; not dangling.

### Jun 2026 – Security fixes + Safe delete + Ledger/Rokad as-on
- `backend/security.py` (+ `tests/test_security.py`, 11 tests): CSRF guard middleware — mutating `/api` calls: Origin/Referer host must be allowed; cookie-auth (no Bearer) must send `X-Requested-With: XMLHttpRequest` (axios default header added). Cookies SameSite=Lax (env `COOKIE_SAMESITE`), Secure off only in desktop (http://127.0.0.1). Login throttle: 5 fails/ip+username → 15 min (429), 20/ip. JWT `iat`; tokens before `password_changed_at` → 401; change-password returns fresh tokens. `/docs|/redoc|/openapi.json` off unless `ENABLE_DOCS=1`. Min password 6, ≠ admin123.
- First-run gate: seed sets `must_change_password` when password is default; startup flags existing admins still on `admin123`; `Protected` route renders `pages/SetPassword.jsx` (forced `ChangePasswordCard`) until changed. Electron `services.js` no longer persists `admin_password` in config.json (mode 600); `openExternal` limited to http(s)/mailto/tel; `migrate-dos-data` folder restricted to DOS_BACKUP_DIR; python-jose removed.
- Preview admin password is now **Vyapari@2026** (see test_credentials.md). Note: preview proxy rewrites cookies to SameSite=None;Partitioned — backend itself emits Lax.
- Safe delete: `DELETE /parties/{id}` & `/accounts/{id}` → 409 `{message,counts,samples}` when referenced (rokad as cash a/c or party, bills, journal, dos_journal, inward); `GET /ledgers/{id}/usage`; `components/LedgerInUseDialog.jsx` in PartyKhata + Accounts.
- Ledger as on: `/summary/party/{id}?as_on=` returns bills/rokad/**cash_rokad** (ledger used as cash a/c)/**journal** lines/dos_journal ≤ date + `party.balance` as on; `PartyLedger.jsx` has As-on date + chips + closing footer. `_compute_party_balance` now counts the cash-account side of rokad (cash/bank parties) → Balance Sheet/TB/year-end include cash movements.
- Rokad Panna: `GET /rokad/accounts-summary?date_from&date_to` (opening = balance day before, closing = balance as on date_to, jama/kharch in range, `other` = journal/DOS delta) replaces client-side math → figures equal Balance Sheet (verified: a/c 307 closing −4,43,87,254 everywhere). Testing agent iteration_12: 19/19 backend + all frontend flows pass.

### Jun 2026 – Transfer (contra), Ledger Statement, Dashboard balances, version, balance hint, typing-focus fix
- **Cash/Bank Transfer**: `POST/GET/PUT /api/rokad/transfer[/{contra_id}]` → two linked rokad legs (kharch on FROM, jama on TO, shared `contra_id`, `counter_account_*`, party_id null); `DELETE /rokad/{leg}` removes both; normal PUT on a leg → 400. UI: Rokad "Transfer" button → `components/rokad/TransferForm.jsx`; legs show TRANSFER badge, pencil opens transfer form.
- **Ledger statement**: `/summary/party/{id}?date_from=&as_on=` returns `opening` (balance day before From) + entries in range; `PartyLedger.jsx` has From/As-on/“Shuru se”, opening row + closing footer, toggle **Statement (Print)** → `components/PartyStatement.jsx` (DOS layout, also the print output; CSS `.dos-stmt-*`).
- **Dashboard**: `components/CashBankBalances.jsx` (today's closing per cash/bank ledger via accounts-summary, rows → ledger).
- **Version**: `lib/brand.js` `appVersion()` (desktop = app.getVersion(), web = `REACT_APP_VERSION` injected by CI, fallback 1.0.0) shown in footer + Help About; CI now sets version before frontend build.
- **Balance hint**: `GET /api/ledgers/{id}/balance` + `components/LedgerBalanceHint.jsx` under Journal line account, Rokad party & cash a/c, Bill seller/buyer, Transfer from/to.
- **Typing bug (desktop)**: Electron inputs going deaf after child window/dialog → `electron/lib/focus.js` `refocus()` on print-preview close, dialogs, ready-to-show, window focus; renderer `hooks/useRefocusOnWindowFocus.js` focuses first field of open modal. Needs a new desktop build to take effect.
- Testing agent iteration_13: 14/14 backend + all UI flows pass (transfer, statement, dashboard card, version). Balance hint verified via screenshot.

### Jun 2026 – Day Book Print (Rokad Panna)
- `components/rokad/DayBookSheet.jsx`: DOS T-format per cash/bank account for From→To — Jama (receipts) left / Kharch (payments) right, Opening B/F + Closing C/F placed by sign so both totals balance, "Journal/Anya" line when other≠0, idle accounts (no movement) compact list, grand Sabhi Accounts line. `RokadPanna.jsx` view toggle "Day Book (Print)"; print media always prints the Day Book (list hidden). CSS `.db-*`. Testing agent iteration_14: 100% pass.

### Jun 2026 – Outstanding List Print
- `GET /api/reports/outstanding?as_on&side=dr|cr|all&min_amount&sort=amount|name` — parties with pending balance grouped by account group (cash/bank excluded), last_txn (aggregates over bills/rokad/journal/dos_journal) + days, sub/grand totals. Page `/outstanding` (nav "Outstanding List", Alt+L) → `pages/Outstanding.jsx` + `components/OutstandingSheet.jsx` (DOS layout: Code/Party/Place/Phone/Last Txn/Days/Dr/Cr/Vasooli-remark column), landscape print, Excel export. Chip highlight fix (`!bg-terracotta`) across OB/Ledger/Outstanding. Testing agent iteration_15: 10/10 backend + 100% frontend.

### Jun 2026 – "Stuck on Loading" fix (Dashboard → Cash/Bank row)
- Root cause (user video): Cash & Bank card rows link to `/parties/{id}`; ledgers from the `accounts` collection (Chart of Accounts, not parties) got 404 from `/summary/party/{id}` and `PartyLedger.jsx` had no error handling → endless "Loading...". Fix: `/summary/party/{pid}` falls back to `db.accounts` (`_account_ledger`: kind=account, cash_rokad + journal, opening/closing via `_compute_account_balance`); `_is_date()` real-date validation (2026-13-99 → 400, not 500). New `components/LoadState.jsx` (spinner / "Data load nahi ho paya" card + Dobara Try Karein + back link) used by PartyLedger, Dashboard, BillView, Settings. Testing agent iteration_16: all pass.

### Jun 2026 – Rokad form: default Mode = Cash, auto Voucher No., Voucher search
- Mode bug: group name "CASH & BANK BALANCE" matched `/bank/` so CASH IN HAND opened with Mode=Bank → `modeForAccount()` now looks at the account NAME only (cash/rokad → Cash; HDFC/SBI/… → Bank).
- Auto V.No.: form open par default account ka `next-voucher` fetch (accounts-collection ledgers bhi); backend `_next_voucher()` helper — `POST /rokad` and transfer legs auto-assign per-cash-a/c running number when blank.
- `GET /api/rokad/by-voucher?voucher_no&cash_account_id?` + `components/rokad/VoucherSearch.jsx` (toolbar "Voucher Khojein": debounce, dropdown with date/type/account/party/amount, "Kholein" → edit form / transfer form). Self-tested via curl + screenshots.

### Jun 2026 – Encrypted Backups + mandatory Backup Password
- User: "backup encrypted hona chahiye; bina software + password ke kabhi na khule". `backend/backup_crypto.py`: `.vbk` = magic `9XVBK` + salt + nonce + hint, AES-256-GCM, key = scrypt(APP_SECRET ‖ backup password) → needs BOTH 9x Vyapari and the password. Key doc in `db.backup_key` (not in backups). Endpoints: `GET /backup/security`, `POST /backup/password` (set/change with current_password, or forgot-flow with login_password; old files open with old password), `GET /backup` → binary .vbk download, `POST /restore` multipart (file+password; legacy .json still accepted), `POST /backup/restore-file {name,password}`, `/backup/auto` → 409 until password set; `/backup/files` shows encrypted flag + hint. Startup + password-set migrate old plain `vyapari-backup_*.json` → `.vbk` and delete JSON. Auth: `must_set_backup_password` flag → gate page `SetBackupPassword` after login (after the first-run password gate). UI: `BackupPasswordCard` (Backup + Settings), `RestorePasswordDialog`, Backup page download/upload reworked. Tests: `tests/test_backup_crypto.py`; testing agent iteration_17 all pass (fixed: truncated .vbk → 400 not 500). Preview backup password in test_credentials.md.

### Jun 2026 – Desktop v1.0.8 crash fix (Backend exit code 1)
- User's main.log: auto-update to v1.0.8 worked, then frozen backend died in <1s. Cause: desktop build installs `requirements-desktop.txt` (NOT requirements.txt) and it lacked `cryptography` + `python-multipart` (needed by backup_crypto / UploadFile). Fix: added both (pinned) + hiddenimports `python_multipart`, `multipart`; new `vyapari-backend --selftest` (imports server, crypto roundtrip, route presence) run in CI right after PyInstaller so a broken exe can never be released; Electron error dialog now shows the last 8 lines of backend-stdio.log/backend.log. LEARNING: any new backend import → add to requirements-desktop.txt too.

### Jun 2026 – "Zordar" Excel export + Backup auto-delete
- Excel: replaced SheetJS (plain cells) with **ExcelJS** in `lib/exports.js` — every Excel button (16+ pages) now gets: firm-name band + report title + FY/rows subtitle, dark bold header, zebra rows, borders, real dates (dd-mm-yyyy), Indian lakh/crore number format, negatives red, code/phone columns plain, auto **TOTAL row with SUM formulas** on amount-like columns, freeze panes, auto-filter, landscape/fit-to-width print setup, header row repeat, footer "Generated by 9x Vyapari". Column kinds sniffed from data (explicit `num`, `date`, `sum` flags win). `xlsx` dependency removed.
- Backup auto-delete: `GET/PUT /api/backup/retention` (keep_files 0/10/20/30/60/100 — 0 = never; keep_days 0/7/15/30/60/90/180/365) stored in settings; `_prune_backups` runs after every backup and on save; newest file always kept. UI `components/BackupRetention.jsx` inside Auto Backups card ("Save & Abhi Saaf Karo" shows how many deleted). Self-tested (curl + Playwright download + openpyxl inspection + UI).

### Jun 2026 – Rokad form: Cash/Bank account & Mode reverting (user video)
- Cause: account `<select onChange={async …}>` read `e.target.value` AFTER `await next-voucher`; the controlled select had already re-rendered back to the old value → old account restored and mode recomputed to "Cash". Fix: read value synchronously, set account+mode immediately, fetch V.No. async with functional update guard. Also `modeTouched` ref: a Mode picked by hand (Mode field comes before Account in the form) is no longer overwritten by the account's auto mode. Verified with a throttled API in Playwright.

### Jun 2026 – Full-DB backup ("har ek chiz") + DOS-style Esc back/logout
- Backup now dumps EVERY collection dynamically (`_backup_collection_names()` = DB collections ∪ known set, minus `backup_key`), incl. `users` (login). Restore makes the DB exactly equal to the file (wipes all non-excluded collections, keeps `users` if an old file has none) and ALWAYS writes a `*_pre-restore.vbk` safety backup first (`_restore_with_safety`). `GET /backup/contents` lists what's inside; Backup page shows "Backup me kya-kya jata hai" grid (19 items). ⚠️ Lesson: a restore of a file lacking collections now wipes them — the safety backup protects against that.
- Esc: `hooks/useEscapeBack.js` (runs after page handlers via setTimeout; skips if `defaultPrevented` or an overlay `.fixed.inset-0` is open): field → blur, `/x/y` → `/x`, `/x` → `/`, `/` → `LogoutConfirm` ("Logout karna hai kya?" Enter = auto-backup + logout, Esc = nahi). Page-level Escape shortcuts (8 pages + help) made conditional on their form being open so Esc on a plain screen goes back. Verified in Playwright end-to-end.

### Jun 2026 – Enter = next field (FoxPro style)
- `hooks/useEnterToNext.js` (global, in App): Enter in input/select/textarea → focus next usable field within the closest `form` / `[data-enter-scope]` / modal `.fixed.inset-0` / `main` (text selected on arrival); last field → `form.requestSubmit()` or click `[data-enter-submit]` / submit button / last `.btn-primary`; for plain page filters (scope = main) Enter only blurs. Shift+Enter keeps native (textarea newline). Skips when a component already handled Enter (`defaultPrevented`, e.g. PartyAutocomplete pick). `data-enter-submit` on Journal & Bill save buttons. ShortcutHelp updated. Verified: Login, Rokad entry saved via Enter-only, Journal walk, filters.

### Jun 2026 – Entry Sound (FoxPro beep)
- `lib/sound.js`: Web Audio (no files) — `beepOk` soft ascending chirp (880→1318 Hz), `beepError` low square buzz; `installSoundHooks()` (App.js) wraps sonner `toast.success`/`toast.error` app-wide + native `invalid` form events → every save beeps, every error/validation buzzes. Burst de-dupe (120 ms), audio unlock on first gesture. Preference in localStorage `vyapari.sound` (device-level, default ON). `components/SoundSettingsCard.jsx` in Settings: ON/OFF switch + "Save beep sunein / Error buzz sunein" test buttons. Verified via instrumented AudioContext in Playwright (buzz on login error, 0 sounds when OFF, persists).

### Jun 2026 – Journal date filter
- JournalEntry page: From/To date filter bar (default aaj, Rokad jaisa) + Today / Is Mahina / Sab chips, range label with count, empty-state link "Sabhi dikhayein"; `/journal?date_from&date_to` already supported. New journal default date = selected To date; print header + Excel filename/title carry the range.

### Jun 2026 – Journal account filter · Excel group subtotals · Data-folder "✕ forget path"
- `/journal?account_id=` (matches `lines.account_id`); Journal page: "Account / Party" select (accounts + parties) + ✕ clear, label/print/Excel carry the account name.
- `exportToExcel` sheet option `groupBy: "group"`: group column hidden, per group → merged bold header row "GROUP (n)", rows, bold `Sub-total · GROUP` with `SUBTOTAL(9,…)` formulas, then `GRAND TOTAL` (SUBTOTAL ignores nested subtotals → no double count). Used by Outstanding + Trial Balance (TB's manual total rows removed).
- Electron chooser: each "Pichle Folders" row has ✕ → confirm → `chooser:forget` IPC → `forgetRecent()` in config.js removes the path from the list only (folder/data untouched; if it was current, falls back to next recent/default). Unit-checked with mocked electron app.

### Jun 2026 – Ledger Excel with running balance
- PartyLedger Excel: Date · V.No./Ref · Particulars · Debit · Credit · Balance (abs) · Dr/Cr; bold OPENING (B/F) row, running balance after every entry, bold CLOSING row, TOTAL of Debit/Credit; title/subtitle carry party, group, period, opening→closing. `exportToExcel` now supports `rowStyle(row) → "opening" | "closing" | "bold"`. `buildRows` adds `vno` (bill no / rokad V.No. / journal V.No. / DOS ref) and the screen table shows it as a `V.n` chip (replacing inline "[V.n]" text) with a tooltip explaining it is the cash a/c running voucher number.

### Jun 2026 – Date-wise voucher renumber
- `POST /cash-accounts/{id}/renumber-vouchers {date_from?, date_to?, start=1, apply}`: sorts the a/c's rokad entries by (date, created_at, old V.No.), assigns start… ; apply=false → preview (total/changed/sample), apply=true → `*_renumber.vbk` safety backup then updates `voucher_no`. UI: Rokad Panna "V.No. Date-wise" button (visible when a Cash/Bank a/c is selected) → `components/rokad/RenumberVouchersDialog.jsx` (FY default range, start no., Preview table old→new, Apply disabled until preview). Verified API + UI on SBICC account (left at 1..15).

### Jun 2026 – Voucher slip print · chooser keyboard
- `components/rokad/VoucherSlip.jsx`: DOS-style RECEIPT / PAYMENT / CONTRA voucher slip (firm, FY, No., Date, A/C, Mode, Party, Chq, Amount, amount in words via `lib/words.js` Indian system, Narration, RECEIVED/PAID box, 3 signature lines). Rendered via portal; `body.print-slip` + CSS hides `#root` in print so only the slip prints (`triggerPrint()` → Electron PDF preview / window.print). Entry points: printer icon on every Rokad row (`rokad-slip-{id}`) and "Slip" in Voucher search results.
- Electron chooser.html: ↑/↓/Home/End move the highlighted "Pichle Folder" (also fills the path box), Enter starts the highlighted folder, Delete = ✕ forget. Verified in Playwright with a mocked bridge.

### Jun 2026 – Modal closing on text drag-select (user video)
- Cause: backdrop `onClick={onClose}`; dragging to select text in an input and releasing over the backdrop fires `click` on the overlay → modal closed. Fix: `lib/backdrop.js` `backdropClose(onClose)` → closes only if mousedown AND mouseup/click both landed on the backdrop itself (flag stored in `dataset`). Applied to all backdrop-closing overlays (Accounts, AccountGroups, Inward, TransferForm, RenumberVouchersDialog, VoucherSlip, LedgerInUseDialog + RokadPanna, JournalEntry, NayaBill, PartyKhata, GallaMaster). Verified via Playwright drag gesture (iteration 18/19).

### Jun 2026 – Inline party create from Rokad · party validation
- Rokad party field = `PartyAutocomplete` with "+ Add 'X' as new party" (click / Enter) → POST /parties, selected in place, entered fields kept.
- Backend `POST /parties`: empty/whitespace name → 422; case-insensitive duplicate → 409 "<NAME> pehle se hai".

### Jun 2026 – Account Settled (leftover → "Account Clear" ledger)
- Settings: `settle_account_id/_name` (Settings card + inline picker in the Rokad form; "ACCOUNT CLEAR banao & link karo" auto-creates the ledger).
- `RokadIn.settle`: `_settle_targets()` validates BEFORE insert/update; `_apply_settlement()` deletes any old settlement journal, computes party balance as on entry date, posts Dr AccountClear/Cr Party (or reverse) with narration "Account cleared upto dd-mm-yyyy · <party> · baki ₹X Dr/Cr → <ledger>", `settles_rokad_id`, `auto:"settle"`; rokad gets `settle_journal_id`, `settled_amount`. Edit recomputes, un-tick/delete removes the journal; deleting the journal un-flags the rokad; auto journals cannot be hand-edited (400). Journal voucher numbers now `_next_journal_vno()` = max+1.
- UI: `SettleToggle` under the party field with live preview of the leftover (also in edit mode), SETTLED badge in the list, toast with amount/journal no.
- Accounts (Khate) page: row / name / book icon → `/parties/<id>` Account Ledger with running balance; account ledgers colour Dr balance ink (red only when overdrawn); ledger rows show DD-MM-YYYY.
- Verified: iteration 19 + 20 (backend 12/12 pytest, frontend 100%).

### Jun 2026 – Settled marker · Account Clear register · Reopen
- Ledger API (`/summary/party/{id}`) returns `settled_upto` + journal rows carry `settles_rokad_id`/`auto`. UI: green `SettledBadge` under the party header, `SettledMarkerRow` ("Account cleared upto dd-mm-yyyy · ledger 0" + Reopen) after each settlement line, DOS statement gets `stmt-settled-upto` tag + `*** ACCOUNT CLEARED UPTO … ***` rows (`components/SettledMarker.jsx`, `PartyStatement.jsx`).
- `GET /reports/account-clear?date_from&date_to` → every journal touching the Account Clear ledger (auto + manual): side `off` (Dr = party ka baki chhoda) / `back` (Cr), totals, rokad V.No. Page `/account-clear` (nav "Account Clear", Alt+W): date range, cards, table with party links + Reopen on auto rows, DOS register print (`AccountClearSheet.jsx`), Excel.
- `POST /rokad/{id}/reopen` deletes the settlement journal and un-flags the rokad (400 if not settled). Reopen buttons in Rokad list (`rokad-reopen-<id>`), ledger marker (`ledger-reopen-<id>`), report (`ac-reopen-<jid>`) via shared `reopenSettled()` confirm helper. Re-settle = edit entry and tick again.
- Verified: iteration 21 (backend 6/6 new + 12/12 regression, frontend 100%).

### Jun 2026 – Full "Create Party Khata" window from entry forms · ledger V.no badges removed
- `components/KhataModal.jsx` = shared Naya/Edit Khata form (Group*, Code auto-suggest, Naam, Type, Alt name, Place, Phone, Address, GSTIN/PAN/CST/MPST, Opening bal/qty, Rate). Used by Party Khata page, and by Rokad/Bill: "+ Add 'X' as new party" no longer auto-creates — it opens this window with the name prefilled; on Save the party is selected in the calling field (Bill: party/buyer/agent). ESC + single-key shortcuts are swallowed (window capture) so the entry form underneath is untouched; Cash/Bank-group ledgers are not selected as Party.
- Party/account ledger rows: no more "V.1/V.2" rokad voucher badges (only Bill no. / Journal no. badges remain). DOS statement keeps its Vch/Ref column.
- Verified: iteration 22 + 23 (frontend).

### Jun 2026 – Opening Balance Sheet: ACCOUNT CLEAR "+" party-wise breakdown
- `/reports/opening-balances` rows now carry `id`; response has `settle_account_id`. Page fetches `/reports/account-clear?date_to=as_on`, aggregates per party (net off−back, cleared-upto date) + an "Opening / other postings" row when head ≠ sum. `OpeningBalanceSheet` renders a `+`/`−` toggle (`ob-clear-toggle`, print:hidden) on the Account Clear row; sub-rows (`ob-clear-sub-<party>`) show on screen, in print and in Excel ONLY when expanded; group/grand totals untouched (head only). Fetch effects guarded against stale responses.
- Verified: iteration 24 + 25.

### Jun 2026 – Trial Balance "+" breakdown · Party Khata Settled filter
- `lib/accountClear.js` (aggregateClearRows / fetchClearBreakdown / clearRowLabel) shared by Opening Balance + Trial Balance. Trial Balance: `/reports/trial-balance` rows carry `id`, response `settle_account_id`; `tb-clear-toggle` on the Account Clear row → `tb-clear-sub-<party>` rows (screen/print/Excel only when expanded; Excel sub-rows keep amounts in the name so group subtotals stay head-only; `_sub` rows excluded from Excel group counts).
- `/parties` returns `settled_upto` (latest settlement journal date) + `settled` (= settled_upto && balance 0). Party Khata: `select-party-settled` (Sabhi / Sirf Settled / Settled chhupao), green `SETTLED dd-mm-yyyy` badge, Excel "Settled" column, print subtitle suffix, filter-aware empty state.
- Verified: iteration 26 (backend 5/5, frontend 100%).

### Jun 2026 – Outstanding "Settled chhupao"
- `/reports/outstanding?hide_settled=true` skips parties cleared via Account Settled whose ledger is 0 TODAY (`_settled_now_map`), returns `settled_hidden`; rows carry `settled_upto`. UI pill `toggle-os-hide-settled` (URL `hs=1`), `os-settled-hidden` count, `[SETTLED dd-mm-yyyy]` tag on rows when not hidden, print header suffix, Excel "Settled" column.
- Ledger → voucher edit (Jun 2026): pencil column in PartyLedger (`ledger-edit-<kind>-<id>`, print:hidden) → `/rokad?edit=<id>&return=…`, `/journal?edit=…`, `/bills?edit=…`; settlement journal rows open the underlying rokad. Target pages fetch `GET /rokad/{id}` / `GET /journal/{id}` (declared AFTER literal `/rokad/accounts-summary` etc. — path-param routes must come last), set date filters, strip `edit`, and `closeForm` navigates to `return`. Verified iteration 28.
- Ledger row delete (Jun 2026): red trash beside the pencil (`ledger-del-<kind>-<id>`) → confirm → DELETE rokad/journal/bill, page reloads in place; settlement rows → Reopen. Stale settlement guard: `SettledMarkerRow balance` prop — if the running balance after the settlement line ≠ 0 (earlier voucher deleted/edited later) the marker turns amber "settlement purana — baki ₹X" (statement print too). Verified iteration 30.
- Party Remark (Jun 2026): `PartyIn.remark` free text (≤500) in KhataModal (`input-party-remark`); shown in Party Khata list (`party-remark-<id>`, searchable, Excel column), ledger header (`ledger-remark`), DOS statement (`stmt-remark`). Group missing on edit → toast instead of silent native block. Verified iteration 32.
- Lesson: never insert a helper between a route decorator and its function (the decorator landed on the helper → endpoint returned {}); keep URL-param state in fetch effect deps.
- Verified: iteration 27 (backend 5/5, frontend 100%).

### Jun 2026 – Versioning rule (user ask: "version number hamesha build ke baad likho")
- CI guard (build-desktop.yml "Duplicate build guard"): fails fast if GitHub Release tag v<version> already exists (workflow re-run) or if the current commit is already released under any v* tag (no new changes). Final step writes "✅ Build complete — v<version>" to the job summary + notice.
- Version = `1.0.<GitHub Actions run_number>` (CI reads MAJOR.MINOR from `electron/package.json` = 1.0 → do NOT bump it; numbering must stay continuous). **Latest user-installed build: v1.0.14** (Jun 2026). Every build via "Save to GitHub" → next number (1.0.15, 1.0.16 …). ALWAYS end user-facing summaries with: "Build ke baad version: v1.0.<N+1>" using the latest known build number; ask the user for the actual number once they build if unsure.

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
See `/app/memory/test_credentials.md` — username `admin` / password `Vyapari@2026` (changed via first-run gate; fresh installs start with admin123 + forced change)
