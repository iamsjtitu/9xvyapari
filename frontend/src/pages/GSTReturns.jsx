import { useEffect, useMemo, useState } from "react";
import api, { inr } from "@/lib/api";
import { Receipt, MagnifyingGlass } from "@phosphor-icons/react";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";

export default function GSTReturns() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/gst-returns").then((r) => setRows(r.data));
  }, []);

  const filtered = useMemo(() =>
    rows.filter((r) =>
      (r.particular || "").toLowerCase().includes(q.toLowerCase()) ||
      (r.gstin || "").toLowerCase().includes(q.toLowerCase()) ||
      (r.invoice_no || "").toLowerCase().includes(q.toLowerCase())
    ), [rows, q]);

  const totals = useMemo(() => {
    let taxable = 0, integrated = 0, central = 0, state = 0, inv = 0;
    for (const r of filtered) {
      taxable += r.taxable || 0;
      integrated += r.integrated || 0;
      central += r.central || 0;
      state += r.state || 0;
      inv += r.inv_amt || 0;
    }
    return { taxable, integrated, central, state, inv };
  }, [filtered]);

  return (
    <div className="space-y-5" data-testid="page-gst">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <div className="section-title">Reports · GST Return</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight flex items-center gap-2">
            <Receipt size={28} color="#8B2520" weight="bold" /> GSTR-1 / GST Returns
          </h1>
          <div className="text-muted2 text-sm mt-1">
            FoxPro AAGSTRET.DBF se imported B2B sale invoices with CGST/SGST/IGST.
          </div>
        </div>
        <ExportBar filename="gst-returns" sheets={[{
          name: "GST Returns",
          columns: [
            { key: "bill_date", label: "Bill Date", width: 12 },
            { key: "particular", label: "Party", width: 30 },
            { key: "gstin", label: "GSTIN", width: 18 },
            { key: "invoice_no", label: "Invoice No.", width: 14 },
            { key: "taxable", label: "Taxable", width: 14, num: true },
            { key: "central", label: "CGST", width: 12, num: true },
            { key: "state", label: "SGST", width: 12, num: true },
            { key: "integrated", label: "IGST", width: 12, num: true },
            { key: "inv_amt", label: "Invoice Amt", width: 14, num: true },
          ],
          rows: filtered,
        }]} />
      </div>

      <FoxProPrintHeader title="GST RETURNS REGISTER"
        subtitle={`Total ${filtered.length} invoices`} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
        <Stat label="Total Invoices" value={filtered.length} />
        <Stat label="Taxable" value={`₹ ${inr(totals.taxable)}`} />
        <Stat label="CGST" value={`₹ ${inr(totals.central)}`} />
        <Stat label="SGST" value={`₹ ${inr(totals.state)}`} />
        <Stat label="IGST" value={`₹ ${inr(totals.integrated)}`} />
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-4 py-3 border-b border-khaki flex items-center gap-2 print:hidden">
          <MagnifyingGlass size={16} color="#595959" />
          <input className="flex-1 bg-transparent outline-none text-sm"
            placeholder="Search by party, GSTIN, invoice..." value={q}
            onChange={(e) => setQ(e.target.value)} data-testid="input-search-gst" />
        </div>

        <table className="dense w-full" data-testid="table-gst">
          <thead>
            <tr>
              <th>Bill Date</th>
              <th>Party / Particulars</th>
              <th>GSTIN</th>
              <th>Invoice No.</th>
              <th className="num">Taxable (₹)</th>
              <th className="num">CGST</th>
              <th className="num">SGST</th>
              <th className="num">IGST</th>
              <th className="num">Invoice Amt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="py-10 text-center text-muted2">Koi GST entry nahi.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id}>
                <td className="font-mono-data text-xs">{r.bill_date}</td>
                <td className="font-medium">{r.particular}</td>
                <td className="font-mono-data text-xs">{r.gstin}</td>
                <td className="font-mono-data text-xs">{r.invoice_no}</td>
                <td className="num">₹ {inr(r.taxable)}</td>
                <td className="num">{r.central ? `₹ ${inr(r.central)}` : "—"}</td>
                <td className="num">{r.state ? `₹ ${inr(r.state)}` : "—"}</td>
                <td className="num">{r.integrated ? `₹ ${inr(r.integrated)}` : "—"}</td>
                <td className="num font-medium">₹ {inr(r.inv_amt)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#F4F1EA" }}>
              <td colSpan={4} className="font-heading font-semibold uppercase tracking-wider">Total</td>
              <td className="num font-mono-data font-medium">₹ {inr(totals.taxable)}</td>
              <td className="num font-mono-data font-medium">₹ {inr(totals.central)}</td>
              <td className="num font-mono-data font-medium">₹ {inr(totals.state)}</td>
              <td className="num font-mono-data font-medium">₹ {inr(totals.integrated)}</td>
              <td className="num font-mono-data font-medium">₹ {inr(totals.inv)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <style>{`
        @media print { body, .paper-bg { background: white !important; } aside, .print\\:hidden { display: none !important; } @page { margin: 8mm; size: A4 landscape; } }
      `}</style>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card-flat p-3">
      <div className="section-title">{label}</div>
      <div className="font-mono-data text-xl mt-1">{value}</div>
    </div>
  );
}
