import { inr } from "@/lib/api";
import { BRAND, appVersionLabel } from "@/lib/brand";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const SIDE_TITLE = { dr: "LENA HAI (Dr) — Collection List", cr: "DENA HAI (Cr) — Payable List", all: "OUTSTANDING (Dr / Cr)" };

// DOS-style collection-round list: parties with pending balance, grouped by account group
export const OutstandingSheet = ({ data }) => {
  const { firm_name, as_on, side, sections, count, grand_dr, grand_cr, min_amount } = data;
  return (
    <div className="dos-sheet dos-stmt card-flat p-5" id="os-printable" data-testid="outstanding-sheet">
      <div className="text-center">
        <div className="font-bold text-base uppercase tracking-wide">{firm_name || BRAND.app}</div>
        <div className="font-bold uppercase">Party Outstanding List · {SIDE_TITLE[side] || SIDE_TITLE.all}</div>
        <div className="uppercase">As on {fmtDate(as_on)}{min_amount > 0 ? ` · Min ₹ ${inr(min_amount)}` : ""} · {count} parties</div>
      </div>
      <div className="dos-stmt-row dos-head os-row mt-2">
        <span className="c">Code</span><span className="n">Party</span><span className="pl">Place</span><span className="ph">Phone</span>
        <span className="lt">Last Txn</span><span className="dy">Days</span><span className="am">Dr (Lena)</span><span className="am">Cr (Dena)</span><span className="tk">Vasooli / Remark</span>
      </div>
      {sections.length === 0 && <div className="dos-stmt-row os-row"><span className="n">-- koi outstanding nahi --</span></div>}
      {sections.map((sec) => (
        <div key={sec.group_id} className="os-group" data-testid={`os-group-${sec.group_id}`}>
          <div className="dos-group flex justify-between uppercase">
            <span>{sec.group_name} ({sec.rows.length})</span>
            <span>Dr {inr(sec.dr_total)} · Cr {inr(sec.cr_total)}</span>
          </div>
          {sec.rows.map((r) => (
            <div className="dos-stmt-row os-row" key={r.id} data-testid={`os-row-${r.id}`}>
              <span className="c">{r.code || ""}</span>
              <span className="n" title={r.name}>{r.name}</span>
              <span className="pl" title={r.place}>{r.place || ""}</span>
              <span className="ph">{r.phone || ""}</span>
              <span className="lt">{fmtDate(r.last_txn)}</span>
              <span className="dy">{r.days == null ? "" : r.days}</span>
              <span className="am">{r.balance > 0 ? inr(r.balance) : ""}</span>
              <span className="am">{r.balance < 0 ? inr(-r.balance) : ""}</span>
              <span className="tk"></span>
            </div>
          ))}
          <div className="dos-stmt-row os-row dos-total" data-testid={`os-subtotal-${sec.group_id}`}>
            <span className="c"></span><span className="n">SUB TOTAL · {sec.group_name}</span><span className="pl"></span><span className="ph"></span><span className="lt"></span><span className="dy"></span>
            <span className="am">{sec.dr_total ? inr(sec.dr_total) : ""}</span><span className="am">{sec.cr_total ? inr(sec.cr_total) : ""}</span><span className="tk"></span>
          </div>
        </div>
      ))}
      <div className="dos-grand" data-testid="os-grand">
        <div className="flex justify-between font-bold uppercase">
          <span>Grand Total · {count} parties</span>
          <span>Lena (Dr) {inr(grand_dr)} &nbsp;|&nbsp; Dena (Cr) {inr(grand_cr)} &nbsp;|&nbsp; Net {inr(Math.abs(grand_dr - grand_cr))} {grand_dr - grand_cr >= 0 ? "Dr" : "Cr"}</span>
        </div>
      </div>
      <div className="flex justify-between mt-3 text-[10px] uppercase">
        <span>Days = Last txn se as-on tak · Blank = koi entry nahi</span>
        <span>E.&amp;O.E.</span>
        <span>Printed {new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {BRAND.app} {appVersionLabel()}</span>
      </div>
      <div className="dos-sign"><div>Vasooli Karta</div><div>Checked By</div><div>For {firm_name || BRAND.app}</div></div>
    </div>
  );
};

export default OutstandingSheet;
