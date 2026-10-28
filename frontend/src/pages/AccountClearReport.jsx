import { useEffect, useState } from "react";
import { Link, useSearchParams, useOutletContext } from "react-router-dom";
import api, { formatApiErrorDetail, inr, todayISO } from "@/lib/api";
import { ExportBar } from "@/components/ExportBar";
import { AccountClearSheet } from "@/components/AccountClearSheet";
import { SettleAccountPicker } from "@/components/rokad/SettleToggle";
import { reopenSettled } from "@/components/SettledMarker";
import { Broom, ArrowCounterClockwise, Printer } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

export default function AccountClearReport() {
  const { settings } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const to = params.get("to") || todayISO();
  const from = params.has("from") ? params.get("from") : (settings?.fy_start && settings.fy_start <= to ? settings.fy_start : "");
  const ledgerId = params.get("ledger") || "";   // "" → all linked Account Clear ledgers together
  const [data, setData] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState("list");
  const [localSettings, setLocalSettings] = useState(null);

  const setP = (next) => setParams({ from: next.from ?? from ?? "", to: next.to ?? to, ...((next.ledger ?? ledgerId) ? { ledger: next.ledger ?? ledgerId } : {}) });

  useEffect(() => {
    setData(null);
    api.get("/reports/account-clear", { params: { ...(from ? { date_from: from } : {}), date_to: to, ...(ledgerId ? { ledger_id: ledgerId } : {}) } })
      .then((r) => setData(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  }, [from, to, ledgerId, attempt]);

  const quick = [
    { l: "Aaj", d: todayISO(), tid: "ac-quick-today" },
    { l: "FY End", d: settings?.fy_end, tid: "ac-quick-fyend" },
  ].filter((q) => q.d);
  const period = from ? `${fmtDate(from)} → ${fmtDate(to)}` : `upto ${fmtDate(to)}`;
  const multi = (data?.ledgers?.length || 0) > 1;
  const allView = multi && !ledgerId;   // rows from several ledgers → show which one

  return (
    <div className="space-y-5" data-testid="page-account-clear">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm 9mm; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <div className="section-title">Reports · Written off</div>
          <h1 className="font-heading font-semibold text-4xl tracking-tight flex items-center gap-2">
            <Broom size={30} weight="duotone" color="#1B5E20" /> Account Clear Register
          </h1>
          <div className="text-muted2 text-sm mt-1">
            Jo bhi paisa "Account Settled" se ya manual journal se <strong>{data?.ledger?.name || "Account Clear"}</strong> me gaya — date-wise, party-wise. Chhoda hua paisa ek nazar me.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {multi && (
            <select className="input-dense h-9 text-sm !w-auto max-w-[260px]" value={ledgerId} onChange={(e) => setP({ ledger: e.target.value })} data-testid="select-ac-ledger">
              <option value="">Sab ledgers ({data.ledgers.length})</option>
              {data.ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1" data-testid="ac-controls">
            <label className="lbl !mb-0 mr-1 whitespace-nowrap">From</label>
            <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={from || ""} max={to}
              onChange={(e) => setP({ from: e.target.value })} data-testid="input-ac-from" />
            <button type="button" className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${!from ? "!bg-terracotta !text-white !border-terracotta" : ""}`}
              onClick={() => setP({ from: "" })} data-testid="ac-from-all">Shuru se</button>
            <label className="lbl !mb-0 mx-1 whitespace-nowrap">To</label>
            <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={to} min={from || undefined}
              onChange={(e) => e.target.value && setP({ to: e.target.value })} data-testid="input-ac-to" />
            {quick.map((q) => (
              <button key={q.l} type="button" data-testid={q.tid} onClick={() => setP({ to: q.d })}
                className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${to === q.d ? "!bg-terracotta !text-white !border-terracotta" : ""}`}>{q.l}</button>
            ))}
          </div>
          <button type="button" className={view === "sheet" ? "btn-primary" : "btn-outline"} onClick={() => setView(view === "sheet" ? "list" : "sheet")}
            title="DOS-style register (print layout)" data-testid="btn-ac-toggle-sheet">
            <Printer size={14} /> {view === "sheet" ? "List View" : "Register (Print)"}
          </button>
          {data && (
            <ExportBar filename={`account-clear-${ledgerId ? (data.ledger?.name || "").toLowerCase().replace(/\s+/g, "-") + "-" : ""}${from || "start"}-${to}`}
              pdfName={`${ledgerId && data.ledger?.name ? data.ledger.name + " - " : ""}Account Clear Register ${from ? from.split("-").reverse().join("-") + " to " : "upto "}${(to || "").split("-").reverse().join("-")}`} title={`Account Clear Register · ${data.ledger?.name || ""} · ${period}`}
              sheets={[{
                name: "Account Clear",
                subtitle: `Chhoda ₹${inr(data.total_off)} · Wapas ₹${inr(data.total_back)} · Net ₹${inr(Math.abs(data.net))} ${data.net >= 0 ? "chhoda" : "wapas"} · ${data.count} entries`,
                columns: [
                  { key: "date", label: "Date", width: 12 },
                  { key: "voucher_no", label: "Journal", width: 10 },
                  { key: "party_name", label: "Party", width: 32 },
                  ...(allView ? [{ key: "ledger_name", label: "Ledger", width: 22 }] : []),
                  { key: "rokad_vno", label: "Rokad V.No.", width: 11 },
                  { key: "rokad_inv", label: "INV No.", width: 12 },
                  { key: "off", label: "Chhoda (Off)", width: 15, num: true },
                  { key: "back", label: "Wapas (Back)", width: 15, num: true },
                  { key: "narration", label: "Narration", width: 60 },
                ],
                rows: data.rows.map((r) => ({ ...r, off: r.side === "off" ? r.amount : "", back: r.side === "back" ? r.amount : "" })),
              }]} />
          )}
        </div>
      </div>

      {data && !data.ledger && (
        <div className="card-flat p-5 print:hidden" data-testid="ac-no-ledger">
          <div className="font-heading font-semibold mb-1">Abhi koi "Account Clear" ledger link nahi hai</div>
          <div className="text-sm text-muted2 mb-3">Ek baar ledger link karein — phir Rokad me "Account Settled" aur yeh register kaam karega.</div>
          <SettleAccountPicker settings={localSettings || settings || {}} onSaved={(d) => { setLocalSettings(d); setAttempt((a) => a + 1); }} />
        </div>
      )}

      {!data ? (
        <div className="text-muted2 font-heading" data-testid="ac-loading">Hisab lagaya ja raha hai...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
            <div className="card-flat p-4"><div className="section-title">Entries</div><div className="font-mono-data text-2xl" data-testid="ac-count">{data.count}</div></div>
            <div className="card-flat p-4"><div className="section-title">Chhoda (party ka baki)</div><div className="font-mono-data text-2xl text-[#B71C1C]" data-testid="ac-total-off">₹ {inr(data.total_off)}</div></div>
            <div className="card-flat p-4"><div className="section-title">Wapas (apna dena chhoda)</div><div className="font-mono-data text-2xl text-jama" data-testid="ac-total-back">₹ {inr(data.total_back)}</div></div>
            <div className="card-flat p-4"><div className="section-title">Net</div><div className="font-mono-data text-2xl" data-testid="ac-net">₹ {inr(Math.abs(data.net))} <span className="text-sm">{data.net >= 0 ? "chhoda" : "wapas"}</span></div></div>
          </div>

          <div className={view === "sheet" ? "" : "hidden print:block"}>
            <AccountClearSheet data={data} showLedger={allView} />
          </div>

          <div className={`card-flat overflow-hidden ${view === "sheet" ? "hidden" : "print:hidden"}`}>
            <div className="px-4 py-3 border-b border-khaki section-title">{data.ledger?.name || "Account Clear"} · {period}</div>
            <table className="dense w-full" data-testid="table-account-clear">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Date</th><th style={{ width: 80 }}>Journal</th><th>Party</th>{allView && <th style={{ width: 160 }}>Ledger</th>}<th style={{ width: 70 }}>Rokad V.</th><th style={{ width: 90 }}>INV No.</th>
                  <th className="num" style={{ width: 130 }}>Chhoda (Off)</th><th className="num" style={{ width: 130 }}>Wapas (Back)</th><th>Narration</th><th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={allView ? 10 : 9} className="py-10 text-center text-muted2" data-testid="ac-empty">Is period me Account Clear me kuch nahi gaya.</td></tr>
                ) : data.rows.map((r) => (
                  <tr key={r.journal_id} data-testid={`ac-row-${r.journal_id}`}>
                    <td className="font-mono-data text-muted2 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td><span className="kbd !text-[10px] !px-1.5 !py-0">{r.voucher_no}</span></td>
                    <td>{r.party_id ? <Link to={`/parties/${r.party_id}`} className="text-terracotta hover:underline" data-testid={`ac-party-link-${r.journal_id}`}>{r.party_name}</Link> : r.party_name}</td>
                    {allView && <td className="text-xs uppercase text-jama" data-testid={`ac-ledger-${r.journal_id}`}>{r.ledger_name}</td>}
                    <td className="font-mono-data text-muted2">{r.rokad_vno ? `V.${r.rokad_vno}` : <span className="text-[10px] uppercase">{r.auto ? "" : "manual"}</span>}</td>
                    <td className="font-mono-data text-xs text-jama whitespace-nowrap" data-testid={`ac-inv-${r.journal_id}`}>{r.rokad_inv || ""}</td>
                    <td className="num amount-kharch whitespace-nowrap">{r.side === "off" ? `₹ ${inr(r.amount)}` : "—"}</td>
                    <td className="num amount-jama whitespace-nowrap">{r.side === "back" ? `₹ ${inr(r.amount)}` : "—"}</td>
                    <td className="text-xs text-muted2 cell-grow" title={r.narration}>{r.narration}</td>
                    <td>
                      {r.auto && (
                        <button type="button" className="btn-ghost p-1.5 text-jama" title="Reopen — settlement hatao"
                          onClick={async () => { if (await reopenSettled(r.rokad_id, r.party_name)) setAttempt((a) => a + 1); }}
                          data-testid={`ac-reopen-${r.journal_id}`}>
                          <ArrowCounterClockwise size={14} weight="bold" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-parchment/60 font-semibold" data-testid="ac-total-row">
                    <td colSpan={allView ? 6 : 5} className="text-right">TOTAL ({data.count})</td>
                    <td className="num font-mono-data">₹ {inr(data.total_off)}</td>
                    <td className="num font-mono-data">₹ {inr(data.total_back)}</td>
                    <td colSpan={2} className="text-xs">Net {data.net >= 0 ? "chhoda" : "wapas"}: ₹ {inr(Math.abs(data.net))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
