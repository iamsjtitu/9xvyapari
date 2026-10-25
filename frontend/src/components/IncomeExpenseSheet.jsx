import { inr } from "@/lib/api";
import { BRAND, appVersionLabel } from "@/lib/brand";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const TITLES = { expense: "KHARCHA (EXPENSE) — KAHAN KAHAN GAYA", income: "AAY (INCOME) — KAHAN SE AAYA", investment: "INVESTMENT — KAHAN LAGAYA" };

// DOS-style printable Aay-Vyay: period table + group-wise heads of the selected scope
export const IncomeExpenseSheet = ({ data, heads, scopeLabel }) => {
  const periodName = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly (FY)" }[data.period];
  return (
    <div className="dos-sheet dos-stmt card-flat p-5" data-testid="income-expense-sheet">
      <div className="text-center">
        <div className="font-bold text-base uppercase tracking-wide">{data.firm_name || BRAND.app}</div>
        <div className="font-bold uppercase">Aay-Vyay Report · {periodName}</div>
        <div className="uppercase">Period {fmtDate(data.date_from)} To {fmtDate(data.date_to)}</div>
      </div>
      <div className="dos-stmt-row dos-head mt-2">
        <span className="pt">Period</span><span className="am">Income (Aay)</span><span className="am">Expense (Kharch)</span><span className="am">Investment</span><span className="bl">Net (Aay − Kharch)</span>
      </div>
      {data.rows.map((r) => (
        <div className="dos-stmt-row" key={r.key} data-testid={`ie-sheet-row-${r.key}`}>
          <span className="pt">{r.label}</span>
          <span className="am">{r.income ? inr(r.income) : ""}</span>
          <span className="am">{r.expense ? inr(r.expense) : ""}</span>
          <span className="am">{r.investment ? inr(r.investment) : ""}</span>
          <span className="bl">{r.net ? `${inr(Math.abs(r.net))} ${r.net < 0 ? "(-)" : ""}` : ""}</span>
        </div>
      ))}
      <div className="dos-stmt-row dos-total">
        <span className="pt">TOTAL</span>
        <span className="am">{inr(data.totals.income)}</span><span className="am">{inr(data.totals.expense)}</span><span className="am">{inr(data.totals.investment)}</span>
        <span className="bl">{inr(Math.abs(data.totals.net))} {data.totals.net < 0 ? "(-)" : ""}</span>
      </div>

      {["expense", "income", "investment"].map((nat) => (
        <div key={nat} className="mt-3" data-testid={`ie-sheet-${nat}`}>
          <div className="dos-stmt-row dos-head"><span className="pt">{TITLES[nat]} · {scopeLabel}</span><span className="am">Amount</span><span className="rf">%</span></div>
          {(heads[nat] || []).length === 0 && <div className="dos-stmt-row"><span className="pt">-- kuch nahi --</span><span className="am"></span><span className="rf"></span></div>}
          {(heads[nat] || []).map((g) => (
            <div key={g.group_id || g.group_name}>
              <div className="dos-stmt-row font-bold"><span className="pt">{g.group_name}</span><span className="am">{inr(g.total)}</span><span className="rf">{g.share}%</span></div>
              {g.rows.map((h) => (
                <div className="dos-stmt-row dos-sub" key={h.id}><span className="pt">   ↳ {h.name}</span><span className="am">{inr(h.amount)}</span><span className="rf">{h.share}%</span></div>
              ))}
            </div>
          ))}
          <div className="dos-stmt-row dos-total"><span className="pt">TOTAL {nat.toUpperCase()}</span><span className="am">{inr((heads[nat] || []).reduce((t, g) => t + g.total, 0))}</span><span className="rf"></span></div>
        </div>
      ))}
      <div className="flex justify-between mt-3 text-[10px] uppercase"><div>{BRAND.app} {appVersionLabel()}</div><div>For {data.firm_name || BRAND.app}</div></div>
    </div>
  );
};

export default IncomeExpenseSheet;
