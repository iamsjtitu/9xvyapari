import { inr } from "@/lib/api";
import { drcr, COL_DEBIT, COL_CREDIT } from "@/lib/drcr";
import { ArrowsLeftRight, ArrowDown, ArrowUp, Printer, PencilSimple, Trash, ArrowCounterClockwise } from "@phosphor-icons/react";

const RowInfo = ({ e }) => (
  <td className="cell-grow" title={`${e.party_name || ""}${e.description ? ` · ${e.description}` : ""}`}>
    <div className="font-medium flex items-center gap-1.5 min-w-0">
      {e.contra_id && (
        <span className="kbd !text-[9px] !px-1 !py-0 text-jama border-jama/40" title="Cash/Bank transfer (contra)" data-testid={`rokad-contra-badge-${e.id}`}>
          <ArrowsLeftRight size={9} weight="bold" className="inline mr-0.5" />TRANSFER
        </span>
      )}
      {e.settle_journal_id && (
        <span className="kbd !text-[10px] !px-1.5 !py-0 font-semibold !text-white !bg-jama !border-jama" title={`Account Settled · ₹${inr(Math.abs(e.settled_amount || 0))} → ${e.settle_account_name || "Account Clear"}`} data-testid={`rokad-settled-badge-${e.id}`}>
          SETTLED
        </span>
      )}
      <span className="truncate min-w-0">{e.party_name || "—"}</span>
    </div>
    {(e.description || e.cash_account_name) && (
      <div className="text-[10px] text-muted2 mt-0.5 truncate">
        {e.cash_account_name ? `[${e.cash_account_name}] ` : ""}{e.description || ""}
      </div>
    )}
    {e.chq_no && <div className="text-[10px] text-muted2 mt-0.5 font-mono-data">Chq: {e.chq_no}</div>}
  </td>
);

const RowActions = ({ e, onSlip, onEdit, onTransfer, onDelete, onReopen }) => (
  <td className="print:hidden whitespace-nowrap">
    <button className="btn-ghost p-1.5" onClick={() => onSlip(e)} title="Voucher slip print" data-testid={`rokad-slip-${e.id}`}><Printer size={14} /></button>
    <button className="btn-ghost p-1.5" onClick={() => (e.contra_id ? onTransfer(e.contra_id) : onEdit(e))} title={e.contra_id ? "Transfer edit" : "Edit"} data-testid={`rokad-edit-${e.id}`}><PencilSimple size={14} /></button>
    <button className="btn-ghost p-1.5" onClick={() => onDelete(e.id)} title="Delete" data-testid={`rokad-del-${e.id}`}><Trash size={14} /></button>
    {e.settle_journal_id && (
      <button className="btn-ghost p-1.5 text-jama" title="Reopen — settlement hatao, party ka baki wapas aayega" onClick={() => onReopen(e)} data-testid={`rokad-reopen-${e.id}`}>
        <ArrowCounterClockwise size={14} weight="bold" />
      </button>
    )}
  </td>
);

const DateCells = ({ e }) => (
  <>
    <td className="font-mono-data text-xs">{(e.date || "").slice(0, 10)}</td>
    <td className="font-mono-data text-xs text-terracotta">{e.voucher_no || "—"}</td>
    <td className="font-mono-data text-xs text-jama whitespace-nowrap" title="Invoice No." data-testid={`rokad-inv-${e.id}`}>{e.inv_no || ""}</td>
  </>
);

