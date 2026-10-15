import { useEffect, useState } from "react";
import api, { formatApiErrorDetail, inr } from "@/lib/api";
import { ArrowsLeftRight, X } from "@phosphor-icons/react";
import { toast } from "sonner";

const EMPTY = { date: "", from_account_id: "", to_account_id: "", amount: "", description: "", voucher_no: "", chq_no: "", mode: "Bank" };

// Cash ↔ Bank transfer (contra): one form → two linked rokad legs (kharch on FROM, jama on TO)
export const TransferForm = ({ accounts, date, contraId, onClose, onSaved }) => {
  const [form, setForm] = useState({ ...EMPTY, date });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!contraId) return;
    api.get(`/rokad/transfer/${contraId}`).then((r) => {
      const t = r.data;
      setForm({ date: t.date, from_account_id: t.from_account_id, to_account_id: t.to_account_id, amount: String(t.amount),
        description: t.description || "", voucher_no: t.voucher_no || "", chq_no: t.chq_no || "", mode: t.mode || "Bank" });
    }).catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  }, [contraId]);

  const from = accounts.find((a) => a.id === form.from_account_id);
  const to = accounts.find((a) => a.id === form.to_account_id);
  const amt = parseFloat(form.amount);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.from_account_id || !form.to_account_id) return toast.error("From aur To dono account chunein");
    if (form.from_account_id === form.to_account_id) return toast.error("From aur To account alag hone chahiye");
    if (!amt || amt <= 0) return toast.error("Amount sahi nahi hai");
    setBusy(true);
    try {
      const body = { ...form, amount: amt };
      if (contraId) await api.put(`/rokad/transfer/${contraId}`, body);
      else await api.post("/rokad/transfer", body);
      toast.success(`₹ ${inr(amt)} ${from?.name} → ${to?.name} transfer ${contraId ? "update" : "save"} hua`);
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onClose} data-testid="transfer-modal">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 grid place-items-center rounded-sm" style={{ background: "#1B5E20" }}><ArrowsLeftRight size={16} weight="bold" color="#fff" /></div>
            <div className="font-heading font-semibold text-lg">{contraId ? "Transfer Edit" : "Cash / Bank Transfer (Contra)"}</div>
          </div>
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} data-testid="transfer-close"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Date</label>
            <input type="date" className="input-dense" value={form.date} required onChange={(e) => set("date", e.target.value)} data-testid="transfer-date" />
          </div>
          <div>
            <label className="lbl">Amount (₹)</label>
            <input type="number" step="0.01" min="0.01" className="input-dense text-right font-mono-data" value={form.amount} required autoFocus
              onChange={(e) => set("amount", e.target.value)} data-testid="transfer-amount" />
          </div>
          <div>
            <label className="lbl">From (paisa nikla) — Kharch</label>
            <select className="input-dense" value={form.from_account_id} required onChange={(e) => set("from_account_id", e.target.value)} data-testid="transfer-from">
              <option value="">— chunein —</option>
              {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === form.to_account_id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">To (paisa aaya) — Jama</label>
            <select className="input-dense" value={form.to_account_id} required onChange={(e) => set("to_account_id", e.target.value)} data-testid="transfer-to">
              <option value="">— chunein —</option>
              {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === form.from_account_id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">V.No. (optional)</label>
            <input className="input-dense font-mono-data" value={form.voucher_no} onChange={(e) => set("voucher_no", e.target.value)} data-testid="transfer-voucher" />
          </div>
          <div>
            <label className="lbl">Chq / Ref No. (optional)</label>
            <input className="input-dense font-mono-data" value={form.chq_no} onChange={(e) => set("chq_no", e.target.value)} data-testid="transfer-chq" />
          </div>
          <div className="col-span-2">
            <label className="lbl">Vivran</label>
            <input className="input-dense" value={form.description} placeholder="e.g. Bank se cash nikala" onChange={(e) => set("description", e.target.value)} data-testid="transfer-description" />
          </div>
        </div>
        {from && to && amt > 0 && (
          <div className="mt-3 text-xs font-mono-data text-muted2 border border-khaki rounded-sm p-2 bg-parchment/40" data-testid="transfer-preview">
            <span className="amount-kharch">{from.name}: Kharch ₹ {inr(amt)}</span> &nbsp;→&nbsp; <span className="amount-jama">{to.name}: Jama ₹ {inr(amt)}</span>
            <span className="ml-2">(dono ledger ek saath update)</span>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4 border-t border-khaki pt-4">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy} data-testid="transfer-submit">
            <ArrowsLeftRight size={14} weight="bold" /> {busy ? "Saving..." : contraId ? "Update Transfer" : "Transfer Karein"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TransferForm;
