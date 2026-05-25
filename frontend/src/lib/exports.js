import * as XLSX from "xlsx";

export function inrPlain(n) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2, minimumFractionDigits: 2,
  }).format(Number(n || 0));
}

/* ---- Excel Export ---- */
export function exportToExcel(filename, sheets) {
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
  // landscape for pages with wide tables
  const path = window.location.pathname;
  if (path.includes("/rokad") || path.includes("/gst-returns") ||
      path.includes("/trial-balance") || path.includes("/reports") ||
      path.includes("/bills") || path.includes("/parties") ||
      path.includes("/inward") || path.includes("/journal")) {
    return "landscape";
  }
  return "portrait";
}

export function triggerPrint() {
  injectPageRule(detectOrientation());
  // give browser time to apply the new stylesheet
  setTimeout(() => window.print(), 30);
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
