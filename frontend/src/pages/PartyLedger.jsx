import { Fragment, useEffect, useState } from "react";
import { useParams, Link, useSearchParams, useOutletContext } from "react-router-dom";
import api, { inr, todayISO } from "@/lib/api";
import { ArrowLeft, Receipt, Notebook, BookOpen, BookOpenText, Wallet, Printer, CheckCircle } from "@phosphor-icons/react";
import { ExportBar } from "@/components/ExportBar";
import { PartyStatement } from "@/components/PartyStatement";
import { LoadState } from "@/components/LoadState";
import { SettledMarkerRow, SettledBadge, reopenSettled } from "@/components/SettledMarker";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

const KIND_ICON = {
  bill: <Receipt size={14} color="#8B2520" />,
  dos: <BookOpen size={14} color="#1B5E20" />,
  journal: <BookOpenText size={14} color="#7A3E00" />,
  cash: <Wallet size={14} color="#1B5E20" />,
  rokad: <Notebook size={14} color="#595959" />,
};

// Build chronological ledger rows (Dr = party owes more / cash a/c receives)
function buildRows({ bills, rokad, cash_rokad = [], journal = [], dos_journal = [] }) {
  const rows = [];
  bills.forEach((b) => rows.push({
    kind: "bill", id: b.id, date: b.date, ref: b.id, vno: b.bill_no || "",
    label: `${b.bill_type === "sale" ? "Sale" : "Purchase"} Bill ${b.bill_no}`,
    debit: b.bill_type === "sale" ? b.total : 0, credit: b.bill_type === "purchase" ? b.total : 0,
  }));
  rokad.forEach((r) => rows.push({
    kind: "rokad", id: r.id, date: r.date, vno: r.voucher_no || "",
    label: `${r.description || (r.type === "jama" ? "Payment Received" : "Payment Paid")}${r.cash_account_name ? ` · ${r.cash_account_name}` : ""}`,
    debit: r.type === "kharch" ? r.amount : 0, credit: r.type === "jama" ? r.amount : 0,
  }));
  cash_rokad.forEach((r) => rows.push({
    kind: "cash", id: r.id, date: r.date, vno: r.voucher_no || "",
    label: `${r.type === "jama" ? "Receipt" : "Payment"} · ${r.party_name || ""}${r.description ? " · " + r.description : ""}`,
    debit: r.type === "jama" ? r.amount : 0, credit: r.type === "kharch" ? r.amount : 0,
  }));
  journal.forEach((j, i) => rows.push({
    kind: "journal", id: `${j.id}-${i}`, date: j.date, vno: j.voucher_no || "",
    label: `Journal${j.narration ? " · " + j.narration : ""}${j.other ? " | vs " + j.other : ""}`,
    debit: j.debit, credit: j.credit, settles_rokad_id: j.settles_rokad_id || null,
  }));
  dos_journal.forEach((j) => {
    const sgnLabel = { SR: "Sale Reg", PR: "Purchase Reg", CB: "Cash Book", JR: "Journal" }[j.sgn] || j.sgn || "DOS";
    const counter = j.other_party_name || "";
    rows.push({
      kind: "dos", id: `${j.imported_from}-${j.row_index}`, date: j.date, vno: j.ref_no || "",
      label: `${sgnLabel} · ${j.narration || ""}${counter ? " | vs " + counter : ""}${j.extra ? " (" + j.extra + ")" : ""}`,
      debit: Number(j.debit || 0), credit: Number(j.credit || 0), ref_no: j.ref_no, sgn: j.sgn,
    });
  });
  rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return rows;
}

const drcr = (n) => (n < 0 ? "Cr" : n > 0 ? "Dr" : "");

