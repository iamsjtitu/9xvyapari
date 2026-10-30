import { memo } from "react";
import { Link } from "react-router-dom";
import { inr } from "@/lib/api";
import { ArrowDown, ArrowUp, PencilSimple, Warning } from "@phosphor-icons/react";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

const Side = ({ side, list, total, color, bg, label, icon: Icon, gid, editReturn }) => (
  <div className="card-flat overflow-hidden flex flex-col" data-testid={`byaj-tside-${side}-${gid}`}>
    <div className="px-3 py-2 flex items-center justify-between border-b border-khaki" style={{ background: bg }}>
      <div className="flex items-center gap-2">
        <Icon size={16} color={color} weight="bold" />
        <div className="font-heading font-semibold text-xs" style={{ color }}>{label}</div>
      </div>
      <div className="font-mono-data text-base font-medium" style={{ color }} data-testid={`byaj-tside-total-${side}-${gid}`}>₹ {inr(total)}</div>
    </div>
    <table className="dense w-full">
      <thead>
        <tr>
          <th style={{ width: 84 }}>Date</th>
          <th style={{ width: 48 }}>V.No.</th>
          <th style={{ width: 84 }}>INV No.</th>
          <th>Ledger / Vivran</th>
          <th className="num" style={{ width: 110 }}>Amount</th>
          <th style={{ width: 34 }} className="print:hidden"></th>
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr><td colSpan={6} className="text-center text-muted2 py-5 text-xs">Koi entry nahi.</td></tr>
        ) : list.map((e) => (
          <tr key={e.id} data-testid={`byaj-row-${e.id}`}>
            <td className="font-mono-data text-xs">{fmtDate(e.date)}</td>
            <td className="font-mono-data text-xs text-terracotta">{e.voucher_no || "—"}</td>
            <td className="font-mono-data text-xs text-jama whitespace-nowrap">{e.inv_no || ""}</td>
            <td className="cell-grow" title={`${e.ledger_name}${e.description ? ` · ${e.description}` : ""}`}>
              <div className="font-medium truncate">{e.ledger_name}</div>
              {(e.description || e.cash_account_name) && (
                <div className="text-[10px] text-muted2 mt-0.5 truncate">{e.cash_account_name ? `[${e.cash_account_name}] ` : ""}{e.description || ""}</div>
              )}
            </td>
            <td className="num whitespace-nowrap font-mono-data" style={{ color }} data-testid={`byaj-amount-${e.id}`}>₹ {inr(e.amount)}</td>
            <td className="print:hidden">
              <Link to={`/rokad?edit=${e.id}&return=${encodeURIComponent(editReturn)}`} className="btn-ghost p-1 inline-flex" title="Rokad me edit karein" data-testid={`byaj-edit-${e.id}`}>
                <PencilSimple size={13} />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// One reference party's byaj in classic T-format: Jama (byaj aaya) LEFT | Kharch (byaj diya) RIGHT
const ByajPartyBlockImpl = ({ g, editReturn }) => {
  const gid = g.ref_party_id || "none";
  const unnamed = !g.ref_party_id;
  return (
    <section className="space-y-2" data-testid={`byaj-party-${gid}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-sm border ${unnamed ? "border-amber-400 bg-amber-50" : "border-ink bg-ink text-parchment"}`}>
        <div className="flex items-center gap-2 min-w-0">
          {unnamed ? <Warning size={18} weight="fill" color="#b45309" /> : null}
          {g.ref_party_id ? (
            <Link to={`/parties/${g.ref_party_id}`} className="font-heading font-semibold text-base uppercase tracking-wide hover:underline truncate" data-testid={`byaj-party-link-${gid}`}>{g.ref_party_name}</Link>
          ) : (
            <span className="font-heading font-semibold text-base uppercase tracking-wide text-amber-900" data-testid="byaj-party-unnamed">{g.ref_party_name}</span>
          )}
          <span className={`text-[11px] ${unnamed ? "text-amber-800" : "text-parchment/60"}`}>· {g.count} entries</span>
        </div>
        <div className="flex items-center gap-4 font-mono-data text-sm whitespace-nowrap">
          <span data-testid={`byaj-party-received-${gid}`}><span className={`text-[10px] uppercase mr-1 ${unnamed ? "text-amber-800" : "text-parchment/60"}`}>Aaya</span><span style={{ color: unnamed ? "#1B5E20" : "#A5D6A7" }}>₹ {inr(g.received)}</span></span>
          <span data-testid={`byaj-party-paid-${gid}`}><span className={`text-[10px] uppercase mr-1 ${unnamed ? "text-amber-800" : "text-parchment/60"}`}>Gaya</span><span style={{ color: unnamed ? "#B71C1C" : "#EF9A9A" }}>₹ {inr(g.paid)}</span></span>
          <span className="font-semibold" data-testid={`byaj-party-net-${gid}`}><span className={`text-[10px] uppercase mr-1 ${unnamed ? "text-amber-800" : "text-parchment/60"}`}>Net</span>₹ {inr(Math.abs(g.net))} <span className="text-[10px]">{g.net >= 0 ? "aaya" : "gaya"}</span></span>
        </div>
      </div>
      {unnamed && (
        <div className="text-xs text-amber-900 px-1" data-testid="byaj-unnamed-note">
          In entries me "Kiska?" nahi bhara — pencil se Rokad me kholkar reference party lagayein, phir yeh us party ke block me aa jayengi.
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 cash-book-grid">
        <Side side="jama" gid={gid} list={g.entries.filter((e) => e.type === "jama")} total={g.received} color="#1B5E20" bg="#E8F5E9"
          label="Byaj Aaya / Jama (आमद) — Credit" icon={ArrowDown} editReturn={editReturn} />
        <Side side="kharch" gid={gid} list={g.entries.filter((e) => e.type === "kharch")} total={g.paid} color="#B71C1C" bg="#FFEBEE"
          label="Byaj Diya / Kharch (खर्च) — Debit" icon={ArrowUp} editReturn={editReturn} />
      </div>
    </section>
  );
};

export const ByajPartyBlock = memo(ByajPartyBlockImpl);
