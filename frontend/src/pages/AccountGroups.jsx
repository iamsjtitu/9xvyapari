import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Plus, PencilSimple, Trash, X, TreeStructure } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { backdropClose } from "@/lib/backdrop";

const NATURES = [
  { v: "asset", l: "Asset (सम्पत्ति)", color: "#1B5E20" },
  { v: "liability", l: "Liability (देयता)", color: "#8B2520" },
  { v: "income", l: "Income (आय)", color: "#1B5E20" },
  { v: "expense", l: "Expense (व्यय)", color: "#B71C1C" },
];

const EMPTY = { name: "", nature: "asset", fcode: "", lcode: "", ecode: "" };

export default function AccountGroups() {
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    const { data } = await api.get("/account-groups");
    data.sort((a, b) => (a.fcode || 0) - (b.fcode || 0));
    setGroups(data);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name, nature: form.nature,
        fcode: form.fcode ? parseInt(form.fcode) : null,
        lcode: form.lcode ? parseInt(form.lcode) : null,
        ecode: form.ecode ? parseInt(form.ecode) : null,
      };
      if (editing?.id) await api.put(`/account-groups/${editing.id}`, payload);
      else await api.post("/account-groups", payload);
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

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: () => { setEditing({ id: null }); setForm(EMPTY); },
      description: "Add new group" },
    editing ? { key: "Escape", action: () => setEditing(null), allowInInputs: true, description: "Close modal" } : null,
  ], []);

  return (
    <div className="space-y-5" data-testid="page-account-groups">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Setup · Account Group</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">Account Groups</h1>
          <div className="text-muted2 text-sm mt-1">
            FoxPro-style ledger groups. Each group has a numeric code range (FCODE-LCODE).
            Naye account uske group ke range me auto-number paayega.
          </div>
        </div>
        <div className="flex items-end gap-2">
          <ExportBar filename="account-groups" sheets={[{
            name: "Account Groups",
            columns: [
              { key: "fcode", label: "FCODE", width: 8, num: true },
              { key: "lcode", label: "LCODE", width: 8, num: true },
              { key: "name", label: "Group Name", width: 32 },
              { key: "nature", label: "Nature", width: 12 },
              { key: "ecode", label: "ECODE", width: 8, num: true },
            ],
            rows: groups,
          }]} />
          <button className="btn-primary" onClick={() => { setEditing({ id: null }); setForm(EMPTY); }} data-testid="btn-add-group">
            <Plus size={16} weight="bold" /> Naya Group
          </button>
        </div>
      </div>

      <FoxProPrintHeader title="ACCOUNT GROUPS (GROUPTEM)"
        subtitle={`Total ${groups.length} groups`} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {grouped.map((sec) => (
          <div key={sec.v} className="card-flat overflow-hidden">
            <div className="px-4 py-3 border-b border-khaki flex items-center gap-2">
              <TreeStructure size={16} color={sec.color} weight="bold" />
              <div className="section-title" style={{ color: sec.color }}>{sec.l}</div>
              <div className="ml-auto font-mono-data text-xs text-muted2">{sec.list.length}</div>
            </div>
            <table className="dense w-full">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Code Range</th>
                  <th>Name</th>
                  <th style={{ width: 80 }}>Next</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {sec.list.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-muted2 py-4 text-xs">Koi group nahi</td></tr>
                ) : sec.list.map((g) => (
                  <tr key={g.id} data-testid={`group-row-${g.id}`}>
                    <td className="font-mono-data text-xs">{g.fcode}–{g.lcode}</td>
                    <td className="font-medium">{g.name}</td>
                    <td className="font-mono-data text-xs text-muted2">{g.ecode || "—"}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn-ghost p-1.5" data-testid={`btn-edit-group-${g.id}`} onClick={() => { setEditing(g); setForm({
                          name: g.name, nature: g.nature, fcode: g.fcode || "", lcode: g.lcode || "", ecode: g.ecode || "",
                        }); }}>
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
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" {...backdropClose(() => setEditing(null))}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-lg p-5">
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="lbl">FCODE (Start)</label>
                  <input type="number" className="input-dense num" value={form.fcode}
                    onChange={(e) => setForm({ ...form, fcode: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">LCODE (End)</label>
                  <input type="number" className="input-dense num" value={form.lcode}
                    onChange={(e) => setForm({ ...form, lcode: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">ECODE</label>
                  <input type="number" className="input-dense num" value={form.ecode}
                    onChange={(e) => setForm({ ...form, ecode: e.target.value })} />
                </div>
              </div>
              <div className="text-[11px] text-muted2 font-mono-data">
                Code range me jab bhi naya account banega, uska code automatic FCODE se start hoga.
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