export default function PartyLedger() {
  const { id } = useParams();
  const { settings } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const asOn = params.get("as_on") || todayISO();
  const hasFromParam = params.has("from");
  const dateFrom = hasFromParam ? params.get("from") : (settings?.fy_start && settings.fy_start <= asOn ? settings.fy_start : "");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState("ledger"); // ledger | statement (DOS print preview)

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api.get(`/summary/party/${id}`, { params: { as_on: asOn, ...(dateFrom ? { date_from: dateFrom } : {}) } })
      .then((r) => { if (alive) setData(r.data); })
      .catch((err) => { if (alive) setError(err); });
    return () => { alive = false; };
  }, [id, asOn, dateFrom, attempt]);

  const setRange = (next) => setParams({ as_on: next.as_on ?? asOn, from: next.from ?? dateFrom ?? "" });

  if (!data) return <LoadState error={error} onRetry={() => setAttempt((a) => a + 1)} backTo="/parties" backLabel="Party Khata par wapas" testid="ledger" />;
  const { party, dos_journal = [], journal = [], cash_rokad = [] } = data;
  const isAccount = data.kind === "account";
  const opening = data.opening ?? (party.opening_balance || 0);
  const rows = buildRows(data);
  let running = opening;
  const enriched = rows.map((r) => { running = running + r.debit - r.credit; return { ...r, balance: running }; });
  const quick = [
    { l: "Aaj", d: todayISO(), tid: "ledger-quick-today" },
    { l: "FY Start", d: settings?.fy_start, tid: "ledger-quick-fystart" },
    { l: "FY End", d: settings?.fy_end, tid: "ledger-quick-fyend" },
  ].filter((q) => q.d);
  const balColor = isAccount
    ? (party.balance < 0 ? "#B71C1C" : party.balance > 0 ? "#1A1A1A" : "#595959")  // cash/bank: Dr = paisa haath me, Cr (overdrawn) = red
    : (party.balance > 0 ? "#B71C1C" : party.balance < 0 ? "#1B5E20" : "#595959");
  const periodText = dateFrom ? `${fmtDate(dateFrom)} → ${fmtDate(asOn)}` : `upto ${fmtDate(asOn)}`;

  return (
    <div className="space-y-5" data-testid="page-party-ledger">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Link to={isAccount ? "/accounts" : "/parties"} className="btn-ghost" data-testid="ledger-back-link"><ArrowLeft size={14} /> Wapas</Link>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" data-testid="ledger-asof-controls">
            <label className="lbl !mb-0 mr-1 whitespace-nowrap">From</label>
            <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={dateFrom || ""} max={asOn}
              onChange={(e) => setRange({ from: e.target.value })} data-testid="input-ledger-from" />
            <button type="button" className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${!dateFrom ? "!bg-terracotta !text-white !border-terracotta" : ""}`}
              onClick={() => setRange({ from: "" })} title="Shuru se (sab entries)" data-testid="ledger-from-all">Shuru se</button>
            <label className="lbl !mb-0 mx-1 whitespace-nowrap">As on</label>
            <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={asOn} min={dateFrom || undefined}
              onChange={(e) => e.target.value && setRange({ as_on: e.target.value })} data-testid="input-ledger-as-on" />
            {quick.map((q) => (
              <button key={q.l} type="button" data-testid={q.tid} onClick={() => setRange({ as_on: q.d })}
                className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${asOn === q.d ? "!bg-terracotta !text-white !border-terracotta" : ""}`}>
                {q.l}
              </button>
            ))}
          </div>
          <button type="button" className={view === "statement" ? "btn-primary" : "btn-outline"} onClick={() => setView(view === "statement" ? "ledger" : "statement")}
            title="DOS-style statement (print layout)" data-testid="btn-toggle-statement">
            <Printer size={14} /> {view === "statement" ? "Ledger View" : "Statement (Print)"}
          </button>
          <ExportBar filename={`ledger-${party.name.replace(/[^a-z0-9]/gi, "_")}-${dateFrom || "start"}-${asOn}`}
            title={`Ledger · ${party.name}${party.group_name ? ` (${party.group_name})` : ""} · ${periodText}`}
            sheets={[{
              name: `Ledger of ${party.name}`,
              subtitle: `Opening ₹${inr(Math.abs(opening))} ${drcr(opening)} → Closing ₹${inr(Math.abs(party.balance))} ${drcr(party.balance)} · ${enriched.length} entries`,
              columns: [
                { key: "date", label: "Date", width: 12 },
                { key: "vno", label: "V.No. / Ref", width: 11 },
                { key: "label", label: "Particulars", width: 46 },
                { key: "debit", label: "Debit", width: 15, num: true },
                { key: "credit", label: "Credit", width: 15, num: true },
                { key: "balance_abs", label: "Balance", width: 15, num: true },
                { key: "drcr", label: "Dr/Cr", width: 6 },
              ],
              rows: [
                { date: dateFrom || "", vno: "", label: `OPENING BALANCE${dateFrom ? " (B/F)" : ""}`, debit: "", credit: "", balance_abs: Math.abs(opening), drcr: drcr(opening), _style: "opening" },
                ...enriched.map((r) => ({ ...r, balance_abs: Math.abs(r.balance), drcr: drcr(r.balance) })),
                { date: asOn, vno: "", label: `CLOSING BALANCE AS ON ${fmtDate(asOn)}`, debit: "", credit: "", balance_abs: Math.abs(party.balance), drcr: drcr(party.balance), _style: "closing" },
              ],
              rowStyle: (r) => r._style || null,
            }]} />
        </div>
      </div>

      {/* Print output = DOS statement (always); on screen only when toggled */}
      <div className={view === "statement" ? "" : "hidden print:block"}>
        <PartyStatement firmName={settings?.firm_name} party={party} rows={enriched} opening={opening}
          closing={party.balance} dateFrom={dateFrom} asOn={asOn} settledUpto={data.settled_upto} />
      </div>

      <div className={view === "statement" ? "hidden" : "space-y-5 print:hidden"}>
      <div className="card-flat p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">{isAccount ? "Account Ledger" : "Party Khata · Ledger"}{party.group_name ? ` · ${party.group_name}` : ""}</div>
            <h1 className="font-heading font-semibold text-3xl tracking-tight mt-1">{party.name}</h1>
            <div className="text-muted2 text-sm mt-1">
              {party.code ? <span className="font-mono-data mr-3">Code: {party.code}</span> : null}
              {party.phone && <span className="font-mono-data mr-3">Ph: {party.phone}</span>}
              {party.address && <span>{party.address}</span>}
            </div>
            {data.settled_upto && <SettledBadge date={data.settled_upto} className="mt-2" />}
          </div>
          <div className="text-right">
            <div className="section-title">Closing as on {fmtDate(asOn)}</div>
            <div className="font-mono-data text-3xl font-medium mt-1" style={{ color: balColor }} data-testid="party-balance">
              ₹ {inr(Math.abs(party.balance))} <span className="text-base">{party.balance > 0 ? "Dr" : party.balance < 0 ? "Cr" : ""}</span>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted2 mt-1">
              {isAccount || cash_rokad.length > 0
                ? (party.balance >= 0 ? "Balance (Cash / Bank me)" : "Overdrawn")
                : party.balance > 0 ? "Party Owes Us (Udhaar)" : party.balance < 0 ? "We Owe Party" : "Settled"}
            </div>
          </div>
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-4 py-3 border-b border-khaki flex items-center justify-between flex-wrap gap-2">
          <div className="section-title">Transaction History ({periodText})</div>
          <div className="flex items-center gap-3 text-xs text-muted2 font-mono-data">
            <span data-testid="ledger-opening">Opening{dateFrom ? ` (${fmtDate(dateFrom)} se pehle)` : ""}: ₹ {inr(Math.abs(opening))} {opening < 0 ? "Cr" : "Dr"}</span>
            <span>·</span>
            <span data-testid="ledger-entry-count">{enriched.length} entries</span>
            {cash_rokad.length > 0 && <span className="text-jama">· {cash_rokad.length} cash a/c</span>}
            {journal.length > 0 && <span>· {journal.length} journal</span>}
            {dos_journal.length > 0 && <span className="text-jama">· {dos_journal.length} from DOS</span>}
          </div>
        </div>
        <table className="dense w-full" data-testid="table-ledger">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Date</th>
              <th>Vivran</th>
              <th className="num" style={{ width: 130 }}>Debit (+)</th>
              <th className="num" style={{ width: 130 }}>Credit (-)</th>
              <th className="num" style={{ width: 130 }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-parchment/40" data-testid="ledger-opening-row">
              <td className="font-mono-data text-muted2 whitespace-nowrap">{dateFrom ? fmtDate(dateFrom) : ""}</td>
              <td className="font-semibold uppercase text-xs tracking-wider">Opening Balance{dateFrom ? " (B/F)" : ""}</td>
              <td className="num">—</td><td className="num">—</td>
              <td className="num font-medium whitespace-nowrap" style={{ color: opening >= 0 ? "#1A1A1A" : "#1B5E20" }}>
                ₹ {inr(Math.abs(opening))} {opening < 0 && <span className="text-[10px] ml-1 text-jama">CR</span>}
              </td>
            </tr>
            {enriched.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted2">Is period me koi transaction nahi.</td></tr>
            ) : (
              enriched.map((r) => (
                <Fragment key={`${r.kind}-${r.id}`}>
                <tr>
                  <td className="font-mono-data text-muted2 whitespace-nowrap">{fmtDate((r.date || "").slice(0, 10))}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {KIND_ICON[r.kind]}
                      {r.kind === "bill" ? (
                        <Link to={`/bills/${r.ref}`} className="text-terracotta hover:underline">{r.label}</Link>
                      ) : r.kind === "dos" ? (
                        <span title={`Ref: ${r.ref_no || "—"}`}>
                          <span className="font-mono-data text-[10px] uppercase text-jama mr-1">{r.sgn || "DOS"}</span>
                          {r.label.replace(/^[A-Za-z ]+· /, "")}
                          {r.ref_no && <span className="text-[10px] text-muted2 font-mono-data ml-1">[#{r.ref_no}]</span>}
                        </span>
                      ) : (
                        <span>{r.label}</span>
                      )}
                      {(r.kind === "bill" || r.kind === "journal") && r.vno ? (
                        <span className="kbd !text-[10px] !px-1.5 !py-0 whitespace-nowrap" title={r.kind === "bill" ? "Bill No." : "Journal Voucher No."}
                          data-testid={`ledger-vno-${r.id}`}>{r.kind === "bill" ? `Bill ${r.vno}` : r.vno}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="num amount-kharch whitespace-nowrap">{r.debit ? `₹ ${inr(r.debit)}` : "—"}</td>
                  <td className="num amount-jama whitespace-nowrap">{r.credit ? `₹ ${inr(r.credit)}` : "—"}</td>
                  <td className="num font-medium whitespace-nowrap" style={{ color: r.balance >= 0 ? "#1A1A1A" : "#1B5E20" }}>
                    ₹ {inr(Math.abs(r.balance))} {r.balance < 0 && <span className="text-[10px] ml-1 text-jama">CR</span>}
                  </td>
                </tr>
                {r.settles_rokad_id && (
                  <SettledMarkerRow colSpan={5} date={(r.date || "").slice(0, 10)} rokadId={r.settles_rokad_id}
                    onReopen={async () => { if (await reopenSettled(r.settles_rokad_id, party.name)) setAttempt((a) => a + 1); }} />
                )}
                </Fragment>
              ))
            )}
          </tbody>
          {enriched.length > 0 && (
            <tfoot>
              <tr className="bg-parchment/60 font-semibold" data-testid="ledger-closing-row">
                <td colSpan={4} className="text-right">CLOSING BALANCE AS ON {fmtDate(asOn)}</td>
                <td className="num font-mono-data" style={{ color: balColor }}>
                  ₹ {inr(Math.abs(party.balance))} {party.balance < 0 ? "Cr" : "Dr"}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </div>
    </div>
  );
}
