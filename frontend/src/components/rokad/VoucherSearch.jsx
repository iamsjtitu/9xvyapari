import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X, PencilSimple, ArrowsLeftRight, CircleNotch } from "@phosphor-icons/react";
import api, { inr } from "@/lib/api";

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "");

// "V.No. daalte hi us voucher ki details" — per-account numbering, so one number may hit several cash a/cs
export const VoucherSearch = ({ accountId, accountName, onEdit, onTransfer }) => {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null); // null | { voucher_no, entries }
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const v = q.trim();
    if (!v) { setRes(null); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      api.get("/rokad/by-voucher", { params: { voucher_no: v, ...(accountId ? { cash_account_id: accountId } : {}) } })
        .then((r) => setRes(r.data))
        .catch(() => setRes({ voucher_no: v, entries: [] }))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, accountId]);

  const clear = () => { setQ(""); setRes(null); inputRef.current?.focus(); };

  return (
    <div className="print:hidden relative" data-testid="voucher-search">
      <label className="lbl">Voucher Khojein</label>
      <div className="relative">
        <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted2 pointer-events-none" />
        <input
          ref={inputRef}
          className="input-dense num !pl-8 !pr-8"
          style={{ minWidth: 150 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && clear()}
          placeholder="V.No."
          inputMode="numeric"
          title={accountName ? `Sirf ${accountName} me khojega` : "Sabhi cash/bank accounts me khojega"}
          data-testid="voucher-search-input"
        />
        {busy ? (
          <CircleNotch size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted2 animate-spin" />
        ) : q ? (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted2 hover:text-ink" onClick={clear} title="Clear" data-testid="voucher-search-clear">
            <X size={14} />
          </button>
        ) : null}
      </div>

      {res && (
        <div className="absolute z-40 mt-1 w-[560px] max-w-[calc(100vw-2rem)] card-flat shadow-2xl overflow-hidden animate-fade-in" data-testid="voucher-search-results">
          <div className="px-4 py-2 border-b border-khaki flex items-center justify-between bg-parchment/60">
            <div className="section-title">
              Voucher No. <span className="font-mono-data text-terracotta">{res.voucher_no}</span>
              {accountName ? <span className="text-muted2 normal-case tracking-normal"> · {accountName}</span> : null}
            </div>
            <div className="text-xs text-muted2 font-mono-data" data-testid="voucher-search-count">{res.entries.length} entry</div>
          </div>
          {res.entries.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted2 text-center" data-testid="voucher-search-empty">
              V.No. {res.voucher_no} ki koi entry nahi mili{accountName ? ` (${accountName} me)` : ""}.
            </div>
          ) : (
            <div className="divide-y divide-khaki/60 max-h-[360px] overflow-auto">
              {res.entries.map((e) => {
                const jama = e.type === "jama";
                return (
                  <div key={e.id} className="px-4 py-2.5 flex items-start gap-3" data-testid={`voucher-result-${e.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono-data text-xs text-muted2">{fmtDate(e.date)}</span>
                        <span className="text-[10px] font-heading uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
                          style={{ background: jama ? "#E8F5E9" : "#FFEBEE", color: jama ? "#1B5E20" : "#B71C1C" }}>
                          {jama ? "Receipt · Jama" : "Payment · Kharch"}
                        </span>
                        {e.contra_id && (
                          <span className="kbd !text-[9px] !px-1 !py-0 text-jama border-jama/40"><ArrowsLeftRight size={9} weight="bold" className="inline mr-0.5" />TRANSFER</span>
                        )}
                        <span className="text-xs text-muted2">{e.mode || ""}{e.chq_no ? ` · Chq ${e.chq_no}` : ""}</span>
                      </div>
                      <div className="font-medium mt-0.5 truncate">{e.party_name || "—"}</div>
                      <div className="text-[11px] text-muted2 truncate">
                        {e.cash_account_name ? `[${e.cash_account_name}] ` : ""}{e.description || ""}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="font-mono-data text-lg font-medium" style={{ color: jama ? "#1B5E20" : "#B71C1C" }}>₹ {inr(e.amount)}</div>
                      <button type="button" className="btn-ghost p-1 mt-0.5 text-xs inline-flex items-center gap-1"
                        onClick={() => { e.contra_id ? onTransfer?.(e.contra_id) : onEdit?.(e); setRes(null); }}
                        title={e.contra_id ? "Transfer kholein" : "Entry kholein / edit"} data-testid={`voucher-open-${e.id}`}>
                        <PencilSimple size={12} /> Kholein
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VoucherSearch;
