import { Link } from "react-router-dom";
import { inr } from "@/lib/api";
import { drcr } from "@/lib/drcr";
import { ArrowDown, ArrowUp, PencilSimple, Trash } from "@phosphor-icons/react";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// Split chronological ledger rows into the two sides of a party T-account.
// Party: LEFT = Jama (party ne diya — paisa wapas / byaj memo), RIGHT = Kharch (party ko diya — udhaar / maal).
// Cash & bank a/c: LEFT = Aaya (credit), RIGHT = Gaya (debit). Opening/closing sit on the side that balances the T.
export function splitT(rows, opening, closing, isAccount) {
  const amt = (r, side) => (side === "left" ? (isAccount ? r.credit : r.debit) : (isAccount ? r.debit : r.credit)) || 0;
  const memoSide = (r) => (r.memo ? ((r.memo.side === "debit") !== isAccount ? "left" : "right") : null);
  const pick = (side) => rows.filter((r) => amt(r, side) > 0 || memoSide(r) === side).map((r) => ({ ...r, amount: r.memo ? r.memo.amount : amt(r, side) }));
  const left = pick("left"), right = pick("right");
  const sum = (list, memo) => list.filter((r) => !!r.memo === memo).reduce((s, r) => s + r.amount, 0);
  const t = { left, right, leftMool: sum(left, false), rightMool: sum(right, false), leftMemo: sum(left, true), rightMemo: sum(right, true) };
  const bfLeft = isAccount ? opening > 0 : opening < 0;     // party owes us (+) → B/F on the Kharch side; cash in hand (+) → Jama side
  const cfLeft = isAccount ? closing < 0 : closing > 0;
  t.bf = { side: bfLeft ? "left" : "right", amount: Math.abs(opening) };
  t.cf = { side: cfLeft ? "left" : "right", amount: Math.abs(closing), negative: closing < 0 };
  t.grandLeft = t.leftMool + (t.bf.side === "left" ? t.bf.amount : 0) + (t.cf.side === "left" ? t.cf.amount : 0);
  t.grandRight = t.rightMool + (t.bf.side === "right" ? t.bf.amount : 0) + (t.cf.side === "right" ? t.cf.amount : 0);
  return t;
}

