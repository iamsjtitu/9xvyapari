import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { ArrowLeft, Receipt, Notebook, BookOpen } from "@phosphor-icons/react";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";

export default function PartyLedger() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/summary/party/${id}`).then((r) => setData(r.data));
  }, [id]);

  if (!data) return <div className="text-muted2 font-heading">Loading...</div>;
  const { party, bills, rokad, dos_journal = [] } = data;

  // Build chronological ledger
  const rows = [];
  bills.forEach((b) => rows.push({
    kind: "bill",
    id: b.id,
    date: b.date,
    label: `${b.bill_type === "sale" ? "Sale" : "Purchase"} Bill ${b.bill_no}`,
    debit: b.bill_type === "sale" ? b.total : 0,
    credit: b.bill_type === "purchase" ? b.total : 0,
    ref: b.id,
  }));
  rokad.forEach((r) => rows.push({
    kind: "rokad",
    id: r.id,
    date: r.date,
    label: r.description || (r.type === "jama" ? "Payment Received" : "Payment Paid"),
    debit: r.type === "kharch" ? r.amount : 0,
    credit: r.type === "jama" ? r.amount : 0,
  }));
  // DOS journal (imported from AN.DBF) - historical journal entries
  dos_journal.forEach((j) => {
    const sgnLabel = ({
      SR: "Sale Reg",
      PR: "Purchase Reg",
      CB: "Cash Book",
      JR: "Journal",
    })[j.sgn] || j.sgn || "DOS";
    const counter = j.other_party_name || "";
    const label = `${sgnLabel} · ${j.narration || ""}${counter ? " | vs " + counter : ""}${j.extra ? " (" + j.extra + ")" : ""}`;
    rows.push({
      kind: "dos",
      id: `${j.imported_from}-${j.row_index}`,
      date: j.date,
      label,
      debit: Number(j.debit || 0),
      credit: Number(j.credit || 0),
      ref_no: j.ref_no,
      sgn: j.sgn,
      is_counter: !!j.is_counter_side,
    });
  });
  rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let running = party.opening_balance || 0;
  const enriched = rows.map((r) => {
    running = running + r.debit - r.credit;
    return { ...r, balance: running };
  });

  return (
    <div className="space-y-5" data-testid="page-party-ledger">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to="/parties" className="btn-ghost"><ArrowLeft size={14} /> Wapas</Link>
        <ExportBar filename={`ledger-${party.name.replace(/[^a-z0-9]/gi, "_")}`} sheets={[{
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

      <FoxProPrintHeader title={`PARTY LEDGER: ${party.name.toUpperCase()}`}
        subtitle={`Code: ${party.code || "—"} · ${party.place || ""} · Current Balance: ₹${inr(Math.abs(party.balance))} ${party.balance > 0 ? "DR" : party.balance < 0 ? "CR" : ""}`} />

      <div className="card-flat p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">Party Khata · Ledger</div>
            <h1 className="font-heading font-semibold text-3xl tracking-tight mt-1">
              {party.name}
            </h1>
            <div className="text-muted2 text-sm mt-1">
              {party.phone && <span className="font-mono-data mr-3">Ph: {party.phone}</span>}
              {party.address && <span>{party.address}</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="section-title">Baki (Current)</div>
            <div
              className="font-mono-data text-3xl font-medium mt-1"
              style={{ color: party.balance > 0 ? "#B71C1C" : party.balance < 0 ? "#1B5E20" : "#595959" }}
              data-testid="party-balance"
            >
              ₹ {inr(Math.abs(party.balance))}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted2 mt-1">
              {party.balance > 0 ? "Party Owes Us (Udhaar)" : party.balance < 0 ? "We Owe Party" : "Settled"}
            </div>
          </div>
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-4 py-3 border-b border-khaki flex items-center justify-between flex-wrap gap-2">
          <div className="section-title">Transaction History</div>
          <div className="flex items-center gap-3 text-xs text-muted2 font-mono-data">
            <span>Opening: ₹ {inr(party.opening_balance || 0)}</span>
            <span>·</span>
            <span>{enriched.length} entries</span>
            {dos_journal.length > 0 && (
              <span className="text-jama">· {dos_journal.length} from DOS</span>
            )}
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
                  <td className="font-mono-data text-muted2">{r.date}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {r.kind === "bill" ? <Receipt size={14} color="#8B2520" />
                        : r.kind === "dos" ? <BookOpen size={14} color="#1B5E20" />
                        : <Notebook size={14} color="#595959" />}
                      {r.kind === "bill" ? (
                        <Link to={`/bills/${r.ref}`} className="text-terracotta hover:underline">
                          {r.label}
                        </Link>
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
                  <td className="num amount-kharch">{r.debit ? `₹ ${inr(r.debit)}` : "—"}</td>
                  <td className="num amount-jama">{r.credit ? `₹ ${inr(r.credit)}` : "—"}</td>
                  <td className="num font-medium" style={{ color: r.balance >= 0 ? "#1A1A1A" : "#1B5E20" }}>
                    ₹ {inr(Math.abs(r.balance))} {r.balance < 0 && <span className="text-[10px] ml-1 text-jama">CR</span>}
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