// Passbook-style Cash Book register: Debit (Gaya) | Credit (Aaya) | Balance (single a/c only)
// rows must be chronological; running balance = opening + credit − debit (lib/drcr.js rule)
export const RokadRegister = ({ rows, opening, showBalance, totals, ...actions }) => {
  let running = opening || 0;
  const withBal = rows.map((e) => {
    running += e.type === "jama" ? e.amount : -e.amount;
    return { ...e, balance: running };
  });
  const cols = 7 + (showBalance ? 1 : 0);
  return (
    <div className="card-flat overflow-hidden" data-testid="rokad-register">
      <table className="dense w-full">
        <thead>
          <tr>
            <th style={{ width: 84 }}>Date</th>
            <th style={{ width: 50 }}>V.No.</th>
            <th style={{ width: 90 }}>INV No.</th>
            <th>Party / Vivran</th>
            <th className="num" style={{ width: 130 }} data-testid="rokad-th-debit">{COL_DEBIT(true)}</th>
            <th className="num" style={{ width: 130 }} data-testid="rokad-th-credit">{COL_CREDIT(true)}</th>
            {showBalance && <th className="num" style={{ width: 150 }} data-testid="rokad-th-balance">Balance</th>}
            <th style={{ width: 110 }} className="print:hidden"></th>
          </tr>
        </thead>
        <tbody>
          {showBalance && (
            <tr className="bg-parchment/40" data-testid="rokad-opening-row">
              <td className="font-mono-data text-xs" colSpan={3}></td>
              <td className="font-semibold text-xs uppercase">Opening Balance (B/F)</td>
              <td className="num text-muted2">—</td>
              <td className="num text-muted2">—</td>
              <td className="num font-mono-data font-medium" style={{ color: opening < 0 ? "#B71C1C" : "#1A1A1A" }}>
                ₹ {inr(Math.abs(opening))} <span className="text-[10px] ml-1">{drcr(opening)}</span>
              </td>
              <td className="print:hidden"></td>
            </tr>
          )}
          {withBal.length === 0 ? (
            <tr><td colSpan={cols} className="text-center text-muted2 py-8 text-sm">Koi entry nahi.</td></tr>
          ) : withBal.map((e) => (
            <tr key={e.id} data-testid={`rokad-row-${e.id}`}>
              <DateCells e={e} />
              <RowInfo e={e} />
              <td className="num amount-kharch whitespace-nowrap" data-testid={`rokad-debit-${e.id}`}>{e.type === "kharch" ? `₹ ${inr(e.amount)}` : "—"}</td>
              <td className="num amount-jama whitespace-nowrap" data-testid={`rokad-credit-${e.id}`}>{e.type === "jama" ? `₹ ${inr(e.amount)}` : "—"}</td>
              {showBalance && (
                <td className="num font-mono-data whitespace-nowrap" style={{ color: e.balance < 0 ? "#B71C1C" : "#1A1A1A" }} data-testid={`rokad-bal-${e.id}`}>
                  ₹ {inr(Math.abs(e.balance))} <span className="text-[10px] ml-1">{drcr(e.balance)}</span>
                </td>
              )}
              <RowActions e={e} {...actions} />
            </tr>
          ))}
          <tr className="bg-parchment/60 font-semibold" data-testid="rokad-total-row">
            <td colSpan={3}></td>
            <td className="text-xs uppercase">Total ({withBal.length} entries)</td>
            <td className="num amount-kharch font-mono-data" data-testid="rokad-total-debit">₹ {inr(totals.kharch)}</td>
            <td className="num amount-jama font-mono-data" data-testid="rokad-total-credit">₹ {inr(totals.jama)}</td>
            {showBalance && (
              <td className="num font-mono-data" style={{ color: running < 0 ? "#B71C1C" : "#1B5E20" }} data-testid="rokad-closing-cell">
                ₹ {inr(Math.abs(running))} <span className="text-[10px] ml-1">{drcr(running)}</span>
              </td>
            )}
            <td className="print:hidden"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const TSide = ({ side, list, total, color, bg, label, icon: Icon, ...actions }) => (
  <div className="card-flat overflow-hidden flex flex-col" data-testid={`rokad-tside-${side}`}>
    <div className="px-4 py-3 flex items-center justify-between border-b border-khaki" style={{ background: bg }}>
      <div className="flex items-center gap-2">
        <Icon size={18} color={color} weight="bold" />
        <div className="font-heading font-semibold text-sm" style={{ color }}>{label}</div>
      </div>
      <div className="font-mono-data text-lg font-medium" style={{ color }} data-testid={`rokad-tside-total-${side}`}>₹ {inr(total)}</div>
    </div>
    <table className="dense w-full">
      <thead>
        <tr>
          <th style={{ width: 80 }}>Date</th>
          <th style={{ width: 50 }}>V.No.</th>
          <th style={{ width: 90 }}>INV No.</th>
          <th>Party / Vivran</th>
          <th className="num" style={{ width: 110 }}>Amount</th>
          <th style={{ width: 96 }} className="print:hidden"></th>
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr><td colSpan={6} className="text-center text-muted2 py-8 text-sm">Koi entry nahi.</td></tr>
        ) : list.map((e) => (
          <tr key={e.id} data-testid={`rokad-row-${e.id}`}>
            <DateCells e={e} />
            <RowInfo e={e} />
            <td className="num whitespace-nowrap" style={{ color }} data-testid={`rokad-amount-${e.id}`}>₹ {inr(e.amount)}</td>
            <RowActions e={e} {...actions} />
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Classic DOS cash book T-format — Jama (receipts) LEFT, Kharch (payments) RIGHT
export const RokadTFormat = ({ rows, totals, ...actions }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 cash-book-grid" data-testid="rokad-tformat">
    <TSide side="jama" list={rows.filter((e) => e.type === "jama")} total={totals.jama} color="#1B5E20" bg="#E8F5E9"
      label="Receipt / Jama (आमद) — Money In · Credit" icon={ArrowDown} {...actions} />
    <TSide side="kharch" list={rows.filter((e) => e.type === "kharch")} total={totals.kharch} color="#B71C1C" bg="#FFEBEE"
      label="Payment / Kharch (खर्च) — Money Out · Debit" icon={ArrowUp} {...actions} />
  </div>
);
