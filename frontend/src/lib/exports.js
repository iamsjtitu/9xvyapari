import ExcelJS from "exceljs";
import api from "@/lib/api";
import { BRAND, appVersionLabel } from "@/lib/brand";

export function inrPlain(n) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2, minimumFractionDigits: 2,
  }).format(Number(n || 0));
}

/* ---- Excel Export (ExcelJS): firm band, styled header, Indian ₹ format, zebra rows, SUM totals, print setup ---- */
const X = {
  ink: "FF1A1A1A", sidebar: "FF2C2A29", terracotta: "FF8B2520", parchment: "FFF4F1EA", bone: "FFFBF9F4",
  khaki: "FFD6D1C4", white: "FFFFFFFF", muted: "FF595959", jama: "FF1B5E20", kharch: "FFB71C1C", band: "FFEFE9DC",
};
const INR = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00'; // 1,23,45,678.00 style
const INT = "#,##0";
const SUM_LABEL = /amount|amt|debit|credit|\bdr\b|\bcr\b|jama|kharch|lena|dena|receipt|payment|qty|bags|weight|\bwt\b|taxable|cgst|sgst|igst|^total|net amt|nag/i;
const NO_SUM_LABEL = /balance|rate|bhav|days|%|phone|code|v\.?no|bill no|sr|s\.no|year|pin/i;
const thin = { style: "thin", color: { argb: X.khaki } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const isISODate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const toDate = (v) => { const [y, m, d] = v.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const isNumLike = (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && /^-?[\d,]+(\.\d+)?$/.test(v.trim()));
const toNum = (v) => (typeof v === "number" ? v : Number(String(v).replace(/,/g, "")));

let settingsCache = null;
async function firmInfo() {
  if (!settingsCache) {
    try { settingsCache = (await api.get("/settings")).data || {}; } catch { settingsCache = {}; }
  }
  return settingsCache;
}

const fmtD = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "");

function cellValue(col, row) {
  const v = typeof col.value === "function" ? col.value(row) : row[col.key];
  return v ?? "";
}

const CODE_LABEL = /code|phone|mobile|v\.?no|bill no|chq|pin|gstin|hsn|a\/c$|no\.?$/i;

// Column kind: money / int / code (number, no grouping, never summed) / date / text — explicit flags win, else sniffed
function columnKind(col, values) {
  if (CODE_LABEL.test(col.label)) return col.num ? "code" : "text";
  if (col.num || col.money) return "money";
  if (col.date) return "date";
  const filled = values.filter((v) => v !== "" && v != null);
  if (!filled.length) return "text";
  if (filled.every(isISODate) && /date|dt|txn|dinank|tarikh/i.test(col.label)) return "date";
  if (filled.every(isNumLike)) {
    return filled.every((v) => Number.isInteger(toNum(v))) && /days|qty|bags|nag|count|sr/i.test(col.label) ? "int" : "money";
  }
  return "text";
}

// groupBy given as a column key (string) → that column is hidden and shown as group headers instead
const groupKeyOf = (sh) => (typeof sh.groupBy === "string" && sh.hideGroupColumn !== false ? sh.groupBy : null);

function buildSheet(wb, sh, firm, meta) {
  const ws = wb.addWorksheet(sh.name.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"), {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: (sh.columns.length - (groupKeyOf(sh) ? 1 : 0)) > 6 ? "landscape" : "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }, printTitlesRow: "5:5" },
    properties: { tabColor: { argb: X.terracotta } },
  });
  // grouped sheets drop the group column — the group header row carries the name (DOS print style)
  const columns = groupKeyOf(sh) ? sh.columns.filter((c) => c.key !== sh.groupBy) : sh.columns;
  const nCols = columns.length;
  const last = ws.getColumn(nCols).letter;
  const matrix = sh.rows.map((r) => columns.map((c) => cellValue(c, r)));
  const kinds = columns.map((c, i) => columnKind(c, matrix.map((row) => row[i])));

  // Rows 1-4: firm band
  ws.mergeCells(`A1:${last}1`);
  const t1 = ws.getCell("A1");
  t1.value = (firm.firm_name || BRAND.app).toUpperCase();
  t1.font = { name: "Calibri", size: 18, bold: true, color: { argb: X.white } };
  t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: X.sidebar } };
  t1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(`A2:${last}2`);
  const t2 = ws.getCell("A2");
  t2.value = sh.title || meta.title || sh.name;
  t2.font = { name: "Calibri", size: 13, bold: true, color: { argb: X.white } };
  t2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: X.terracotta } };
  t2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 22;

  ws.mergeCells(`A3:${last}3`);
  const fy = firm.fy_start ? `FY ${fmtD(firm.fy_start)} – ${fmtD(firm.fy_end)}` : "";
  const t3 = ws.getCell("A3");
  t3.value = [sh.subtitle || meta.subtitle, fy, `${sh.rows.length} rows`].filter(Boolean).join("   ·   ");
  t3.font = { name: "Calibri", size: 10, italic: true, color: { argb: X.muted } };
  t3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: X.band } };
  t3.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 6;

  // Row 5: header
  const header = ws.getRow(5);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: X.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: X.ink } };
    cell.alignment = { vertical: "middle", horizontal: ["money", "int", "code"].includes(kinds[i]) ? "right" : "left", wrapText: true };
    cell.border = BORDER;
  });
  header.height = 24;

  // Data rows (optionally grouped: group header → rows → bold sub-total, like the DOS print)
  const sumCols = columns.map((c, i) => c.sum === true || (c.sum !== false && (kinds[i] === "money" || kinds[i] === "int")
    && (SUM_LABEL.test(c.label) || c.num) && !NO_SUM_LABEL.test(c.label)));
  const groupOf = sh.groupBy ? (typeof sh.groupBy === "function" ? sh.groupBy : (r) => r[sh.groupBy]) : null;
  const firstData = 6;
  let cursor = 6;

  const ROW_STYLES = { // sh.rowStyle(row) → opening / closing / bold rows (ledger B/F, C/F etc.)
    opening: { bold: true, fill: X.band },
    closing: { bold: true, fill: X.parchment, top: "medium" },
    bold: { bold: true, fill: null },
  };
  const writeDataRow = (vals, zebra, styleName) => {
    const st = styleName ? ROW_STYLES[styleName] : null;
    const row = ws.getRow(cursor++);
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      const kind = kinds[i];
      if (kind === "money" || kind === "int" || kind === "code") {
        cell.value = v === "" || v == null ? null : isNumLike(v) ? toNum(v) : v;
        cell.numFmt = kind === "money" ? INR : kind === "int" ? INT : "0";
        cell.alignment = { horizontal: "right", vertical: "middle" };
        if (typeof cell.value === "number" && cell.value < 0) cell.font = { name: "Calibri", size: 10.5, color: { argb: X.kharch } };
      } else if (kind === "date" && isISODate(v)) {
        cell.value = toDate(v);
        cell.numFmt = "dd-mm-yyyy";
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.value = v === null ? "" : v;
        cell.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
      }
      if (!cell.font) cell.font = { name: "Calibri", size: 10.5, color: { argb: X.ink } };
      if (st?.bold) cell.font = { ...cell.font, bold: true };
      cell.border = st?.top ? { ...BORDER, top: { style: st.top, color: { argb: X.ink } } } : BORDER;
      if (st?.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: st.fill } };
      else if (zebra && !st) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: X.bone } };
    });
    row.height = st ? 20 : 18;
  };
  const styleOf = (r) => (typeof sh.rowStyle === "function" ? sh.rowStyle(r) : null);

  const writeGroupHeader = (name, count) => {
    const row = ws.getRow(cursor++);
    ws.mergeCells(`A${row.number}:${last}${row.number}`);
    const cell = row.getCell(1);
    cell.value = `${String(name || "—").toUpperCase()}   (${count})`;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: X.terracotta } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: X.band } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.border = { ...BORDER, top: { style: "thin", color: { argb: X.terracotta } } };
    row.height = 20;
  };

  // SUBTOTAL(9, …) ignores other SUBTOTAL cells → group sub-totals and the grand total never double count
  const writeTotalRow = (label, from, to, grand) => {
    const row = ws.getRow(cursor++);
    const labelAt = sumCols.findIndex(Boolean);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const L = ws.getColumn(i + 1).letter;
      if (sumCols[i]) {
        cell.value = { formula: `SUBTOTAL(9,${L}${from}:${L}${to})` };
        cell.numFmt = kinds[i] === "int" ? INT : INR;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (i === 0 && labelAt !== 0) {
        cell.value = label;
        cell.alignment = { horizontal: "left", vertical: "middle", indent: grand ? 0 : 1 };
      }
      cell.font = { name: "Calibri", size: grand ? 11 : 10.5, bold: true, color: { argb: X.ink } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: grand ? X.parchment : X.band } };
      cell.border = grand
        ? { ...BORDER, top: { style: "medium", color: { argb: X.ink } }, bottom: { style: "double", color: { argb: X.ink } } }
        : { ...BORDER, top: { style: "thin", color: { argb: X.ink } } };
    });
    row.height = grand ? 22 : 19;
  };

  const hasSums = matrix.length > 0 && sumCols.some(Boolean);
  if (groupOf) {
    let i = 0;
    while (i < matrix.length) {
      const g = groupOf(sh.rows[i]);
      let j = i;
      while (j < matrix.length && groupOf(sh.rows[j]) === g) j++;
      writeGroupHeader(g, sh.rows.slice(i, j).filter((r) => !r._sub).length); // detail "_sub" rows don't count
      const from = cursor;
      for (let k = i; k < j; k++) writeDataRow(matrix[k], (k - i) % 2 === 1, styleOf(sh.rows[k]));
      if (hasSums) writeTotalRow(`Sub-total · ${g || "—"}`, from, cursor - 1, false);
      i = j;
    }
  } else {
    matrix.forEach((vals, r) => writeDataRow(vals, r % 2 === 1, styleOf(sh.rows[r])));
  }
  const lastData = cursor - 1;
  if (hasSums) writeTotalRow(groupOf ? "GRAND TOTAL" : "TOTAL", firstData, lastData, true);

  // Footer note
  const fr = ws.getRow(lastData + 3);
  ws.mergeCells(`A${lastData + 3}:${last}${lastData + 3}`);
  fr.getCell(1).value = `Generated by ${BRAND.app} ${appVersionLabel()} · ${new Date().toLocaleString("en-IN")} · ${BRAND.developer}`;
  fr.getCell(1).font = { name: "Calibri", size: 9, italic: true, color: { argb: X.muted } };

  // Widths: definition or sniffed from content
  columns.forEach((c, i) => {
    const longest = Math.max(String(c.label).length, ...matrix.map((row) => String(row[i] ?? "").length));
    ws.getColumn(i + 1).width = c.width || Math.min(48, Math.max(8, longest + 2));
  });
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, lastData), column: nCols } };
  ws.headerFooter = { oddFooter: `&L&8${firm.firm_name || BRAND.app}&C&8Page &P / &N&R&8${BRAND.app}` };
}

