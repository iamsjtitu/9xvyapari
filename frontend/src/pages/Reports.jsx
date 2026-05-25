import { useEffect, useMemo, useState } from "react";
import api, { inr, todayISO } from "@/lib/api";
import { Calendar, ArrowDown, ArrowUp, Receipt } from "@phosphor-icons/react";

export default function Reports() {
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const [rokad, setRokad] = useState([]);
  const [bills, setBills] = useState([]);

  useEffect(() => {
    api.get(`/rokad?date_from=${from}&date_to=${to}`).then((r) => setRokad(r.data));
    api.get("/bills").then((r) => {
      setBills(r.data.filter((b) => b.date >= from && b.date <= to));
    });
  }, [from, to]);

  const rokadTotals = useMemo(() => {
    let j = 0, k = 0;
    for (const r of rokad) {
      if (r.type === "jama") j += r.amount;
      else k += r.amount;
    }
    return { jama: j, kharch: k, net: j - k };
  }, [rokad]);

  const billTotals = useMemo(() => {
    let sale = 0, purchase = 0, commission = 0;
    for (const b of bills) {
      if (b.bill_type === "sale") {
        sale += b.total;
        commission += b.commission_amt;
      } else {
        purchase += b.total;
      }
    }
    return { sale, purchase, commission, gross: sale - purchase };
  }, [bills]);

  // Daily breakup
  const dailyMap = {};
  rokad.forEach((r) => {
    if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, jama: 0, kharch: 0 };
    if (r.type === "jama") dailyMap[r.date].jama += r.amount;
    else dailyMap[r.date].kharch += r.amount;
  });
  const dailyRows = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-5" data-testid="page-reports">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Reports · रिपोर्ट / खाता बही</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">Hisab Summary</h1>
        </div>
        <div className="flex gap-3 items-end">
          <ExportBar filename={`reports-${from}-to-${to}`} sheets={[
            {
              name: "Daily Summary",
              columns: [
                { key: "date", label: "Date", width: 12 },
                { key: "jama", label: "Jama (Receipt)", width: 16, num: true },
                { key: "kharch", label: "Kharch (Payment)", width: 16, num: true },
                { value: (d) => d.jama - d.kharch, label: "Net", width: 14, num: true },
              ],
              rows: dailyRows,
            },
            {
              name: "Bills Summary",
              columns: [
                { key: "bill_no", label: "Bill No", width: 10 },
                { key: "date", label: "Date", width: 12 },
                { key: "bill_type", label: "Type", width: 10 },
                { key: "party_name", label: "Party", width: 30 },
                { key: "total", label: "Total", width: 14, num: true },
                { key: "commission_amt", label: "Arhat", width: 12, num: true },
              ],
              rows: bills,
            },
          ]} />
          <div>
            <label className="lbl">From</label>
            <input type="date" className="input-dense" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" />
          </div>
          <div>
            <label className="lbl">To</label>
            <input type="date" className="input-dense" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-to" />
          </div>
        </div>
      </div>

      <FoxProPrintHeader title="DAILY SUMMARY REPORT"
        subtitle={`From ${from} to ${to} · Jama ${inr(rokadTotals.jama)} · Kharch ${inr(rokadTotals.kharch)} · Sales ${inr(billTotals.sale)} · Purchase ${inr(billTotals.purchase)}`} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-flat p-4">
          <div className="flex items-center justify-between">
            <div className="section-title">Total Jama</div>
            <ArrowDown size={16} color="#1B5E20" weight="bold" />
          </div>
          <div className="amount-jama text-2xl font-medium mt-2" data-testid="rep-jama">₹ {inr(rokadTotals.jama)}</div>
        </div>
        <div className="card-flat p-4">
          <div className="flex items-center justify-between">
            <div className="section-title">Total Kharch</div>
            <ArrowUp size={16} color="#B71C1C" weight="bold" />
          </div>
          <div className="amount-kharch text-2xl font-medium mt-2" data-testid="rep-kharch">₹ {inr(rokadTotals.kharch)}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Net Cash</div>
          <div className="font-mono-data text-2xl mt-2"
               style={{ color: rokadTotals.net >= 0 ? "#1B5E20" : "#B71C1C" }} data-testid="rep-net">
            ₹ {inr(rokadTotals.net)}
          </div>
        </div>
        <div className="card-flat p-4">
          <div className="flex items-center justify-between">
            <div className="section-title">Arhat (Commission)</div>
            <Receipt size={16} color="#8B2520" weight="bold" />
          </div>
          <div className="font-mono-data text-2xl mt-2 text-terracotta" data-testid="rep-commission">
            ₹ {inr(billTotals.commission)}
          </div>
        </div>
      </div>

      {/* Sales & Purchase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card-flat p-5">
          <div className="section-title">Total Sales</div>
          <div className="font-mono-data text-2xl mt-2">₹ {inr(billTotals.sale)}</div>
          <div className="text-xs text-muted2 mt-1">
            {bills.filter((b) => b.bill_type === "sale").length} bills
          </div>
        </div>
        <div className="card-flat p-5">
          <div className="section-title">Total Purchase</div>
          <div className="font-mono-data text-2xl mt-2">₹ {inr(billTotals.purchase)}</div>
          <div className="text-xs text-muted2 mt-1">
            {bills.filter((b) => b.bill_type === "purchase").length} bills
          </div>
        </div>
        <div className="card-flat p-5">
          <div className="section-title">Gross (Sales − Purchase)</div>
          <div
            className="font-mono-data text-2xl mt-2"
            style={{ color: billTotals.gross >= 0 ? "#1B5E20" : "#B71C1C" }}
          >
            ₹ {inr(billTotals.gross)}
          </div>
        </div>
      </div>

      {/* Daily breakup */}
      <div className="card-flat overflow-hidden">
        <div className="px-5 py-3 border-b border-khaki section-title flex items-center gap-2">
          <Calendar size={14} /> Daily Cash Summary
        </div>
        <table className="dense w-full" data-testid="table-daily">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Jama</th>
              <th className="num">Kharch</th>
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-muted2">Is range me koi entry nahi.</td></tr>
            ) : (
              dailyRows.map((d) => (
                <tr key={d.date}>
                  <td className="font-mono-data">{d.date}</td>
                  <td className="num amount-jama">₹ {inr(d.jama)}</td>
                  <td className="num amount-kharch">₹ {inr(d.kharch)}</td>
                  <td className="num font-medium" style={{ color: d.jama - d.kharch >= 0 ? "#1B5E20" : "#B71C1C" }}>
                    ₹ {inr(d.jama - d.kharch)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
