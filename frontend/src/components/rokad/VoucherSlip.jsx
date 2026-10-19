import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import { Printer, FilePdf, X } from "@phosphor-icons/react";
import { inr } from "@/lib/api";
import { amountInWords } from "@/lib/words";
import { triggerPrint } from "@/lib/exports";

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "");

// DOS-style half-page voucher slip for one rokad entry (receipt / payment). Portal + body.print-slip → prints alone.
export const VoucherSlip = ({ entry, onClose }) => {
  const { settings } = useOutletContext() || {};
  useEffect(() => {
    document.body.classList.add("print-slip");
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => { document.body.classList.remove("print-slip"); window.removeEventListener("keydown", onKey, true); };
  }, [onClose]);
  if (!entry) return null;

  const jama = entry.type === "jama";
  const title = entry.contra_id ? "CONTRA VOUCHER" : jama ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER";
  const firm = (settings?.firm_name || "9x Vyapari").toUpperCase();
  const fy = settings?.fy_start ? `FY ${fmtDate(settings.fy_start)} - ${fmtDate(settings.fy_end)}` : "";
  const row = (k, v, k2, v2) => (
    <div className="vs-row">
      <span className="vs-k">{k}</span><span className="vs-v">{v || "-"}</span>
      {k2 ? <><span className="vs-k vs-k2">{k2}</span><span className="vs-v2">{v2 || "-"}</span></> : null}
    </div>
  );

  return createPortal(
    <div className="slip-overlay fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose} data-testid="voucher-slip">
      <div className="bg-white rounded-sm shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-khaki print:hidden">
          <div className="font-heading font-semibold">{title} · V.{entry.voucher_no || "—"}</div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => triggerPrint()} data-testid="slip-print"><Printer size={14} /> Print</button>
            <button className="btn-outline" onClick={() => triggerPrint()} data-testid="slip-pdf"><FilePdf size={14} /> PDF</button>
            <button className="btn-ghost p-1.5" onClick={onClose} title="Band (Esc)" data-testid="slip-close"><X size={16} /></button>
          </div>
        </div>
        <div className="vs-sheet" id="voucher-slip-printable" data-testid="slip-sheet">
          <div className="vs-center vs-firm">{firm}</div>
          <div className="vs-center vs-sub">{[settings?.address, settings?.phone].filter(Boolean).join(" · ")}{fy ? `${settings?.address || settings?.phone ? " · " : ""}${fy}` : ""}</div>
          <div className="vs-hr vs-hr-dbl" />
          <div className="vs-row vs-title">
            <span className="vs-v" style={{ fontWeight: 700 }} data-testid="slip-title">{title}</span>
            <span>No. : <b data-testid="slip-vno">{entry.voucher_no || "—"}</b></span>
          </div>
          <div className="vs-row"><span className="vs-v">&nbsp;</span><span>Date: <b data-testid="slip-date">{fmtDate(entry.date)}</b></span></div>
          <div className="vs-hr" />
          {row("A/C", entry.cash_account_name, "Mode", entry.mode)}
          {row(jama ? "Received From" : "Paid To", entry.party_name, "Chq No", entry.chq_no)}
          {row("Amount", `Rs. ${inr(entry.amount)}`)}
          {row("Rupees", amountInWords(entry.amount))}
          {row("Narration", entry.description)}
          <div className="vs-hr" />
          <div className="vs-amount-box">
            <span>{jama ? "RECEIVED" : "PAID"}</span>
            <span data-testid="slip-amount">Rs. {inr(entry.amount)}</span>
          </div>
          <div className="vs-sign">
            <span>Prepared By</span><span>Authorised By</span><span>{jama ? "Payer's Sign" : "Receiver's Sign"}</span>
          </div>
          <div className="vs-foot">Voucher ID {String(entry.id || "").slice(0, 8)} · Printed {new Date().toLocaleString("en-IN")} · 9x Vyapari</div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VoucherSlip;
