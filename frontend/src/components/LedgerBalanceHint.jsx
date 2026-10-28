import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { drcr } from "@/lib/drcr";
import { Scales, ArrowRight } from "@phosphor-icons/react";

// Shows a ledger's live balance as soon as it is selected (party / cash account).
// `delta` (signed, Dr +ve) = what the entry being typed will do → "abhi ₹X → baad me ₹Y" updates live.
export const LedgerBalanceHint = ({ ledgerId, delta = 0, className = "", compact = false, testId = "ledger-balance-hint" }) => {
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
  const isParty = info.kind === "party" && !/cash|bank/i.test(info.group_name || "");
  // party: lena (+) red / dena (−) green · cash-bank: paisa hai (+) ink / overdrawn (−) red
  const colorOf = (b) => (isParty ? (b > 0 ? "#B71C1C" : b < 0 ? "#1B5E20" : "#595959") : (b < 0 ? "#B71C1C" : "#1A1A1A"));
  const meaningOf = (b) => (isParty ? (b > 0 ? "lena hai" : b < 0 ? "dena hai" : "settled") : (b >= 0 ? "balance" : "overdrawn"));
  const d = Number(delta) || 0;
  const after = Math.round((bal + d) * 100) / 100;
  const live = Math.abs(d) >= 0.005;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[11px] font-mono-data ${className}`} data-testid={testId}>
      <Scales size={12} color={colorOf(bal)} weight="bold" />
      {!compact && <span className="text-muted2">Abhi ka balance:</span>}
      <span className="font-semibold" style={{ color: colorOf(bal) }} data-testid={`${testId}-amount`}>
        ₹ {inr(Math.abs(bal))} {drcr(bal)}
      </span>
      <span className="text-muted2">({meaningOf(bal)})</span>
      {live && (
        <>
          <ArrowRight size={11} className="text-muted2" />
          <span className="text-muted2">{compact ? "" : "is entry ke baad:"}</span>
          <span className="font-semibold px-1 rounded-sm bg-[#FFF8E1] border border-[#F0C674]" style={{ color: colorOf(after) }}
            title="Is amount ke baad ka balance (live)" data-testid={`${testId}-after`}>
            ₹ {inr(Math.abs(after))} {drcr(after)}
          </span>
          <span className="text-muted2">({meaningOf(after)})</span>
        </>
      )}
      {info.kind === "party" && (
        <Link to={`/parties/${ledgerId}`} className="text-terracotta hover:underline ml-1" target="_blank" rel="noreferrer" title="Ledger kholein">
          Ledger
        </Link>
      )}
    </div>
  );
};

export default LedgerBalanceHint;
