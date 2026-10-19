import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr, formatApiErrorDetail, todayISO } from "@/lib/api";
import { toast } from "sonner";
import { HandCoins, Trash } from "@phosphor-icons/react";
import { LedgerBalanceHint } from "@/components/LedgerBalanceHint";
import { MonthPicker, MODES, thisMonth, monthLabel, StaffPageHeader } from "@/components/staff/common";
import { fetchCashAccounts, defaultCashAccount, accountLabel } from "@/lib/cashAccounts";

const EMPTY = { staff_id: "", amount: "", date: todayISO(), cash_account_id: "", mode: "Cash", note: "" };

export default function StaffAdvance() {
  const [month, setMonth] = useState(thisMonth());
  const [staff, setStaff] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = (m = month) => api.get("/staff/advance", { params: { month: m } })
    .then((r) => setData((cur) => (m === monthRef.current ? r.data : cur)))   // ignore stale month responses
    .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  const monthRef = useRef(month);
  useEffect(() => { monthRef.current = month; setData(null); load(month); /* eslint-disable-next-line */ }, [month]);
  useEffect(() => {
    api.get("/staff").then((r) => setStaff(r.data.staff.filter((s) => s.active !== false)));
    fetchCashAccounts().then((list) => { setAccounts(list); const c = defaultCashAccount(list); if (c) setForm((f) => ({ ...f, cash_account_id: f.cash_account_id || c.id })); });
  }, []);

  const sel = staff.find((s) => s.id === form.staff_id);
  const amt = Number(form.amount) || 0;
  const submit = async (e) => {
    e.preventDefault();
    if (!form.staff_id) return toast.error("Staff chunein");
    if (amt <= 0) return toast.error("Amount daalein");
    setBusy(true);
    try {
      const { data: res } = await api.post("/staff/advance", { ...form, amount: amt });
      toast.success(`${sel?.name} ko advance ₹${inr(amt)} diya · V.No. ${res.voucher_no} · ab bacha advance ₹${inr(res.advance_due)}`);
      setForm((f) => ({ ...EMPTY, cash_account_id: f.cash_account_id, mode: f.mode, date: f.date }));
      load();
      api.get("/staff").then((r) => setStaff(r.data.staff.filter((s) => s.active !== false)));
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
    finally { setBusy(false); }
  };
  const del = async (e) => {
    if (!window.confirm(`${e.staff_name} ka advance ₹${inr(e.amount)} (${e.date.split("-").reverse().join("-")}) delete karein?`)) return;
    try { await api.delete(`/rokad/${e.id}`); toast.success("Advance entry delete hui"); load(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
  };

  return (
    <div className="space-y-4" data-testid="page-staff-advance">
      <StaffPageHeader title="Staff Advance" icon={HandCoins} subtitle="Staff ko advance (udhaar) do — Rokad me Payment entry banti hai, staff ke ledger me Dr. Salary dete waqt bacha advance apne aap katta hai. (Rokad me bhi staff ka naam select karke de sakte ho.)">
        <MonthPicker value={month} onChange={setMonth} testId="adv-month" />
      </StaffPageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form onSubmit={submit} className="card-flat p-4 space-y-3 lg:col-span-1" data-testid="advance-form">
          <div className="font-heading font-semibold">Naya Advance</div>
          <div><label className="lbl">Staff *</label>
            <select className="input-dense" value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} data-testid="adv-staff" autoFocus>
              <option value="">— Staff chunein —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.advance_due ? ` (baki ₹${inr(s.advance_due)})` : ""}</option>)}
            </select>
            {sel && <LedgerBalanceHint ledgerId={sel.ledger_id} delta={amt} compact className="mt-1" testId="adv-balance" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Amount (₹) *</label><input type="number" min="1" step="1" className="input-dense num" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="adv-amount" /></div>
            <div><label className="lbl">Date</label><input type="date" className="input-dense" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="adv-date" /></div>
            <div><label className="lbl">Mode</label><select className="input-dense" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} data-testid="adv-mode">{MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
            <div><label className="lbl">Cash / Bank</label><select className="input-dense" value={form.cash_account_id} onChange={(e) => { const a = accounts.find((x) => x.id === e.target.value); setForm({ ...form, cash_account_id: e.target.value, mode: a && /bank/i.test(a.group_name || "") && !/cash/i.test(a.name || "") ? "Bank" : "Cash" }); }} data-testid="adv-account">{accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</select></div>
          </div>
          <div><label className="lbl">Note</label><input className="input-dense" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Kis liye" data-testid="adv-note" /></div>
          <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="adv-submit">{busy ? "..." : `Advance do${amt ? ` ₹ ${inr(amt)}` : ""}`}</button>
        </form>

        <div className="lg:col-span-2 space-y-4">
          <div className="card-flat p-4">
            <div className="section-title mb-2">Bacha advance (aaj tak)</div>
            <div className="flex flex-wrap gap-2" data-testid="adv-dues">
              {(data?.dues || []).filter((d) => d.advance_due > 0 || d.salary_due > 0).length === 0 && <span className="text-sm text-muted2">Kisi par advance baki nahi.</span>}
              {(data?.dues || []).filter((d) => d.advance_due > 0 || d.salary_due > 0).map((d) => (
                <Link key={d.id} to={`/parties/${d.ledger_id}`} className="kbd !text-[11px] px-2 py-1 hover:bg-khaki/60" data-testid={`adv-due-${d.id}`}>
                  {d.name}: {d.advance_due > 0 ? <span className="text-[#B71C1C]">₹ {inr(d.advance_due)} advance</span> : <span className="text-jama">₹ {inr(d.salary_due)} salary dena</span>}
                </Link>
              ))}
            </div>
          </div>
          <div className="card-flat overflow-hidden">
            <div className="px-4 py-2 border-b border-khaki section-title flex justify-between"><span>Advance entries · {monthLabel(month)}</span><span className="font-mono-data" data-testid="adv-total">₹ {inr(data?.total || 0)}</span></div>
            <table className="dense w-full" data-testid="table-advance">
              <thead><tr><th>Date</th><th>Staff</th><th>Note</th><th>Mode / A/c</th><th>V.No.</th><th className="num">Amount</th><th style={{ width: 44 }}></th></tr></thead>
              <tbody>
                {!data ? <tr><td colSpan={7} className="py-6 text-center text-muted2">Loading…</td></tr>
                  : data.rows.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-muted2" data-testid="adv-empty">Is mahine koi advance nahi.</td></tr>
                  : data.rows.map((e) => (
                    <tr key={e.id} data-testid={`adv-row-${e.id}`}>
                      <td className="font-mono-data text-muted2">{e.date.split("-").reverse().join("-")}</td>
                      <td className="font-medium">{e.staff_name}</td>
                      <td className="text-xs text-muted2">{e.description}</td>
                      <td className="text-xs">{e.mode} · {e.cash_account_name}</td>
                      <td className="font-mono-data text-muted2">{e.voucher_no}</td>
                      <td className="num font-mono-data amount-kharch">₹ {inr(e.amount)}</td>
                      <td><button className="btn-ghost p-1.5 !text-[#B71C1C]" onClick={() => del(e)} data-testid={`adv-del-${e.id}`}><Trash size={14} /></button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
