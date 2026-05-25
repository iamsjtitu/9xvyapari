import * as XLSX from "xlsx";

export function inrPlain(n) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2, minimumFractionDigits: 2,
  }).format(Number(n || 0));
}

/* ---- Excel Export ---- */
export function exportToExcel(filename, sheets) {
  // sheets: [{name, columns: [{key, label, width?, num?}], rows: [...]}]
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const data = [
      sh.columns.map((c) => c.label),
      ...sh.rows.map((r) => sh.columns.map((c) => {
        const v = typeof c.value === "function" ? c.value(r) : r[c.key];
        return v ?? "";
      })),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = sh.columns.map((c) => ({ wch: c.width || 15 }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.replace(/\.xlsx$/i, "") + ".xlsx");
}

/* ---- Print / PDF ---- */
export function triggerPrint() {
  window.print();
}

export function exportPDF() {
  // Browser "Save as PDF" via print dialog (cleanest, no library needed)
  window.print();
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
