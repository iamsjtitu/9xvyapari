import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr, formatApiErrorDetail, todayISO } from "@/lib/api";
import { toast } from "sonner";
import { Money, Printer, Trash, X, CheckCircle } from "@phosphor-icons/react";
import { FoxProPrintHeader } from "@/components/ExportBar";
import { backdropClose } from "@/lib/backdrop";
import { MonthPicker, MODES, thisMonth, monthLabel, StaffPageHeader } from "@/components/staff/common";
import { fetchCashAccounts, defaultCashAccount, accountLabel } from "@/lib/cashAccounts";

// Confirm + pay dialog for one staff's month
const PayDialog = ({ row, month, monthEnd, onClose, onPaid }) => {
  const [accounts, setAccounts] = useState([]);
  const today = todayISO();
  const [form, setForm] = useState({ deduct: String(row.suggested_deduct), pay_now: true, cash_account_id: "", mode: "Cash", date: monthEnd < today ? monthEnd : today, note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchCashAccounts().then((list) => { setAccounts(list); const c = defaultCashAccount(list); if (c) setForm((f) => ({ ...f, cash_account_id: c.id })); }); }, []);
  const deduct = Math.min(Math.max(Number(form.deduct) || 0, 0), row.gross, row.advance_due);
  const net = Math.round((row.gross - deduct) * 100) / 100;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post("/staff/salary/pay", { staff_id: row.id, month, deduct_advance: deduct, pay_now: form.pay_now, cash_account_id: form.cash_account_id, mode: form.mode, date: form.date, note: form.note });
      toast.success(`${row.name} · ${monthLabel(month)} salary ₹${inr(data.gross)}${deduct ? ` − advance ₹${inr(deduct)}` : ""} = net ₹${inr(data.net)}${data.paid_now ? ` · V.No. ${data.voucher_no}` : " (credit kiya, payment baad me)"}`, { duration: 7000 });
      onPaid();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
    finally { setBusy(false); }
  };
  const c = row.counts;
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" {...backdropClose(onClose)} data-testid="modal-pay-salary">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-flat w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-heading font-semibold text-lg">Salary · {row.name} · {monthLabel(month)}</div>
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} data-testid="pay-close"><X size={16} /></button>
        </div>
        <div className="font-mono-data text-sm bg-parchment/60 border border-khaki p-3 space-y-1" data-testid="pay-summary">
          <div className="flex justify-between"><span>Attendance</span><span>P{c.P} H{c.H} A{c.A} C{c.C} = <strong>{row.paid_days}</strong> din</span></div>
          <div className="flex justify-between"><span>{row.salary_type === "monthly" ? `₹${inr(row.salary)} ÷ 30 = ₹${inr(row.per_day)}/din` : `Daily rate ₹${inr(row.per_day)}`}</span><span>× {row.paid_days}</span></div>
          <div className="flex justify-between font-semibold"><span>Gross salary</span><span data-testid="pay-gross">₹ {inr(row.gross)}</span></div>
          <div className="flex justify-between items-center"><span>Advance kaatein (bacha ₹{inr(row.advance_due)})</span>
            <input type="number" min="0" max={Math.min(row.gross, row.advance_due)} step="1" className="input-dense num !w-[120px] h-8" value={form.deduct} onChange={(e) => setForm({ ...form, deduct: e.target.value })} data-testid="pay-deduct" /></div>
          <div className="flex justify-between text-base font-semibold border-t border-khaki pt-1"><span>Net dena</span><span className="text-jama" data-testid="pay-net">₹ {inr(net)}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-[#1B5E20]" checked={form.pay_now} onChange={(e) => setForm({ ...form, pay_now: e.target.checked })} data-testid="pay-now" /> Abhi cash/bank se payment karo (Rokad entry banegi)</label>
          <div><label className="lbl">Date</label><input type="date" className="input-dense" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="pay-date" /></div>
          <div><label className="lbl">Mode</label><select className="input-dense" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} disabled={!form.pay_now} data-testid="pay-mode">{MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div className="col-span-2"><label className="lbl">Cash / Bank Account</label>
            <select className="input-dense" value={form.cash_account_id} onChange={(e) => { const a = accounts.find((x) => x.id === e.target.value); setForm({ ...form, cash_account_id: e.target.value, mode: a && /bank/i.test(a.group_name || "") && !/cash/i.test(a.name || "") ? "Bank" : "Cash" }); }} disabled={!form.pay_now} data-testid="pay-account">
              {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</select></div>
          <div className="col-span-2"><label className="lbl">Note</label><input className="input-dense" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="pay-note" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4 border-t border-khaki pt-3">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy} data-testid="pay-submit"><CheckCircle size={14} weight="bold" /> {busy ? "..." : form.pay_now ? `Pay ₹ ${inr(net)}` : "Salary credit karo"}</button>
        </div>
      </form>
    </div>
  );
};

