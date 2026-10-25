import { inr } from "@/lib/api";
import { BRAND, appVersionLabel } from "@/lib/brand";
import { fmtBal, LEGEND_PARTY, LEGEND_CASH } from "@/lib/drcr";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const drcr = (n) => (Math.abs(n || 0) < 0.005 ? `${inr(0)}   ` : fmtBal(n, false));   // passbook: +ve = Cr
const refOf = (r) => r.vno || r.voucher_no || r.ref_no || r.bill_no || "";

// DOS-style printable ledger statement: opening → entries → totals → closing, one page.
// Columns follow the PASSBOOK rule (lib/drcr.js): Debit = gaya, Credit = aaya, balance Cr = lena / paisa hai.
export const PartyStatement = ({ firmName, party, rows, opening, closing, dateFrom, asOn, settledUpto, isCash = false }) => {
  const totalDr = rows.reduce((t, r) => t + (r.debit || 0), 0);
  const totalCr = rows.reduce((t, r) => t + (r.credit || 0), 0);
  const period = dateFrom ? `${fmtDate(dateFrom)} To ${fmtDate(asOn)}` : `Upto ${fmtDate(asOn)}`;
  return (
    <div className="dos-sheet dos-stmt card-flat p-5" id="ledger-printable" data-testid="party-statement">
      <div className="text-center">
        <div className="font-bold text-base uppercase tracking-wide">{firmName || BRAND.app}</div>
        <div className="font-bold uppercase">Ledger Account Statement</div>
      </div>
      <div className="flex justify-between mt-2 uppercase">
        <div>
          Party : <b>{party.name}</b>{party.code ? ` (Code ${party.code})` : ""}
          {party.place ? ` · ${party.place}` : ""}
        </div>
        <div>Period : <b>{period}</b></div>
        {party.remark && <div data-testid="stmt-remark">Remark : <b>{party.remark}</b></div>}
        {settledUpto && <div className="dos-settled-tag" data-testid="stmt-settled-upto">✔ ACCOUNT CLEARED UPTO {fmtDate(settledUpto)}</div>}
      </div>
      <div className="dos-stmt-row dos-head mt-2">
        <span className="dt">Date</span><span className="pt">Particulars</span><span className="rf">V.No</span><span className="iv">INV No</span>
        <span className="am">{isCash ? "Debit (Gaya)" : "Debit (Diya)"}</span><span className="am">{isCash ? "Credit (Aaya)" : "Credit (Mila)"}</span><span className="bl">Balance</span>
      </div>
      <div className="dos-stmt-row dos-open" data-testid="stmt-opening-row">
        <span className="dt">{dateFrom ? fmtDate(dateFrom) : ""}</span>
        <span className="pt">OPENING BALANCE{dateFrom ? ` (B/F)` : ""}</span><span className="rf"></span><span className="iv"></span>
        <span className="am"></span><span className="am"></span><span className="bl">{drcr(opening)}</span>
      </div>
      {rows.length === 0 ? (
        <div className="dos-stmt-row"><span className="dt"></span><span className="pt">-- is period me koi entry nahi --</span></div>
      ) : rows.map((r, i) => (
        <div key={`${r.kind}-${r.id}-${i}`}>
          <div className="dos-stmt-row">
            <span className="dt">{fmtDate((r.date || "").slice(0, 10))}</span>
            <span className="pt" title={r.label}>{r.label}</span>
            <span className="rf">{refOf(r)}</span><span className="iv">{r.inv || ""}</span>
            <span className="am">{r.debit ? inr(r.debit) : ""}</span>
            <span className="am">{r.credit ? inr(r.credit) : ""}</span>
            <span className="bl">{drcr(r.balance)}</span>
          </div>
          {r.settles_rokad_id && (
            <div className="dos-stmt-row dos-settled" data-testid="stmt-settled-row">
              <span className="dt"></span>
              <span className="pt">*** ACCOUNT CLEARED UPTO {fmtDate((r.date || "").slice(0, 10))} — {Math.abs(r.balance) < 0.005 ? "LEDGER 0" : `SETTLEMENT PURANA · BAKI ${drcr(r.balance)}`} ***</span>
              <span className="rf"></span><span className="iv"></span><span className="am"></span><span className="am"></span><span className="bl">{drcr(r.balance)}</span>
            </div>
          )}
        </div>
      ))}
      <div className="dos-stmt-row dos-total" data-testid="stmt-total-row">
        <span className="dt"></span><span className="pt">TOTAL ({rows.length} entries)</span><span className="rf"></span><span className="iv"></span>
        <span className="am">{inr(totalDr)}</span><span className="am">{inr(totalCr)}</span><span className="bl"></span>
      </div>
      <div className="dos-stmt-row dos-close" data-testid="stmt-closing-row">
        <span className="dt">{fmtDate(asOn)}</span><span className="pt">CLOSING BALANCE AS ON {fmtDate(asOn)}</span><span className="rf"></span><span className="iv"></span>
        <span className="am"></span><span className="am"></span><span className="bl">{drcr(closing)}</span>
      </div>
      <div className="flex justify-between mt-3 text-[10px] uppercase">
        <span data-testid="stmt-legend">{isCash ? LEGEND_CASH : LEGEND_PARTY}</span>
        <span>E.&amp;O.E.</span>
        <span>Printed {new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {BRAND.app} {appVersionLabel()}</span>
      </div>
      <div className="dos-sign"><div>Checked By</div><div>Party Signature</div><div>For {firmName || BRAND.app}</div></div>
    </div>
  );
};

export default PartyStatement;
