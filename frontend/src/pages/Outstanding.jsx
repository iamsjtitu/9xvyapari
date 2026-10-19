import { useEffect, useState } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import api, { formatApiErrorDetail, inr, todayISO } from "@/lib/api";
import { ExportBar } from "@/components/ExportBar";
import { OutstandingSheet } from "@/components/OutstandingSheet";
import { HandCoins } from "@phosphor-icons/react";
import { toast } from "sonner";

const SIDES = [
  { v: "dr", l: "Lena hai (Dr)", tid: "os-side-dr" },
  { v: "cr", l: "Dena hai (Cr)", tid: "os-side-cr" },
  { v: "all", l: "Dono", tid: "os-side-all" },
];

export default function Outstanding() {
  const { settings } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const asOn = params.get("as_on") || todayISO();
  const side = params.get("side") || "dr";
  const sort = params.get("sort") || "amount";
  const minAmount = params.get("min") || "";
  const hideSettled = params.get("hs") === "1";
  const [data, setData] = useState(null);

  const setP = (next) => setParams({ as_on: asOn, side, sort, min: minAmount, hs: hideSettled ? "1" : "0", ...next });

  useEffect(() => {
    setData(null);
    api.get("/reports/outstanding", { params: { as_on: asOn, side, sort, min_amount: Number(minAmount) || 0, hide_settled: hideSettled } })
      .then((r) => setData(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  }, [asOn, side, sort, minAmount, hideSettled]);

  const quick = [
    { l: "Aaj", d: todayISO(), tid: "os-quick-today" },
    { l: "FY Start", d: settings?.fy_start, tid: "os-quick-fystart" },
    { l: "FY End", d: settings?.fy_end, tid: "os-quick-fyend" },
  ].filter((q) => q.d);
  const flatRows = (data?.sections || []).flatMap((s) => s.rows.map((r) => ({ ...r, group: s.group_name, dr: r.balance > 0 ? r.balance : 0, cr: r.balance < 0 ? -r.balance : 0 })));

  return (
    <div className="space-y-5" data-testid="page-outstanding">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm 9mm; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <div className="section-title">Reports · Vasooli</div>
          <h1 className="font-heading font-semibold text-4xl tracking-tight flex items-center gap-2">
            <HandCoins size={30} weight="duotone" color="#8B2520" /> Outstanding List
          </h1>
          <div className="text-muted2 text-sm mt-1">
            Jin parties ka balance baki hai — group-wise, as on date. Collection round ke liye DOS-style print (phone, last txn, din).
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" data-testid="os-controls">
            <label className="lbl !mb-0 mr-1 whitespace-nowrap">As on</label>
            <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={asOn}
              onChange={(e) => e.target.value && setP({ as_on: e.target.value })} data-testid="input-os-as-on" />
            {quick.map((q) => (
              <button key={q.l} type="button" data-testid={q.tid} onClick={() => setP({ as_on: q.d })}
                className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${asOn === q.d ? "!bg-terracotta !text-white !border-terracotta" : ""}`}>{q.l}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-2">
            {SIDES.map((s) => (
              <button key={s.v} type="button" data-testid={s.tid} onClick={() => setP({ side: s.v })}
                className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${side === s.v ? "!bg-terracotta !text-white !border-terracotta" : ""}`}>{s.l}</button>
            ))}
          </div>
          <input type="number" min="0" step="100" placeholder="Min ₹" className="input-dense h-9 text-sm !w-[110px] font-mono-data" value={minAmount}
            onChange={(e) => setP({ min: e.target.value })} title="Isse chhote balance chhupayein" data-testid="input-os-min" />
          <select className="input-dense h-9 text-sm !w-auto" value={sort} onChange={(e) => setP({ sort: e.target.value })} data-testid="select-os-sort">
            <option value="amount">Sort: Amount (bada pehle)</option>
            <option value="name">Sort: Naam (A-Z)</option>
          </select>
          <label className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 inline-flex items-center gap-1.5 ${hideSettled ? "!bg-jama !text-white !border-jama" : ""}`}
            title="Jo khate baad me Account Settled se clear ho chuke (aaj ledger 0) unhe vasooli list se hatao" data-testid="toggle-os-hide-settled">
            <input type="checkbox" className="h-3 w-3 accent-[#1B5E20]" checked={hideSettled} onChange={(e) => setP({ hs: e.target.checked ? "1" : "0" })} data-testid="checkbox-os-hide-settled" />
            Settled chhupao{data?.hide_settled && data.settled_hidden > 0 ? ` (${data.settled_hidden})` : ""}
          </label>
          {data && (
            <ExportBar filename={`outstanding-${side}-${asOn}`} sheets={[{
              name: `Outstanding ${side.toUpperCase()} ${asOn}`,
              columns: [
                { key: "group", label: "Group", width: 20 },
                { key: "code", label: "Code", width: 8 },
                { key: "name", label: "Party", width: 32 },
                { key: "place", label: "Place", width: 16 },
                { key: "phone", label: "Phone", width: 14 },
                { key: "last_txn", label: "Last Txn", width: 12 },
                { key: "days", label: "Days", width: 7 },
                { key: "dr", label: "Dr (Lena)", width: 16, num: true },
                { key: "cr", label: "Cr (Dena)", width: 16, num: true },
                { key: "settled_text", label: "Settled", width: 18 },
              ],
              rows: flatRows.map((r) => ({ ...r, settled_text: r.settled_upto ? `Cleared upto ${r.settled_upto.split("-").reverse().join("-")}` : "" })),
              groupBy: "group",
            }]} />
          )}
        </div>
      </div>

      {!data ? (
        <div className="text-muted2 font-heading" data-testid="os-loading">Hisab lagaya ja raha hai...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
            <div className="card-flat p-4"><div className="section-title">Parties</div><div className="font-mono-data text-2xl" data-testid="os-count">{data.count}</div></div>
            <div className="card-flat p-4"><div className="section-title">Lena hai (Dr)</div><div className="font-mono-data text-2xl text-[#B71C1C]" data-testid="os-grand-dr">₹ {inr(data.grand_dr)}</div></div>
            <div className="card-flat p-4"><div className="section-title">Dena hai (Cr)</div><div className="font-mono-data text-2xl text-jama" data-testid="os-grand-cr">₹ {inr(data.grand_cr)}</div></div>
            <div className="card-flat p-4"><div className="section-title">Groups</div><div className="font-mono-data text-2xl">{data.sections.length}
              {data.hide_settled && data.settled_hidden > 0 && <span className="text-xs text-jama font-heading ml-2" data-testid="os-settled-hidden">· {data.settled_hidden} settled chhupaye</span>}</div></div>
          </div>
          <OutstandingSheet data={data} />
        </>
      )}
    </div>
  );
}
