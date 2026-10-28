import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import { Printer, FilePdf, X } from "@phosphor-icons/react";
import { inr } from "@/lib/api";
import { amountInWords } from "@/lib/words";
import { triggerPrint } from "@/lib/exports";
import { backdropClose } from "@/lib/backdrop";
import { monthLabel } from "@/components/staff/common";

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "");

// DOS-style half-page salary slip for one staff's month (reuses the voucher-slip print CSS: vs-* + body.print-slip)
export const SalarySlip = ({ rec, staff, onClose }) => {
  const { settings } = useOutletContext() || {};
  useEffect(() => {
    document.body.classList.add("print-slip");
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => { document.body.classList.remove("print-slip"); window.removeEventListener("keydown", onKey, true); };
  }, [onClose]);
  if (!rec) return null;

  const firm = (settings?.firm_name || "9x Vyapari").toUpperCase();
  const c = rec.counts || {};
  const monthly = (staff?.salary_type || rec.salary_type) === "monthly";
  const rate = staff?.salary ?? rec.salary;
  const slipName = `${rec.staff_name || staff?.name || "Staff"} - Salary Slip ${rec.month ? monthLabel(rec.month) : ""}`.trim();
  const row = (k, v, k2, v2) => (
    <div className="vs-row">
      <span className="vs-k">{k}</span><span className="vs-v">{v ?? "-"}</span>
      {k2 ? <><span className="vs-k vs-k2">{k2}</span><span className="vs-v2">{v2 ?? "-"}</span></> : null}
    </div>
  );

  return createPortal(
    <div className="slip-overlay fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" {...backdropClose(onClose)} data-testid="salary-slip">
      <div className="bg-white rounded-sm shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-khaki print:hidden">
          <div className="font-heading font-semibold">SALARY SLIP · {rec.staff_name} · {monthLabel(rec.month)}</div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => triggerPrint({ filename: slipName })} data-testid="salary-slip-print"><Printer size={14} /> Print</button>
            <button className="btn-outline" onClick={() => triggerPrint({ filename: slipName })} data-testid="salary-slip-pdf"><FilePdf size={14} /> PDF</button>
            <button className="btn-ghost p-1.5" onClick={onClose} title="Band (Esc)" data-testid="salary-slip-close"><X size={16} /></button>
          </div>
        </div>
        <div className="vs-sheet" id="salary-slip-printable" data-testid="salary-slip-sheet">
          <div className="vs-center vs-firm">{firm}</div>
          <div className="vs-center vs-sub">{[settings?.address, settings?.phone].filter(Boolean).join(" · ")}</div>
          <div className="vs-hr vs-hr-dbl" />
          <div className="vs-row vs-title">
            <span className="vs-v" style={{ fontWeight: 700 }}>SALARY SLIP — {monthLabel(rec.month).toUpperCase()}</span>
            <span>Date: <b data-testid="salary-slip-date">{fmtDate(rec.date)}</b></span>
          </div>
          <div className="vs-hr" />
          {row("Staff", rec.staff_name, "Phone", staff?.phone || "")}
          {row("Salary", monthly ? `Monthly Rs. ${inr(rate)}  (÷30 = Rs. ${inr(rec.per_day)}/din)` : `Daily Rs. ${inr(rec.per_day)}/din`)}
          <div className="vs-hr" />
          <div className="vs-row" style={{ fontWeight: 700 }}>
            <span className="vs-k">Attendance</span>
            <span className="vs-v" data-testid="salary-slip-att">Present {c.P ?? 0} · Half {c.H ?? 0} · Absent {c.A ?? 0} · Choot {c.C ?? 0}  =  {rec.paid_days} din</span>
          </div>
          <div className="vs-hr" />
          {row("Gross Salary", `Rs. ${inr(rec.gross)}   (${rec.paid_days} din x Rs. ${inr(rec.per_day)})`)}
          {row("Advance Cut", rec.advance_deducted ? `(-) Rs. ${inr(rec.advance_deducted)}` : "Rs. 0.00")}
          <div className="vs-hr" />
          <div className="vs-amount-box">
            <span>{rec.paid_now ? "NET PAID" : "NET PAYABLE"}</span>
            <span data-testid="salary-slip-net">Rs. {inr(rec.net)}</span>
          </div>
          {row("Rupees", amountInWords(rec.net))}
          {rec.paid_now
            ? row("Paid By", `${rec.cash_account_name || ""}`.trim() || "Cash", "V.No.", rec.voucher_no || "—")
            : row("Status", "Credited to staff ledger — payment baad me")}
          {rec.note ? row("Note", rec.note) : null}
          <div className="vs-sign">
            <span>Prepared By</span><span>Authorised By</span><span>Staff Sign</span>
          </div>
          <div className="vs-foot">Slip ID {String(rec.id || "").slice(0, 8)} · Printed {new Date().toLocaleString("en-IN")} · 9x Vyapari</div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SalarySlip;