export default function StaffSalary() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [paying, setPaying] = useState(null);
  const monthRef = useRef(month);
  const load = (m = month) => api.get("/staff/salary", { params: { month: m } })
    .then((r) => setData((cur) => (r.data.month === monthRef.current ? r.data : cur)))   // ignore stale month responses
    .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  useEffect(() => { monthRef.current = month; setData(null); load(month); /* eslint-disable-next-line */ }, [month]);

  const unpay = async (r) => {
    if (!window.confirm(`${r.name} ki ${monthLabel(month)} salary entry delete karein?\nSalary journal aur payment (Rokad) dono hat jayenge.`)) return;
    try { await api.delete(`/staff/salary/${r.paid.id}`); toast.success("Salary entry delete ho gayi"); load(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
  };

  const rows = data?.rows || [];
  const pending = rows.filter((r) => !r.paid && r.gross > 0);
  return (
    <div className="space-y-4" data-testid="page-staff-salary">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>
      <StaffPageHeader title="Staff Salary Payments" icon={Money} subtitle="Attendance se salary: paid din = P + H/2 + C · Monthly = salary ÷ 30 × din · bacha advance apne aap katta hai (kam kar sakte ho).">
        <MonthPicker value={month} onChange={setMonth} testId="sal-month" />
        <button className="btn-outline" onClick={() => window.print()} data-testid="btn-sal-print"><Printer size={14} /> Print</button>
      </StaffPageHeader>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
          <div className="card-flat p-4"><div className="section-title">Staff</div><div className="font-mono-data text-2xl">{rows.length}</div></div>
          <div className="card-flat p-4"><div className="section-title">Paid ({data.totals.paid_count}){data.totals.credited_count ? <span className="normal-case tracking-normal"> · credited {data.totals.credited_count}</span> : ""}</div>
            <div className="font-mono-data text-2xl text-jama" data-testid="sal-total-net">₹ {inr(data.totals.paid_net)}</div>
            {data.totals.credited_count > 0 && <div className="text-[10px] text-muted2 font-mono-data" data-testid="sal-total-credited">+ ₹ {inr(data.totals.credited_net)} credited (dena baaki)</div>}</div>
          <div className="card-flat p-4"><div className="section-title">Advance kata</div><div className="font-mono-data text-2xl" data-testid="sal-total-deduct">₹ {inr(data.totals.deduct)}</div></div>
          <div className="card-flat p-4"><div className="section-title">Baaki (pending)</div><div className="font-mono-data text-2xl text-[#B71C1C]" data-testid="sal-pending">{pending.length} · ₹ {inr(pending.reduce((t, r) => t + r.net, 0))}</div></div>
        </div>
      )}

      <div className="card-flat overflow-x-auto" id="sal-printable">
        <div className="hidden print:block p-2"><FoxProPrintHeader title={`STAFF SALARY SHEET · ${monthLabel(month).toUpperCase()}`} subtitle="Din = P + H/2 + C · Monthly ÷ 30" /></div>
        <table className="dense w-full" data-testid="table-salary">
          <thead><tr><th>Staff</th><th className="num">P</th><th className="num">H</th><th className="num">A</th><th className="num">C</th><th className="num">Din</th><th className="num">Rate/din</th><th className="num">Gross</th><th className="num">Advance baki</th><th className="num">Katega</th><th className="num">Net</th><th>Status</th><th className="print:hidden" style={{ width: 120 }}></th></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={13} className="py-8 text-center text-muted2">Hisab lagaya ja raha hai…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={13} className="py-10 text-center text-muted2" data-testid="sal-empty">Koi staff nahi.</td></tr>
              : rows.map((r) => {
                const p = r.paid; const c = r.counts;
                return (
                  <tr key={r.id} data-testid={`sal-row-${r.id}`} className={p ? "bg-jama-bg/40" : ""}>
                    <td><Link to={`/parties/${r.ledger_id}`} className="font-medium text-ink hover:text-terracotta">{r.name}</Link><div className="text-[10px] text-muted2">{r.salary_type === "monthly" ? `Monthly ₹${inr(r.salary)}` : `Daily ₹${inr(r.salary)}`}{r.unmarked ? ` · ${r.unmarked} din bina mark` : ""}</div></td>
                    <td className="num font-mono-data">{c.P}</td><td className="num font-mono-data">{c.H}</td><td className="num font-mono-data text-[#B71C1C]">{c.A}</td><td className="num font-mono-data text-[#1565C0]">{c.C}</td>
                    <td className="num font-mono-data font-semibold" data-testid={`sal-days-${r.id}`}>{r.paid_days}</td>
                    <td className="num font-mono-data">₹ {inr(r.per_day)}</td>
                    <td className="num font-mono-data" data-testid={`sal-gross-${r.id}`}>₹ {inr(p ? p.gross : r.gross)}</td>
                    <td className="num font-mono-data amount-kharch">{r.advance_due ? `₹ ${inr(r.advance_due)}` : "—"}</td>
                    <td className="num font-mono-data" data-testid={`sal-deduct-${r.id}`}>{(p ? p.advance_deducted : r.suggested_deduct) ? `₹ ${inr(p ? p.advance_deducted : r.suggested_deduct)}` : "—"}</td>
                    <td className="num font-mono-data font-semibold text-jama" data-testid={`sal-net-${r.id}`}>₹ {inr(p ? p.net : r.net)}</td>
                    <td>{p ? <span className="kbd !text-[9px] !px-1 !py-0 !text-white !bg-jama !border-jama" title={`${p.date.split("-").reverse().join("-")}${p.voucher_no ? ` · V.No. ${p.voucher_no}` : ""}`} data-testid={`sal-paid-${r.id}`}>{p.paid_now ? `PAID ${p.date.split("-").reverse().join("-")}` : "CREDITED"}</span>
                      : r.gross > 0 ? <span className="kbd !text-[9px] !px-1 !py-0">PENDING</span> : <span className="text-[10px] text-muted2">attendance nahi</span>}</td>
                    <td className="print:hidden">{p
                      ? <button className="btn-ghost p-1.5 !text-[#B71C1C]" onClick={() => unpay(r)} title="Salary entry delete" data-testid={`sal-unpay-${r.id}`}><Trash size={14} /></button>
                      : <button className="btn-primary !h-7 text-xs" disabled={r.gross <= 0} onClick={() => setPaying(r)} data-testid={`sal-pay-${r.id}`}>Pay</button>}</td>
                  </tr>
                );
              })}
          </tbody>
          {data && rows.length > 0 && (
            <tfoot><tr className="bg-parchment/60 font-semibold" data-testid="sal-total-row">
              <td colSpan={7} className="text-right">TOTAL (paid {data.totals.paid_count})</td>
              <td className="num font-mono-data">₹ {inr(data.totals.gross)}</td><td></td>
              <td className="num font-mono-data">₹ {inr(data.totals.deduct)}</td>
              <td className="num font-mono-data">₹ {inr(data.totals.net)}</td><td colSpan={2}></td>
            </tr></tfoot>
          )}
        </table>
      </div>
      {paying && <PayDialog row={paying} month={month} monthEnd={data.month_end} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); load(); }} />}
    </div>
  );
}
