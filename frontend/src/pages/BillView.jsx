import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { ArrowLeft, Storefront } from "@phosphor-icons/react";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";

export default function BillView() {
  const { id } = useParams();
  const [bill, setBill] = useState(null);

  useEffect(() => {
    api.get(`/bills/${id}`).then((r) => setBill(r.data));
  }, [id]);

  if (!bill) return <div className="text-muted2 font-heading">Loading...</div>;

  return (
    <div className="space-y-4" data-testid="page-bill-view">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/bills" className="btn-ghost"><ArrowLeft size={14} /> Wapas</Link>
        <ExportBar filename={`bill-${bill.bill_no}`} sheets={[{
          name: `Bill ${bill.bill_no}`,
          columns: [
            { key: "item_name", label: "Item", width: 28 },
            { key: "bag_pack", label: "Pack", width: 12 },
            { key: "qty", label: "Bags", width: 8, num: true },
            { key: "weight", label: "Weight", width: 10, num: true },
            { key: "wb", label: "W.B.", width: 10, num: true },
            { key: "rate", label: "Rate", width: 12, num: true },
            { key: "amount", label: "Amount", width: 14, num: true },
          ],
          rows: bill.items || [],
        }]} />
      </div>

      <FoxProPrintHeader
        title={bill.bill_type === "sale" ? "SALE INVOICE" : "PURCHASE BILL"}
        subtitle={`Bill No: ${bill.bill_no} · Date: ${bill.date} · Party: ${bill.party_name}`} />

      <div className="card-flat p-8 bg-white max-w-3xl mx-auto print:shadow-none print:border-0" id="printable-bill">
        {/* Header */}
        <div className="flex items-start justify-between pb-5 border-b-2 border-terracotta">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 grid place-items-center rounded-sm" style={{ background: "#8B2520" }}>
              <Storefront size={26} weight="bold" color="#fff" />
            </div>
            <div>
              <div className="font-heading font-bold text-2xl text-terracotta">9x Vyapari</div>
              <div className="text-[11px] uppercase tracking-widest text-muted2">Kaccha Arhat · Hisab Kitab</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-heading font-bold text-xl uppercase tracking-wider">
              {bill.bill_type === "sale" ? "Sale Invoice" : "Purchase Bill"}
            </div>
            <div className="font-mono-data text-base mt-1">{bill.bill_no}</div>
            <div className="text-xs text-muted2 font-mono-data">{bill.date}</div>
          </div>
        </div>

        {/* Party + Bill meta */}
        <div className="grid grid-cols-2 gap-6 py-5 border-b border-khaki">
          <div>
            <div className="section-title mb-2">{bill.bill_type === "sale" ? "Grahak (Bill To)" : "Seller Party"}</div>
            <div className="font-heading font-semibold text-lg">{bill.party_name}</div>
            {bill.payment_cond && (
              <div className="text-xs text-muted2 mt-1">Payment: {bill.payment_cond}</div>
            )}
          </div>
          <div className="text-right space-y-1 text-sm">
            <div><span className="section-title">E.Date:</span> <span className="font-mono-data ml-2">{bill.date}</span></div>
            {bill.s_date && <div><span className="section-title">S.Date:</span> <span className="font-mono-data ml-2">{bill.s_date}</span></div>}
            {bill.gp_no && <div><span className="section-title">GP No.:</span> <span className="font-mono-data ml-2">{bill.gp_no}</span></div>}
            {bill.truck_no && <div><span className="section-title">Truck:</span> <span className="font-mono-data ml-2">{bill.truck_no}</span></div>}
          </div>
        </div>

        {/* Items */}
        <table className="dense w-full my-4">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Galla</th>
              <th>Pack</th>
              <th className="num">Bags</th>
              <th className="num">Weight</th>
              <th className="num">W.B.</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.items.map((it, i) => (
              <tr key={i}>
                <td className="font-mono-data text-muted2">{i + 1}</td>
                <td className="font-medium">{it.item_name}</td>
                <td className="text-[11px] text-muted2">{it.bag_pack || "—"}</td>
                <td className="num">{inr(it.qty || 0)}</td>
                <td className="num">{inr(it.weight || 0)}</td>
                <td className="num">{inr(it.wb || 0)}</td>
                <td className="num">₹ {inr(it.rate)}</td>
                <td className="num font-medium">₹ {inr(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted2">Subtotal</span>
              <span className="font-mono-data">₹ {inr(bill.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted2">Arhat ({bill.commission_pct}%)</span>
              <span className="font-mono-data">₹ {inr(bill.commission_amt)}</span></div>
            <div className="flex justify-between"><span className="text-muted2">Other Charges</span>
              <span className="font-mono-data">₹ {inr(bill.other_charges)}</span></div>
            <div className="border-t border-khaki my-2"></div>
            <div className="flex justify-between font-heading font-semibold text-base">
              <span>Total</span>
              <span className="font-mono-data text-terracotta">₹ {inr(bill.total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted2">Received</span>
              <span className="amount-jama">₹ {inr(bill.payment_received)}</span>
            </div>
            <div className="flex justify-between font-heading font-semibold">
              <span>Baki (Due)</span>
              <span className="font-mono-data" style={{ color: bill.balance > 0 ? "#B71C1C" : "#1B5E20" }}>
                ₹ {inr(bill.balance)}
              </span>
            </div>
          </div>
        </div>

        {bill.notes && (
          <div className="mt-6 p-3 bg-parchment border border-khaki rounded-sm">
            <div className="section-title mb-1">Notes</div>
            <div className="text-sm">{bill.notes}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mt-10 pt-6 border-t border-khaki text-xs text-muted2">
          <div>
            <div>Dhanyavaad / Thank You</div>
            <div className="mt-1 font-mono-data text-[10px]">Generated by 9x Vyapari · {new Date().toLocaleDateString()}</div>
          </div>
          <div className="text-right">
            <div className="border-t border-khaki pt-1 inline-block w-40">Authorised Signature</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .paper-bg { background: white !important; }
          aside, header, .print\\:hidden { display: none !important; }
          #printable-bill { box-shadow: none !important; border: none !important; max-width: 100% !important; }
          @page { margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
