import { inr } from "@/lib/api";
import { Prohibit, X } from "@phosphor-icons/react";
import { backdropClose } from "@/lib/backdrop";
import { useEscClose } from "@/hooks/useEscClose";

const LABELS = { rokad: "Rokad entries", bills: "Bills", journal: "Journal entries", dos_journal: "DOS (purani) entries", inward: "Inward entries" };

// Shown when DELETE returns 409: the ledger is referenced by entries
export const LedgerInUseDialog = ({ info, onClose }) => {
  useEscClose(onClose, !!info);
  if (!info) return null;
  const counts = Object.entries(info.counts || {}).filter(([, n]) => n > 0);
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-[60] p-4" {...backdropClose(onClose)} data-testid="ledger-in-use-dialog">
      <div className="card-flat w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-sm flex-shrink-0" style={{ background: "#7A3E00" }}>
              <Prohibit size={18} weight="bold" color="#fff" />
            </div>
            <div>
              <div className="font-heading font-semibold text-lg">Delete nahi ho sakta</div>
              <div className="text-sm text-muted2 mt-0.5" data-testid="ledger-in-use-message">{info.message}</div>
            </div>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose} data-testid="ledger-in-use-close"><X size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-2 mb-3" data-testid="ledger-in-use-counts">
          {counts.map(([k, n]) => (
            <span key={k} className="kbd !text-[11px] px-2 py-1">{LABELS[k] || k}: <b>{n}</b></span>
          ))}
        </div>
        {info.samples?.length > 0 && (
          <table className="dense w-full text-sm" data-testid="ledger-in-use-samples">
            <thead><tr><th style={{ width: 95 }}>Date</th><th>Entry</th><th className="num" style={{ width: 120 }}>Amount</th></tr></thead>
            <tbody>
              {info.samples.map((s, i) => (
                <tr key={i}>
                  <td className="font-mono-data text-muted2">{s.date}</td>
                  <td>{s.text}</td>
                  <td className="num font-mono-data">{s.amount != null ? `₹ ${inr(s.amount)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {info.total > (info.samples?.length || 0) && (
          <div className="text-[11px] text-muted2 mt-2 font-mono-data">… aur {info.total - info.samples.length} entries</div>
        )}
        <div className="flex justify-end mt-4">
          <button className="btn-primary" onClick={onClose}>Theek hai</button>
        </div>
      </div>
    </div>
  );
};

export const inUseInfo = (err) => (err?.response?.status === 409 && typeof err.response.data?.detail === "object" ? err.response.data.detail : null);

export default LedgerInUseDialog;
