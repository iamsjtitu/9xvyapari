import { Fragment, useEffect, useState } from "react";
import { useParams, Link, useSearchParams, useOutletContext } from "react-router-dom";
import api, { inr, todayISO, formatApiErrorDetail } from "@/lib/api";
import { drcr, COL_DEBIT, COL_CREDIT } from "@/lib/drcr";
import { ArrowLeft, Receipt, Notebook, BookOpen, BookOpenText, Wallet, Printer, CheckCircle, PencilSimple, Trash, NotePencil } from "@phosphor-icons/react";
import { toast } from "sonner";
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

// Build chronological ledger rows — PASSBOOK columns (see lib/drcr.js):
//   credit = AAYA (party ko maal/paisa mila · cash a/c me paisa aaya) → balance badhta hai
//   debit  = GAYA (party ne diya · cash a/c se paisa gaya)           → balance ghatta hai
function buildRows({ bills, rokad, cash_rokad = [], journal = [], dos_journal = [] }) {
  const rows = [];
  bills.forEach((b) => rows.push({
    kind: "bill", id: b.id, date: b.date, ref: b.id, vno: b.bill_no || "",
    label: `${b.bill_type === "sale" ? "Sale" : "Purchase"} Bill ${b.bill_no}`,
    credit: b.bill_type === "sale" ? b.total : 0, debit: b.bill_type === "purchase" ? b.total : 0,
  }));
  rokad.forEach((r) => rows.push({
    kind: "rokad", id: r.id, date: r.date, vno: r.voucher_no || "", inv: r.inv_no || "", created_at: r.created_at || "",
    label: `${r.description || (r.type === "jama" ? "Payment Received" : "Payment Paid")}${r.cash_account_name ? ` · ${r.cash_account_name}` : ""}`,
    credit: r.type === "kharch" ? r.amount : 0, debit: r.type === "jama" ? r.amount : 0,
  }));
  cash_rokad.forEach((r) => rows.push({
    kind: "cash", id: r.id, date: r.date, vno: r.voucher_no || "", inv: r.inv_no || "",
    label: `${r.type === "jama" ? "Receipt" : "Payment"} · ${r.party_name || ""}${r.description ? " · " + r.description : ""}`,
    credit: r.type === "jama" ? r.amount : 0, debit: r.type === "kharch" ? r.amount : 0,
  }));
  journal.forEach((j, i) => rows.push({
    kind: "journal", id: `${j.id}-${i}`, refId: j.id, date: j.date, vno: j.voucher_no || "", created_at: j.created_at || "",
    label: `Journal${j.narration ? " · " + j.narration : ""}${j.other ? " | vs " + j.other : ""}`,
    credit: j.debit, debit: j.credit, settles_rokad_id: j.settles_rokad_id || null,
  }));
  dos_journal.forEach((j) => {
    const sgnLabel = { SR: "Sale Reg", PR: "Purchase Reg", CB: "Cash Book", JR: "Journal" }[j.sgn] || j.sgn || "DOS";
    const counter = j.other_party_name || "";
    rows.push({
      kind: "dos", id: `${j.imported_from}-${j.row_index}`, date: j.date, vno: j.ref_no || "",
      label: `${sgnLabel} · ${j.narration || ""}${counter ? " | vs " + counter : ""}${j.extra ? " (" + j.extra + ")" : ""}`,
      credit: Number(j.debit || 0), debit: Number(j.credit || 0), ref_no: j.ref_no, sgn: j.sgn,
    });
  });
  // same date → entry order (created_at); salary journal (credit) lands before its payment, settlement after its receipt
  rows.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.created_at || "").localeCompare(b.created_at || ""));
  return rows;
}

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
  const isAccount = data.kind === "account" || /CASH\s*&\s*BANK/i.test(data.party?.group_name || "") || (data.cash_rokad || []).length > 0;
  // Edit the voucher behind a ledger line, then come back here (DOS-imported rows are read-only)
  const back = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  const editHref = (r) => {
    if (r.kind === "rokad" || r.kind === "cash") return `/rokad?edit=${r.id}&return=${back}`;
    if (r.kind === "journal") return r.settles_rokad_id ? `/rokad?edit=${r.settles_rokad_id}&return=${back}` : `/journal?edit=${r.refId}&return=${back}`;
    if (r.kind === "bill") return `/bills?edit=${r.ref}&return=${back}`;
    return null;
  };
  // Delete the voucher behind a ledger line without leaving the page (confirm first)
  const deleteRow = async (r) => {
    if (r.settles_rokad_id) { if (await reopenSettled(r.settles_rokad_id, party.name)) setAttempt((a) => a + 1); return; }
    const url = r.kind === "rokad" || r.kind === "cash" ? `/rokad/${r.id}` : r.kind === "journal" ? `/journal/${r.refId}` : r.kind === "bill" ? `/bills/${r.ref}` : null;
    if (!url) return;
    const amt = r.debit || r.credit || 0;
    const what = r.kind === "bill" ? "Bill" : r.kind === "journal" ? "Journal voucher" : "Rokad entry";
    if (!window.confirm(`${what} delete karein?

${fmtDate((r.date || "").slice(0, 10))} · ${r.label}
₹ ${inr(amt)}

Yeh wapas nahi aayega${r.kind !== "bill" && r.kind !== "journal" ? " (Transfer entry ho toh dono legs hat jayenge; Account Settled ho toh uska adjustment bhi)" : ""}.`)) return;
    try {
      await api.delete(url);
      toast.success(`${what} delete ho gaya · ₹ ${inr(amt)}`);
      setAttempt((a) => a + 1);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };
  const opening = data.opening ?? (party.opening_balance || 0);
  const rows = buildRows(data);
  let running = opening;
  const enriched = rows.map((r) => { running = running + r.credit - r.debit; return { ...r, balance: running }; });   // passbook: credit badhata hai
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
        <Link to={data.kind === "account" ? "/accounts" : "/parties"} className="btn-ghost" data-testid="ledger-back-link"><ArrowLeft size={14} /> Wapas</Link>
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
                { key: "inv", label: "INV No.", width: 12 },
                { key: "label", label: "Particulars", width: 46 },
                { key: "debit", label: COL_DEBIT(isAccount), width: 18, num: true },
                { key: "credit", label: COL_CREDIT(isAccount), width: 18, num: true },
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
        <PartyStatement firmName={settings?.firm_name} party={party} rows={enriched} opening={opening} isCash={isAccount}
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
            {party.remark && (
              <div className="mt-2 inline-flex items-start gap-1.5 text-sm text-ink bg-[#FFF8E1] border border-[#F0C674] px-2.5 py-1 max-w-xl whitespace-pre-wrap" data-testid="ledger-remark">
                <NotePencil size={16} weight="duotone" className="shrink-0 mt-0.5 text-[#B45309]" /> <span><span className="font-heading font-semibold text-xs uppercase tracking-wider text-[#B45309] mr-1">Remark:</span>{party.remark}</span>
              </div>
            )}
            {data.settled_upto && <SettledBadge date={data.settled_upto} className="mt-2" />}
          </div>
          <div className="text-right">
            <div className="section-title">Closing as on {fmtDate(asOn)}</div>
            <div className="font-mono-data text-3xl font-medium mt-1" style={{ color: balColor }} data-testid="party-balance">
              ₹ {inr(Math.abs(party.balance))} <span className="text-base">{drcr(party.balance)}</span>
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
            <span data-testid="ledger-opening">Opening{dateFrom ? ` (${fmtDate(dateFrom)} se pehle)` : ""}: ₹ {inr(Math.abs(opening))} {drcr(opening)}</span>
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
              <th style={{ width: 70 }}>V.No.</th>
              <th style={{ width: 100 }}>INV No.</th>
              <th>Vivran</th>
              <th className="num" style={{ width: 150 }} data-testid="ledger-th-debit">{COL_DEBIT(isAccount)}</th>
              <th className="num" style={{ width: 150 }} data-testid="ledger-th-credit">{COL_CREDIT(isAccount)}</th>
              <th className="num" style={{ width: 130 }}>Balance</th>
              <th className="print:hidden" style={{ width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-parchment/40" data-testid="ledger-opening-row">
              <td className="font-mono-data text-muted2 whitespace-nowrap">{dateFrom ? fmtDate(dateFrom) : ""}</td>
              <td></td><td></td>
              <td className="font-semibold uppercase text-xs tracking-wider">Opening Balance{dateFrom ? " (B/F)" : ""}</td>
              <td className="num">—</td><td className="num">—</td>
              <td className="num font-medium whitespace-nowrap" style={{ color: opening >= 0 ? "#1A1A1A" : "#1B5E20" }}>
                ₹ {inr(Math.abs(opening))} <span className={`text-[10px] ml-1 ${opening < 0 ? "text-kharch" : "text-muted2"}`}>{drcr(opening)}</span>
              </td>
              <td className="print:hidden"></td>
            </tr>
            {enriched.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-muted2">Is period me koi transaction nahi.</td></tr>
            ) : (
              enriched.map((r) => (
                <Fragment key={`${r.kind}-${r.id}`}>
                <tr>
                  <td className="font-mono-data text-muted2 whitespace-nowrap">{fmtDate((r.date || "").slice(0, 10))}</td>
                  <td className="font-mono-data text-xs text-terracotta whitespace-nowrap" title={r.kind === "bill" ? "Bill No." : r.kind === "journal" ? "Journal Voucher No." : r.kind === "dos" ? "DOS Ref" : "Rokad Voucher No."}
                    data-testid={`ledger-vno-${r.id}`}>{r.kind === "bill" && r.vno ? `Bill ${r.vno}` : r.vno || r.ref_no || "—"}</td>
                  <td className="font-mono-data text-xs text-jama whitespace-nowrap" title="Invoice No." data-testid={`ledger-inv-${r.id}`}>{r.inv || ""}</td>
                  <td className="cell-grow" title={r.label}>
                    <div className="flex items-center gap-2 min-w-0">
                      {KIND_ICON[r.kind]}
                      {r.kind === "bill" ? (
                        <Link to={`/bills/${r.ref}`} className="text-terracotta hover:underline truncate min-w-0">{r.label}</Link>
                      ) : r.kind === "dos" ? (
                        <span className="truncate min-w-0" title={`Ref: ${r.ref_no || "—"}`}>
                          <span className="font-mono-data text-[10px] uppercase text-jama mr-1">{r.sgn || "DOS"}</span>
                          {r.label.replace(/^[A-Za-z ]+· /, "")}
                          {r.ref_no && <span className="text-[10px] text-muted2 font-mono-data ml-1">[#{r.ref_no}]</span>}
                        </span>
                      ) : (
                        <span className="truncate min-w-0">{r.label}</span>
                      )}
                    </div>
                  </td>
                  <td className="num amount-kharch whitespace-nowrap" data-testid={`ledger-debit-${r.id}`}>{r.debit ? `₹ ${inr(r.debit)}` : "—"}</td>
                  <td className="num amount-jama whitespace-nowrap" data-testid={`ledger-credit-${r.id}`}>{r.credit ? `₹ ${inr(r.credit)}` : "—"}</td>
                  <td className="num font-medium whitespace-nowrap" style={{ color: r.balance >= 0 ? "#1A1A1A" : "#1B5E20" }}>
                    ₹ {inr(Math.abs(r.balance))} <span className={`text-[10px] ml-1 ${r.balance < 0 ? "text-kharch" : "text-muted2"}`} data-testid={`ledger-bal-${r.id}`}>{drcr(r.balance)}</span>
                  </td>
                  <td className="print:hidden">
                    {editHref(r) && (
                      <div className="flex items-center gap-0.5">
                        <Link to={editHref(r)} className="btn-ghost p-1.5 inline-flex" title={r.settles_rokad_id ? "Settlement wali Rokad entry edit karein" : "Voucher edit karein"}
                          data-testid={`ledger-edit-${r.kind}-${r.refId || r.ref || r.id}`}>
                          <PencilSimple size={14} />
                        </Link>
                        <button type="button" className="btn-ghost p-1.5 inline-flex !text-[#B71C1C]" onClick={() => deleteRow(r)}
                          title={r.settles_rokad_id ? "Settlement hatao (Reopen)" : "Voucher delete karein"}
                          data-testid={`ledger-del-${r.kind}-${r.refId || r.ref || r.id}`}>
                          <Trash size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {r.settles_rokad_id && (
                  <SettledMarkerRow colSpan={8} date={(r.date || "").slice(0, 10)} rokadId={r.settles_rokad_id} balance={r.balance}
                    onReopen={async () => { if (await reopenSettled(r.settles_rokad_id, party.name)) setAttempt((a) => a + 1); }} />
                )}
                </Fragment>
              ))
            )}
          </tbody>
          {enriched.length > 0 && (
            <tfoot>
              <tr className="bg-parchment/60 font-semibold" data-testid="ledger-closing-row">
                <td colSpan={6} className="text-right">CLOSING BALANCE AS ON {fmtDate(asOn)}</td>
                <td className="num font-mono-data" style={{ color: balColor }}>
                  ₹ {inr(Math.abs(party.balance))} {drcr(party.balance)}
                </td>
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </div>
    </div>
  );
}
