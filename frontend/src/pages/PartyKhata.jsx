import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { Plus, PencilSimple, Trash, X, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";

const EMPTY = { name: "", phone: "", address: "", type: "both", opening_balance: 0 };

export default function PartyKhata() {
  const [parties, setParties] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    const { data } = await api.get("/parties");
    setParties(data);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        opening_balance: parseFloat(form.opening_balance || 0),
      };
      if (editing) await api.put(`/parties/${editing.id}`, payload);
      else await api.post("/parties", payload);
      toast.success("Saved");
      setEditing(null);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const startEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name,
      phone: p.phone || "",
      address: p.address || "",
      type: p.type || "both",
      opening_balance: p.opening_balance || 0,
    });
  };

  const startNew = () => {
    setEditing({ id: null });
    setForm(EMPTY);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this party?")) return;
    await api.delete(`/parties/${id}`);
    toast.success("Party hata di gayi");
    load();
  };

  const filtered = parties.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.phone || "").includes(q)
  );

  const totalUdhaar = parties.reduce((s, p) => s + Math.max(0, p.balance || 0), 0);
  const totalOwed = parties.reduce((s, p) => s + Math.max(0, -(p.balance || 0)), 0);

  return (
    <div className="space-y-5" data-testid="page-parties">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Party Khata · पार्टी खाता</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Customers & Suppliers
          </h1>
        </div>
        <button className="btn-primary" onClick={startNew} data-testid="btn-add-party">
          <Plus size={16} weight="bold" /> Nayi Party
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card-flat p-4">
          <div className="section-title">Kul Parties</div>
          <div className="font-mono-data text-2xl mt-2">{parties.length}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Udhaar (humein milna hai)</div>
          <div className="font-mono-data text-2xl mt-2 amount-jama">₹ {inr(totalUdhaar)}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Humne dena hai</div>
          <div className="font-mono-data text-2xl mt-2 amount-kharch">₹ {inr(totalOwed)}</div>
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-4 py-3 border-b border-khaki flex items-center gap-3">
          <MagnifyingGlass size={16} color="#595959" />
          <input
            className="flex-1 bg-transparent outline-none text-sm"
            placeholder="Search by name or phone..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="input-search-party"
          />
        </div>

        <table className="dense w-full" data-testid="table-parties">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Address</th>
              <th className="num">Baki</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted2">
                  Koi party nahi. <button className="text-terracotta" onClick={startNew}>Add karein</button>
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} data-testid={`party-row-${p.id}`}>
                  <td>
                    <Link to={`/parties/${p.id}`} className="font-medium text-terracotta hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="font-mono-data">{p.phone || "—"}</td>
                  <td className="text-[11px] uppercase tracking-wider text-muted2">{p.type}</td>
                  <td className="text-muted2">{p.address || "—"}</td>
                  <td
                    className="num"
                    style={{
                      color: p.balance > 0 ? "#B71C1C" : p.balance < 0 ? "#1B5E20" : "#595959",
                    }}
                  >
                    ₹ {inr(Math.abs(p.balance || 0))}
                    <div className="text-[10px] uppercase tracking-wider text-muted2">
                      {p.balance > 0 ? "Udhaar" : p.balance < 0 ? "Hum Owe" : "Settled"}
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <div
          className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4"
          onClick={() => setEditing(null)}
          data-testid="modal-party"
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="card-flat w-full max-w-lg p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-heading font-semibold text-lg">
                {editing.id ? "Edit Party" : "Nayi Party"}
              </div>
              <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="lbl">Naam *</label>
                <input
                  required autoFocus
                  className="input-dense"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="input-party-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Phone</label>
                  <input
                    className="input-dense"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    data-testid="input-party-phone"
                  />
                </div>
                <div>
                  <label className="lbl">Type</label>
                  <select
                    className="input-dense"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  >
                    <option value="customer">Customer (Grahak)</option>
                    <option value="supplier">Supplier (Kisan)</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="lbl">Address</label>
                <input
                  className="input-dense"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div>
                <label className="lbl">Opening Balance (₹)</label>
                <input
                  type="number" step="0.01"
                  className="input-dense num"
                  value={form.opening_balance}
                  onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
                  data-testid="input-opening-balance"
                />
                <div className="text-[11px] text-muted2 mt-1">
                  Positive = party humein dena hai (udhaar). Negative = humein party ko dena hai.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" data-testid="btn-save-party">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
