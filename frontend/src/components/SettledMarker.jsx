import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { confirmBox } from "@/components/ConfirmHost";
import { drcr } from "@/lib/drcr";
import { toast } from "sonner";
import { CheckCircle, ArrowCounterClockwise, Warning } from "@phosphor-icons/react";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// Undo an Account Settled adjustment (confirm → POST /rokad/{id}/reopen). Resolves true when done.
export const reopenSettled = async (rokadId, partyName = "") => {
  const ok = await confirmBox(`${partyName ? partyName + " ka " : ""}Account Settled hataayein?\nAdjustment journal delete hoga aur party ka baki ledger me wapas aa jayega.`);
  if (!ok) return false;
  try {
    const { data } = await api.post(`/rokad/${rokadId}/reopen`);
    toast.success(`Account reopened · ₹${inr(data.removed_amount)} ka adjustment hata · ${data.party_name || ""} ka baki wapas`);
    return true;
  } catch (err) {
    toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    return false;
  }
};

export const SettledBadge = ({ date, className = "" }) => (
  <div className={`inline-flex items-center gap-1.5 border-2 border-jama text-jama bg-jama-bg font-heading font-semibold text-xs uppercase tracking-wider px-2.5 py-1 ${className}`}
    data-testid="ledger-settled-badge">
    <CheckCircle size={14} weight="fill" /> Account cleared upto {fmtDate(date)}
  </div>
);

// Green full-width marker row rendered right after a settlement journal line in the ledger table
// `balance` = running balance right after the settlement line; non-zero means an earlier voucher changed later → stale
export const SettledMarkerRow = ({ colSpan, date, rokadId, onReopen, balance = 0 }) => {
  const stale = Math.abs(balance) >= 0.005;
  return (
  <tr className={stale ? "!bg-[#FFF3E0]" : "!bg-jama-bg"} data-testid={`ledger-settled-marker-${rokadId}`} data-stale={stale ? "1" : "0"}>
    <td colSpan={colSpan} className="!py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex items-center gap-1.5 font-heading font-semibold text-xs uppercase tracking-wider ${stale ? "text-[#B45309]" : "text-jama"}`}>
          {stale ? <Warning size={14} weight="fill" /> : <CheckCircle size={14} weight="fill" />}
          Account cleared upto {fmtDate(date)} · {stale ? `settlement purana — baki ₹ ${inr(Math.abs(balance))} ${drcr(balance)} (Rokad entry edit karein ya Reopen)` : "ledger 0"}
        </span>
        {onReopen && (
          <button type="button" className="btn-ghost !h-6 text-[11px] text-jama print:hidden flex items-center gap-1" onClick={onReopen}
            title="Settlement hatao — party ka baki wapas aayega" data-testid={`ledger-reopen-${rokadId}`}>
            <ArrowCounterClockwise size={12} weight="bold" /> Reopen
          </button>
        )}
      </div>
    </td>
  </tr>
  );
};
