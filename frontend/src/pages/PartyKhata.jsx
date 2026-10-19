import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { Plus, PencilSimple, Trash, X, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTableNav } from "@/hooks/useTableNav";
import { LedgerInUseDialog, inUseInfo } from "@/components/LedgerInUseDialog";
import { backdropClose } from "@/lib/backdrop";

const EMPTY = {
  code: "",
  name: "",
  alt_name: "",
  group_id: "",
  group_name: "",
  type: "both",
  place: "",
  phone: "",
  address: "",
  address2: "",
  gstin: "",
  pan: "",
  cstno: "",
  mpstno: "",
  opening_balance: 0,
  opening_qty: 0,
  rate: 0,
};

export default function PartyKhata() {
  const [parties, setParties] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    const { data } = await api.get("/parties");
    setParties(data);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.get("/account-groups").then((r) => {
      const d = r.data; d.sort((a, b) => (a.fcode || 0) - (b.fcode || 0));
      setGroups(d);
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        opening_balance: parseFloat(form.opening_balance || 0),
        opening_qty: parseFloat(form.opening_qty || 0),
        rate: parseFloat(form.rate || 0),
        code: form.code ? parseInt(form.code) : null,
      };
      if (editing?.id) await api.put(`/parties/${editing.id}`, payload);
      else await api.post("/parties", payload);
      toast.success("Ledger saved");
      setEditing(null); setForm(EMPTY); load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const startNew = async () => {
    setEditing({ id: null });
    setForm(EMPTY);
  };

  const onGroupChange = async (group_id) => {
    const g = groups.find((x) => x.id === group_id);
    setForm((f) => ({ ...f, group_id, group_name: g?.name || "" }));
    if (!group_id || editing?.id) return;
    // fetch next code suggestion
    try {
      const { data } = await api.get(`/account-groups/${group_id}/next-code`);
      if (data.next_code) {
        setForm((f) => ({ ...f, group_id, group_name: g.name, code: String(data.next_code) }));
      }
    } catch {}
  };

  const startEdit = (p) => {
    setEditing(p);
    setForm({
      code: p.code || "",
      name: p.name || "",
      alt_name: p.alt_name || "",
      group_id: p.group_id || "",
      group_name: p.group_name || "",
      type: p.type || "both",
      place: p.place || "",
      phone: p.phone || "",
      address: p.address || "",
      address2: p.address2 || "",
      gstin: p.gstin || "",
      pan: p.pan || "",
      cstno: p.cstno || "",
      mpstno: p.mpstno || "",
      opening_balance: p.opening_balance || 0,
      opening_qty: p.opening_qty || 0,
      rate: p.rate || 0,
    });
  };

  const [inUse, setInUse] = useState(null);
  const del = async (id) => {
    if (!window.confirm("Delete this ledger?")) return;
    try {
      await api.delete(`/parties/${id}`);
      toast.success("Deleted"); load();
    } catch (err) {
      const info = inUseInfo(err);
      if (info) setInUse(info);
      else toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const filtered = parties.filter((p) => {
    const matchQ =
      (p.name || "").toLowerCase().includes(q.toLowerCase()) ||
      String(p.code || "").includes(q) ||
      (p.phone || "").includes(q) ||
      (p.place || "").toLowerCase().includes(q.toLowerCase());
    const matchG = !filterGroup || p.group_id === filterGroup;
    return matchQ && matchG;
  });

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: startNew, description: "Add new ledger" },
    { key: "/", action: () => document.querySelector('[data-testid="input-search-party"]')?.focus(),
      description: "Focus search" },
    editing ? { key: "Escape", action: () => setEditing(null), allowInInputs: true, description: "Close dialog" } : null,
  ], []);

  // Arrow-key table navigation
  const { rowProps } = useTableNav({
    rows: filtered,
    onEdit: (p) => startEdit(p),
    onDelete: (p) => del(p.id),
    enabled: editing === null,
  });

  const totalUdhaar = parties.reduce((s, p) => s + Math.max(0, p.balance || 0), 0);
  const totalOwed = parties.reduce((s, p) => s + Math.max(0, -(p.balance || 0)), 0);

  return (
    <div className="space-y-5" data-testid="page-parties">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Setup · Party Khata / Ledger</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Master Ledger — खाता बही
          </h1>
          <div className="text-muted2 text-sm mt-1">
            Sales Party, Purchase Party, Cold Storage, Cash/Bank — sabhi yahan se manage hote hain.
          </div>
        </div>
        <div className="flex items-end gap-2">
          <ExportBar filename="ledger-master" sheets={[{
            name: "Ledger Master",
            columns: [
              { key: "code", label: "Code", width: 8, num: true },
              { key: "name", label: "Name", width: 32 },
              { key: "group_name", label: "Group", width: 24 },
              { key: "place", label: "Place", width: 16 },
              { key: "phone", label: "Phone", width: 14 },
              { key: "gstin", label: "GSTIN", width: 18 },
              { key: "opening_balance", label: "Opening Bal", width: 14, num: true },
              { key: "balance", label: "Current Bal", width: 14, num: true },
            ],
            rows: filtered,
          }]} />
          <button className="btn-primary" onClick={startNew} data-testid="btn-add-party">
            <Plus size={16} weight="bold" /> Naya Khata
          </button>
        </div>
      </div>

      <FoxProPrintHeader title="MASTER LEDGER / KHATA BAHI"
        subtitle={`Total ${filtered.length} ledgers · ${groups.length} groups`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-flat p-4">
          <div className="section-title">Total Khate</div>
          <div className="font-mono-data text-2xl mt-1">{parties.length}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Udhaar (milne hain)</div>
          <div className="font-mono-data text-2xl mt-1 amount-jama">₹ {inr(totalUdhaar)}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Humein dena hai</div>
          <div className="font-mono-data text-2xl mt-1 amount-kharch">₹ {inr(totalOwed)}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Groups</div>
          <div className="font-mono-data text-2xl mt-1">{groups.length}</div>
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-4 py-3 border-b border-khaki flex flex-wrap items-center gap-3">
          <MagnifyingGlass size={16} color="#595959" />
          <input
            className="flex-1 min-w-[200px] bg-transparent outline-none text-sm"
            placeholder="Search by code, name, phone, place..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="input-search-party"
          />
          <select className="input-dense" style={{ width: 240 }}
            value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
            <option value="">Sabhi groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.fcode}–{g.lcode} · {g.name}</option>
            ))}
          </select>
        </div>

        <table className="dense w-full" data-testid="table-parties">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Code</th>
              <th>Naam</th>
              <th>Group</th>
              <th>Place</th>
              <th>Phone</th>
              <th className="num">Baki</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted2">
                  Koi ledger nahi. <button className="text-terracotta" onClick={startNew}>Add karein</button>
                </td>
              </tr>
            ) : filtered.map((p, idx) => (
              <tr key={p.id} data-testid={`party-row-${p.id}`} {...rowProps(idx)}>
                <td className="font-mono-data text-terracotta">{p.code || "—"}</td>
                <td>
                  <Link to={`/parties/${p.id}`} className="font-medium text-ink hover:text-terracotta">
                    {p.name}
                  </Link>
                  {p.alt_name && <div className="text-xs text-muted2">{p.alt_name}</div>}
                </td>
                <td className="text-xs text-muted2">{p.group_name || "—"}</td>
                <td className="text-xs">{p.place || "—"}</td>
                <td className="font-mono-data text-xs">{p.phone || "—"}</td>
                <td
                  className="num"
                  style={{
                    color: p.balance > 0 ? "#B71C1C" : p.balance < 0 ? "#1B5E20" : "#595959",
                  }}
                >
                  ₹ {inr(Math.abs(p.balance || 0))}
                  <div className="text-[10px] uppercase tracking-wider text-muted2">
                    {p.balance > 0 ? "Udhaar" : p.balance < 0 ? "Hum Owe" : "—"}
                  </div>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn-ghost p-1.5" onClick={() => startEdit(p)} data-testid={`party-edit-${p.id}`}>
                      <PencilSimple size={14} />
                    </button>
                    <button className="btn-ghost p-1.5" onClick={() => del(p.id)} data-testid={`party-del-${p.id}`}>
                      <Trash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <div
          className="fixed inset-0 bg-black/40 grid place-items-start z-50 p-4 overflow-y-auto"
          {...backdropClose(() => setEditing(null))}
          data-testid="modal-party"
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="card-flat w-full max-w-3xl my-6 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-heading font-semibold text-lg">
                {editing.id ? "Edit Khata" : "Naya Khata / Ledger"}
              </div>
              <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <label className="lbl">Group *</label>
                <select required className="input-dense" value={form.group_id}
                  onChange={(e) => onGroupChange(e.target.value)} data-testid="select-party-group">
                  <option value="">— Group chunein —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.fcode}–{g.lcode} · {g.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="lbl">Code</label>
                <input type="number" className="input-dense num" value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  data-testid="input-party-code" />
              </div>
              <div className="md:col-span-5">
                <label className="lbl">Naam *</label>
                <input required autoFocus className="input-dense" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
                  data-testid="input-party-name" />
              </div>
              <div className="md:col-span-2">
                <label className="lbl">Type</label>
                <select className="input-dense" value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div className="md:col-span-5">
                <label className="lbl">Alt Name (GL_NAME1)</label>
                <input className="input-dense" value={form.alt_name}
                  onChange={(e) => setForm({ ...form, alt_name: e.target.value })} />
              </div>
              <div className="md:col-span-3">
                <label className="lbl">Place (GL_PLACE)</label>
                <input className="input-dense" value={form.place}
                  onChange={(e) => setForm({ ...form, place: e.target.value })} />
              </div>
              <div className="md:col-span-4">
                <label className="lbl">Phone</label>
                <input className="input-dense" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>

              <div className="md:col-span-6">
                <label className="lbl">Address 1</label>
                <input className="input-dense" value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="md:col-span-6">
                <label className="lbl">Address 2</label>
                <input className="input-dense" value={form.address2}
                  onChange={(e) => setForm({ ...form, address2: e.target.value })} />
              </div>

              <div className="md:col-span-3">
                <label className="lbl">GSTIN (F_G_L_NO)</label>
                <input className="input-dense" value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
              </div>
              <div className="md:col-span-3">
                <label className="lbl">PAN</label>
                <input className="input-dense" value={form.pan}
                  onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} />
              </div>
              <div className="md:col-span-3">
                <label className="lbl">CST No.</label>
                <input className="input-dense" value={form.cstno}
                  onChange={(e) => setForm({ ...form, cstno: e.target.value })} />
              </div>
              <div className="md:col-span-3">
                <label className="lbl">MP State Tax</label>
                <input className="input-dense" value={form.mpstno}
                  onChange={(e) => setForm({ ...form, mpstno: e.target.value })} />
              </div>

              <div className="md:col-span-4">
                <label className="lbl">Opening Balance (₹)</label>
                <input type="number" step="0.01" className="input-dense num" value={form.opening_balance}
                  onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
                  data-testid="input-opening-balance" />
                <div className="text-[10px] text-muted2 mt-1">+ve = party humein dena hai. −ve = humein party ko dena hai.</div>
              </div>
              <div className="md:col-span-4">
                <label className="lbl">Opening Qty</label>
                <input type="number" step="0.001" className="input-dense num" value={form.opening_qty}
                  onChange={(e) => setForm({ ...form, opening_qty: e.target.value })} />
              </div>
              <div className="md:col-span-4">
                <label className="lbl">Default Rate</label>
                <input type="number" step="0.01" className="input-dense num" value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 border-t border-khaki pt-4">
              <button type="button" className="btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" data-testid="btn-save-party">Save Khata</button>
            </div>
          </form>
        </div>
      )}
      <LedgerInUseDialog info={inUse} onClose={() => setInUse(null)} />
    </div>
  );
}