export async function exportToExcel(filename, sheets, meta = {}) {
  const firm = await firmInfo();
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.app;
  wb.created = new Date();
  for (const sh of sheets) buildSheet(wb, sh, firm, meta);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.xlsx$/i, "") + ".xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---- Print / PDF — auto landscape detection for cash book / wide reports ---- */
function injectPageRule(orientation) {
  // Remove any previous one
  document.getElementById("__print_page_rule__")?.remove();
  const style = document.createElement("style");
  style.id = "__print_page_rule__";
  style.media = "print";
  style.innerHTML = `@page { size: A4 ${orientation}; margin: 8mm; }`;
  document.head.appendChild(style);
}

function detectOrientation() {
  if (document.body.classList.contains("print-slip")) return "portrait";   // voucher / salary slip overlay
  // landscape for pages with wide tables
  const path = window.location.pathname;
  if (path.includes("/rokad") || path.includes("/gst-returns") ||
      path.includes("/trial-balance") || path.includes("/reports") ||
      path.includes("/bills") || path.includes("/parties") ||
      path.includes("/inward") || path.includes("/journal") ||
      path.includes("/opening-balance") || path.includes("/outstanding") ||
      path.includes("/account-clear") || path.includes("/staff/") || path.includes("/income-expense")) {
    return "landscape";
  }
  return "portrait";
}

export function triggerPrint() {
  const orientation = detectOrientation();
  injectPageRule(orientation);
  // Desktop app: Electron has no print preview → open our PDF preview window instead
  if (window.vyapari?.printPreview) {
    setTimeout(() => window.vyapari.printPreview({ landscape: orientation === "landscape", title: document.title }), 30);
    return;
  }
  // give browser time to apply the new stylesheet
  setTimeout(() => window.print(), 30);
}

if (typeof window !== "undefined") {
  window.addEventListener("vyapari:print", () => triggerPrint());
}

export function exportPDF() {
  triggerPrint();
}

/* ---- FoxPro-style header builder for print ---- */
export function foxproHeader({ firm, phones, title, subtitle, fyText }) {
  const now = new Date();
  const dt = now.toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const tm = now.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return { firm, phones, title, subtitle, fyText, dt, tm };
}
