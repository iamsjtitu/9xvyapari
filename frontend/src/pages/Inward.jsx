import { useEffect, useMemo, useState } from "react";
import api, { inr, todayISO, formatApiErrorDetail } from "@/lib/api";
import { Plus, Trash, X, Truck } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTableNav } from "@/hooks/useTableNav";

const EMPTY = {
  date: todayISO(),
  ref_no: "",
  lot_no: "",
  cold_storage_id: "",
  cold_storage_name: "",
  bags: "",
  weight: "",
  item_id: "",
  item_name: "",
  notes: "",
};

export default function Inward() {
  const [rows, setRows] = useState([]);
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
  const [date, setDate] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    const params = date ? `?date_from=${date}&date_to=${date}` : "";
    setRows((await api.get(`/inward${params}`)).data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  useEffect(() => {
    Promise.all([api.get("/parties"), api.get("/items")]).then(([p, i]) => {
      setParties(p.data);
      setItems(i.data);
    });
  }, []);

  // Cold storage parties = group name "COLD STORAGE"
  const coldStorages = useMemo(
    () => parties.filter((p) => /cold storage/i.test(p.group_name || "")),
    [parties]
  );

  const totals = useMemo(() => {
    let bags = 0, wgt = 0;
    for (const r of rows) {
      bags += r.bags || 0;
      wgt += r.weight || 0;
    }
    return { bags, wgt };
  }, [rows]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        bags: parseInt(form.bags || 0),
        weight: parseFloat(form.weight || 0),
      };
      if (!payload.cold_storage_id) return toast.error("Cold storage party chunein");
      if (!payload.lot_no) return toast.error("Lot number daalein");

      if (editingId) await api.put(`/inward/${editingId}`, payload);
      else await api.post("/inward", payload);
      toast.success("Saved");
      setOpen(false); setForm(EMPTY); setEditingId(null); load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setForm({
      date: r.date, ref_no: r.ref_no || "", lot_no: r.lot_no,
      cold_storage_id: r.cold_storage_id, cold_storage_name: r.cold_storage_name,
      bags: r.bags, weight: r.weight,
      item_id: r.item_id || "", item_name: r.item_name || "",
      notes: r.notes || "",
    });
    setOpen(true);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await api.delete(`/inward/${id}`);
    toast.success("Deleted"); load();
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: () => { setForm({ ...EMPTY, date: date || todayISO() }); setEditingId(null); setOpen(true); },
      description: "Add new inward" },
    { ctrl: true, key: "s", action: (e) => open && save(e),
      allowInInputs: true, description: "Save inward" },
    open ? { key: "Escape", action: () => setOpen(false), allowInInputs: true, description: "Close modal" } : null,
  ], [open, date]);

  // Arrow-key table navigation
  const { rowProps } = useTableNav({
    rows: rows,
    onEdit: (r) => startEdit(r),
    onDelete: (r) => del(r.id),
    enabled: !open,
  });

  return (
    <div className="space-y-5" data-testid="page-inward">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Operations · Inward Register</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Inward — Cold Storage Stock
          </h1>
          <div className="text-muted2 text-sm mt-1">
            Cold storage me bheja gaya stock (lot, bags, weight) track karein.
          </div>
        </div>
        <div className="flex items-end gap-3">
          <ExportBar filename="inward-register" sheets={[{
            name: "Inward Register",
            columns: [
              { key: "date", label: "Date", width: 12 },
              { key: "ref_no", label: "Ref", width: 10 },
              { key: "lot_no", label: "Lot No", width: 12 },
              { key: "cold_storage_name", label: "Cold Storage", width: 30 },
              { key: "item_name", label: "Item", width: 18 },
              { key: "bags", label: "Bags", width: 8, num: true },
              { key: "weight", label: "Weight (Qtl)", width: 14, num: true },
            ],
            rows: rows,
          }]} />
          <div>
            <label className="lbl">Date (filter)</label>
            <input type="date" className="input-dense" value={date}
              onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => {
            setForm({ ...EMPTY, date: date || todayISO() }); setEditingId(null); setOpen(true);
          }} data-testid="btn-add-inward">
            <Plus size={16} weight="bold" /> Nayi Inward
          </button>
        </div>
      </div>

      <FoxProPrintHeader title="INWARD REGISTER (COLD STORAGE)"
        subtitle={`Total ${rows.length} entries · ${totals.bags} bags · ${inr(totals.wgt)} Qtl`} />

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card-flat p-4">
          <div className="section-title">Total Entries</div>
          <div className="font-mono-data text-2xl mt-1">{rows.length}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Total Bags</div>
          <div className="font-mono-data text-2xl mt-1">{inr(totals.bags)}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Total Weight (Qtl)</div>
          <div className="font-mono-data text-2xl mt-1">{inr(totals.wgt)}</div>
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <table className="dense w-full" data-testid="table-inward">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref</th>
              <th>Lot No</th>
              <th>Cold Storage</th>
              <th>Item</th>
              <th className="num">Bags</th>
              <th className="num">Weight</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-muted2">Koi entry nahi.</td></tr>
            ) : rows.map((r, idx) => (
              <tr key={r.id} data-testid={`inward-row-${r.id}`} {...rowProps(idx)}>
                <td className="font-mono-data">{r.date}</td>
                <td className="font-mono-data">{r.ref_no || "—"}</td>
                <td className="font-mono-data text-terracotta">{r.lot_no}</td>
                <td className="font-medium">{r.cold_storage_name}</td>
                <td className="text-xs">{r.item_name || "—"}</td>
                <td className="num">{r.bags}</td>
                <td className="num">{inr(r.weight)}</td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn-ghost p-1.5" onClick={() => startEdit(r)}>
                      <Plus size={14} className="rotate-45" />
                    </button>
                    <button className="btn-ghost p-1.5" onClick={() => del(r.id)}>
                      <Trash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Truck size={20} color="#8B2520" weight="bold" />
                <div className="font-heading font-semibold text-lg">
                  {editingId ? "Edit Inward" : "Nayi Inward Entry"}
                </div>
              </div>
              <button type="button" className="btn-ghost p-1.5" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="lbl">Date *</label>
                <input type="date" required className="input-dense" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Reference No.</label>
                <input className="input-dense" value={form.ref_no}
                  onChange={(e) => setForm({ ...form, ref_no: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Lot No *</label>
                <input required className="input-dense" value={form.lot_no}
                  onChange={(e) => setForm({ ...form, lot_no: e.target.value })}
                  data-testid="input-lot-no" />
              </div>
              <div className="md:col-span-2">
                <label className="lbl">Cold Storage Party *</label>
                <select required className="input-dense" value={form.cold_storage_id}
                  onChange={(e) => {
                    const p = parties.find((x) => x.id === e.target.value);
                    setForm({ ...form, cold_storage_id: e.target.value, cold_storage_name: p?.name || "" });
                  }} data-testid="select-cold-storage">
                  <option value="">— Cold storage chunein —</option>
                  {coldStorages.length === 0 && (
                    <option disabled>(COLD STORAGE group me koi ledger nahi. Pehle add karein.)</option>
                  )}
                  {coldStorages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.code} · ` : ""}{p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl">Item (Galla)</label>
                <select className="input-dense" value={form.item_id}
                  onChange={(e) => {
                    const it = items.find((x) => x.id === e.target.value);
                    setForm({ ...form, item_id: e.target.value, item_name: it?.name || "" });
                  }}>
                  <option value="">— Koi nahi —</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>

              <div>
                <label className="lbl">Bags (SBAG)</label>
                <input type="number" className="input-dense num" value={form.bags}
                  onChange={(e) => setForm({ ...form, bags: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Weight (Quintal)</label>
                <input type="number" step="0.01" className="input-dense num" value={form.weight}
                  onChange={(e) => setForm({ ...form, weight: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Notes</label>
                <input className="input-dense" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 border-t border-khaki pt-4">
              <button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary" data-testid="btn-save-inward">Save Inward</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
