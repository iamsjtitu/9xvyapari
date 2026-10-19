import { useEffect, useState } from "react";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { ListNumbers, X, Eye, Check, Warning } from "@phosphor-icons/react";

// Renumber one cash/bank a/c's vouchers date-wise (1, 2, 3 … in date order). Preview first, then apply.
export const RenumberVouchersDialog = ({ account, fyStart, fyEnd, onClose, onDone }) => {
  const [f, setF] = useState({ date_from: fyStart || "", date_to: fyEnd || "", start: 1 });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPreview(null); }, [f.date_from, f.date_to, f.start]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const call = async (apply) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/cash-accounts/${account.id}/renumber-vouchers`, {
        date_from: f.date_from || null, date_to: f.date_to || null, start: Number(f.start) || 1, apply,
      });
      if (apply) {
        toast.success(`${data.changed} voucher renumber ho gaye (${data.first_no} → ${data.last_no})${data.safety_backup ? " · safety backup bana" : ""}`);
        onDone?.();
        onClose();
      } else {
        setPreview(data);
        if (!data.changed) toast.info("Sab V.No. pehle se hi date-wise sahi hain");
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  if (!account) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-start p-4 overflow-y-auto print:hidden" onClick={onClose} data-testid="renumber-dialog">
      <div className="card-flat w-full max-w-2xl p-6 my-4 mx-auto" onClick={(e) => e.stopPropagation()} data-enter-scope>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 grid place-items-center rounded-sm flex-shrink-0" style={{ background: "#8B2520" }}>
              <ListNumbers size={20} weight="bold" color="#fff" />
            </div>
            <div>
              <div className="font-heading font-semibold text-lg">V.No. Date-wise Renumber</div>
              <div className="text-sm text-muted2">{account.code ? `${account.code} · ` : ""}{account.name} — is account ke vouchers date ke kram me 1, 2, 3… ho jayenge.</div>
            </div>
          </div>
          <button className="btn-ghost p-1" onClick={onClose} data-testid="renumber-close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="lbl">From</label>
            <input type="date" className="input-dense" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} data-testid="renumber-from" />
          </div>
          <div>
            <label className="lbl">To</label>
            <input type="date" className="input-dense" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} data-testid="renumber-to" />
          </div>
          <div>
            <label className="lbl">Shuru number</label>
            <input type="number" min={1} className="input-dense num" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} data-testid="renumber-start" />
          </div>
        </div>
        <div className="text-[11px] text-muted2 mt-2">Khali chhodo to account ki saari entries. Ek hi date par kai entries hon to jis kram me daali gayi thi wahi kram rahega.</div>

        {preview && (
          <div className="mt-4 border border-khaki rounded-sm overflow-hidden" data-testid="renumber-preview">
            <div className="px-3 py-2 bg-parchment/60 text-sm flex items-center justify-between flex-wrap gap-2">
              <span><strong data-testid="renumber-total">{preview.total}</strong> entries · <strong className="text-terracotta" data-testid="renumber-changed">{preview.changed}</strong> ka number badlega</span>
              <span className="font-mono-data text-xs text-muted2">{preview.first_no} → {preview.last_no ?? "—"}</span>
            </div>
            {preview.changed > 0 && (
              <div className="max-h-52 overflow-auto">
              <table className="dense w-full text-xs">
                <thead><tr><th>Date</th><th>Party</th><th className="num">Amount</th><th className="num">Purana</th><th className="num">Naya</th></tr></thead>
                <tbody>
                  {preview.sample.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono-data">{c.date}</td>
                      <td>{c.type === "jama" ? "R · " : "P · "}{c.party_name || "—"}</td>
                      <td className="num font-mono-data">₹ {inr(c.amount)}</td>
                      <td className="num font-mono-data text-muted2">{c.old || "—"}</td>
                      <td className="num font-mono-data font-semibold text-terracotta">{c.new}</td>
                    </tr>
                  ))}
                  {preview.changed > preview.sample.length && (
                    <tr><td colSpan={5} className="text-center text-muted2">… aur {preview.changed - preview.sample.length} entries</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 p-3 mt-4 border border-kharch/30 bg-kharch-bg/40 rounded-sm text-xs">
          <Warning size={14} color="#B71C1C" weight="bold" className="mt-0.5 flex-shrink-0" />
          <div>Apply se pehle current data ka <strong>safety backup</strong> apne aap banta hai. Purane V.No. print ho chuke vouchers se alag ho jayenge — soch kar karein.</div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-outline" onClick={onClose} disabled={busy} data-testid="renumber-cancel">Cancel</button>
          <button className="btn-outline" onClick={() => call(false)} disabled={busy} data-testid="renumber-preview-btn"><Eye size={14} /> Preview</button>
          <button className="btn-primary" onClick={() => call(true)} disabled={busy || !preview || !preview.changed} data-enter-submit
            title={!preview ? "Pehle Preview dekhein" : ""} data-testid="renumber-apply-btn">
            <Check size={14} weight="bold" /> Renumber Karein
          </button>
        </div>
      </div>
    </div>
  );
};

export default RenumberVouchersDialog;
