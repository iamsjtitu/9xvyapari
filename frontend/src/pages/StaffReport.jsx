import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { ChartBar } from "@phosphor-icons/react";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { MonthPicker, thisMonth, monthLabel, StaffPageHeader } from "@/components/staff/common";

const STATUS = { paid: ["PAID", "!text-white !bg-jama !border-jama"], credited: ["CREDITED", "text-jama border-jama/40"], pending: ["PENDING", ""], none: ["—", "text-muted2"] };

export default function StaffReport() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const monthRef = useRef(month);
  useEffect(() => {
    monthRef.current = month; setData(null);
    api.get("/staff/report", { params: { month } }).then((r) => setData((cur) => (r.data.month === monthRef.current ? r.data : cur)))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  }, [month]);

  const rows = data?.rows || []; const t = data?.totals;
  return (
    <div className="space-y-4" data-testid="page-staff-report">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>
      <StaffPageHeader title="Monthly Staff Report" icon={ChartBar} subtitle="Mahine ka staff kharch: attendance, salary (gross / advance kata / net), diye gaye advance, aur month-end par bacha advance ya dena.">
        <MonthPicker value={month} onChange={setMonth} testId="rep-month" />
        {data && (
          <ExportBar filename={`staff-report-${month}`} title={`Staff Report · ${data.label}`}
            sheets={[{
              name: "Staff Report",
              subtitle: `Salary gross ₹${inr(t.gross)} · advance kata ₹${inr(t.deduct)} · net ₹${inr(t.net)} · advances diye ₹${inr(t.advance)} · total cash out ₹${inr(t.cash_out)}`,
              columns: [
                { key: "name", label: "Staff", width: 26 }, { key: "type", label: "System", width: 10 },
                { key: "P", label: "P", width: 5, num: true }, { key: "H", label: "H", width: 5, num: true }, { key: "A", label: "A", width: 5, num: true }, { key: "C", label: "C", width: 5, num: true },
                { key: "paid_days", label: "Din", width: 7, num: true }, { key: "per_day", label: "Rate/din", width: 11, num: true },
                { key: "gross", label: "Gross", width: 13, num: true }, { key: "deduct", label: "Advance kata", width: 13, num: true }, { key: "net", label: "Net salary", width: 13, num: true },
                { key: "advance_amount", label: "Advance diya", width: 13, num: true }, { key: "cash_out", label: "Total cash out", width: 14, num: true },
                { key: "advance_due", label: "Advance baki (month end)", width: 16, num: true }, { key: "salary_due", label: "Salary dena", width: 13, num: true },
                { key: "status_text", label: "Status", width: 12 },
              ],
              rows: rows.map((r) => ({ ...r, ...r.counts, type: r.salary_type === "monthly" ? "Monthly" : "Daily", status_text: STATUS[r.status][0] })),
            }]} />
        )}
      </StaffPageHeader>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
          <div className="card-flat p-4"><div className="section-title">Salary gross (kharch)</div><div className="font-mono-data text-2xl" data-testid="rep-gross">₹ {inr(t.gross)}</div></div>
          <div className="card-flat p-4"><div className="section-title">Advance kata</div><div className="font-mono-data text-2xl" data-testid="rep-deduct">₹ {inr(t.deduct)}</div></div>
          <div className="card-flat p-4"><div className="section-title">Net salary</div><div className="font-mono-data text-2xl text-jama" data-testid="rep-net">₹ {inr(t.net)}</div></div>
          <div className="card-flat p-4"><div className="section-title">Advance diye</div><div className="font-mono-data text-2xl text-[#B71C1C]" data-testid="rep-advance">₹ {inr(t.advance)}</div></div>
          <div className="card-flat p-4"><div className="section-title">Total cash out</div><div className="font-mono-data text-2xl" data-testid="rep-cash-out">₹ {inr(t.cash_out)}</div></div>
        </div>
      )}

      <div className="card-flat overflow-x-auto" id="rep-printable">
        <div className="hidden print:block p-2"><FoxProPrintHeader title={`STAFF REPORT · ${monthLabel(month).toUpperCase()}`} subtitle="Din = P + H/2 + C · Monthly ÷ 30 · Cash out = net salary + advances" /></div>
        <table className="dense w-full" data-testid="table-staff-report">
          <thead><tr><th>Staff</th><th className="num">P</th><th className="num">H</th><th className="num">A</th><th className="num">C</th><th className="num">Din</th><th className="num">Rate/din</th><th className="num">Gross</th><th className="num">Adv. kata</th><th className="num">Net salary</th><th className="num">Advance diya</th><th className="num">Cash out</th><th className="num">Adv. baki</th><th className="num">Salary dena</th><th>Status</th></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={15} className="py-8 text-center text-muted2">Hisab lagaya ja raha hai…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={15} className="py-10 text-center text-muted2" data-testid="rep-empty">Koi staff nahi.</td></tr>
              : rows.map((r) => {
                const [label, cls] = STATUS[r.status];
                return (
                  <tr key={r.id} data-testid={`rep-row-${r.id}`}>
                    <td><Link to={`/parties/${r.ledger_id}`} className="font-medium text-ink hover:text-terracotta">{r.name}</Link><div className="text-[10px] text-muted2">{r.salary_type === "monthly" ? `Monthly ₹${inr(r.salary)}` : `Daily ₹${inr(r.salary)}`}{r.advance_count ? ` · ${r.advance_count} advance` : ""}</div></td>
                    <td className="num font-mono-data">{r.counts.P}</td><td className="num font-mono-data">{r.counts.H}</td><td className="num font-mono-data text-[#B71C1C]">{r.counts.A}</td><td className="num font-mono-data text-[#1565C0]">{r.counts.C}</td>
                    <td className="num font-mono-data font-semibold">{r.paid_days}</td>
                    <td className="num font-mono-data">₹ {inr(r.per_day)}</td>
                    <td className="num font-mono-data" data-testid={`rep-gross-${r.id}`}>{r.gross ? `₹ ${inr(r.gross)}` : r.expected_gross ? <span className="text-muted2" title="Abhi pay nahi hua (expected)">(₹ {inr(r.expected_gross)})</span> : "—"}</td>
                    <td className="num font-mono-data">{r.deduct ? `₹ ${inr(r.deduct)}` : "—"}</td>
                    <td className="num font-mono-data text-jama" data-testid={`rep-net-${r.id}`}>{r.net ? `₹ ${inr(r.net)}` : "—"}</td>
                    <td className="num font-mono-data amount-kharch" data-testid={`rep-adv-${r.id}`}>{r.advance_amount ? `₹ ${inr(r.advance_amount)}` : "—"}</td>
                    <td className="num font-mono-data font-semibold" data-testid={`rep-cashout-${r.id}`}>₹ {inr(r.cash_out)}</td>
                    <td className="num font-mono-data">{r.advance_due ? `₹ ${inr(r.advance_due)}` : "—"}</td>
                    <td className="num font-mono-data">{r.salary_due ? `₹ ${inr(r.salary_due)}` : "—"}</td>
                    <td><span className={`kbd !text-[9px] !px-1 !py-0 ${cls}`} title={r.salary_date ? `${r.salary_date.split("-").reverse().join("-")}${r.voucher_no ? ` · V.No. ${r.voucher_no}` : ""}` : ""} data-testid={`rep-status-${r.id}`}>{label}</span></td>
                  </tr>
                );
              })}
          </tbody>
          {t && rows.length > 0 && (
            <tfoot><tr className="bg-parchment/60 font-semibold" data-testid="rep-total-row">
              <td colSpan={5} className="text-right">TOTAL</td><td className="num font-mono-data">{t.paid_days}</td><td></td>
              <td className="num font-mono-data">₹ {inr(t.gross)}</td><td className="num font-mono-data">₹ {inr(t.deduct)}</td><td className="num font-mono-data">₹ {inr(t.net)}</td>
              <td className="num font-mono-data">₹ {inr(t.advance)}</td><td className="num font-mono-data">₹ {inr(t.cash_out)}</td>
              <td className="num font-mono-data">₹ {inr(t.advance_due)}</td><td className="num font-mono-data">₹ {inr(t.salary_due)}</td><td></td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
