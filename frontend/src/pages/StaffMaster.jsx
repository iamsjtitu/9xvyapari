import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr, formatApiErrorDetail, todayISO } from "@/lib/api";
import { toast } from "sonner";
import { Plus, PencilSimple, Trash, X, UsersThree, LinkSimple } from "@phosphor-icons/react";
import { backdropClose } from "@/lib/backdrop";
import { StaffPageHeader } from "@/components/staff/common";

const EMPTY = { name: "", phone: "", salary_type: "monthly", salary: "", join_date: todayISO(), active: true, notes: "" };

const StaffForm = ({ editing, onClose, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(editing?.id ? { ...EMPTY, ...editing, salary: String(editing.salary ?? "") } : EMPTY); }, [editing]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, name: form.name.trim().toUpperCase(), salary: parseFloat(form.salary || 0) };
      const { data } = editing?.id ? await api.put(`/staff/${editing.id}`, payload) : await api.post("/staff", payload);
      toast.success(editing?.id ? "Staff update ho gaya" : `${data.name} add ho gaya · ledger ban gaya (Rokad me naam select kar sakte ho)`);
      onSaved(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" {...backdropClose(onClose)} data-testid="modal-staff">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-heading font-semibold text-lg">{editing?.id ? "Staff Edit" : "Naya Staff"}</div>
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} data-testid="modal-staff-close"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="lbl">Naam *</label>
            <input required autoFocus className="input-dense uppercase" value={form.name} onChange={set("name")} placeholder="RAMU" data-testid="input-staff-name" /></div>
          <div><label className="lbl">Phone</label><input className="input-dense" value={form.phone} onChange={set("phone")} data-testid="input-staff-phone" /></div>
          <div><label className="lbl">Joining Date</label><input type="date" className="input-dense" value={form.join_date || ""} onChange={set("join_date")} data-testid="input-staff-join" /></div>
          <div><label className="lbl">Salary System</label>
            <select className="input-dense" value={form.salary_type} onChange={set("salary_type")} data-testid="select-staff-salary-type">
              <option value="monthly">Monthly (mahine ki salary ÷ 30)</option>
              <option value="daily">Daily (roz ka rate)</option>
            </select></div>
          <div><label className="lbl">{form.salary_type === "monthly" ? "Monthly Salary (₹)" : "Daily Rate (₹)"} *</label>
            <input required type="number" min="0" step="1" className="input-dense num" value={form.salary} onChange={set("salary")} data-testid="input-staff-salary" />
            {form.salary_type === "monthly" && Number(form.salary) > 0 && <div className="text-[10px] text-muted2 mt-1">1 din = ₹ {inr(Number(form.salary) / 30)}</div>}</div>
          <div className="col-span-2"><label className="lbl">Note</label><input className="input-dense" value={form.notes || ""} onChange={set("notes")} placeholder="Kaam / duty" data-testid="input-staff-notes" /></div>
          {editing?.id && (
            <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4 accent-[#1B5E20]" checked={!!form.active} onChange={set("active")} data-testid="checkbox-staff-active" /> Active (attendance / salary list me dikhe)
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5 border-t border-khaki pt-4">
          <button type="button" className="btn-outline" onClick={onClose} data-testid="btn-cancel-staff">Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy} data-testid="btn-save-staff">{busy ? "Saving..." : "Save Staff"}</button>
        </div>
      </form>
    </div>
  );
};

export default function StaffMaster() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const load = () => api.get("/staff").then((r) => setData(r.data)).catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  useEffect(() => { load(); }, []);

  const del = async (s) => {
    if (!window.confirm(`${s.name} ko delete karein? (Agar entries hain toh Inactive karna padega)`)) return;
    try { await api.delete(`/staff/${s.id}`); toast.success("Staff delete ho gaya (ledger rakha gaya)"); load(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
  };
  const list = (data?.staff || []).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone || "").includes(q));

  return (
    <div className="space-y-5" data-testid="page-staff-master">
      <StaffPageHeader title="Staff Master" icon={UsersThree} subtitle="Staff ka naam, salary system (Monthly ÷ 30 / Daily) aur rate. Har staff ka ledger apne aap STAFF group me banta hai — Rokad me naam select karke payment ho sakti hai.">
        <input className="input-dense h-9 text-sm !w-[200px]" placeholder="Search naam / phone" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-staff-search" />
        <button className="btn-primary" onClick={() => setEditing({})} data-testid="btn-add-staff"><Plus size={16} weight="bold" /> Naya Staff</button>
      </StaffPageHeader>

      {data?.setup && (
        <div className="text-xs text-muted2 flex flex-wrap gap-4" data-testid="staff-setup-info">
          <span><LinkSimple size={12} className="inline mr-1" />Staff ledger group: <strong>{data.setup.staff_group_name}</strong></span>
          <span>Salary kharch ledger: <strong>{data.setup.salary_expense_name}</strong></span>
        </div>
      )}

      <div className="card-flat overflow-hidden">
        <table className="dense w-full" data-testid="table-staff">
          <thead><tr><th>Naam</th><th>Phone</th><th>Salary System</th><th className="num">Salary / Rate</th><th>Joining</th><th className="num">Advance Baki</th><th className="num">Salary Baki</th><th>Status</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={9} className="py-8 text-center text-muted2">Loading…</td></tr>
              : list.length === 0 ? <tr><td colSpan={9} className="py-10 text-center text-muted2" data-testid="staff-empty">Koi staff nahi. <button className="text-terracotta" onClick={() => setEditing({})}>Add karein</button></td></tr>
              : list.map((s) => (
                <tr key={s.id} data-testid={`staff-row-${s.id}`} className={s.active ? "" : "opacity-60"}>
                  <td><Link to={`/parties/${s.ledger_id}`} className="font-medium text-ink hover:text-terracotta" title="Staff ledger">{s.name}</Link>{s.notes && <div className="text-xs text-muted2">{s.notes}</div>}</td>
                  <td className="font-mono-data">{s.phone || "—"}</td>
                  <td>{s.salary_type === "monthly" ? "Monthly" : "Daily"}</td>
                  <td className="num font-mono-data">₹ {inr(s.salary)}{s.salary_type === "monthly" ? <span className="text-[10px] text-muted2 block">₹ {inr(s.salary / 30)}/din</span> : null}</td>
                  <td className="font-mono-data text-muted2">{s.join_date ? s.join_date.split("-").reverse().join("-") : "—"}</td>
                  <td className="num font-mono-data amount-kharch" data-testid={`staff-adv-${s.id}`}>{s.advance_due ? `₹ ${inr(s.advance_due)}` : "—"}</td>
                  <td className="num font-mono-data amount-jama" data-testid={`staff-due-${s.id}`}>{s.salary_due ? `₹ ${inr(s.salary_due)}` : "—"}</td>
                  <td>{s.active ? <span className="kbd !text-[9px] !px-1 !py-0 text-jama border-jama/40">ACTIVE</span> : <span className="kbd !text-[9px] !px-1 !py-0">INACTIVE</span>}</td>
                  <td><div className="flex gap-1">
                    <button className="btn-ghost p-1.5" onClick={() => setEditing(s)} data-testid={`staff-edit-${s.id}`}><PencilSimple size={14} /></button>
                    <button className="btn-ghost p-1.5 !text-[#B71C1C]" onClick={() => del(s)} data-testid={`staff-del-${s.id}`}><Trash size={14} /></button>
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing !== null && <StaffForm editing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
