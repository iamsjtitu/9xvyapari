import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams, useOutletContext } from "react-router-dom";
import api, { inr, todayISO } from "@/lib/api";
import { ArrowLeft, Receipt, Notebook, BookOpen, BookOpenText, Wallet } from "@phosphor-icons/react";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";

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
    kind: "bill", id: b.id, date: b.date, ref: b.id,
    label: `${b.bill_type === "sale" ? "Sale" : "Purchase"} Bill ${b.bill_no}`,
    debit: b.bill_type === "sale" ? b.total : 0, credit: b.bill_type === "purchase" ? b.total : 0,
  }));
  rokad.forEach((r) => rows.push({
    kind: "rokad", id: r.id, date: r.date,
    label: r.description || (r.type === "jama" ? "Payment Received" : "Payment Paid"),
    debit: r.type === "kharch" ? r.amount : 0, credit: r.type === "jama" ? r.amount : 0,
  }));
  cash_rokad.forEach((r) => rows.push({
    kind: "cash", id: r.id, date: r.date,
    label: `${r.type === "jama" ? "Receipt" : "Payment"} · ${r.party_name || ""}${r.description ? " · " + r.description : ""}${r.voucher_no ? ` [V.${r.voucher_no}]` : ""}`,
    debit: r.type === "jama" ? r.amount : 0, credit: r.type === "kharch" ? r.amount : 0,
  }));
  journal.forEach((j, i) => rows.push({
    kind: "journal", id: `${j.id}-${i}`, date: j.date,
    label: `Journal ${j.voucher_no || ""}${j.narration ? " · " + j.narration : ""}${j.other ? " | vs " + j.other : ""}`,
    debit: j.debit, credit: j.credit,
  }));
  dos_journal.forEach((j) => {
    const sgnLabel = { SR: "Sale Reg", PR: "Purchase Reg", CB: "Cash Book", JR: "Journal" }[j.sgn] || j.sgn || "DOS";
    const counter = j.other_party_name || "";
    rows.push({
      kind: "dos", id: `${j.imported_from}-${j.row_index}`, date: j.date,
      label: `${sgnLabel} · ${j.narration || ""}${counter ? " | vs " + counter : ""}${j.extra ? " (" + j.extra + ")" : ""}`,
      debit: Number(j.debit || 0), credit: Number(j.credit || 0), ref_no: j.ref_no, sgn: j.sgn,
    });
  });
  rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return rows;
}

export default function PartyLedger() {
  const { id } = useParams();
  const { settings } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const asOn = params.get("as_on") || todayISO();
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/summary/party/${id}`, { params: { as_on: asOn } }).then((r) => setData(r.data));
  }, [id, asOn]);

  if (!data) return <div className="text-muted2 font-heading" data-testid="ledger-loading">Loading...</div>;
  const { party, dos_journal = [], journal = [], cash_rokad = [] } = data;
  const rows = buildRows(data);
  let running = party.opening_balance || 0;
  const enriched = rows.map((r) => { running = running + r.debit - r.credit; return { ...r, balance: running }; });
  const quick = [
    { l: "Aaj", d: todayISO(), tid: "ledger-quick-today" },
    { l: "FY Start", d: settings?.fy_start, tid: "ledger-quick-fystart" },
    { l: "FY End", d: settings?.fy_end, tid: "ledger-quick-fyend" },
  ].filter((q) => q.d);
  const balColor = party.balance > 0 ? "#B71C1C" : party.balance < 0 ? "#1B5E20" : "#595959";

  return (
    <div className="space-y-5" data-testid="page-party-ledger">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Link to="/parties" className="btn-ghost"><ArrowLeft size={14} /> Wapas</Link>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" data-testid="ledger-asof-controls">
            <label className="lbl !mb-0 mr-1 whitespace-nowrap">As on</label>
            <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={asOn}
              onChange={(e) => e.target.value && setParams({ as_on: e.target.value })} data-testid="input-ledger-as-on" />
            {quick.map((q) => (
              <button key={q.l} type="button" data-testid={q.tid} onClick={() => setParams({ as_on: q.d })}
                className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${asOn === q.d ? "bg-terracotta text-white border-terracotta" : ""}`}>
                {q.l}
              </button>
            ))}
          </div>
          <ExportBar filename={`ledger-${party.name.replace(/[^a-z0-9]/gi, "_")}-${asOn}`} sheets={[{
            name: `Ledger of ${party.name}`,
            columns: [
              { key: "date", label: "Date", width: 12 },
              { key: "label", label: "Narration", width: 40 },
              { key: "debit", label: "Debit", width: 14, num: true },
              { key: "credit", label: "Credit", width: 14, num: true },
              { key: "balance", label: "Balance", width: 14, num: true },
            ],
            rows: enriched,
          }]} />
        </div>
      </div>

      <FoxProPrintHeader title={`PARTY LEDGER: ${party.name.toUpperCase()}`}
        subtitle={`Code: ${party.code || "—"} · ${party.place || ""} · As on ${fmtDate(asOn)} · Closing: ₹${inr(Math.abs(party.balance))} ${party.balance > 0 ? "DR" : party.balance < 0 ? "CR" : ""}`} />

      <div className="card-flat p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">Party Khata · Ledger</div>
            <h1 className="font-heading font-semibold text-3xl tracking-tight mt-1">{party.name}</h1>
            <div className="text-muted2 text-sm mt-1">
              {party.code ? <span className="font-mono-data mr-3">Code: {party.code}</span> : null}
              {party.phone && <span className="font-mono-data mr-3">Ph: {party.phone}</span>}
              {party.address && <span>{party.address}</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="section-title">Closing as on {fmtDate(asOn)}</div>
            <div className="font-mono-data text-3xl font-medium mt-1" style={{ color: balColor }} data-testid="party-balance">
              ₹ {inr(Math.abs(party.balance))} <span className="text-base">{party.balance > 0 ? "Dr" : party.balance < 0 ? "Cr" : ""}</span>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted2 mt-1">
              {party.balance > 0 ? "Party Owes Us (Udhaar)" : party.balance < 0 ? "We Owe Party" : "Settled"}
            </div>
          </div>
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-4 py-3 border-b border-khaki flex items-center justify-between flex-wrap gap-2">
          <div className="section-title">Transaction History (upto {fmtDate(asOn)})</div>
          <div className="flex items-center gap-3 text-xs text-muted2 font-mono-data">
            <span>Opening: ₹ {inr(party.opening_balance || 0)}</span>
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
            {enriched.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted2">Koi transaction nahi.</td></tr>
            ) : (
              enriched.map((r) => (
                <tr key={`${r.kind}-${r.id}`}>
                  <td className="font-mono-data text-muted2 whitespace-nowrap">{r.date}</td>
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
                    </div>
                  </td>
                  <td className="num amount-kharch whitespace-nowrap">{r.debit ? `₹ ${inr(r.debit)}` : "—"}</td>
                  <td className="num amount-jama whitespace-nowrap">{r.credit ? `₹ ${inr(r.credit)}` : "—"}</td>
                  <td className="num font-medium whitespace-nowrap" style={{ color: r.balance >= 0 ? "#1A1A1A" : "#1B5E20" }}>
                    ₹ {inr(Math.abs(r.balance))} {r.balance < 0 && <span className="text-[10px] ml-1 text-jama">CR</span>}
                  </td>
                </tr>
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
  );
}
