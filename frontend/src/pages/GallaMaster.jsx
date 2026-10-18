import { useEffect, useState } from "react";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { Plus, PencilSimple, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTableNav } from "@/hooks/useTableNav";

const EMPTY = { name: "", unit: "Quintal", rate: 0, hsn: "" };

export default function GallaMaster() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => setItems((await api.get("/items")).data);
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, rate: parseFloat(form.rate || 0) };
      if (editing.id) await api.put(`/items/${editing.id}`, payload);
      else await api.post("/items", payload);
      toast.success("Saved");
      setEditing(null);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    await api.delete(`/items/${id}`);
    toast.success("Item delete kiya gaya");
    load();
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: () => { setEditing({ id: null }); setForm(EMPTY); },
      description: "Add new galla item" },
    editing ? { key: "Escape", action: () => setEditing(null), allowInInputs: true, description: "Close modal" } : null,
  ], []);

  // Arrow-key table navigation
  const { rowProps } = useTableNav({
    rows: items,
    onEdit: (it) => { setEditing(it); setForm(it); },
    onDelete: (it) => del(it.id),
    enabled: editing === null,
  });

  return (
    <div className="space-y-5" data-testid="page-items">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Galla Master · गल्ला सूची</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">Items & Rates</h1>
        </div>
        <div className="flex items-end gap-2">
          <ExportBar filename="galla-items" sheets={[{
            name: "Galla Items",
            columns: [
              { key: "name", label: "Name", width: 28 },
              { key: "unit", label: "Unit", width: 10 },
              { key: "hsn", label: "HSN", width: 10 },
              { key: "rate", label: "Rate", width: 14, num: true },
              { key: "purchase_acc_code", label: "Pur A/C", width: 10, num: true },
              { key: "sale_acc_code", label: "Sale A/C", width: 10, num: true },
              { key: "opening_qty", label: "Opening Qty", width: 14, num: true },
            ],
            rows: items,
          }]} />
          <button
            className="btn-primary"
            onClick={() => { setEditing({ id: null }); setForm(EMPTY); }}
            data-testid="btn-add-item"
          >
            <Plus size={16} weight="bold" /> Naya Galla
          </button>
        </div>
      </div>

      <FoxProPrintHeader title="GALLA MASTER (STOCK ITEMS)"
        subtitle={`Total ${items.length} items`} />

      <div className="card-flat overflow-hidden">
        <table className="dense w-full" data-testid="table-items">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Unit</th>
              <th>HSN</th>
              <th className="num">Rate (₹ / Unit)</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted2">Koi item nahi.</td></tr>
            ) : (
              items.map((it, idx) => (
                <tr key={it.id} data-testid={`item-row-${it.id}`} {...rowProps(idx)}>
                  <td className="font-medium">{it.name}</td>
                  <td className="text-[11px] uppercase tracking-wider text-muted2">{it.unit}</td>
                  <td className="font-mono-data text-muted2">{it.hsn || "—"}</td>
                  <td className="num">₹ {inr(it.rate)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn-ghost p-1.5" onClick={() => { setEditing(it); setForm(it); }} data-testid={`item-edit-${it.id}`}>
                        <PencilSimple size={14} />
                      </button>
                      <button className="btn-ghost p-1.5" onClick={() => del(it.id)} data-testid={`item-del-${it.id}`}>
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

      {editing && (
        <div
          className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4"
          onClick={() => setEditing(null)}
          data-testid="modal-item"
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="card-flat w-full max-w-lg p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-heading font-semibold text-lg">
                {editing.id ? "Edit Galla" : "Naya Galla"}
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
                  placeholder="Eg: Gehu (Wheat)"
                  data-testid="input-item-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Unit</label>
                  <select
                    className="input-dense"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    data-testid="select-item-unit"
                  >
                    <option>Quintal</option>
                    <option>Kg</option>
                    <option>Bag</option>
                    <option>Bori</option>
                    <option>Tonne</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">HSN Code</label>
                  <input
                    className="input-dense"
                    value={form.hsn}
                    onChange={(e) => setForm({ ...form, hsn: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="lbl">Default Rate (₹ / Unit)</label>
                <input
                  type="number" step="0.01"
                  className="input-dense num"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  data-testid="input-item-rate"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" data-testid="btn-save-item">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
