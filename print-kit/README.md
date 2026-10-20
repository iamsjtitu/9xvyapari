# 9x Vyapari — DOS / FoxPro Print Kit

Yeh folder **sirf print/PDF/Excel ka DOS-style system** hai (koi accounting logic nahi). Ise kisi bhi React (+ optional Electron) app me — jaise Rice Mill software — daal kar wahi look milega:
monospace (IBM Plex Mono), fixed-width columns, bold totals with top border, dual-column / T-format sheets, A4 landscape/portrait auto, ek-line niyam (koi cell upar-niche nahi tootta), Print → PDF preview, Excel export.

## Files

| File | Kya hai |
|---|---|
| `dos-print.css` | Poora DOS print CSS: `.dos-sheet`, `.dos-stmt`, `.dos-stmt-row` (columns `.dt` date, `.pt` particulars, `.rf` V.No, `.iv` INV No, `.am` amount, `.bl` balance), `.db-row` (T-shaped cash book), `.dos-head/.dos-total/.dos-sub/.dos-settled/.dos-line`, voucher slip `.vs-*`, sab `@media print` rules (7.5pt, page-break per account, colors exact) + `table.dense` ek-line rule (`white-space: nowrap`, `.cell-grow` ellipsis). **Poora file `index.css` ke end me paste karo.** |
| `lib/exports.js` | `triggerPrint()` (Electron ho toh PDF preview window, warna `window.print`), `injectPageRule()` + `detectOrientation()` (route ke hisab se landscape/portrait; `body.print-slip` → portrait), `foxproHeader()`, `exportToExcel({filename, title, sheets:[{name, subtitle, columns:[{key,label,width,num}], rows, groupBy}]})` (ExcelJS; grouped subtotals, Indian number format). |
| `lib/format.js` | `inr()` (1,00,000.00), `todayISO()`, `fmtDate()`, `BRAND`, `appVersionLabel()` — standalone replacement for 9x Vyapari ke `@/lib/api` + `@/lib/brand`. |
| `lib/words.js` | `amountInWords()` — rupees in words (slip ke liye). |
| `lib/backdrop.js` | `backdropClose()` — modal sirf backdrop par mouse-down+up se band ho (text select karte waqt band na ho). |
| `components/ExportBar.jsx` | **Print / PDF / Excel** button strip + `FoxProPrintHeader` (firm name, title, period, "Printed on"). Har report page ke header me daalo. |
| `components/PartyStatement.jsx` | Ledger statement (Date · Particulars · V.No · INV No · Debit · Credit · Balance, Opening B/F, Total, Closing). |
| `components/DayBookSheet.jsx` | Cash/Bank Day Book — har account ka alag hisab: left Opening B/F + Jama entries + **Total Jama**, right Kharch entries + **Total Kharch** + **Closing C/F**. `pageBreak` prop = har account alag page. |
| `components/VoucherSlip.jsx` | Half-page receipt/payment slip (portrait), Print/PDF buttons, Esc close, rupees in words. |
| `components/OpeningBalanceSheet.jsx` | Group-wise Dr/Cr opening balance sheet with "+" sub-rows. |
| `components/OutstandingSheet.jsx` | Collection (vasooli) list print. |
| `components/AccountClearSheet.jsx` | Date-range register print (example of a simple DOS register). |
| `electron/printing.js` | Electron main-process: `print:preview` IPC → `webContents.printToPDF` → PDF preview window (Windows me "doesn't support print preview" problem ka hal). Preload me expose karo: `printPreview: (opts) => ipcRenderer.invoke("print:preview", opts)`; menu me Ctrl+P → `webContents.send("print:request")` → renderer `window.dispatchEvent(new Event("vyapari:print"))`. |

## Install (target app me)

```bash
yarn add exceljs @phosphor-icons/react
```
Font: `index.html` me `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">` (offline app ho toh font file bundle karo; fallback "Courier New" CSS me hai).

1. `dos-print.css` ka content apne `index.css` ke end me paste karo.
2. `lib/*` → `src/lib/`, `components/*` → `src/components/`. Imports badlo: `@/lib/api` → `@/lib/format` (`inr`), `@/lib/brand` → `@/lib/format` (`BRAND`, `appVersionLabel`). `OpeningBalanceSheet` ka `clearRowLabel` import hata do (Account Clear specific).
3. Report page me:
   ```jsx
   <ExportBar filename="daily-register-2026-06-16" title="Daily Register · 16-06-2026" sheets={[{ name: "Register", columns, rows }]} />
   <div className="dos-sheet dos-stmt card-flat p-5">
     <div className="dos-stmt-row dos-head"><span className="dt">Date</span><span className="pt">Particulars</span><span className="rf">V.No</span><span className="iv">INV No</span><span className="am">Debit</span><span className="am">Credit</span><span className="bl">Balance</span></div>
     {rows.map((r) => <div className="dos-stmt-row" key={r.id}><span className="dt">{fmtDate(r.date)}</span><span className="pt" title={r.label}>{r.label}</span><span className="rf">{r.vno}</span><span className="iv">{r.inv}</span><span className="am">{r.debit ? inr(r.debit) : ""}</span><span className="am">{r.credit ? inr(r.credit) : ""}</span><span className="bl">{inr(Math.abs(r.balance))} {r.balance < 0 ? "Cr" : "Dr"}</span></div>)}
     <div className="dos-stmt-row dos-total"><span className="dt"></span><span className="pt">TOTAL</span><span className="rf"></span><span className="iv"></span><span className="am">{inr(totDr)}</span><span className="am">{inr(totCr)}</span><span className="bl"></span></div>
   </div>
   ```
4. Screen tables: `<table className="dense w-full">`; lambi text wali `<td className="cell-grow">` + andar `<span className="truncate">`.
5. `detectOrientation()` me apne landscape routes add karo (e.g. `/register`, `/reports`).

## Dusre Emergent agent ko yeh bolo (copy-paste)

> Mere GitHub repo `https://github.com/<user>/<9x-vyapari-repo>` me folder **`print-kit/`** hai — README padho aur usi ke mutabik is Rice Mill software me **wahi DOS/FoxPro print style** lagao: `dos-print.css` index.css me, `lib/exports.js` + `lib/format.js`, `ExportBar` har report par (Print/PDF/Excel), DOS sheets (`.dos-stmt-row` columns dt/pt/rf/iv/am/bl, `.dos-total` bold totals) — har register/ledger/statement isi style me, IBM Plex Mono font, Indian number format, ek-line niyam (`table.dense` nowrap + `.cell-grow`), V.No aur INV No alag columns, Electron me `printing.js` wala PDF preview. Pehle ek report (daily register) is style me bana kar dikhao, approve hone par baaki sab.
