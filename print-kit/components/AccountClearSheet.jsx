import { inr } from "@/lib/api";
import { BRAND, appVersionLabel } from "@/lib/brand";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// DOS-style printable register of everything posted to the Account Clear ledger(s); showLedger → extra column (all-ledgers view)
export const AccountClearSheet = ({ data, showLedger = false }) => {
  const { firm_name, ledger, date_from, date_to, rows, count, total_off, total_back, net } = data;
  const period = date_from ? `${fmtDate(date_from)} To ${fmtDate(date_to)}` : `Upto ${fmtDate(date_to)}`;
  return (
    <div className="dos-sheet dos-stmt card-flat p-5" id="ac-printable" data-testid="account-clear-sheet">
      <div className="text-center">
        <div className="font-bold text-base uppercase tracking-wide">{firm_name || BRAND.app}</div>
        <div className="font-bold uppercase">Account Clear Register · {ledger?.name || "—"}</div>
        <div className="uppercase">Period {period} · {count} entries</div>
      </div>
      <div className="dos-stmt-row dos-head ac-row mt-2">
        <span className="dt">Date</span><span className="rf">Jrnl</span><span className="pt">Party</span>
        {showLedger && <span className="ld">Ledger</span>}
        <span className="rf">Rokad V.</span><span className="iv">INV No</span><span className="am">Chhoda (Off)</span><span className="am">Wapas (Back)</span><span className="nr">Narration</span>
      </div>
      {rows.length === 0 && <div className="dos-stmt-row"><span className="dt"></span><span className="pt">-- is period me Account Clear me kuch nahi gaya --</span></div>}
      {rows.map((r) => (
        <div className="dos-stmt-row ac-row" key={r.journal_id} data-testid={`ac-sheet-row-${r.journal_id}`}>
          <span className="dt">{fmtDate(r.date)}</span>
          <span className="rf">{r.voucher_no}</span>
          <span className="pt" title={r.party_name}>{r.party_name}</span>
          {showLedger && <span className="ld" title={r.ledger_name}>{r.ledger_name}</span>}
          <span className="rf">{r.rokad_vno || (r.auto ? "" : "manual")}</span>
          <span className="iv">{r.rokad_inv || ""}</span>
          <span className="am">{r.side === "off" ? inr(r.amount) : ""}</span>
          <span className="am">{r.side === "back" ? inr(r.amount) : ""}</span>
          <span className="nr" title={r.narration}>{r.narration}</span>
        </div>
      ))}
      <div className="dos-stmt-row dos-total ac-row" data-testid="ac-sheet-total">
        <span className="dt"></span><span className="rf"></span><span className="pt">TOTAL ({count} entries)</span>{showLedger && <span className="ld"></span>}<span className="rf"></span><span className="iv"></span>
        <span className="am">{inr(total_off)}</span><span className="am">{inr(total_back)}</span>
        <span className="nr">NET CHHODA: {inr(Math.abs(net))} {net >= 0 ? "Dr" : "Cr"}</span>
      </div>
      <div className="flex justify-between mt-3 text-[10px] uppercase">
        <span>Off = party ka baki chhoda (Dr Account Clear) · Back = humne apna dena chhoda (Cr Account Clear)</span>
        <span>E.&amp;O.E.</span>
        <span>Printed {new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {BRAND.app} {appVersionLabel()}</span>
      </div>
      <style>{`.ac-row .nr { flex: 1.4; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; }
.ac-row .ld { width: 130px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; color: #1B5E20; }
@media print { .ac-row .nr { white-space: normal; overflow: visible; text-overflow: clip; } .ac-row .ld { width: 90pt; } }`}</style>
    </div>
  );
};
