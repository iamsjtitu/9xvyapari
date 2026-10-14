import { inr } from "@/lib/api";

const amt = (v) => (v > 0.004 ? inr(v) : "");
const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

const Line = ({ code, name, dr, cr, cls = "", testId }) => (
  <div className={`dos-line ${cls}`} data-testid={testId}>
    <span className="c">{code}</span>
    <span className="n" title={name}>{name}</span>
    <span className="d">{dr}</span>
    <span className="k">{cr}</span>
  </div>
);

export const OpeningBalanceSheet = ({ data }) => (
  <div className="dos-sheet" data-testid="opening-balance-sheet">
    <div className="text-center mb-3 print:hidden">
      <div className="font-bold text-base uppercase tracking-wider" data-testid="ob-firm">{data.firm_name}</div>
      <div className="font-bold mt-1">OPENING BALANCE SHEET</div>
      <div className="text-[11px]">AS ON {fmtDate(data.as_on)} &nbsp;|&nbsp; F.Y. {data.fy_text}</div>
      <div className="text-[11px]">{"=".repeat(64)}</div>
    </div>

    <div className="dos-cols">
      <Line code="CODE" name="LEDGER / PARTY NAME" dr="DEBIT (DR)" cr="CREDIT (CR)" cls="dos-head" />
      {data.sections.map((sec) => (
        <div key={sec.group_name}>
          <Line code="" name={`-- ${sec.group_name}${sec.fcode ? ` (${sec.fcode}-${sec.lcode})` : ""} --`}
            dr="" cr="" cls="dos-group" testId={`ob-group-${sec.group_name}`} />
          {sec.rows.map((r, i) => (
            <Line key={`${r.kind}-${r.code}-${i}`} code={r.code || ""} name={r.name}
              dr={amt(r.balance)} cr={amt(-r.balance)} />
          ))}
          <Line code="" name={`${sec.group_name} TOTAL`} dr={inr(sec.dr_total)} cr={inr(sec.cr_total)} cls="dos-total" />
        </div>
      ))}
      {data.sections.length === 0 && (
        <div className="dos-line"><span className="n">KOI OPENING BALANCE NAHI</span></div>
      )}
    </div>

    <div className="dos-grand" data-testid="ob-grand">
      <div className="flex justify-between"><span>LEDGERS WITH OPENING BALANCE</span><span>{data.count}</span></div>
      <div className="flex justify-between font-bold"><span>GRAND TOTAL DEBIT</span><span data-testid="ob-grand-dr">₹ {inr(data.grand_dr)}</span></div>
      <div className="flex justify-between font-bold"><span>GRAND TOTAL CREDIT</span><span data-testid="ob-grand-cr">₹ {inr(data.grand_cr)}</span></div>
      <div className="flex justify-between border-t border-black mt-1 pt-1">
        <span>DIFFERENCE (DR − CR)</span>
        <span data-testid="ob-difference">
          {Math.abs(data.difference) < 0.01 ? "NIL — BALANCED" : `₹ ${inr(Math.abs(data.difference))} ${data.difference > 0 ? "DR" : "CR"}`}
        </span>
      </div>
    </div>

    <div className="dos-sign">
      <div>Prepared By</div>
      <div>Checked By</div>
      <div>Proprietor</div>
    </div>
  </div>
);
