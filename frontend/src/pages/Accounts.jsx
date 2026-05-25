import { useEffect, useState } from "react";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { Plus, PencilSimple, Trash, X, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const EMPTY = { name: "", group_id: "", opening_balance: 0, phone: "", address: "", notes: "" };

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    const params = filterGroup ? `?group_id=${filterGroup}` : "";
    setAccounts((await api.get(`/accounts${params}`)).data);
  };
  const loadGroups = async () => setGroups((await api.get("/account-groups")).data);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterGroup]);
  useEffect(() => { loadGroups(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, opening_balance: parseFloat(form.opening_balance || 0) };
      if (editing?.id) await api.put(`/accounts/${editing.id}`, payload);
      else await api.post("/accounts", payload);
      toast.success("Saved");
      setEditing(null); setForm(EMPTY); load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this account?")) return;
    await api.delete(`/accounts/${id}`);
    toast.success("Deleted"); load();
  };

  const filtered = accounts.filter((a) =>
    a.name.toLowerCase().includes(q.toLowerCase()) ||
    (a.group_name || "").toLowerCase().includes(q.toLowerCase())
  );

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: () => { setEditing({ id: null }); setForm(EMPTY); },
      description: "Add new account" },
    { key: "Escape", action: () => setEditing(null), allowInInputs: true,
      description: "Close modal" },
  ], []);

  return (
    <div className="space-y-5" data-testid="page-accounts">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Setup · Create Account</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">Accounts (Khate)</h1>
          <div className="text-muted2 text-sm mt-1">Cash, Bank, Expense, Income, Capital accounts. (Party accounts are in Party Khata.)</div>
        </div>
        <div className="flex items-end gap-2">
          <ExportBar filename="accounts" sheets={[{
            name: "Accounts",
            columns: [
              { key: "code", label: "Code", width: 8, num: true },
              { key: "name", label: "Name", width: 32 },
              { key: "group_name", label: "Group", width: 24 },
              { key: "phone", label: "Phone", width: 14 },
              { key: "opening_balance", label: "Opening", width: 14, num: true },
              { key: "balance", label: "Balance", width: 14, num: true },
            ],
            rows: accounts,
          }]} />
          <button className="btn-primary" onClick={() => { setEditing({ id: null }); setForm(EMPTY); }} data-testid="btn-add-account">
            <Plus size={16} weight="bold" /> Naya Account <span className="kbd ml-1">B</span>
          </button>
        </div>
      </div>

      <FoxProPrintHeader title="ACCOUNTS REGISTER"
        subtitle={`Total ${accounts.length} accounts`} />

      <div className="card-flat overflow-hidden">
        <div className="px-4 py-3 border-b border-khaki flex flex-wrap items-center gap-3">
          <MagnifyingGlass size={16} color="#595959" />
          <input className="flex-1 min-w-[200px] bg-transparent outline-none text-sm"
            placeholder="Search by name or group..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input-dense" style={{ width: 220 }} value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)} data-testid="select-filter-group">
            <option value="">Sabhi groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <table className="dense w-full" data-testid="table-accounts">
          <thead>
            <tr>
              <th>Account Name</th>
              <th>Group</th>
              <th>Phone</th>
              <th className="num">Opening</th>
              <th className="num">Current Balance</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted2 py-10">Koi account nahi.</td></tr>
            ) : filtered.map((a) => (
              <tr key={a.id} data-testid={`account-row-${a.id}`}>
                <td className="font-medium">{a.name}</td>
                <td className="text-muted2">{a.group_name || "—"}</td>
                <td className="font-mono-data text-muted2">{a.phone || "—"}</td>
                <td className="num text-muted2">₹ {inr(a.opening_balance)}</td>
                <td className="num font-medium" style={{ color: a.balance < 0 ? "#B71C1C" : "#1A1A1A" }}>
                  ₹ {inr(a.balance)}
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn-ghost p-1.5" onClick={() => { setEditing(a); setForm({
                      name: a.name, group_id: a.group_id, opening_balance: a.opening_balance,
                      phone: a.phone || "", address: a.address || "", notes: a.notes || "",
                    }); }}>
                      <PencilSimple size={14} />
                    </button>
                    <button className="btn-ghost p-1.5" onClick={() => del(a.id)}>
                      <Trash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setEditing(null)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-heading font-semibold text-lg">{editing.id ? "Edit Account" : "Naya Account"}</div>
              <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="lbl">Account Name *</label>
                <input required autoFocus className="input-dense" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-account-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Under Group *</label>
                  <select required className="input-dense" value={form.group_id}
                    onChange={(e) => setForm({ ...form, group_id: e.target.value })} data-testid="select-account-group">
                    <option value="">— Group chunein —</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Opening Balance</label>
                  <input type="number" step="0.01" className="input-dense num" value={form.opening_balance}
                    onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="lbl">Phone</label>
                <input className="input-dense" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Address</label>
                <input className="input-dense" value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Notes</label>
                <input className="input-dense" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" data-testid="btn-save-account">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
