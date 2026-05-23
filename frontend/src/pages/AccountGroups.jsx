import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Plus, PencilSimple, Trash, X, TreeStructure } from "@phosphor-icons/react";
import { toast } from "sonner";

const NATURES = [
  { v: "asset", l: "Asset (Sampatti)", color: "#1B5E20" },
  { v: "liability", l: "Liability (Deyatva)", color: "#8B2520" },
  { v: "income", l: "Income (Aay)", color: "#1B5E20" },
  { v: "expense", l: "Expense (Vyay)", color: "#B71C1C" },
];

const EMPTY = { name: "", nature: "asset" };

export default function AccountGroups() {
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => setGroups((await api.get("/account-groups")).data);
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editing?.id) await api.put(`/account-groups/${editing.id}`, form);
      else await api.post("/account-groups", form);
      toast.success("Saved");
      setEditing(null); setForm(EMPTY); load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this group?")) return;
    try {
      await api.delete(`/account-groups/${id}`);
      toast.success("Deleted"); load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const grouped = NATURES.map((n) => ({
    ...n,
    list: groups.filter((g) => g.nature === n.v),
  }));

  return (
    <div className="space-y-5" data-testid="page-account-groups">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Setup · Account Group</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">Account Groups</h1>
          <div className="text-muted2 text-sm mt-1">Tally-style ledger groups – Assets, Liabilities, Income, Expenses.</div>
        </div>
        <button className="btn-primary" onClick={() => { setEditing({ id: null }); setForm(EMPTY); }} data-testid="btn-add-group">
          <Plus size={16} weight="bold" /> Naya Group <span className="kbd ml-1">A</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {grouped.map((sec) => (
          <div key={sec.v} className="card-flat overflow-hidden">
            <div className="px-4 py-3 border-b border-khaki flex items-center gap-2">
              <TreeStructure size={16} color={sec.color} weight="bold" />
              <div className="section-title" style={{ color: sec.color }}>{sec.l}</div>
              <div className="ml-auto font-mono-data text-xs text-muted2">{sec.list.length}</div>
            </div>
            <table className="dense w-full">
              <thead>
                <tr><th>Name</th><th style={{ width: 80 }}></th></tr>
              </thead>
              <tbody>
                {sec.list.length === 0 ? (
                  <tr><td colSpan={2} className="text-center text-muted2 py-4 text-xs">Koi group nahi</td></tr>
                ) : sec.list.map((g) => (
                  <tr key={g.id} data-testid={`group-row-${g.id}`}>
                    <td className="font-medium">{g.name}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn-ghost p-1.5" onClick={() => { setEditing(g); setForm({ name: g.name, nature: g.nature }); }}>
                          <PencilSimple size={14} />
                        </button>
                        <button className="btn-ghost p-1.5" onClick={() => del(g.id)}>
                          <Trash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setEditing(null)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-heading font-semibold text-lg">{editing.id ? "Edit Group" : "Naya Group"}</div>
              <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="lbl">Group Name *</label>
                <input required autoFocus className="input-dense" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-group-name" />
              </div>
              <div>
                <label className="lbl">Nature</label>
                <select className="input-dense" value={form.nature}
                  onChange={(e) => setForm({ ...form, nature: e.target.value })}>
                  {NATURES.map((n) => <option key={n.v} value={n.v}>{n.l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" data-testid="btn-save-group">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
