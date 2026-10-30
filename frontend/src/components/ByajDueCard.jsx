import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { Percent, CheckCircle, Plus, ArrowRight, CaretDown, CaretUp } from "@phosphor-icons/react";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

// Dashboard card: byaj parties jinka is mahine ka byaj abhi tak nahi aaya (ya nahi diya)
export const ByajDueCard = () => {
  const [info, setInfo] = useState(null);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { api.get("/reports/byaj/due").then((r) => setInfo(r.data)).catch(() => setInfo({ pending: [], done: [], ledgers: [] })); }, []);
  if (info === null) return <div className="card-flat p-4 h-[88px] animate-pulse" data-testid="byaj-due-loading" />;
  if (!info.ledgers?.length || (info.pending.length === 0 && info.done.length === 0)) return null;

  const { pending, done, totals, month } = info;
  const entryHref = (p) => {
    const ledger = p.side === "dena" ? (info.expense_ledger_id || info.default_ledger_id) : info.default_ledger_id;
    return `/rokad?new=${p.side === "dena" ? "kharch" : "jama"}${ledger ? `&party=${ledger}` : ""}&ref=${p.id}${p.expected ? `&amount=${p.expected}` : ""}&return=${encodeURIComponent("/")}`;
  };

  return (
    <div className={`card-flat overflow-hidden border-l-4 ${pending.length ? "border-l-[#F59E0B]" : "border-l-jama"}`} data-testid="byaj-due-card">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-khaki" style={{ background: pending.length ? "#FFF8E1" : "#E8F5E9" }}>
        <div className="flex items-center gap-2">
          <Percent size={18} weight="bold" color={pending.length ? "#B45309" : "#1B5E20"} />
          <div>
            <div className="font-heading font-semibold text-sm" data-testid="byaj-due-title">
              {pending.length ? `Byaj Due — ${pending.length} party ka ${monthLabel(month)} ka byaj baaki` : `Byaj — ${monthLabel(month)} ka sab byaj aa gaya`}
            </div>
            <div className="text-[11px] text-muted2">
              {pending.length > 0 && totals.expected_total > 0 && <span data-testid="byaj-due-expected">Expected ₹ {inr(totals.expected_total)} (remark ke % se) · </span>}
              {done.length > 0 && <span>{done.length} party se aa chuka: ₹ {inr(totals.received_total)}{totals.paid_total ? ` · diya ₹ ${inr(totals.paid_total)}` : ""}</span>}
            </div>
          </div>
        </div>
        <Link to="/byaj-report" className="text-xs text-terracotta hover:underline font-heading inline-flex items-center gap-1" data-testid="byaj-due-report-link">Byaj Report <ArrowRight size={12} /></Link>
      </div>
      {pending.length > 0 && (
        <table className="dense w-full" data-testid="byaj-due-table">
          <thead>
            <tr><th>Party</th><th className="num">Mool (balance)</th><th>Rate</th><th className="num">Expected byaj</th><th>Last byaj</th><th className="print:hidden" style={{ width: 130 }}></th></tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <tr key={p.id} data-testid={`byaj-due-row-${p.id}`}>
                <td>
                  <Link to={`/parties/${p.id}`} className="font-medium hover:text-terracotta hover:underline" data-testid={`byaj-due-party-${p.id}`}>{p.name}</Link>
                  {p.group_name && <span className="text-[10px] text-muted2 ml-2 uppercase">{p.group_name}</span>}
                </td>
                <td className="num font-mono-data whitespace-nowrap" style={{ color: p.side === "dena" ? "#B71C1C" : "#1A1A1A" }}>
                  ₹ {inr(Math.abs(p.balance))} <span className="text-[10px] text-muted2">{p.side === "dena" ? "Dr · dena" : "Cr · lena"}</span>
                </td>
                <td className="text-xs text-muted2" title={p.remark}>{p.rate != null ? `${p.rate}%` : <span className="opacity-60">— remark me % likho</span>}</td>
                <td className="num font-mono-data whitespace-nowrap" data-testid={`byaj-due-expected-${p.id}`}>{p.expected != null ? `₹ ${inr(p.expected)}` : "—"}</td>
                <td className="text-xs font-mono-data text-muted2 whitespace-nowrap" data-testid={`byaj-due-last-${p.id}`}>
                  {p.last_date ? `${fmtDate(p.last_date)} · ₹ ${inr(p.last_amount)}` : "kabhi nahi"}
                </td>
                <td className="print:hidden">
                  <Link to={entryHref(p)} className="btn-outline !py-1 !px-2 text-xs inline-flex items-center gap-1" data-testid={`byaj-due-entry-${p.id}`}>
                    <Plus size={12} weight="bold" /> Byaj entry
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {done.length > 0 && (
        <div className="px-4 py-2 text-xs border-t border-khaki">
          <button type="button" className="inline-flex items-center gap-1 text-jama hover:underline" onClick={() => setShowDone((v) => !v)} data-testid="byaj-due-toggle-done">
            <CheckCircle size={14} weight="bold" /> Is mahine aa gaya ({done.length}) {showDone ? <CaretUp size={12} /> : <CaretDown size={12} />}
          </button>
          {showDone && (
            <ul className="mt-1.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0.5" data-testid="byaj-due-done-list">
              {done.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 font-mono-data" data-testid={`byaj-done-${p.id}`}>
                  <Link to={`/parties/${p.id}`} className="truncate hover:text-terracotta hover:underline font-sans">{p.name}</Link>
                  <span className="text-jama whitespace-nowrap">₹ {inr(p.month_received || p.month_paid)}{p.month_paid && !p.month_received ? " diya" : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
