import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api, { inr, todayISO, formatApiErrorDetail } from "@/lib/api";
import { Plus, Trash, BookOpenText, X, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { LedgerBalanceHint } from "@/components/LedgerBalanceHint";
import { backdropClose } from "@/lib/backdrop";

const blank = (date = todayISO()) => ({
  date,
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
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blank());
  const [dateFrom, setDateFrom] = useState(todayISO()); // default: aaj ki entries (Rokad jaisa)
  const [dateTo, setDateTo] = useState(todayISO());
  const [accountFilter, setAccountFilter] = useState(""); // only vouchers touching this ledger

  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = search.get("return");
  const closeForm = () => { setOpen(false); setEditId(null); setForm(blank(dateTo)); if (returnTo) navigate(returnTo); };

  // /journal?edit=<id>[&return=...] → open that voucher for editing (from a ledger)
  useEffect(() => {
    const id = search.get("edit");
    if (!id) return;
    api.get(`/journal/${id}`).then((r) => {
      const d = (r.data.date || "").slice(0, 10);
      if (d) { setDateFrom(d); setDateTo(d); }
      startEdit(r.data);
      setSearch((prev) => { const n = new URLSearchParams(prev); n.delete("edit"); return n; }, { replace: true });
    }).catch(() => toast.error("Journal entry nahi mili"));
    // eslint-disable-next-line
  }, [search]);
  const openNew = () => { setEditId(null); setForm(blank(dateTo)); setOpen(true); };
  const monthRange = () => { const d = new Date(); const y = d.getFullYear(), m = d.getMonth();
    const last = new Date(y, m + 1, 0).getDate(); const mm = String(m + 1).padStart(2, "0");
    setDateFrom(`${y}-${mm}-01`); setDateTo(`${y}-${mm}-${String(last).padStart(2, "0")}`); };
  const rangeLabel = !dateFrom && !dateTo ? "Sabhi entries" : dateFrom === dateTo ? `Date ${dateFrom}` : `${dateFrom || "…"} se ${dateTo || "…"} tak`;
  // Live balance per line: (debit - credit) typed now, minus what the original voucher already posts to that ledger
  const lineDelta = (l) => {
    if (!l.account_id) return 0;
    const now = (Number(l.debit) || 0) - (Number(l.credit) || 0);
    const orig = editId ? entries.find((e) => e.id === editId) : null;
    const before = orig ? (orig.lines || []).filter((x) => x.account_id === l.account_id).reduce((t, x) => t + (Number(x.debit) || 0) - (Number(x.credit) || 0), 0) : 0;
    return now - before;
  };

  const startEdit = (j) => {
    setForm({
      date: (j.date || "").slice(0, 10), narration: j.narration || "", ref: j.ref || "", voucher_no: j.voucher_no,
      lines: (j.lines || []).map((l) => ({ account_id: l.account_id, account_name: l.account_name,
        debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "" })),
    });
    setEditId(j.id);
    setOpen(true);
  };

  const load = async () => setEntries((await api.get("/journal", { params: {
    ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}),
    ...(accountFilter ? { account_id: accountFilter } : {}) } })).data);
  useEffect(() => { load(); }, [dateFrom, dateTo, accountFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.all([api.get("/accounts"), api.get("/parties?lite=1")]).then(([a, p]) => {
      setAccounts(a.data); setParties(p.data);
    });
  }, []);

  // accountId -> name map. Treat parties as accounts too.
  const allOptions = useMemo(() => [
    ...accounts.map((a) => ({ id: a.id, name: a.name, group: a.group_name || "" })),
    ...parties.map((p) => ({ id: p.id, name: p.name, group: "Party / " + p.type })),
  ], [accounts, parties]);
  const filterName = accountFilter ? (allOptions.find((o) => o.id === accountFilter)?.name || "") : "";

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
      if (editId) {
        await api.put(`/journal/${editId}`, payload);
        toast.success(`Journal ${form.voucher_no || ""} update ho gaya`);
      } else {
        await api.post("/journal", payload);
        toast.success("Journal saved");
      }
      closeForm(); load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api.delete(`/journal/${id}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      return;
    }
    toast.success("Deleted"); load();
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: openNew, description: "Add new journal" },
    { ctrl: true, key: "s", action: () => open && save(),
      allowInInputs: true, description: "Save journal" },
    open ? { key: "Escape", action: () => closeForm(), allowInInputs: true, description: "Close modal" } : null,
  ], [open, dateTo]);

  return (
    <div className="space-y-5" data-testid="page-journal">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Operations · Journal Entry</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">Journal Voucher</h1>
          <div className="text-muted2 text-sm mt-1">Double-entry: Debit = Credit. Bina cash ke adjustments / transfers.</div>
        </div>
        <div className="flex items-end gap-2">
          <ExportBar filename={`journal-entries_${dateFrom || "all"}_${dateTo || "all"}`} title={`Journal Voucher Register · ${rangeLabel}${filterName ? ` · ${filterName}` : ""}`} sheets={[{
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
          <button className="btn-primary" onClick={openNew} data-testid="btn-new-journal">
            <Plus size={16} weight="bold" /> Nayi Journal <span className="kbd ml-1">D</span>
          </button>
        </div>
      </div>

      <div className="card-flat p-3 flex flex-wrap items-end gap-3 print:hidden" data-testid="journal-filters">
        <div>
          <label className="lbl">From</label>
          <input type="date" className="input-dense" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-date-from" />
        </div>
        <div>
          <label className="lbl">To</label>
          <input type="date" className="input-dense" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-date-to" />
        </div>
        <button className={dateFrom === todayISO() && dateTo === todayISO() ? "btn-primary" : "btn-outline"}
          onClick={() => { setDateFrom(todayISO()); setDateTo(todayISO()); }} title="Aaj ki entries" data-testid="journal-quick-today">Today</button>
        <button className="btn-outline" onClick={monthRange} title="Is mahine ki entries" data-testid="journal-quick-month">Is Mahina</button>
        <button className={!dateFrom && !dateTo ? "btn-primary" : "btn-outline"}
          onClick={() => { setDateFrom(""); setDateTo(""); }} title="Sabhi entries (koi date filter nahi)" data-testid="journal-quick-all">Sab</button>
        <div>
          <label className="lbl">Account / Party</label>
          <select className="input-dense" style={{ minWidth: 220, maxWidth: 320 }} value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)} data-testid="select-journal-account">
            <option value="">— Sabhi accounts —</option>
            {allOptions.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.group})</option>)}
          </select>
        </div>
        {accountFilter && (
          <button className="btn-ghost text-xs" onClick={() => setAccountFilter("")} title="Account filter hatao" data-testid="journal-account-clear">✕ Account</button>
        )}
        <div className="text-xs text-muted2 ml-auto font-mono-data" data-testid="journal-range-label">
          {rangeLabel}{filterName ? ` · ${filterName}` : ""} · {entries.length} voucher
        </div>
      </div>

      <FoxProPrintHeader title="JOURNAL VOUCHER REGISTER"
        subtitle={`${rangeLabel}${filterName ? ` · ${filterName}` : ""} · Total ${entries.length} vouchers`} />

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
              <tr><td colSpan={6} className="py-10 text-center text-muted2" data-testid="journal-empty">
                {rangeLabel}{filterName ? ` · ${filterName}` : ""} me koi journal entry nahi. <button className="underline hover:text-terracotta" onClick={() => { setDateFrom(""); setDateTo(""); }}>Sabhi dikhayein</button>
              </td></tr>
            ) : entries.map((j) => (
              <tr key={j.id} data-testid={`journal-row-${j.id}`}>
                <td className="font-mono-data text-terracotta">{j.voucher_no}</td>
                <td className="font-mono-data">{j.date}</td>
                <td className="cell-grow" title={j.narration || ""}>
                  <div className="truncate">{j.narration || "—"}</div>
                  {j.ref && <div className="text-xs text-muted2 truncate">Ref: {j.ref}</div>}
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
                  <button className="btn-ghost p-1.5" onClick={() => startEdit(j)} title="Edit" data-testid={`journal-edit-${j.id}`}><PencilSimple size={14} /></button>
                  <button className="btn-ghost p-1.5" onClick={() => del(j.id)} title="Delete" data-testid={`journal-del-${j.id}`}><Trash size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-start z-50 p-4 overflow-y-auto"
             {...backdropClose(closeForm)}>
          <div onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-3xl my-6 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BookOpenText size={20} color="#8B2520" weight="bold" />
                <div className="font-heading font-semibold text-lg" data-testid="journal-modal-title">
                  {editId ? `Journal Edit — ${form.voucher_no || ""}` : "Nayi Journal Entry"}
                </div>
              </div>
              <button className="btn-ghost p-1.5" onClick={closeForm}><X size={16} /></button>
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
                        <LedgerBalanceHint ledgerId={l.account_id} delta={lineDelta(l)} compact className="mt-1" testId={`jline-balance-${idx}`} />
                      </td>
                      <td>
                        <input type="number" step="0.01" className="input-dense num" value={l.debit} data-testid={`jline-debit-${idx}`}
                          onChange={(e) => updateLine(idx, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                      </td>
                      <td>
                        <input type="number" step="0.01" className="input-dense num" value={l.credit} data-testid={`jline-credit-${idx}`}
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
              <button className="btn-outline" onClick={closeForm}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={totals.diff !== 0 || totals.d === 0}
                data-enter-submit data-testid="btn-save-journal">
                {editId ? "Update Journal" : "Save Journal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
