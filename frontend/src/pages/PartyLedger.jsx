import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { ArrowLeft, Receipt, Notebook, BookOpen, Printer } from "@phosphor-icons/react";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";

// Convert Arabic numerals to Devanagari for traditional Mahajani look
const enToDevanagari = (n) => {
  const map = { "0":"०","1":"१","2":"२","3":"३","4":"४","5":"५","6":"६","7":"७","8":"८","9":"९" };
  return String(n).replace(/[0-9]/g, (d) => map[d] || d);
};

const fmtINRDev = (n) => enToDevanagari(inr(Math.abs(Number(n || 0))));

// Format YYYY-MM-DD -> "DD/MM/YYYY" in Devanagari
const fmtDateDev = (iso) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return enToDevanagari(`${d || ""}/${m || ""}/${y || ""}`);
};

export default function PartyLedger() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [mahajaniPreview, setMahajaniPreview] = useState(false);

  useEffect(() => {
    api.get(`/summary/party/${id}`).then((r) => setData(r.data));
  }, [id]);

  // Toggle body class for Mahajani-only print
  const printMahajani = () => {
    document.body.classList.add("print-mahajani");
    // Give the browser a tick to apply styles before opening print dialog
    setTimeout(() => {
      window.print();
      // Cleanup after print dialog closes
      setTimeout(() => document.body.classList.remove("print-mahajani"), 100);
    }, 50);
  };

  if (!data) return <div className="text-muted2 font-heading">Loading...</div>;
  const { party, bills, rokad } = data;

  // Build chronological ledger
  const rows = [];
  bills.forEach((b) => rows.push({
    kind: "bill",
    id: b.id,
    date: b.date,
    label: `${b.bill_type === "sale" ? "Sale" : "Purchase"} Bill ${b.bill_no}`,
    label_hi: b.bill_type === "sale"
      ? `बिक्री बिल ${b.bill_no}`
      : `खरीद बिल ${b.bill_no}`,
    debit: b.bill_type === "sale" ? b.total : 0,
    credit: b.bill_type === "purchase" ? b.total : 0,
    ref: b.id,
  }));
  rokad.forEach((r) => rows.push({
    kind: "rokad",
    id: r.id,
    date: r.date,
    label: r.description || (r.type === "jama" ? "Payment Received" : "Payment Paid"),
    label_hi: r.type === "jama" ? "रोकड़ जमा हुई" : "रोकड़ खर्च की",
    debit: r.type === "kharch" ? r.amount : 0,
    credit: r.type === "jama" ? r.amount : 0,
  }));
  rows.sort((a, b) => a.date.localeCompare(b.date));

  let running = party.opening_balance || 0;
  const enriched = rows.map((r) => {
    running = running + r.debit - r.credit;
    return { ...r, balance: running };
  });

  return (
    <div className="space-y-5" data-testid="page-party-ledger">
      {/* ===== Screen + regular print layout (hidden in mahajani print mode) ===== */}
      <div className="mahajani-hide-on-print space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link to="/parties" className="btn-ghost"><ArrowLeft size={14} /> Wapas</Link>
          <div className="flex gap-2 items-center">
            <button
              className="btn-outline"
              onClick={() => setMahajaniPreview((v) => !v)}
              data-testid="btn-mahajani-preview"
              title="Preview Mahajani (traditional) ledger style"
            >
              <BookOpen size={15} weight="bold" /> {mahajaniPreview ? "Hide Mahajani" : "Mahajani Preview"}
            </button>
            <button
              className="btn-outline"
              onClick={printMahajani}
              data-testid="btn-mahajani-print"
              title="Print in Mahajani (traditional Hindi bahi-khata) format"
            >
              <Printer size={15} weight="bold" /> Mahajani Print
            </button>
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

        {/* Inline Mahajani preview (on screen) */}
        {mahajaniPreview && (
          <MahajaniSheet party={party} enriched={enriched} />
        )}

        <div className="card-flat overflow-hidden">
          <div className="px-4 py-3 border-b border-khaki flex items-center justify-between">
            <div className="section-title">Transaction History</div>
            <div className="text-xs text-muted2 font-mono-data">
              Opening: ₹ {inr(party.opening_balance || 0)}
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
                        {r.kind === "bill" ? <Receipt size={14} color="#8B2520" /> : <Notebook size={14} color="#595959" />}
                        {r.kind === "bill" ? (
                          <Link to={`/bills/${r.ref}`} className="text-terracotta hover:underline">
                            {r.label}
                          </Link>
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

      {/* ===== Mahajani print-only layout (visible only when body.print-mahajani) ===== */}
      <div className="mahajani-print" data-testid="mahajani-print-block">
        <MahajaniSheet party={party} enriched={enriched} />
      </div>
    </div>
  );
}

function MahajaniSheet({ party, enriched }) {
  const opening = party.opening_balance || 0;
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="mahajani-page" data-testid="mahajani-sheet">
      <div className="mahajani-ganesh">॥ श्री गणेशाय नमः ॥</div>
      <div className="mahajani-title">गल्ला बही</div>
      <div className="mahajani-sub">पार्टी बहीखाता · खाता-विवरण</div>

      <div className="grid grid-cols-2 gap-4 mt-3 mb-4 text-[11pt]">
        <div>
          <div><strong>नाम:</strong> {party.name}</div>
          {party.place && <div><strong>स्थान:</strong> {party.place}</div>}
          {party.phone && <div><strong>दू.भा.:</strong> {enToDevanagari(party.phone)}</div>}
        </div>
        <div className="text-right">
          {party.code !== undefined && party.code !== null && (
            <div><strong>कोड:</strong> {enToDevanagari(party.code)}</div>
          )}
          <div><strong>दिनांक:</strong> {enToDevanagari(todayStr)}</div>
          <div>
            <strong>आज की बाकी:</strong>{" "}
            <span style={{ color: party.balance > 0 ? "#8B0000" : "#0a4d10" }}>
              ₹ {fmtINRDev(party.balance)} {party.balance > 0 ? "(नाम)" : party.balance < 0 ? "(जमा)" : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="mahajani-row head">
        <div>दिनांक</div>
        <div>विवरण</div>
        <div className="num">नाम (खर्च)</div>
        <div className="num">जमा</div>
        <div className="num">बाकी</div>
      </div>

      {/* Opening balance row */}
      <div className="mahajani-row">
        <div>—</div>
        <div><em>शुरूआती बाकी (Opening)</em></div>
        <div className="num">{opening > 0 ? `₹ ${fmtINRDev(opening)}` : "—"}</div>
        <div className="num">{opening < 0 ? `₹ ${fmtINRDev(opening)}` : "—"}</div>
        <div className="num">₹ {fmtINRDev(opening)} {opening < 0 ? "(जमा)" : opening > 0 ? "(नाम)" : ""}</div>
      </div>

      {enriched.length === 0 ? (
        <div className="mahajani-row">
          <div>—</div>
          <div colSpan={4} style={{ gridColumn: "span 4", textAlign: "center", fontStyle: "italic" }}>
            कोई लेनदेन नहीं
          </div>
        </div>
      ) : (
        enriched.map((r) => (
          <div className="mahajani-row" key={`m-${r.kind}-${r.id}`}>
            <div>{fmtDateDev(r.date)}</div>
            <div>{r.label_hi || r.label}</div>
            <div className="num">{r.debit ? `₹ ${fmtINRDev(r.debit)}` : "—"}</div>
            <div className="num">{r.credit ? `₹ ${fmtINRDev(r.credit)}` : "—"}</div>
            <div className="num">
              ₹ {fmtINRDev(r.balance)}{" "}
              <span style={{ fontSize: "9pt", color: r.balance < 0 ? "#0a4d10" : "#8B0000" }}>
                {r.balance < 0 ? "(जमा)" : r.balance > 0 ? "(नाम)" : ""}
              </span>
            </div>
          </div>
        ))
      )}

      <div className="mahajani-footer">
        <div className="flex justify-between items-center">
          <div>
            <strong>अंतिम बाकी:</strong>{" "}
            <span style={{ color: party.balance > 0 ? "#8B0000" : "#0a4d10", fontWeight: 700 }}>
              ₹ {fmtINRDev(party.balance)} {party.balance > 0 ? "(पार्टी से लेना)" : party.balance < 0 ? "(पार्टी को देना)" : "(निपटा हुआ)"}
            </span>
          </div>
          <div style={{ fontSize: "10pt", color: "#6b3a0f" }}>
            ~ शुभम् भवतु ~
          </div>
        </div>
      </div>
    </div>
  );
}
