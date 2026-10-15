import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { Scales } from "@phosphor-icons/react";

// Shows a ledger's live balance as soon as it is selected (party / cash account)
export const LedgerBalanceHint = ({ ledgerId, className = "", compact = false, testId = "ledger-balance-hint" }) => {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!ledgerId) { setInfo(null); return; }
    let alive = true;
    setInfo({ loading: true });
    api.get(`/ledgers/${ledgerId}/balance`)
      .then((r) => alive && setInfo(r.data))
      .catch(() => alive && setInfo(null));
    return () => { alive = false; };
  }, [ledgerId]);

  if (!ledgerId || !info) return null;
  if (info.loading) return <div className={`text-[11px] text-muted2 font-mono-data ${className}`} data-testid={testId}>Balance…</div>;
  const bal = info.balance || 0;
  const color = bal > 0 ? "#B71C1C" : bal < 0 ? "#1B5E20" : "#595959";
  const meaning = info.kind === "party" && !/cash|bank/i.test(info.group_name || "")
    ? (bal > 0 ? "lena hai" : bal < 0 ? "dena hai" : "settled")
    : (bal >= 0 ? "balance" : "overdrawn");
  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-mono-data ${className}`} data-testid={testId}>
      <Scales size={12} color={color} weight="bold" />
      {!compact && <span className="text-muted2">Abhi ka balance:</span>}
      <span className="font-semibold" style={{ color }} data-testid={`${testId}-amount`}>
        ₹ {inr(Math.abs(bal))} {info.dr_cr}
      </span>
      <span className="text-muted2">({meaning})</span>
      {info.kind === "party" && (
        <Link to={`/parties/${ledgerId}`} className="text-terracotta hover:underline ml-1" target="_blank" rel="noreferrer" title="Ledger kholein">
          Ledger
        </Link>
      )}
    </div>
  );
};

export default LedgerBalanceHint;
