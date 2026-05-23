import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { inr, todayISO, formatApiErrorDetail } from "@/lib/api";
import { Plus, Trash, Receipt, X, MagnifyingGlass, Truck } from "@phosphor-icons/react";
import { toast } from "sonner";

const blankLine = () => ({
  item_id: "", item_name: "",
  bag_pack: "50 Kg", qty: "", weight: "", wb: "",
  unit: "Quintal", rate: "", amount: 0,
});

export default function NayaBill() {
  const [search] = useSearchParams();
  const initialType = search.get("type") === "purchase" ? "purchase" : "sale";

  const [bills, setBills] = useState([]);
  const [filter, setFilter] = useState(search.get("type") || "all");
  const [q, setQ] = useState("");
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const blank = (type = initialType) => ({
    bill_type: type,
    party_id: "", party_name: "",
    date: todayISO(),
    s_date: todayISO(),
    gp_no: "",
    truck_no: "",
    payment_cond: "Cash",
    lines: [blankLine()],
    commission_pct: 2,
    other_charges: 0,
    payment_received: 0,
    notes: "",
  });
  const [form, setForm] = useState(blank());

  const load = async () => {
    const params = filter === "all" ? "" : `?bill_type=${filter}`;
    setBills((await api.get(`/bills${params}`)).data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  useEffect(() => {
    Promise.all([api.get("/parties"), api.get("/items")]).then(([p, i]) => {
      setParties(p.data); setItems(i.data);
    });
  }, []);
  // honor ?type query param changing
  useEffect(() => {
    const t = search.get("type");
    if (t === "sale" || t === "purchase") setFilter(t);
  }, [search]);

  const updateLine = (idx, patch) => {
    const lines = form.lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      // Compute amount: if wb has value, prefer wb (actual weight) else weight
      const w = parseFloat(next.wb || 0) || parseFloat(next.weight || 0);
      const rate = parseFloat(next.rate || 0);
      next.amount = +(w * rate).toFixed(2);
      return next;
    });
    setForm({ ...form, lines });
  };
  const addLine = () => setForm({ ...form, lines: [...form.lines, blankLine()] });
  const removeLine = (idx) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });

  const subtotal = useMemo(
    () => form.lines.reduce((s, l) => s + Number(l.amount || 0), 0), [form.lines]);
  const commission_amt = useMemo(
    () => +(subtotal * Number(form.commission_pct || 0) / 100).toFixed(2),
    [subtotal, form.commission_pct]);
  const total = useMemo(
    () => +(subtotal + commission_amt + Number(form.other_charges || 0)).toFixed(2),
    [subtotal, commission_amt, form.other_charges]);
  const balance = +(total - Number(form.payment_received || 0)).toFixed(2);
  const totalWeight = useMemo(
    () => form.lines.reduce((s, l) => s + (parseFloat(l.wb || 0) || parseFloat(l.weight || 0)), 0),
    [form.lines]);
  const totalBags = useMemo(
    () => form.lines.reduce((s, l) => s + parseFloat(l.qty || 0), 0), [form.lines]);

  const save = async () => {
    try {
      if (!form.party_id) return toast.error("Party select karein");
      const validLines = form.lines.filter((l) => l.item_id && (Number(l.weight) > 0 || Number(l.wb) > 0));
      if (validLines.length === 0) return toast.error("Kam se kam ek item with weight add karein");

      const payload = {
        bill_type: form.bill_type,
        party_id: form.party_id, party_name: form.party_name,
        date: form.date, s_date: form.s_date,
        gp_no: form.gp_no, truck_no: form.truck_no, payment_cond: form.payment_cond,
        items: validLines.map((l) => ({
          item_id: l.item_id, item_name: l.item_name,
          qty: Number(l.qty || 0), bag_pack: l.bag_pack || "",
          weight: Number(l.weight || 0), wb: Number(l.wb || 0),
          unit: l.unit, rate: Number(l.rate), amount: Number(l.amount),
        })),
        subtotal, commission_pct: Number(form.commission_pct || 0),
        commission_amt, other_charges: Number(form.other_charges || 0),
        total, payment_received: Number(form.payment_received || 0),
        notes: form.notes,
      };
      const { data } = await api.post("/bills", payload);
      toast.success(`Bill ${data.bill_no} ban gaya`);
      setOpen(false); setForm(blank()); load();
      navigate(`/bills/${data.id}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this bill?")) return;
    await api.delete(`/bills/${id}`);
    toast.success("Bill delete kiya gaya"); load();
  };

  const filtered = bills.filter((b) =>
    b.bill_no.toLowerCase().includes(q.toLowerCase()) ||
    b.party_name.toLowerCase().includes(q.toLowerCase()) ||
    (b.truck_no || "").toLowerCase().includes(q.toLowerCase()) ||
    (b.gp_no || "").toLowerCase().includes(q.toLowerCase())
  );

  const isPurchase = form.bill_type === "purchase";

  return (
    <div className="space-y-5" data-testid="page-bills">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">
            Operations · {filter === "purchase" ? "Purchase Entry" : filter === "sale" ? "Bill Entry" : "Sale & Purchase"}
          </div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            {filter === "purchase" ? "Purchase Entry" : filter === "sale" ? "Sale / Bill Entry" : "Bills"}
          </h1>
        </div>
        <button className="btn-primary" onClick={() => { setForm(blank(filter === "purchase" ? "purchase" : "sale")); setOpen(true); }} data-testid="btn-new-bill">
          <Plus size={16} weight="bold" /> Naya {filter === "purchase" ? "Purchase" : "Bill"} <span className="kbd ml-1">A</span>
        </button>
      </div>

      <div className="card-flat px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-parchment p-1 rounded-sm">
          {["all", "sale", "purchase"].map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-sm text-xs font-heading font-medium uppercase tracking-wider ${
                filter === t ? "bg-white text-ink border border-khaki" : "text-muted2 hover:text-ink"
              }`} data-testid={`filter-${t}`}>
              {t === "all" ? "Sabhi" : t === "sale" ? "Sale" : "Purchase"}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2 min-w-[200px]">
          <MagnifyingGlass size={16} color="#595959" />
          <input className="flex-1 bg-transparent outline-none text-sm"
            placeholder="Bill no, party, truck no, GP no..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <table className="dense w-full" data-testid="table-bills">
          <thead>
            <tr>
              <th>Bill No.</th>
              <th>Date</th>
              <th>Type</th>
              <th>Party</th>
              <th>GP / Truck</th>
              <th className="num">Total Wt.</th>
              <th className="num">Total ₹</th>
              <th className="num">Baki</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="py-10 text-center text-muted2">Koi bill nahi mila.</td></tr>
            ) : filtered.map((b) => {
              const tw = (b.items || []).reduce((s, it) => s + (it.wb || it.weight || 0), 0);
              return (
                <tr key={b.id} data-testid={`bill-row-${b.id}`}>
                  <td><Link to={`/bills/${b.id}`} className="font-mono-data text-terracotta hover:underline">{b.bill_no}</Link></td>
                  <td className="font-mono-data">{b.date}</td>
                  <td>
                    <span className="text-[11px] uppercase tracking-wider font-heading font-medium"
                      style={{ color: b.bill_type === "sale" ? "#1B5E20" : "#8B2520" }}>
                      {b.bill_type}
                    </span>
                  </td>
                  <td className="font-medium">{b.party_name}</td>
                  <td className="text-xs">
                    {b.gp_no && <div className="font-mono-data">GP: {b.gp_no}</div>}
                    {b.truck_no && <div className="font-mono-data text-muted2">🚚 {b.truck_no}</div>}
                    {!b.gp_no && !b.truck_no && <span className="text-muted2">—</span>}
                  </td>
                  <td className="num">{inr(tw)}</td>
                  <td className="num">₹ {inr(b.total)}</td>
                  <td className="num" style={{ color: b.balance > 0 ? "#B71C1C" : "#1B5E20" }}>₹ {inr(b.balance)}</td>
                  <td><button className="btn-ghost p-1.5" onClick={() => del(b.id)}><Trash size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-start z-50 p-4 overflow-y-auto"
             onClick={() => setOpen(false)} data-testid="modal-bill">
          <div onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-5xl my-6 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Receipt size={20} color="#8B2520" weight="bold" />
                <div className="font-heading font-semibold text-lg">
                  {isPurchase ? "Purchase Entry" : "Sale / Bill Entry"}
                </div>
              </div>
              <button className="btn-ghost p-1.5" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>

            {/* Type toggle */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {["sale", "purchase"].map((t) => (
                <button key={t} onClick={() => setForm({ ...form, bill_type: t })}
                  className={`py-3 rounded-sm border font-heading font-medium text-sm uppercase tracking-wider ${
                    form.bill_type === t
                      ? t === "sale" ? "bg-jama-bg border-jama text-jama" : "bg-kharch-bg border-terracotta text-terracotta"
                      : "bg-white border-khaki text-muted2"
                  }`} data-testid={`bill-type-${t}`}>
                  {t === "sale" ? "Sale (Bechna)" : "Purchase (Kharidna)"}
                </button>
              ))}
            </div>

            {/* Header info - DOS-style layout */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 p-3 border border-khaki rounded-sm bg-parchment/40">
              <div>
                <label className="lbl">E.Date (Entry)</label>
                <input type="date" className="input-dense" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="lbl">S.Date (Bill)</label>
                <input type="date" className="input-dense" value={form.s_date}
                  onChange={(e) => setForm({ ...form, s_date: e.target.value })}
                  data-testid="input-s-date" />
              </div>
              <div>
                <label className="lbl">GP No.</label>
                <input className="input-dense" value={form.gp_no}
                  onChange={(e) => setForm({ ...form, gp_no: e.target.value })}
                  placeholder="Gate pass no." data-testid="input-gp-no" />
              </div>
              <div>
                <label className="lbl"><Truck size={11} className="inline mr-1" /> Truck No.</label>
                <input className="input-dense" value={form.truck_no}
                  onChange={(e) => setForm({ ...form, truck_no: e.target.value })}
                  placeholder="HR-26-AB-1234" data-testid="input-truck-no" />
              </div>
              <div className="md:col-span-2">
                <label className="lbl">{isPurchase ? "Seller Party" : "Grahak / Party"} *</label>
                <select className="input-dense" value={form.party_id}
                  onChange={(e) => {
                    const p = parties.find((x) => x.id === e.target.value);
                    setForm({ ...form, party_id: e.target.value, party_name: p?.name || "" });
                  }} data-testid="select-bill-party">
                  <option value="">— Party chunein —</option>
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.name} {p.phone ? `· ${p.phone}` : ""}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="lbl">Payment Condition</label>
                <select className="input-dense" value={form.payment_cond}
                  onChange={(e) => setForm({ ...form, payment_cond: e.target.value })}>
                  <option>Cash</option>
                  <option>7 Days Credit</option>
                  <option>15 Days Credit</option>
                  <option>30 Days Credit</option>
                  <option>On Delivery</option>
                  <option>Advance</option>
                </select>
              </div>
            </div>

            {/* Items table - DOS-style detailed columns */}
            <div className="border border-khaki rounded-sm overflow-hidden mb-4">
              <table className="dense w-full text-xs">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th style={{ width: 90 }}>Bag/Tin Pack</th>
                    <th className="num" style={{ width: 70 }}>Qty (Bags)</th>
                    <th className="num" style={{ width: 90 }}>Weight</th>
                    <th className="num" style={{ width: 90 }}>W.B.</th>
                    <th style={{ width: 70 }}>Unit</th>
                    <th className="num" style={{ width: 90 }}>Rate</th>
                    <th className="num" style={{ width: 110 }}>Amount</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="input-dense" value={l.item_id}
                          onChange={(e) => {
                            const it = items.find((x) => x.id === e.target.value);
                            updateLine(idx, {
                              item_id: e.target.value, item_name: it?.name || "",
                              unit: it?.unit || l.unit, rate: it?.rate || l.rate,
                            });
                          }} data-testid={`line-item-${idx}`}>
                          <option value="">— Item —</option>
                          {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="input-dense" value={l.bag_pack}
                          onChange={(e) => updateLine(idx, { bag_pack: e.target.value })}
                          placeholder="50 Kg" />
                      </td>
                      <td>
                        <input type="number" step="0.01" className="input-dense num" value={l.qty}
                          onChange={(e) => updateLine(idx, { qty: e.target.value })}
                          data-testid={`line-qty-${idx}`} />
                      </td>
                      <td>
                        <input type="number" step="0.01" className="input-dense num" value={l.weight}
                          onChange={(e) => updateLine(idx, { weight: e.target.value })}
                          placeholder="Quintal" data-testid={`line-weight-${idx}`} />
                      </td>
                      <td>
                        <input type="number" step="0.01" className="input-dense num" value={l.wb}
                          onChange={(e) => updateLine(idx, { wb: e.target.value })}
                          placeholder="Kanta" data-testid={`line-wb-${idx}`} />
                      </td>
                      <td>
                        <input className="input-dense" value={l.unit}
                          onChange={(e) => updateLine(idx, { unit: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" step="0.01" className="input-dense num" value={l.rate}
                          onChange={(e) => updateLine(idx, { rate: e.target.value })}
                          data-testid={`line-rate-${idx}`} />
                      </td>
                      <td className="num font-mono-data font-medium">₹ {inr(l.amount)}</td>
                      <td>
                        {form.lines.length > 1 && (
                          <button className="btn-ghost p-1.5" onClick={() => removeLine(idx)}>
                            <Trash size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F4F1EA" }}>
                    <td className="font-heading font-semibold text-xs">Total</td>
                    <td></td>
                    <td className="num font-mono-data">{inr(totalBags)} bags</td>
                    <td className="num font-mono-data" colSpan={2}>{inr(totalWeight)} Qtl</td>
                    <td colSpan={2}></td>
                    <td className="num font-mono-data font-medium">₹ {inr(subtotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <div className="px-3 py-2 border-t border-khaki bg-parchment flex items-center justify-between">
                <button onClick={addLine} className="btn-ghost text-xs" data-testid="btn-add-line">
                  <Plus size={12} /> Item line add karein <span className="kbd ml-1">+</span>
                </button>
                <div className="text-[10px] text-muted2 font-mono-data">
                  Amount = (W.B. ya Weight) × Rate
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="lbl">Commission (Arhat) %</label>
                    <input type="number" step="0.01" className="input-dense num"
                      value={form.commission_pct}
                      onChange={(e) => setForm({ ...form, commission_pct: e.target.value })} />
                  </div>
                  <div>
                    <label className="lbl">Other Charges</label>
                    <input type="number" step="0.01" className="input-dense num"
                      value={form.other_charges}
                      onChange={(e) => setForm({ ...form, other_charges: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="lbl">Payment Received (Abhi)</label>
                  <input type="number" step="0.01" className="input-dense num"
                    value={form.payment_received}
                    onChange={(e) => setForm({ ...form, payment_received: e.target.value })}
                    data-testid="input-payment" />
                </div>
                <div>
                  <label className="lbl">Notes</label>
                  <input className="input-dense" value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              <div className="card-flat p-4 bg-parchment">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted2">Subtotal</span>
                    <span className="font-mono-data">₹ {inr(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted2">Arhat ({form.commission_pct}%)</span>
                    <span className="font-mono-data">₹ {inr(commission_amt)}</span></div>
                  <div className="flex justify-between"><span className="text-muted2">Other</span>
                    <span className="font-mono-data">₹ {inr(form.other_charges || 0)}</span></div>
                  <div className="border-t border-khaki my-2"></div>
                  <div className="flex justify-between text-base font-heading font-semibold">
                    <span>Total Amount</span>
                    <span className="font-mono-data" data-testid="bill-total">₹ {inr(total)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted2">Received</span>
                    <span className="amount-jama">₹ {inr(form.payment_received || 0)}</span>
                  </div>
                  <div className="flex justify-between font-heading font-semibold">
                    <span>Baki</span>
                    <span className="font-mono-data" style={{ color: balance > 0 ? "#B71C1C" : "#1B5E20" }}>
                      ₹ {inr(balance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* DOS-style action bar */}
            <div className="flex justify-between items-center mt-5 pt-4 border-t border-khaki">
              <div className="flex gap-1 text-[11px] text-muted2 font-mono-data">
                <span className="kbd">A</span>dd · <span className="kbd">S</span>earch · <span className="kbd">E</span>xit
              </div>
              <div className="flex gap-2">
                <button className="btn-outline" onClick={() => setOpen(false)}>Cancel (Esc)</button>
                <button className="btn-primary" onClick={save} data-testid="btn-save-bill">
                  Save Bill (Ctrl+S)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
