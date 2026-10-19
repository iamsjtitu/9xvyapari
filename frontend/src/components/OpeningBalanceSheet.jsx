import { inr } from "@/lib/api";
import { clearRowLabel } from "@/lib/accountClear";

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

// breakdown = { ledgerId, rows: [{party_id, party_name, net, last_date, count}] } for the Account Clear ledger;
// shown only when `expanded` (+ clicked) — on screen and in print. Amounts stay informational (totals use the head only).
const ClearBreakdown = ({ rows }) => (
  <div data-testid="ob-clear-breakdown">
    {rows.map((b) => (
      <div className="dos-line dos-sub" key={b.party_id || b.party_name} data-testid={`ob-clear-sub-${b.party_id}`}>
        <span className="c"></span>
        <span className="n" title={b.party_name}>{clearRowLabel(b)}</span>
        <span className="d">{amt(b.net)}</span>
        <span className="k">{amt(-b.net)}</span>
      </div>
    ))}
    {rows.length === 0 && <div className="dos-line dos-sub"><span className="c"></span><span className="n">↳ koi party settlement nahi</span><span className="d"></span><span className="k"></span></div>}
  </div>
);

export const OpeningBalanceSheet = ({ data, breakdown, expanded, onToggle }) => (
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
          {sec.rows.map((r, i) => {
            const isClear = breakdown && r.id && r.id === breakdown.ledgerId;
            if (!isClear) return <Line key={`${r.kind}-${r.code}-${i}`} code={r.code || ""} name={r.name} dr={amt(r.balance)} cr={amt(-r.balance)} />;
            return (
              <div key={`${r.kind}-${r.code}-${i}`}>
                <div className="dos-line" data-testid="ob-clear-row">
                  <span className="c">{r.code || ""}</span>
                  <span className="n flex items-center gap-1.5" title={r.name}>
                    <button type="button" onClick={onToggle} className="print:hidden inline-flex items-center justify-center w-4 h-4 border border-black text-[10px] leading-none font-bold hover:bg-khaki/60"
                      title={expanded ? "Party-wise breakdown chhupao" : "Party-wise breakdown dikhao"} data-testid="ob-clear-toggle">{expanded ? "−" : "+"}</button>
                    {r.name}
                    {expanded && <span className="text-[10px] normal-case text-[#555]">(party-wise)</span>}
                  </span>
                  <span className="d">{amt(r.balance)}</span>
                  <span className="k">{amt(-r.balance)}</span>
                </div>
                {expanded && <ClearBreakdown rows={breakdown.rows} />}
              </div>
            );
          })}
          <Line code="" name={`${sec.group_name} TOTAL`} dr={inr(sec.dr_total)} cr={inr(sec.cr_total)} cls="dos-total" />
        </div>
      ))}
      {data.sections.length === 0 && (
        <div className="dos-line"><span className="n">KOI OPENING BALANCE NAHI</span></div>
      )}
    </div>

    <div className="dos-grand" data-testid="ob-grand">
      <div className="flex justify-between"><span>LEDGERS WITH BALANCE</span><span>{data.count}</span></div>
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
