import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useOutletContext } from "react-router-dom";
import api, { formatApiErrorDetail, inr, todayISO } from "@/lib/api";
import { ExportBar } from "@/components/ExportBar";
import { IncomeExpenseSheet } from "@/components/IncomeExpenseSheet";
import { ChartPieSlice, Printer, GearSix, CaretRight } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const PERIODS = [["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]];
const NAT = {
  expense: { title: "Kharcha (Expense) — kahan kahan gaya", color: "text-kharch", bar: "bg-kharch", tid: "ie-expense" },
  income: { title: "Aay (Income) — kahan se aaya", color: "text-jama", bar: "bg-jama", tid: "ie-income" },
  investment: { title: "Investment — kahan lagaya", color: "text-terracotta", bar: "bg-terracotta", tid: "ie-investment" },
};

// Group-wise heads with % bars (expense / income / investment)
const HeadsCard = ({ nat, groups, total }) => (
  <div className="card-flat p-4" data-testid={`${NAT[nat].tid}-card`}>
    <div className="flex items-baseline justify-between mb-2">
      <div className={`section-title ${NAT[nat].color}`}>{NAT[nat].title}</div>
      <div className={`font-mono-data font-semibold ${NAT[nat].color}`} data-testid={`${NAT[nat].tid}-total`}>₹ {inr(total)}</div>
    </div>
    {groups.length === 0 ? <div className="text-xs text-muted2 py-3" data-testid={`${NAT[nat].tid}-empty`}>Is period me kuch nahi.</div> : groups.map((g) => (
      <div key={g.group_id || g.group_name} className="mb-2" data-testid={`${NAT[nat].tid}-group-${g.group_id}`}>
        <div className="flex items-center justify-between text-xs font-heading font-semibold uppercase">
          <span className="truncate">{g.group_name}</span>
          <span className="font-mono-data whitespace-nowrap ml-2">₹ {inr(g.total)} <span className="text-muted2 font-normal">· {g.share}%</span></span>
        </div>
        <div className="h-1 bg-khaki/40 rounded-sm mt-0.5 mb-1"><div className={`h-1 ${NAT[nat].bar}`} style={{ width: `${Math.min(100, g.share)}%` }} /></div>
        {g.rows.map((h) => (
          <div key={h.id} className="flex items-center justify-between text-xs pl-3 py-0.5" data-testid={`${NAT[nat].tid}-head-${h.id}`}>
            <Link to={`/parties/${h.id}`} className="truncate hover:underline hover:text-terracotta">↳ {h.name}</Link>
            <span className="font-mono-data whitespace-nowrap ml-2">₹ {inr(h.amount)} <span className="text-muted2">· {h.share}%</span></span>
          </div>
        ))}
      </div>
    ))}
  </div>
);

// Which asset groups count as "Investment" (saved in Settings)
const InvestmentGroupsPicker = ({ groups, selected, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(new Set(selected));
  useEffect(() => { setSel(new Set(selected)); }, [selected]);
  const save = async () => {
    try {
      await api.put("/settings", { investment_group_ids: [...sel] });
      toast.success("Investment groups save ho gaye"); setOpen(false); onSaved?.();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
  };
  return (
    <div className="relative print:hidden">
      <button type="button" className="btn-ghost text-xs whitespace-nowrap inline-flex items-center gap-1" onClick={() => setOpen((v) => !v)} title="Kaun se group Investment ginein" data-testid="ie-inv-groups-btn"><GearSix size={14} /> Investment groups</button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-72 bg-white border border-khaki rounded-sm shadow-lg p-3 text-xs" data-testid="ie-inv-groups-pop">
          <div className="font-heading font-semibold mb-1">Asset groups jo "Investment" me ginein:</div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {groups.filter((g) => g.nature === "asset").map((g) => (
              <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 accent-[#8B2520]" checked={sel.has(g.id)}
                  onChange={(e) => setSel((p) => { const n = new Set(p); e.target.checked ? n.add(g.id) : n.delete(g.id); return n; })} data-testid={`ie-inv-group-${g.id}`} />
                <span className="truncate">{g.name}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" className="btn-outline text-xs h-7" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary text-xs h-7" onClick={save} data-testid="ie-inv-groups-save">Save</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function IncomeExpense() {
  const { settings } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const period = params.get("period") || "monthly";
  const today = todayISO();
  const defFrom = settings?.fy_start && settings.fy_start <= today ? settings.fy_start : `${today.slice(0, 4)}-04-01`;
  const from = params.get("from") || defFrom;
  const to = params.get("to") || (settings?.fy_end && settings.fy_end >= today ? settings.fy_end : today);
  const [data, setData] = useState(null);
  const [sel, setSel] = useState("");      // selected bucket key ("" = whole range)
  const [view, setView] = useState("list");
  const [tick, setTick] = useState(0);

  const setP = (next) => setParams({ period: next.period ?? period, from: next.from ?? from, to: next.to ?? to });
  useEffect(() => {
    setData(null); setSel("");
    api.get("/reports/income-expense", { params: { period, date_from: from, date_to: to } })
      .then((r) => setData(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  }, [period, from, to, tick]);

  const scope = useMemo(() => {
    if (!data) return null;
    const row = data.rows.find((r) => r.key === sel);
    return row ? { heads: row.heads, label: row.label, totals: { income: row.income, expense: row.expense, investment: row.investment } }
      : { heads: data.heads, label: `Poora period ${fmtDate(data.date_from)} → ${fmtDate(data.date_to)}`, totals: data.totals };
  }, [data, sel]);

  const quick = (key) => {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    if (key === "fy") return setP({ from: defFrom, to: settings?.fy_end || today });
    if (key === "month") return setP({ from: `${today.slice(0, 7)}-01`, to: today });
    if (key === "3y") return setP({ period: "yearly", from: `${y - 2}-${String(m).padStart(2, "0")}-01`, to: today });
  };
  const excelSheets = data ? [
    { name: "Summary", subtitle: `${period} · ${fmtDate(data.date_from)} → ${fmtDate(data.date_to)}`,
      columns: [{ key: "label", label: "Period", width: 24 }, { key: "income", label: "Income (Aay)", width: 16, num: true }, { key: "expense", label: "Expense (Kharch)", width: 16, num: true }, { key: "investment", label: "Investment", width: 16, num: true }, { key: "net", label: "Net", width: 16, num: true }],
      rows: data.rows.map((r) => ({ label: r.label, income: r.income, expense: r.expense, investment: r.investment, net: r.net })) },
    { name: "Heads", subtitle: scope.label,
      columns: [{ key: "type", label: "Type", width: 12 }, { key: "group", label: "Group", width: 24 }, { key: "head", label: "Head / Ledger", width: 32 }, { key: "amount", label: "Amount", width: 16, num: true }, { key: "share", label: "%", width: 8, num: true }],
      rows: ["expense", "income", "investment"].flatMap((nat) => scope.heads[nat].flatMap((g) => g.rows.map((h) => ({ type: nat.toUpperCase(), group: g.group_name, head: h.name, amount: h.amount, share: h.share })))),
      groupBy: "type" },
  ] : [];

  return (
    <div className="space-y-4" data-testid="page-income-expense">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted2 font-heading">Reports · Aay-Vyay</div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2"><ChartPieSlice size={22} weight="duotone" /> Income & Expense — आय-व्यय</h1>
          <p className="text-xs text-muted2 mt-1">Expense groups = kharcha · Income groups = aay · chune hue asset groups = investment. Period par click karo → us period ka head-wise hisab.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-khaki rounded-sm overflow-hidden" data-testid="ie-period-tabs">
            {PERIODS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setP({ period: k })} data-testid={`ie-period-${k}`}
                className={`px-3 h-9 text-xs font-heading font-semibold uppercase ${period === k ? "bg-terracotta text-white" : "bg-white hover:bg-parchment/60"}`}>{l}</button>
            ))}
          </div>
          <input type="date" className="input-dense h-9 text-sm !w-auto" value={from} onChange={(e) => setP({ from: e.target.value })} data-testid="ie-from" />
          <span className="text-muted2">→</span>
          <input type="date" className="input-dense h-9 text-sm !w-auto" value={to} onChange={(e) => setP({ to: e.target.value })} data-testid="ie-to" />
          <button type="button" className="btn-outline text-xs h-9" onClick={() => quick("month")} data-testid="ie-quick-month">Is mahine</button>
          <button type="button" className="btn-outline text-xs h-9" onClick={() => quick("fy")} data-testid="ie-quick-fy">Poora saal (FY)</button>
          <button type="button" className="btn-outline text-xs h-9" onClick={() => quick("3y")} data-testid="ie-quick-3y">3 saal</button>
          {data && <InvestmentGroupsPicker groups={data.groups} selected={data.investment_group_ids} onSaved={() => setTick((t) => t + 1)} />}
          <button type="button" className={view === "sheet" ? "btn-primary h-9" : "btn-outline h-9"} onClick={() => setView((v) => (v === "sheet" ? "list" : "sheet"))} data-testid="btn-ie-toggle-sheet">
            <Printer size={14} /> {view === "sheet" ? "Screen view" : "Report (Print)"}
          </button>
          {data && <ExportBar filename={`aay-vyay-${period}-${from}-${to}`} title={`Aay-Vyay · ${period} · ${fmtDate(from)} → ${fmtDate(to)}`} sheets={excelSheets} />}
        </div>
      </div>

      {!data ? <div className="text-muted2 font-heading">Loading...</div> : (
        <>
          <div className={view === "sheet" ? "" : "hidden print:block"}>
            <IncomeExpenseSheet data={data} heads={scope.heads} scopeLabel={scope.label} />
          </div>
          <div className={view === "sheet" ? "hidden" : "print:hidden space-y-4"}>
            <div className="grid grid-cols-4 gap-3" data-testid="ie-totals">
              {[["income", "Total Income (Aay)"], ["expense", "Total Expense (Kharch)"], ["investment", "Total Investment"], ["net", "Net (Aay − Kharch)"]].map(([k, l]) => (
                <div key={k} className="card-flat p-3" data-testid={`ie-total-${k}`}>
                  <div className="text-[10px] uppercase tracking-wider text-muted2 font-heading">{l} · {sel ? scope.label : "poora period"}</div>
                  <div className={`font-mono-data text-xl font-semibold ${k === "expense" ? "text-kharch" : k === "income" ? "text-jama" : k === "investment" ? "text-terracotta" : (scope.totals.income - scope.totals.expense) < 0 ? "text-kharch" : ""}`}>
                    ₹ {inr(k === "net" ? Math.abs(scope.totals.income - scope.totals.expense) : scope.totals[k])}{k === "net" && scope.totals.income - scope.totals.expense < 0 ? " (−)" : ""}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-2 card-flat overflow-hidden">
                <div className="px-4 py-3 border-b border-khaki section-title flex items-center justify-between">
                  <span>{PERIODS.find((p) => p[0] === period)?.[1]} hisab · {fmtDate(from)} → {fmtDate(to)}</span>
                  {sel && <button type="button" className="text-xs underline decoration-dotted hover:text-terracotta" onClick={() => setSel("")} data-testid="ie-clear-sel">poora period dikhao</button>}
                </div>
                <table className="dense w-full" data-testid="ie-table">
                  <thead><tr><th>Period</th><th className="num">Income</th><th className="num">Expense</th><th className="num">Invest.</th><th className="num">Net</th><th style={{ width: 24 }}></th></tr></thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.key} onClick={() => setSel(sel === r.key ? "" : r.key)} className={`cursor-pointer ${sel === r.key ? "bg-parchment" : "hover:bg-parchment/50"}`} data-testid={`ie-row-${r.key}`}>
                        <td className="font-heading font-semibold">{r.label}</td>
                        <td className="num text-jama">{r.income ? inr(r.income) : "—"}</td>
                        <td className="num text-kharch">{r.expense ? inr(r.expense) : "—"}</td>
                        <td className="num text-terracotta">{r.investment ? inr(r.investment) : "—"}</td>
                        <td className={`num ${r.net < 0 ? "text-kharch" : ""}`}>{r.net ? `${inr(Math.abs(r.net))}${r.net < 0 ? " (−)" : ""}` : "—"}</td>
                        <td className="text-muted2"><CaretRight size={12} /></td>
                      </tr>
                    ))}
                    <tr className="bg-parchment/60 font-semibold" data-testid="ie-total-row">
                      <td>TOTAL</td><td className="num text-jama">{inr(data.totals.income)}</td><td className="num text-kharch">{inr(data.totals.expense)}</td>
                      <td className="num text-terracotta">{inr(data.totals.investment)}</td><td className={`num ${data.totals.net < 0 ? "text-kharch" : ""}`}>{inr(Math.abs(data.totals.net))}{data.totals.net < 0 ? " (−)" : ""}</td><td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="col-span-3 space-y-4">
                <HeadsCard nat="expense" groups={scope.heads.expense} total={scope.totals.expense} />
                <HeadsCard nat="income" groups={scope.heads.income} total={scope.totals.income} />
                <HeadsCard nat="investment" groups={scope.heads.investment} total={scope.totals.investment} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
