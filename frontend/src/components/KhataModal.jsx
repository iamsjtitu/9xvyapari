import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { backdropClose } from "@/lib/backdrop";

export const EMPTY_KHATA = {
  code: "", name: "", alt_name: "", group_id: "", group_name: "", type: "both", place: "", phone: "",
  address: "", address2: "", gstin: "", pan: "", cstno: "", mpstno: "", opening_balance: 0, opening_qty: 0, rate: 0, remark: "",
};

const fromParty = (p) => ({
  ...EMPTY_KHATA,
  ...Object.fromEntries(Object.keys(EMPTY_KHATA).map((k) => [k, p[k] ?? EMPTY_KHATA[k]])),
  name: (p.name || "").toUpperCase(),
});

// Full "Naya Khata / Edit Khata" form. `khata` = null (closed) | {id:null, name?} (new) | existing party (edit).
// onSaved(party) gets the saved record so callers (Rokad/Bill) can select it right away.
export const KhataModal = ({ khata, onClose, onSaved, title }) => {
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState(EMPTY_KHATA);
  const [busy, setBusy] = useState(false);
  const open = khata !== null && khata !== undefined;

  useEffect(() => {
    if (!open) return;
    setForm(fromParty(khata));
    api.get("/account-groups").then((r) => { const d = r.data; d.sort((a, b) => (a.fcode || 0) - (b.fcode || 0)); setGroups(d); }).catch(() => {});
  }, [open, khata]);

  // ESC closes only this dialog; single-key page shortcuts (a / p / r …) must not reach the page underneath
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); onClose(); return; }
      const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || "");
      if (!inField && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.stopPropagation(); e.stopImmediatePropagation(); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open, onClose]);

  if (!open) return null;
  const isEdit = !!khata.id;

  const onGroupChange = async (group_id) => {
    const g = groups.find((x) => x.id === group_id);
    setForm((f) => ({ ...f, group_id, group_name: g?.name || "" }));
    if (!group_id || isEdit) return;
    try {
      const { data } = await api.get(`/account-groups/${group_id}/next-code`);
      if (data.next_code) setForm((f) => ({ ...f, group_id, group_name: g.name, code: String(data.next_code) }));
    } catch {}
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.group_id) { toast.error("Group chunna zaroori hai — pehle Group select karein"); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        opening_balance: parseFloat(form.opening_balance || 0),
        opening_qty: parseFloat(form.opening_qty || 0),
        rate: parseFloat(form.rate || 0),
        code: form.code ? parseInt(form.code) : null,
      };
      const { data } = isEdit ? await api.put(`/parties/${khata.id}`, payload) : await api.post("/parties", payload);
      toast.success(isEdit ? "Khata update ho gaya" : `Khata "${data.name}" ban gaya`);
      onSaved?.(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setUpper = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.toUpperCase() }));

  return (
    <div className="fixed inset-0 bg-black/40 grid justify-items-center items-start z-[60] p-4 overflow-y-auto" {...backdropClose(onClose)} data-testid="modal-party">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-3xl my-6 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-heading font-semibold text-lg" data-testid="modal-party-title">{title || (isEdit ? "Edit Khata" : "Naya Khata / Ledger")}</div>
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} data-testid="modal-party-close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-3">
            <label className="lbl">Group *</label>
            <select className={`input-dense ${!form.group_id && isEdit ? "border-[#B71C1C]" : ""}`} value={form.group_id} onChange={(e) => onGroupChange(e.target.value)} data-testid="select-party-group" autoFocus={!form.group_id}>
              <option value="">— Group chunein —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.fcode}–{g.lcode} · {g.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="lbl">Code</label>
            <input type="number" className="input-dense num" value={form.code} onChange={set("code")} data-testid="input-party-code" />
          </div>
          <div className="md:col-span-5">
            <label className="lbl">Naam *</label>
            <input required autoFocus={!!form.group_id} className="input-dense" value={form.name} onChange={setUpper("name")} data-testid="input-party-name" />
          </div>
          <div className="md:col-span-2">
            <label className="lbl">Type</label>
            <select className="input-dense" value={form.type} onChange={set("type")} data-testid="select-party-type">
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div className="md:col-span-5"><label className="lbl">Alt Name (GL_NAME1)</label><input className="input-dense" value={form.alt_name} onChange={set("alt_name")} /></div>
          <div className="md:col-span-3"><label className="lbl">Place (GL_PLACE)</label><input className="input-dense" value={form.place} onChange={set("place")} data-testid="input-party-place" /></div>
          <div className="md:col-span-4"><label className="lbl">Phone</label><input className="input-dense" value={form.phone} onChange={set("phone")} data-testid="input-party-phone" /></div>

          <div className="md:col-span-6"><label className="lbl">Address 1</label><input className="input-dense" value={form.address} onChange={set("address")} /></div>
          <div className="md:col-span-6"><label className="lbl">Address 2</label><input className="input-dense" value={form.address2} onChange={set("address2")} /></div>

          <div className="md:col-span-3"><label className="lbl">GSTIN (F_G_L_NO)</label><input className="input-dense" value={form.gstin} onChange={setUpper("gstin")} /></div>
          <div className="md:col-span-3"><label className="lbl">PAN</label><input className="input-dense" value={form.pan} onChange={setUpper("pan")} /></div>
          <div className="md:col-span-3"><label className="lbl">CST No.</label><input className="input-dense" value={form.cstno} onChange={set("cstno")} /></div>
          <div className="md:col-span-3"><label className="lbl">MP State Tax</label><input className="input-dense" value={form.mpstno} onChange={set("mpstno")} /></div>

          <div className="md:col-span-4">
            <label className="lbl">Opening Balance (₹)</label>
            <input type="number" step="0.01" className="input-dense num" value={form.opening_balance} onChange={set("opening_balance")} data-testid="input-opening-balance" />
            <div className="text-[10px] text-muted2 mt-1">+ve = party humein dena hai. −ve = humein party ko dena hai.</div>
          </div>
          <div className="md:col-span-4"><label className="lbl">Opening Qty</label><input type="number" step="0.001" className="input-dense num" value={form.opening_qty} onChange={set("opening_qty")} /></div>
          <div className="md:col-span-4"><label className="lbl">Default Rate</label><input type="number" step="0.01" className="input-dense num" value={form.rate} onChange={set("rate")} /></div>

          <div className="md:col-span-12">
            <label className="lbl">Remark / Yaad-dasht</label>
            <textarea rows={2} className="input-dense !h-auto py-1.5" value={form.remark} onChange={set("remark")} maxLength={500}
              placeholder='Jaise: "Is party se 1,60,000 me tutaya hai" · "JCB wala, Sunday band"' data-testid="input-party-remark" />
            <div className="text-[10px] text-muted2 mt-1">Ledger ke upar aur Party Khata list me dikhega (print statement me bhi).</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5 border-t border-khaki pt-4">
          <button type="button" className="btn-outline" onClick={onClose} data-testid="btn-cancel-party">Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy} data-testid="btn-save-party">{busy ? "Saving..." : "Save Khata"}</button>
        </div>
      </form>
    </div>
  );
};

export default KhataModal;
