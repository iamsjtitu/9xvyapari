import { useEffect, useMemo, useState } from "react";
import api, { inr, todayISO, formatApiErrorDetail } from "@/lib/api";
import { Plus, Trash, BookOpenText, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const blank = () => ({
  date: todayISO(),
  narration: "",
  ref: "",
  lines: [
    { account_id: "", account_name: "", debit: "", credit: "" },
    { account_id: "", account_name: "", debit: "", credit: "" },
  ],
});

export default function JournalEntry() {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [parties, setParties] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank());

  const load = async () => setEntries((await api.get("/journal")).data);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    Promise.all([api.get("/accounts"), api.get("/parties")]).then(([a, p]) => {
      setAccounts(a.data); setParties(p.data);
    });
  }, []);

  // accountId -> name map. Treat parties as accounts too.
  const allOptions = useMemo(() => [
    ...accounts.map((a) => ({ id: a.id, name: a.name, group: a.group_name || "" })),
    ...parties.map((p) => ({ id: p.id, name: p.name, group: "Party / " + p.type })),
  ], [accounts, parties]);

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of form.lines) {
      d += parseFloat(l.debit || 0);
      c += parseFloat(l.credit || 0);
    }
    return { d, c, diff: +(d - c).toFixed(2) };
  }, [form.lines]);

  const updateLine = (i, patch) => setForm({
    ...form, lines: form.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l),
  });
  const addLine = () => setForm({
    ...form, lines: [...form.lines, { account_id: "", account_name: "", debit: "", credit: "" }],
  });
  const removeLine = (i) => setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });

  const save = async () => {
    try {
      const lines = form.lines
        .filter((l) => l.account_id && (parseFloat(l.debit || 0) > 0 || parseFloat(l.credit || 0) > 0))
        .map((l) => ({
          account_id: l.account_id, account_name: l.account_name,
          debit: parseFloat(l.debit || 0), credit: parseFloat(l.credit || 0),
        }));
      if (lines.length < 2) return toast.error("Kam se kam 2 lines daalein");
      const payload = { date: form.date, narration: form.narration, ref: form.ref, lines };
      await api.post("/journal", payload);
      toast.success("Journal saved");
      setOpen(false); setForm(blank()); load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await api.delete(`/journal/${id}`);
    toast.success("Deleted"); load();
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: () => { setForm(blank()); setOpen(true); },
      description: "Add new journal" },
    { ctrl: true, key: "s", action: () => open && save(),
      allowInInputs: true, description: "Save journal" },
    { key: "Escape", action: () => setOpen(false), allowInInputs: true,
      description: "Close modal" },
  ], [open]);

  return (
    <div className="space-y-5" data-testid="page-journal">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Operations · Journal Entry</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">Journal Voucher</h1>
          <div className="text-muted2 text-sm mt-1">Double-entry: Debit = Credit. Bina cash ke adjustments / transfers.</div>
        </div>
        <div className="flex items-end gap-2">
          <ExportBar filename="journal-entries" sheets={[{
            name: "Journal Register",
            columns: [
              { key: "voucher_no", label: "V.No.", width: 10 },
              { key: "date", label: "Date", width: 12 },
              { key: "narration", label: "Narration", width: 40 },
              { key: "ref", label: "Ref", width: 16 },
              { value: (j) => (j.lines || []).map((l) => `${l.debit > 0 ? "Dr." : "Cr."} ${l.account_name} ₹${l.debit || l.credit}`).join(" | "), label: "Lines", width: 60 },
              { key: "total", label: "Total", width: 14, num: true },
            ],
            rows: entries,
          }]} />
          <button className="btn-primary" onClick={() => { setForm(blank()); setOpen(true); }} data-testid="btn-new-journal">
            <Plus size={16} weight="bold" /> Nayi Journal <span className="kbd ml-1">D</span>
          </button>
        </div>
      </div>

      <FoxProPrintHeader title="JOURNAL VOUCHER REGISTER"
        subtitle={`Total ${entries.length} vouchers`} />

      <div className="card-flat overflow-hidden">
        <table className="dense w-full" data-testid="table-journal">
          <thead>
            <tr>
              <th>V.No.</th>
              <th>Date</th>
              <th>Narration / Ref</th>
              <th>Accounts</th>
              <th className="num">Amount</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-muted2">Koi journal entry nahi.</td></tr>
            ) : entries.map((j) => (
              <tr key={j.id} data-testid={`journal-row-${j.id}`}>
                <td className="font-mono-data text-terracotta">{j.voucher_no}</td>
                <td className="font-mono-data">{j.date}</td>
                <td>
                  <div>{j.narration || "—"}</div>
                  {j.ref && <div className="text-xs text-muted2">Ref: {j.ref}</div>}
                </td>
                <td className="text-xs">
                  {j.lines.map((l, i) => (
                    <div key={i}>
                      <span className="text-muted2">{l.debit > 0 ? "Dr." : "Cr."}</span>{" "}
                      <span className="font-medium">{l.account_name}</span>{" "}
                      <span className="font-mono-data">₹ {inr(l.debit || l.credit)}</span>
                    </div>
                  ))}
                </td>
                <td className="num font-medium">₹ {inr(j.total)}</td>
                <td>
                  <button className="btn-ghost p-1.5" onClick={() => del(j.id)}><Trash size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-start z-50 p-4 overflow-y-auto"
             onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-3xl my-6 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BookOpenText size={20} color="#8B2520" weight="bold" />
                <div className="font-heading font-semibold text-lg">Nayi Journal Entry</div>
              </div>
              <button className="btn-ghost p-1.5" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="lbl">Date</label>
                <input type="date" className="input-dense" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="lbl">Reference</label>
                <input className="input-dense" value={form.ref}
                  onChange={(e) => setForm({ ...form, ref: e.target.value })}
                  placeholder="eg. Bill adjustment, opening entry" />
              </div>
            </div>

            <div className="border border-khaki rounded-sm overflow-hidden mb-4">
              <table className="dense w-full">
                <thead>
                  <tr>
                    <th>Account (Dr / Cr)</th>
                    <th className="num" style={{ width: 140 }}>Debit</th>
                    <th className="num" style={{ width: 140 }}>Credit</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="input-dense" value={l.account_id}
                          onChange={(e) => {
                            const o = allOptions.find((x) => x.id === e.target.value);
                            updateLine(idx, { account_id: e.target.value, account_name: o?.name || "" });
                          }}
                          data-testid={`jline-account-${idx}`}>
                          <option value="">— Account chunein —</option>
                          {allOptions.map((o) => (
                            <option key={o.id} value={o.id}>{o.name} ({o.group})</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" className="input-dense num" value={l.debit}
                          onChange={(e) => updateLine(idx, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                      </td>
                      <td>
                        <input type="number" step="0.01" className="input-dense num" value={l.credit}
                          onChange={(e) => updateLine(idx, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
                      </td>
                      <td>
                        {form.lines.length > 2 && (
                          <button className="btn-ghost p-1.5" onClick={() => removeLine(idx)}>
                            <Trash size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F4F1EA" }}>
                    <td className="font-heading font-semibold text-sm">Total</td>
                    <td className="num font-mono-data font-medium">₹ {inr(totals.d)}</td>
                    <td className="num font-mono-data font-medium">₹ {inr(totals.c)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <div className="px-3 py-2 border-t border-khaki bg-parchment flex items-center justify-between">
                <button onClick={addLine} className="btn-ghost text-xs"><Plus size={12} /> Line add karein</button>
                <div className={`text-xs font-mono-data ${totals.diff === 0 ? "text-jama" : "text-kharch"}`}>
                  {totals.diff === 0 ? "✓ Balanced" : `Diff: ₹ ${inr(totals.diff)}`}
                </div>
              </div>
            </div>

            <div>
              <label className="lbl">Narration</label>
              <input className="input-dense" value={form.narration}
                onChange={(e) => setForm({ ...form, narration: e.target.value })}
                placeholder="eg. Being commission earned from XYZ" />
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={totals.diff !== 0 || totals.d === 0}
                data-testid="btn-save-journal">
                Save Journal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
