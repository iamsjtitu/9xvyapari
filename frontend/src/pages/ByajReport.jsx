import { useEffect, useState } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import api, { formatApiErrorDetail, inr, todayISO } from "@/lib/api";
import { ExportBar } from "@/components/ExportBar";
import { ByajPartyBlock } from "@/components/ByajPartyBlock";
import { ByajSheet } from "@/components/ByajSheet";
import { Percent, Printer } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

export default function ByajReport() {
  const { settings } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const to = params.get("to") || todayISO();
  const from = params.has("from") ? params.get("from") : (settings?.fy_start && settings.fy_start <= to ? settings.fy_start : "");
  const [data, setData] = useState(null);
  const [view, setView] = useState("blocks");
  const setP = (next) => setParams({ from: next.from ?? from ?? "", to: next.to ?? to });

  useEffect(() => {
    setData(null);
    api.get("/reports/byaj", { params: { ...(from ? { date_from: from } : {}), date_to: to } })
      .then((r) => setData(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  }, [from, to]);

  const quick = [
    { l: "Aaj", d: todayISO(), tid: "byaj-quick-today" },
    { l: "FY End", d: settings?.fy_end, tid: "byaj-quick-fyend" },
  ].filter((q) => q.d);
  const period = from ? `${fmtDate(from)} → ${fmtDate(to)}` : `upto ${fmtDate(to)}`;
  const editReturn = `/byaj-report?from=${from || ""}&to=${to}`;
  const excelRows = (data?.groups || []).flatMap((g) => [
    ...g.entries.map((e) => ({ party: g.ref_party_name, date: fmtDate(e.date), voucher_no: e.voucher_no, inv_no: e.inv_no, ledger: e.ledger_name,
      vivran: `${e.cash_account_name ? `[${e.cash_account_name}] ` : ""}${e.description || ""}`, received: e.type === "jama" ? e.amount : "", paid: e.type === "kharch" ? e.amount : "" })),
    { party: `TOTAL — ${g.ref_party_name}`, received: g.received, paid: g.paid, vivran: `Net ₹${inr(Math.abs(g.net))} ${g.net >= 0 ? "aaya" : "gaya"}` },
  ]);

  return (
    <div className="space-y-5" data-testid="page-byaj-report">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm 9mm; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <div className="section-title">Reports · Interest</div>
          <h1 className="font-heading font-semibold text-4xl tracking-tight flex items-center gap-2">
            <Percent size={30} weight="duotone" color="#1B5E20" /> Byaj Report
          </h1>
          <div className="text-muted2 text-sm mt-1">
            Jin ledgers ke naam me <strong>INTEREST / BYAJ</strong> hai unki Rokad entries — <strong>"Kiska?"</strong> party ke hisab se, har party ka apna Jama | Kharch T-block aur total.
            {data?.ledgers?.length ? <span className="block text-xs mt-0.5" data-testid="byaj-ledger-list">Ledgers: {data.ledgers.map((l) => l.name).join(", ")}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" data-testid="byaj-controls">
            <label className="lbl !mb-0 mr-1 whitespace-nowrap">From</label>
            <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={from || ""} max={to}
              onChange={(e) => setP({ from: e.target.value })} data-testid="input-byaj-from" />
            <button type="button" className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${!from ? "!bg-terracotta !text-white !border-terracotta" : ""}`}
              onClick={() => setP({ from: "" })} data-testid="byaj-from-all">Shuru se</button>
            <label className="lbl !mb-0 mx-1 whitespace-nowrap">To</label>
            <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={to} min={from || undefined}
              onChange={(e) => e.target.value && setP({ to: e.target.value })} data-testid="input-byaj-to" />
            {quick.map((q) => (
              <button key={q.l} type="button" data-testid={q.tid} onClick={() => setP({ to: q.d })}
                className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${to === q.d ? "!bg-terracotta !text-white !border-terracotta" : ""}`}>{q.l}</button>
            ))}
          </div>
          <button type="button" className={view === "sheet" ? "btn-primary" : "btn-outline"} onClick={() => setView(view === "sheet" ? "blocks" : "sheet")}
            title="DOS-style register (print layout)" data-testid="btn-byaj-toggle-sheet">
            <Printer size={14} /> {view === "sheet" ? "T-Blocks View" : "Register (Print)"}
          </button>
          {data && (
            <ExportBar filename={`byaj-report-${from || "start"}-${to}`}
              pdfName={`Byaj Report ${from ? fmtDate(from) + " to " : "upto "}${fmtDate(to)}`} title={`Byaj Report · ${period}`}
              sheets={[{
                name: "Byaj",
                subtitle: `Aaya ₹${inr(data.total_received)} · Gaya ₹${inr(data.total_paid)} · Net ₹${inr(Math.abs(data.net))} ${data.net >= 0 ? "aaya" : "gaya"} · ${data.groups.length} parties · ${data.count} entries`,
                columns: [
                  { key: "party", label: "Kiska (Party)", width: 30 },
                  { key: "date", label: "Date", width: 12 },
                  { key: "voucher_no", label: "V.No.", width: 8 },
                  { key: "inv_no", label: "INV No.", width: 12 },
                  { key: "ledger", label: "Ledger", width: 24 },
                  { key: "vivran", label: "Vivran", width: 40 },
                  { key: "received", label: "Byaj Aaya (Jama)", width: 16, num: true },
                  { key: "paid", label: "Byaj Gaya (Kharch)", width: 16, num: true },
                ],
                rows: excelRows,
              }]} />
          )}
        </div>
      </div>

      {!data ? (
        <div className="text-muted2 font-heading" data-testid="byaj-loading">Hisab lagaya ja raha hai...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
            <div className="card-flat p-4"><div className="section-title">Parties · Entries</div><div className="font-mono-data text-2xl" data-testid="byaj-count">{data.groups.length} <span className="text-sm text-muted2">· {data.count}</span></div></div>
            <div className="card-flat p-4"><div className="section-title">Byaj Aaya (Jama)</div><div className="font-mono-data text-2xl text-jama" data-testid="byaj-total-received">₹ {inr(data.total_received)}</div></div>
            <div className="card-flat p-4"><div className="section-title">Byaj Gaya (Kharch)</div><div className="font-mono-data text-2xl text-[#B71C1C]" data-testid="byaj-total-paid">₹ {inr(data.total_paid)}</div></div>
            <div className="card-flat p-4"><div className="section-title">Net</div><div className="font-mono-data text-2xl" data-testid="byaj-net">₹ {inr(Math.abs(data.net))} <span className="text-sm">{data.net >= 0 ? "aaya" : "gaya"}</span></div></div>
          </div>

          <div className={view === "sheet" ? "" : "hidden print:block"}>
            <ByajSheet data={data} />
          </div>

          <div className={`space-y-6 ${view === "sheet" ? "hidden" : "print:hidden"}`} data-testid="byaj-blocks">
            {data.ledgers.length === 0 ? (
              <div className="card-flat p-6 text-sm text-muted2" data-testid="byaj-no-ledger">
                Koi ledger nahi mila jiske naam me <b>INTEREST</b> ya <b>BYAJ</b> ho. Accounts me ek ledger banayein (jaise <b>INTEREST RECEIVED</b> under BYAJ group) aur Rokad me us par entry karein — "Kiska?" me party chunein.
              </div>
            ) : data.groups.length === 0 ? (
              <div className="card-flat p-6 text-sm text-muted2" data-testid="byaj-empty">Is period ({period}) me koi byaj entry nahi.</div>
            ) : data.groups.map((g) => <ByajPartyBlock key={g.ref_party_id || "none"} g={g} editReturn={editReturn} />)}
          </div>
        </>
      )}
    </div>
  );
}
