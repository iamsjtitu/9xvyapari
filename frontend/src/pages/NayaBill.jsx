import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { inr, todayISO, formatApiErrorDetail } from "@/lib/api";
import { Plus, Trash, Receipt, X, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTableNav } from "@/hooks/useTableNav";

const blankLine = () => ({
  item_id: "", item_name: "",
  bag_pack: "50 Kg",
  bag: "", pack: "", weight: "", wb: "", ghat: "", nwt: "",
  unit: "Quintal", rate: "", amount: 0,
});

const blank = (type = "sale") => ({
  bill_type: type,
  party_id: "", party_name: "",
  buyer_id: "", buyer_name: "",
  agent_id: "", agent_name: "",
  date: todayISO(),
  s_date: todayISO(),
  due_date: "",
  lot_no: "",
  gp_no: "",
  truck_no: "",
  driver_name: "",
  bilty_no: "",
  garage: "",
  no_of_bag: "",
  bag_pack_q: "",
  payment_cond: "Cash",
  lines: [blankLine()],
  // charges
  hamali_rt: 0, hamali_amt: 0,
  cartage_rt: 0, cartage_amt: 0,
  bhada_rt: 0, bhada_amt: 0,
  mandirt: 0, mandiamt: 0,
  discount_rt: 0, discount_amt: 0,
  rebate_rt: 0, rebate_amt: 0,
  dalali_rt: 2, dalali_amt: 0,
  garrt: 0, garamt: 0,
  loading: 0, bdalali: 0,
  less: 0, advance: 0,
  // legacy commission
  commission_pct: 0, commission_amt: 0,
  other_charges: 0,
  payment_received: 0,
  remark1: "", remark2: "", notes: "",
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
  const [form, setForm] = useState(blank(initialType));

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
  useEffect(() => {
    const t = search.get("type");
    if (t === "sale" || t === "purchase") setFilter(t);
  }, [search]);

  // ---- Line calculations ----
  const updateLine = (idx, patch) => {
    const lines = form.lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      const w = parseFloat(next.wb || 0) || parseFloat(next.weight || 0);
      const ghat = parseFloat(next.ghat || 0);
      const nwt = +(w - ghat).toFixed(3);
      const rate = parseFloat(next.rate || 0);
      next.nwt = nwt;
      next.amount = +(nwt * rate).toFixed(2);
      return next;
    });
    setForm({ ...form, lines });
  };

  // Auto-calc Due Date based on Payment Condition
  const onPaymentCondChange = (cond) => {
    const baseDate = form.date || form.s_date || todayISO();
    const daysMatch = String(cond).match(/(\d+)\s*Day/i);
    let newDue = form.due_date;
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      const d = new Date(baseDate);
      d.setDate(d.getDate() + days);
      newDue = d.toISOString().slice(0, 10);
    } else if (/Cash|On Delivery/i.test(cond)) {
      newDue = baseDate;
    } else if (/Advance/i.test(cond)) {
      newDue = baseDate;
    }
    setForm({ ...form, payment_cond: cond, due_date: newDue });
  };

  // When base date changes, recompute due date if a "N Days" condition is set
  useEffect(() => {
    const daysMatch = String(form.payment_cond).match(/(\d+)\s*Day/i);
    if (!daysMatch) return;
    const days = parseInt(daysMatch[1]);
    const d = new Date(form.date);
    d.setDate(d.getDate() + days);
    const newDue = d.toISOString().slice(0, 10);
    if (newDue !== form.due_date) setForm((f) => ({ ...f, due_date: newDue }));
    // eslint-disable-next-line
  }, [form.date]);
  const addLine = () => setForm({ ...form, lines: [...form.lines, blankLine()] });
  const removeLine = (idx) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });

  // ---- Aggregates ----
  const totalBags = useMemo(
    () => form.lines.reduce((s, l) => s + parseFloat(l.bag || 0), 0), [form.lines]);
  const totalWeight = useMemo(
    () => form.lines.reduce((s, l) => s + (parseFloat(l.wb || 0) || parseFloat(l.weight || 0)), 0),
    [form.lines]);
  const totalNwt = useMemo(
    () => form.lines.reduce((s, l) => s + parseFloat(l.nwt || 0), 0), [form.lines]);
  const subtotal = useMemo(
    () => form.lines.reduce((s, l) => s + Number(l.amount || 0), 0), [form.lines]);

  // ---- Auto-recalc charges based on rate × base ----
  useEffect(() => {
    setForm((f) => {
      const hamali_amt = +((parseFloat(f.hamali_rt) || 0) * totalBags).toFixed(2);
      const cartage_amt = +((parseFloat(f.cartage_rt) || 0) * totalBags).toFixed(2);
      const bhada_amt = +((parseFloat(f.bhada_rt) || 0) * totalWeight).toFixed(2);
      const garamt = +((parseFloat(f.garrt) || 0) * totalBags).toFixed(2);
      const mandiamt = +((parseFloat(f.mandirt) || 0) * subtotal / 100).toFixed(2);
      const dalali_amt = +((parseFloat(f.dalali_rt) || 0) * subtotal / 100).toFixed(2);
      const discount_amt = +((parseFloat(f.discount_rt) || 0) * totalWeight).toFixed(2);
      const rebate_amt = +((parseFloat(f.rebate_rt) || 0) * totalWeight).toFixed(2);
      return {
        ...f,
        hamali_amt, cartage_amt, bhada_amt, garamt, mandiamt,
        dalali_amt, discount_amt, rebate_amt,
      };
    });
    // eslint-disable-next-line
  }, [totalBags, totalWeight, subtotal,
      form.hamali_rt, form.cartage_rt, form.bhada_rt, form.garrt,
      form.mandirt, form.dalali_rt, form.discount_rt, form.rebate_rt]);

  // ---- Grand totals ----
  const additions = useMemo(() =>
    Number(form.hamali_amt || 0) + Number(form.cartage_amt || 0) +
    Number(form.bhada_amt || 0) + Number(form.mandiamt || 0) +
    Number(form.garamt || 0) + Number(form.loading || 0) +
    Number(form.bdalali || 0) + Number(form.other_charges || 0) +
    Number(form.dalali_amt || 0),
    [form]);
  const deductions = useMemo(() =>
    Number(form.discount_amt || 0) + Number(form.rebate_amt || 0) +
    Number(form.less || 0) + Number(form.advance || 0),
    [form]);
  const total = +(subtotal + additions - deductions).toFixed(2);
  const balance = +(total - Number(form.payment_received || 0)).toFixed(2);

  const save = async () => {
    try {
      if (!form.party_id) return toast.error("Party select karein");
      const validLines = form.lines.filter((l) =>
        l.item_id && (Number(l.weight) > 0 || Number(l.wb) > 0)
      );
      if (validLines.length === 0) return toast.error("Kam se kam ek item with weight add karein");

      const payload = {
        bill_type: form.bill_type,
        party_id: form.party_id, party_name: form.party_name,
        buyer_id: form.buyer_id || null, buyer_name: form.buyer_name,
        agent_id: form.agent_id || null, agent_name: form.agent_name,
        date: form.date, s_date: form.s_date, due_date: form.due_date,
        lot_no: form.lot_no, gp_no: form.gp_no, truck_no: form.truck_no,
        driver_name: form.driver_name, bilty_no: form.bilty_no,
        garage: form.garage, no_of_bag: form.no_of_bag, bag_pack_q: form.bag_pack_q,
        payment_cond: form.payment_cond,
        items: validLines.map((l) => ({
          item_id: l.item_id, item_name: l.item_name,
          bag: Number(l.bag || 0), pack: Number(l.pack || 0),
          bag_pack: l.bag_pack || "",
          weight: Number(l.weight || 0), wb: Number(l.wb || 0),
          ghat: Number(l.ghat || 0), nwt: Number(l.nwt || 0),
          unit: l.unit, rate: Number(l.rate), amount: Number(l.amount),
          qty: Number(l.bag || 0),
        })),
        subtotal,
        hamali_rt: Number(form.hamali_rt || 0), hamali_amt: Number(form.hamali_amt || 0),
        cartage_rt: Number(form.cartage_rt || 0), cartage_amt: Number(form.cartage_amt || 0),
        bhada_rt: Number(form.bhada_rt || 0), bhada_amt: Number(form.bhada_amt || 0),
        mandirt: Number(form.mandirt || 0), mandiamt: Number(form.mandiamt || 0),
        discount_rt: Number(form.discount_rt || 0), discount_amt: Number(form.discount_amt || 0),
        rebate_rt: Number(form.rebate_rt || 0), rebate_amt: Number(form.rebate_amt || 0),
        dalali_rt: Number(form.dalali_rt || 0), dalali_amt: Number(form.dalali_amt || 0),
        garrt: Number(form.garrt || 0), garamt: Number(form.garamt || 0),
        loading: Number(form.loading || 0), bdalali: Number(form.bdalali || 0),
        less: Number(form.less || 0), advance: Number(form.advance || 0),
        commission_pct: 0, commission_amt: 0,
        other_charges: Number(form.other_charges || 0),
        total,
        payment_received: Number(form.payment_received || 0),
        notes: form.notes, remark1: form.remark1, remark2: form.remark2,
      };
      const { data } = await api.post("/bills", payload);
      toast.success(`Bill ${data.bill_no} ban gaya`);
      setOpen(false); setForm(blank(filter === "purchase" ? "purchase" : "sale"));
      load();
      navigate(`/bills/${data.id}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this bill?")) return;
    await api.delete(`/bills/${id}`);
    toast.success("Deleted"); load();
  };

  const filtered = bills.filter((b) =>
    b.bill_no.toLowerCase().includes(q.toLowerCase()) ||
    (b.party_name || "").toLowerCase().includes(q.toLowerCase()) ||
    (b.truck_no || "").toLowerCase().includes(q.toLowerCase()) ||
    (b.lot_no || "").toLowerCase().includes(q.toLowerCase()) ||
    (b.gp_no || "").toLowerCase().includes(q.toLowerCase())
  );

  const isPurchase = form.bill_type === "purchase";

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: () => {
        setForm(blank(filter === "purchase" ? "purchase" : "sale")); setOpen(true);
      }, description: "Add new bill" },
    { ctrl: true, key: "s", action: () => open && save(),
      allowInInputs: true, description: "Save bill" },
    { key: "Escape", action: () => setOpen(false), allowInInputs: true,
      description: "Close bill modal" },
    { key: "+", action: () => open && addLine(),
      description: "Add line item" },
  ], [open, filter]);

  // Filter party options based on group nature
  const sellerOptions = parties.filter((p) =>
    isPurchase ? /purchase party/i.test(p.group_name || "") || !p.group_name
               : /sales party/i.test(p.group_name || "") || !p.group_name
  );
  const buyerOptions = parties.filter((p) => /sales party/i.test(p.group_name || ""));
  const agentOptions = parties; // any party can be agent

  // Arrow-key table navigation
  const { rowProps } = useTableNav({
    rows: filtered,
    onEdit: (b) => navigate(`/bills/${b.id}`),
    onDelete: (b) => del(b.id),
    enabled: !open,
  });

  return (
    <div className="space-y-5" data-testid="page-bills">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">
            Operations · {filter === "purchase" ? "Purchase Entry" : filter === "sale" ? "Bill Entry" : "Bills"}
          </div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            {filter === "purchase" ? "Purchase Entry" : filter === "sale" ? "Sale / Bill Entry" : "All Bills"}
          </h1>
        </div>
        <div className="flex items-end gap-2">
          <ExportBar filename={`bills-${filter}`} sheets={[{
            name: filter === "purchase" ? "Purchase Register" : filter === "sale" ? "Sale Register" : "Bills",
            columns: [
              { key: "bill_no", label: "Bill No.", width: 10 },
              { key: "date", label: "Date", width: 12 },
              { key: "lot_no", label: "Lot", width: 10 },
              { key: "bill_type", label: "Type", width: 10 },
              { key: "party_name", label: "Party", width: 30 },
              { key: "truck_no", label: "Truck", width: 14 },
              { value: (b) => (b.items || []).reduce((s, it) => s + (it.bag || 0), 0), label: "Bags", width: 10, num: true },
              { value: (b) => (b.items || []).reduce((s, it) => s + (it.wb || it.weight || 0), 0), label: "Weight (Qtl)", width: 12, num: true },
              { key: "total", label: "Total", width: 14, num: true },
              { key: "payment_received", label: "Received", width: 14, num: true },
              { key: "balance", label: "Baki", width: 14, num: true },
            ],
            rows: filtered,
          }]} />
          <button className="btn-primary" onClick={() => {
            setForm(blank(filter === "purchase" ? "purchase" : "sale")); setOpen(true);
          }} data-testid="btn-new-bill">
            <Plus size={16} weight="bold" /> Naya {filter === "purchase" ? "Purchase" : "Bill"} <span className="kbd ml-1">A</span>
          </button>
        </div>
      </div>

      <FoxProPrintHeader
        title={filter === "purchase" ? "PURCHASE REGISTER" : filter === "sale" ? "SALES REGISTER" : "ALL BILLS"}
        subtitle={`Total ${filtered.length} bills`} />

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
            placeholder="Bill no, party, truck, lot, GP no..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <table className="dense w-full" data-testid="table-bills">
          <thead>
            <tr>
              <th>Bill No.</th>
              <th>Date</th>
              <th>Lot</th>
              <th>Type</th>
              <th>Party</th>
              <th>Truck</th>
              <th className="num">Bags</th>
              <th className="num">Wt</th>
              <th className="num">Total ₹</th>
              <th className="num">Baki</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} className="py-10 text-center text-muted2">Koi bill nahi mila.</td></tr>
            ) : filtered.map((b, idx) => {
              const bg = (b.items || []).reduce((s, it) => s + (it.bag || 0), 0);
              const tw = (b.items || []).reduce((s, it) => s + (it.wb || it.weight || 0), 0);
              return (
                <tr key={b.id} data-testid={`bill-row-${b.id}`} {...rowProps(idx)}>
                  <td><Link to={`/bills/${b.id}`} className="font-mono-data text-terracotta hover:underline">{b.bill_no}</Link></td>
                  <td className="font-mono-data text-xs">{b.date}</td>
                  <td className="font-mono-data text-xs">{b.lot_no || "—"}</td>
                  <td>
                    <span className="text-[10px] uppercase tracking-wider font-heading font-medium"
                      style={{ color: b.bill_type === "sale" ? "#1B5E20" : "#8B2520" }}>
                      {b.bill_type}
                    </span>
                  </td>
                  <td className="font-medium text-xs">{b.party_name}</td>
                  <td className="font-mono-data text-xs">{b.truck_no || "—"}</td>
                  <td className="num">{inr(bg)}</td>
                  <td className="num">{inr(tw)}</td>
                  <td className="num font-medium">₹ {inr(b.total)}</td>
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
          <div onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-7xl my-4 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Receipt size={20} color="#8B2520" weight="bold" />
                <div className="font-heading font-semibold text-lg">
                  {isPurchase ? "PURCHASE ENTRY (कच्चा खरीद)" : "SALE / BILL ENTRY (नया बिल)"}
                </div>
              </div>
              <button className="btn-ghost p-1.5" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>

            {/* Type toggle */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {["sale", "purchase"].map((t) => (
                <button key={t} onClick={() => setForm({ ...form, bill_type: t })}
                  className={`py-2 rounded-sm border font-heading font-medium text-xs uppercase tracking-wider ${
                    form.bill_type === t
                      ? t === "sale" ? "bg-jama-bg border-jama text-jama" : "bg-kharch-bg border-terracotta text-terracotta"
                      : "bg-white border-khaki text-muted2"
                  }`} data-testid={`bill-type-${t}`}>
                  {t === "sale" ? "Sale (बेचना)" : "Purchase (कच्चा खरीद)"}
                </button>
              ))}
            </div>

            {/* Header strip — FoxPro style dense layout */}
            <div className="border border-khaki rounded-sm bg-parchment/40 p-3 mb-3">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                <div>
                  <label className="lbl">E.Date</label>
                  <input type="date" className="input-dense" value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">S.Date</label>
                  <input type="date" className="input-dense" value={form.s_date}
                    onChange={(e) => setForm({ ...form, s_date: e.target.value })}
                    data-testid="input-s-date" />
                </div>
                <div>
                  <label className="lbl">Lot No.</label>
                  <input className="input-dense" value={form.lot_no}
                    onChange={(e) => setForm({ ...form, lot_no: e.target.value })}
                    data-testid="input-lot-no" />
                </div>
                <div>
                  <label className="lbl">GP No.</label>
                  <input className="input-dense" value={form.gp_no}
                    onChange={(e) => setForm({ ...form, gp_no: e.target.value })}
                    data-testid="input-gp-no" />
                </div>
                <div>
                  <label className="lbl">Payment Cond.</label>
                  <select className="input-dense" value={form.payment_cond}
                    onChange={(e) => onPaymentCondChange(e.target.value)}
                    data-testid="select-payment-cond">
                    <option>Cash</option>
                    <option>7 Days</option>
                    <option>15 Days</option>
                    <option>30 Days</option>
                    <option>45 Days</option>
                    <option>60 Days</option>
                    <option>90 Days</option>
                    <option>On Delivery</option>
                    <option>Advance</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Due Date <span className="text-[10px] text-muted2">(auto)</span></label>
                  <input type="date" className="input-dense" value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    data-testid="input-due-date" />
                </div>

                <div className="md:col-span-2">
                  <label className="lbl">{isPurchase ? "Seller Party" : "Customer / Party"} *</label>
                  <select className="input-dense" value={form.party_id}
                    onChange={(e) => {
                      const p = parties.find((x) => x.id === e.target.value);
                      setForm({ ...form, party_id: e.target.value, party_name: p?.name || "" });
                    }} data-testid="select-bill-party">
                    <option value="">— Party chunein —</option>
                    {sellerOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code ? `${p.code} · ` : ""}{p.name}{p.place ? ` (${p.place})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {isPurchase && (
                  <div className="md:col-span-2">
                    <label className="lbl">Buyer Party (Final Customer)</label>
                    <select className="input-dense" value={form.buyer_id}
                      onChange={(e) => {
                        const p = parties.find((x) => x.id === e.target.value);
                        setForm({ ...form, buyer_id: e.target.value, buyer_name: p?.name || "" });
                      }} data-testid="select-buyer">
                      <option value="">— Koi nahi (apne stock me) —</option>
                      {buyerOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="lbl">Agent / Dalal</label>
                  <select className="input-dense" value={form.agent_id}
                    onChange={(e) => {
                      const p = parties.find((x) => x.id === e.target.value);
                      setForm({ ...form, agent_id: e.target.value, agent_name: p?.name || "" });
                    }}>
                    <option value="">— Koi nahi —</option>
                    {agentOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Vehicle strip */}
            <div className="border border-khaki rounded-sm bg-parchment/40 p-3 mb-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div>
                  <label className="lbl">Truck No (TNO)</label>
                  <input className="input-dense" value={form.truck_no}
                    onChange={(e) => setForm({ ...form, truck_no: e.target.value.toUpperCase() })}
                    placeholder="HR-26-AB-1234" data-testid="input-truck-no" />
                </div>
                <div>
                  <label className="lbl">Driver Name</label>
                  <input className="input-dense" value={form.driver_name}
                    onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">Bilty No (BUILTY)</label>
                  <input className="input-dense" value={form.bilty_no}
                    onChange={(e) => setForm({ ...form, bilty_no: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">Garage</label>
                  <input className="input-dense" value={form.garage}
                    onChange={(e) => setForm({ ...form, garage: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">No. of Bags</label>
                  <input className="input-dense" value={form.no_of_bag}
                    onChange={(e) => setForm({ ...form, no_of_bag: e.target.value })}
                    placeholder="e.g. 150 + 50" />
                </div>
              </div>
            </div>

            {/* Items table */}
            <div className="border border-khaki rounded-sm overflow-x-auto mb-3">
              <table className="dense w-full text-[11px]" style={{ minWidth: 1000 }}>
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th style={{ width: 78 }}>Bag Pack</th>
                    <th className="num" style={{ width: 65 }}>Bag</th>
                    <th className="num" style={{ width: 65 }}>Pack</th>
                    <th className="num" style={{ width: 78 }}>Weight</th>
                    <th className="num" style={{ width: 78 }}>W.B.</th>
                    <th className="num" style={{ width: 60 }}>Ghat</th>
                    <th className="num" style={{ width: 78 }}>Net Wt</th>
                    <th className="num" style={{ width: 85 }}>Rate</th>
                    <th className="num" style={{ width: 105 }}>Amount</th>
                    <th style={{ width: 28 }}></th>
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
                      <td><input className="input-dense" value={l.bag_pack}
                        onChange={(e) => updateLine(idx, { bag_pack: e.target.value })} /></td>
                      <td><input type="number" className="input-dense num" value={l.bag}
                        onChange={(e) => updateLine(idx, { bag: e.target.value })}
                        data-testid={`line-bag-${idx}`} /></td>
                      <td><input type="number" step="0.01" className="input-dense num" value={l.pack}
                        onChange={(e) => updateLine(idx, { pack: e.target.value })} /></td>
                      <td><input type="number" step="0.01" className="input-dense num" value={l.weight}
                        onChange={(e) => updateLine(idx, { weight: e.target.value })}
                        data-testid={`line-weight-${idx}`} /></td>
                      <td><input type="number" step="0.01" className="input-dense num" value={l.wb}
                        onChange={(e) => updateLine(idx, { wb: e.target.value })}
                        data-testid={`line-wb-${idx}`} /></td>
                      <td><input type="number" step="0.01" className="input-dense num" value={l.ghat}
                        onChange={(e) => updateLine(idx, { ghat: e.target.value })} /></td>
                      <td className="num text-muted2 font-mono-data">{inr(l.nwt || 0)}</td>
                      <td><input type="number" step="0.01" className="input-dense num" value={l.rate}
                        onChange={(e) => updateLine(idx, { rate: e.target.value })}
                        data-testid={`line-rate-${idx}`} /></td>
                      <td className="num font-mono-data font-medium">₹ {inr(l.amount)}</td>
                      <td>{form.lines.length > 1 && (
                        <button className="btn-ghost p-1" onClick={() => removeLine(idx)}>
                          <Trash size={11} />
                        </button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F4F1EA" }}>
                    <td className="font-heading font-semibold">Total</td>
                    <td></td>
                    <td className="num font-mono-data">{inr(totalBags)}</td>
                    <td></td>
                    <td className="num font-mono-data">{inr(totalWeight)}</td>
                    <td></td>
                    <td></td>
                    <td className="num font-mono-data">{inr(totalNwt)}</td>
                    <td></td>
                    <td className="num font-mono-data font-medium">₹ {inr(subtotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <div className="px-3 py-1.5 border-t border-khaki bg-parchment flex items-center justify-between">
                <button onClick={addLine} className="btn-ghost text-xs"><Plus size={11} /> Add line</button>
                <div className="text-[10px] text-muted2 font-mono-data">
                  Amount = (W.B. ya Weight − Ghat) × Rate
                </div>
              </div>
            </div>

            {/* Charges section — FoxPro style: Rate + Amount columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="border border-khaki rounded-sm p-3 bg-bone">
                <div className="section-title mb-2 text-jama">Additions (Kharch / Charges)</div>
                <ChargeRow label="Hamali" rate={form.hamali_rt} amt={form.hamali_amt}
                  onRate={(v) => setForm({ ...form, hamali_rt: v })}
                  rateNote={`× ${inr(totalBags)} bags`} />
                <ChargeRow label="Cartage" rate={form.cartage_rt} amt={form.cartage_amt}
                  onRate={(v) => setForm({ ...form, cartage_rt: v })}
                  rateNote={`× ${inr(totalBags)} bags`} />
                <ChargeRow label="Bhada (Freight)" rate={form.bhada_rt} amt={form.bhada_amt}
                  onRate={(v) => setForm({ ...form, bhada_rt: v })}
                  rateNote={`× ${inr(totalWeight)} Qtl`} />
                <ChargeRow label="Mandi Tax %" rate={form.mandirt} amt={form.mandiamt}
                  onRate={(v) => setForm({ ...form, mandirt: v })}
                  rateNote="% of subtotal" />
                <ChargeRow label="Dalali / Arhat %" rate={form.dalali_rt} amt={form.dalali_amt}
                  onRate={(v) => setForm({ ...form, dalali_rt: v })}
                  rateNote="% of subtotal" />
                <ChargeRow label="Garage" rate={form.garrt} amt={form.garamt}
                  onRate={(v) => setForm({ ...form, garrt: v })}
                  rateNote={`× ${inr(totalBags)} bags`} />
                <FlatRow label="Loading" val={form.loading} onChange={(v) => setForm({ ...form, loading: v })} />
                <FlatRow label="Brokerage Dalali" val={form.bdalali} onChange={(v) => setForm({ ...form, bdalali: v })} />
                <FlatRow label="Other Charges" val={form.other_charges} onChange={(v) => setForm({ ...form, other_charges: v })} />
              </div>

              <div className="border border-khaki rounded-sm p-3 bg-bone">
                <div className="section-title mb-2 text-kharch">Deductions (Less / Discount)</div>
                <ChargeRow label="Discount" rate={form.discount_rt} amt={form.discount_amt}
                  onRate={(v) => setForm({ ...form, discount_rt: v })}
                  rateNote={`× ${inr(totalWeight)} Qtl`} />
                <ChargeRow label="Rebate" rate={form.rebate_rt} amt={form.rebate_amt}
                  onRate={(v) => setForm({ ...form, rebate_rt: v })}
                  rateNote={`× ${inr(totalWeight)} Qtl`} />
                <FlatRow label="Less" val={form.less} onChange={(v) => setForm({ ...form, less: v })} />
                <FlatRow label="Advance Paid" val={form.advance} onChange={(v) => setForm({ ...form, advance: v })} />

                {/* Totals box */}
                <div className="mt-4 pt-3 border-t border-khaki space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted2">Subtotal</span>
                    <span className="font-mono-data">₹ {inr(subtotal)}</span></div>
                  <div className="flex justify-between text-jama"><span>+ Additions</span>
                    <span className="font-mono-data">₹ {inr(additions)}</span></div>
                  <div className="flex justify-between text-kharch"><span>− Deductions</span>
                    <span className="font-mono-data">₹ {inr(deductions)}</span></div>
                  <div className="border-t border-khaki my-1"></div>
                  <div className="flex justify-between text-base font-heading font-semibold">
                    <span>Total Amount</span>
                    <span className="font-mono-data" data-testid="bill-total">₹ {inr(total)}</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-muted2">Payment Received</span>
                    <input type="number" step="0.01" className="input-dense num"
                      style={{ width: 130, height: 28 }} value={form.payment_received}
                      onChange={(e) => setForm({ ...form, payment_received: e.target.value })}
                      data-testid="input-payment" />
                  </div>
                  <div className="flex justify-between font-heading font-semibold border-t border-khaki pt-1">
                    <span>Baki / Balance</span>
                    <span className="font-mono-data"
                      style={{ color: balance > 0 ? "#B71C1C" : "#1B5E20" }}>
                      ₹ {inr(balance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="lbl">Remark 1 (REMARK)</label>
                <input className="input-dense" value={form.remark1}
                  onChange={(e) => setForm({ ...form, remark1: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Remark 2 (REMARK1)</label>
                <input className="input-dense" value={form.remark2}
                  onChange={(e) => setForm({ ...form, remark2: e.target.value })} />
              </div>
            </div>

            {/* FoxPro-style action bar */}
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-khaki">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted2 font-mono-data">
                <span><span className="kbd">A</span>dd</span>
                <span>·</span>
                <span><span className="kbd">S</span>earch</span>
                <span>·</span>
                <span><span className="kbd">C</span>hange</span>
                <span>·</span>
                <span><span className="kbd">D</span>elete</span>
                <span>·</span>
                <span><span className="kbd">V</span>iew</span>
                <span>·</span>
                <span><span className="kbd">B</span>ikara</span>
                <span>·</span>
                <span><span className="kbd">E</span>xit</span>
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

function ChargeRow({ label, rate, amt, onRate, rateNote }) {
  return (
    <div className="flex items-center gap-2 mb-1.5 text-xs">
      <div className="w-32 text-muted2">{label}</div>
      <input type="number" step="0.01" className="input-dense num" style={{ width: 80, height: 28 }}
        value={rate} onChange={(e) => onRate(e.target.value)} placeholder="Rate" />
      <div className="text-[10px] text-muted2 w-24 font-mono-data">{rateNote}</div>
      <div className="font-mono-data ml-auto text-sm">₹ {inr(amt)}</div>
    </div>
  );
}
function FlatRow({ label, val, onChange }) {
  return (
    <div className="flex items-center gap-2 mb-1.5 text-xs">
      <div className="w-32 text-muted2">{label}</div>
      <input type="number" step="0.01" className="input-dense num" style={{ height: 28 }}
        value={val} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
