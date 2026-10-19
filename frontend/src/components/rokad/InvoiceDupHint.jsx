import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";
import { Warning } from "@phosphor-icons/react";

const dmy = (iso) => (iso || "").slice(0, 10).split("-").reverse().join("-");
export const describeDup = (d) => `${dmy(d.date)} · ₹${inr(d.amount)} ${d.type === "jama" ? "Jama" : "Kharch"} · V.${d.voucher_no || "—"}${d.cash_account_name ? ` (${d.cash_account_name})` : ""}`;

// Live double-payment guard: same Invoice No. already posted for this party? Reports the hits upward via onResult.
export const InvoiceDupHint = ({ partyId, invNo, excludeId, onResult }) => {
  const [dups, setDups] = useState([]);
  useEffect(() => {
    const v = (invNo || "").trim();
    if (!partyId || !v) { setDups([]); onResult?.([]); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      api.get("/rokad/invoice-check", { params: { party_id: partyId, inv_no: v, ...(excludeId ? { exclude_id: excludeId } : {}) } })
        .then((r) => { if (alive) { setDups(r.data.duplicates || []); onResult?.(r.data.duplicates || []); } })
        .catch(() => { if (alive) { setDups([]); onResult?.([]); } });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, invNo, excludeId]);

  if (!dups.length) return null;
  return (
    <div className="mt-1 flex items-start gap-1.5 text-xs text-kharch bg-kharch-bg/60 border border-kharch/40 rounded-sm px-2 py-1.5" data-testid="inv-dup-warning">
      <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
      <div>
        <div className="font-semibold">Yeh Invoice No. is party ke liye pehle se hai — double payment?</div>
        {dups.slice(0, 3).map((d) => <div key={d.id} className="font-mono-data" data-testid={`inv-dup-${d.id}`}>{describeDup(d)}</div>)}
        {dups.length > 3 && <div>… aur {dups.length - 3}</div>}
      </div>
    </div>
  );
};

export default InvoiceDupHint;