const Side = ({ side, t, color, bg, label, icon: Icon, asOn, dateFrom, editHref, onDelete, moolLabel }) => {
  const list = t[side];
  const memo = side === "left" ? t.leftMemo : t.rightMemo;
  const mool = side === "left" ? t.leftMool : t.rightMool;
  return (
    <div className="card-flat overflow-hidden flex flex-col" data-testid={`ledger-tside-${side}`}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-khaki" style={{ background: bg }}>
        <div className="flex items-center gap-2"><Icon size={18} color={color} weight="bold" /><div className="font-heading font-semibold text-sm" style={{ color }}>{label}</div></div>
        <div className="font-mono-data text-lg font-medium" style={{ color }} data-testid={`ledger-tside-mool-${side}`}>₹ {inr(mool)}</div>
      </div>
      <table className="dense w-full">
        <thead><tr><th style={{ width: 84 }}>Date</th><th style={{ width: 56 }}>V.No.</th><th style={{ width: 84 }}>INV No.</th><th>Vivran</th><th className="num" style={{ width: 120 }}>Amount</th><th style={{ width: 60 }} className="print:hidden"></th></tr></thead>
        <tbody>
          {t.bf.side === side && t.bf.amount > 0 && (
            <tr className="bg-parchment/40 font-semibold" data-testid={`ledger-t-bf-${side}`}>
              <td className="font-mono-data text-xs text-muted2">{dateFrom ? fmtDate(dateFrom) : ""}</td><td></td><td></td>
              <td className="text-xs uppercase tracking-wider">Opening Balance B/F</td>
              <td className="num font-mono-data whitespace-nowrap">₹ {inr(t.bf.amount)}</td><td className="print:hidden"></td>
            </tr>
          )}
          {list.length === 0 && !(t.bf.side === side && t.bf.amount > 0) && (
            <tr><td colSpan={6} className="text-center text-muted2 py-6 text-sm">Koi entry nahi.</td></tr>
          )}
          {list.map((r) => (
            <tr key={`${r.kind}-${r.id}`} data-testid={r.memo ? `ledger-t-memo-${r.refId}` : `ledger-t-row-${r.id}`}>
              <td className="font-mono-data text-xs text-muted2 whitespace-nowrap">{fmtDate((r.date || "").slice(0, 10))}</td>
              <td className="font-mono-data text-xs text-terracotta whitespace-nowrap">{r.kind === "bill" && r.vno ? `Bill ${r.vno}` : r.vno || r.ref_no || "—"}</td>
              <td className="font-mono-data text-xs text-jama whitespace-nowrap">{r.inv || ""}</td>
              <td className="cell-grow" title={r.label}>
                <div className="truncate min-w-0">
                  {r.kind === "bill" ? <Link to={`/bills/${r.ref}`} className="text-terracotta hover:underline">{r.label}</Link> : <span>{r.memo ? r.label.replace(/ \(memo[^)]*\)$/, "") : r.label}</span>}
                </div>
              </td>
              <td className="num font-mono-data whitespace-nowrap" style={{ color }} data-testid={`ledger-t-amount-${r.id}`}>
                ₹ {inr(r.amount)}
              </td>
              <td className="print:hidden">
                {editHref(r) && (
                  <div className="flex items-center gap-0.5">
                    <Link to={editHref(r)} className="btn-ghost p-1 inline-flex" title="Voucher edit karein" data-testid={`ledger-t-edit-${r.kind}-${r.refId || r.ref || r.id}`}><PencilSimple size={13} /></Link>
                    <button type="button" className="btn-ghost p-1 inline-flex !text-[#B71C1C]" onClick={() => onDelete(r)} title="Voucher delete karein" data-testid={`ledger-t-del-${r.kind}-${r.refId || r.ref || r.id}`}><Trash size={13} /></button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-parchment/60 font-semibold" data-testid={`ledger-t-mool-${side}`}>
            <td colSpan={4} className="text-right text-xs uppercase">{moolLabel} ({list.filter((r) => !r.memo).length})</td>
            <td className="num font-mono-data" style={{ color }}>₹ {inr(mool)}</td><td className="print:hidden"></td>
          </tr>
          {memo > 0 && (
            <tr className="bg-parchment/40 font-semibold" data-testid={`ledger-t-memo-total-${side}`}>
              <td colSpan={4} className="text-right text-xs uppercase">Total Byaj ({list.filter((r) => r.memo).length}) <span className="normal-case font-normal text-muted2">· mool me nahi juda</span></td>
              <td className="num font-mono-data" style={{ color }}>₹ {inr(memo)}</td><td className="print:hidden"></td>
            </tr>
          )}
          {t.cf.side === side && (
            <tr className="font-semibold" data-testid={`ledger-t-cf-${side}`}>
              <td className="font-mono-data text-xs text-muted2">{fmtDate(asOn)}</td><td></td><td></td>
              <td className="text-xs uppercase tracking-wider">Closing Balance C/F <span className="normal-case text-muted2">· {drcr(t.cf.negative ? -t.cf.amount : t.cf.amount)}</span></td>
              <td className="num font-mono-data whitespace-nowrap" style={{ color: "#8B2520" }}>₹ {inr(t.cf.amount)}</td><td className="print:hidden"></td>
            </tr>
          )}
          <tr className="bg-ink text-parchment font-semibold" data-testid={`ledger-t-grand-${side}`}>
            <td colSpan={4} className="text-right text-xs uppercase tracking-wider">Total</td>
            <td className="num font-mono-data">₹ {inr(side === "left" ? t.grandLeft : t.grandRight)}</td><td className="print:hidden"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// Party ledger in classic T-format (Jama | Kharch) — same engine/rows as the passbook table, just laid out two-sided
export function PartyTFormat({ rows, opening, closing, isAccount, asOn, dateFrom, editHref, onDelete }) {
  const t = splitT(rows, opening, closing, isAccount);
  const common = { t, asOn, dateFrom, editHref, onDelete };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 cash-book-grid" data-testid="ledger-tformat">
      <Side side="left" color="#1B5E20" bg="#E8F5E9" icon={ArrowDown} moolLabel={isAccount ? "Total Aaya" : "Total Jama (mool)"}
        label={isAccount ? "Aaya / Jama (आमद) — Money In · Credit" : "Jama (आमद) — Party ne diya · wapas / byaj"} {...common} />
      <Side side="right" color="#B71C1C" bg="#FFEBEE" icon={ArrowUp} moolLabel={isAccount ? "Total Gaya" : "Total Kharch (mool)"}
        label={isAccount ? "Gaya / Kharch (खर्च) — Money Out · Debit" : "Kharch (खर्च) — Party ko diya · udhaar / maal"} {...common} />
    </div>
  );
}
