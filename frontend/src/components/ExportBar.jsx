import { useEffect } from "react";
import { Printer, FilePdf, FileXls } from "@phosphor-icons/react";
import { exportToExcel, triggerPrint, setPdfName, safeFileName } from "@/lib/exports";

// pdfName: readable file name for the PDF (party / account name); falls back to `filename`
export function ExportBar({ filename, pdfName, sheets, title, hidePrint, className = "" }) {
  const name = pdfName || filename;
  useEffect(() => { setPdfName(name); return () => { if (window.__pdfName === safeFileName(name)) window.__pdfName = ""; }; }, [name]);
  const print = () => triggerPrint({ filename: name });
  return (
    <div className={`flex gap-2 print:hidden ${className}`} data-testid="export-bar">
      {!hidePrint && (
        <button className="btn-outline" onClick={print} data-testid="btn-print"
          title="Print (Ctrl+P)">
          <Printer size={15} weight="bold" /> Print
        </button>
      )}
      <button className="btn-outline" onClick={print} data-testid="btn-pdf"
        title={`Save as PDF — file: ${name}.pdf`}>
        <FilePdf size={15} weight="bold" color="#B71C1C" /> PDF
      </button>
      <button className="btn-outline" onClick={() => exportToExcel(filename, sheets, { title })}
        data-testid="btn-excel" title="Export to Excel (.xlsx)">
        <FileXls size={15} weight="bold" color="#1B5E20" /> Excel
      </button>
    </div>
  );
}

/* FoxPro-style print header — same look as AA.TXT */
export function FoxProPrintHeader({ firmName = "9X VYAPARI", title, subtitle, phones, fyText }) {
  const now = new Date();
  const dt = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const tm = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  return (
    <div className="hidden print:block foxpro-print-header" data-testid="print-header">
      <div className="flex justify-between items-start text-[11px] font-mono-data">
        <div>
          <div className="font-bold">{firmName}</div>
          {phones && <div>{phones}</div>}
        </div>
        <div className="text-right">
          <div>DATE : {dt}</div>
          <div>TIME : {tm}</div>
          {fyText && <div>FY   : {fyText}</div>}
        </div>
      </div>
      <div className="foxpro-rule"></div>
      <div className="text-center font-bold font-mono-data text-[13px] mt-2">{title}</div>
      <div className="text-center font-mono-data text-[10px] mt-0.5">
        {"-".repeat(Math.max(8, (title || "").length))}
      </div>
      {subtitle && (
        <div className="text-center font-mono-data text-[10px] mt-1">{subtitle}</div>
      )}
    </div>
  );
}
