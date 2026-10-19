import { inr } from "@/lib/api";
import { BRAND, appVersionLabel } from "@/lib/brand";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const sortByDate = (a, b) => (a.date || "").localeCompare(b.date || "") || String(a.voucher_no || "").localeCompare(String(b.voucher_no || ""), undefined, { numeric: true });

// One account's T-shaped cash book: JAMA (receipts) left | KHARCH (payments) right.
// Opening B/F sits on the Jama side (Dr) or Kharch side (Cr/overdraft); Closing C/F balances the other side.
function buildSides(acct, entries) {
  const row = (e) => ({ date: e.date, text: e.party_name || e.description || "", sub: e.description && e.party_name ? e.description : "",
    ref: e.voucher_no || e.chq_no || "", inv: e.inv_no || "", amount: e.amount });
  const jama = entries.filter((e) => e.type === "jama").sort(sortByDate).map(row);
  const kharch = entries.filter((e) => e.type === "kharch").sort(sortByDate).map(row);
  const left = [], right = [];
  if (acct.opening >= 0) left.push({ text: "OPENING BALANCE B/F", amount: acct.opening, bold: true });
  else right.push({ text: "OPENING BALANCE B/F (Cr)", amount: -acct.opening, bold: true });
  left.push(...jama);
  right.push(...kharch);
  if (Math.abs(acct.other || 0) >= 0.005) {
    (acct.other > 0 ? left : right).push({ text: "JOURNAL / ANYA ENTRIES", amount: Math.abs(acct.other), italic: true });
  }
  if (acct.closing >= 0) right.push({ text: "CLOSING BALANCE C/F", amount: acct.closing, bold: true, closing: true });
  else left.push({ text: "CLOSING BALANCE C/F (Cr)", amount: -acct.closing, bold: true, closing: true });
  const total = left.reduce((t, r) => t + r.amount, 0);
  return { left, right, total, jamaTotal: jama.reduce((t, r) => t + r.amount, 0), kharchTotal: kharch.reduce((t, r) => t + r.amount, 0) };
}

const Side = ({ rows, title, testId }) => (
  <div className="db-side" data-testid={testId}>
    <div className="dos-stmt-row dos-head db-row"><span className="dt">Date</span><span className="pt">{title}</span><span className="rf">V.No</span><span className="iv">INV No</span><span className="am">Amount</span></div>
    {rows.map((r, i) => (
      <div className={`dos-stmt-row db-row ${r.bold ? "db-bold" : ""} ${r.closing ? "db-closing" : ""}`} key={i}>
        <span className="dt">{r.date ? fmtDate(r.date) : ""}</span>
        <span className="pt" title={r.sub || r.text}>{r.text}{r.sub ? ` · ${r.sub}` : ""}</span>
        <span className="rf">{r.ref || ""}</span>
        <span className="iv">{r.inv || ""}</span>
        <span className="am">{inr(r.amount)}</span>
      </div>
    ))}
  </div>
);

export const DayBookSheet = ({ firmName, dateFrom, dateTo, accounts, entries }) => {
  const period = dateFrom === dateTo ? `Date: ${fmtDate(dateFrom)}` : `${fmtDate(dateFrom)} To ${fmtDate(dateTo)}`;
  const grand = accounts.reduce((t, a) => ({ opening: t.opening + a.opening, jama: t.jama + a.jama, kharch: t.kharch + a.kharch, closing: t.closing + a.closing }),
    { opening: 0, jama: 0, kharch: 0, closing: 0 });
  // Accounts with no movement in the period are listed compactly (saves paper on the daily print)
  const hasMove = (a) => entries.some((e) => e.cash_account_id === a.id) || Math.abs(a.other || 0) >= 0.005;
  const active = accounts.length === 1 ? accounts : accounts.filter(hasMove);
  const idle = accounts.length === 1 ? [] : accounts.filter((a) => !hasMove(a));
  return (
    <div className="dos-sheet dos-stmt card-flat p-5" id="daybook-printable" data-testid="daybook-sheet">
      <div className="text-center">
        <div className="font-bold text-base uppercase tracking-wide">{firmName || BRAND.app}</div>
        <div className="font-bold uppercase">Rokad Panna · Day Book (Cash / Bank)</div>
        <div className="uppercase">{period}{accounts.length === 1 ? ` · A/C: ${accounts[0].code ? accounts[0].code + " · " : ""}${accounts[0].name}` : ` · ${accounts.length} accounts`}</div>
      </div>

      {active.length === 0 && (
        <div className="dos-group uppercase mt-3" data-testid="daybook-no-activity">Is period me kisi bhi account me koi lenden nahi.</div>
      )}
      {active.map((a) => {
        const sides = buildSides(a, entries.filter((e) => e.cash_account_id === a.id));
        return (
          <div className="db-account" key={a.id} data-testid={`daybook-account-${a.id}`}>
            <div className="dos-group flex justify-between uppercase">
              <span>A/C: {a.code ? `${a.code} · ` : ""}{a.name}{a.group_name ? ` (${a.group_name})` : ""}</span>
              <span>Opening {inr(Math.abs(a.opening))} {a.opening < 0 ? "Cr" : "Dr"} → Closing {inr(Math.abs(a.closing))} {a.closing < 0 ? "Cr" : "Dr"}</span>
            </div>
            <div className="db-t">
              <Side rows={sides.left} title="Jama (Receipts)" testId={`daybook-jama-${a.id}`} />
              <Side rows={sides.right} title="Kharch (Payments)" testId={`daybook-kharch-${a.id}`} />
            </div>
            <div className="db-t dos-total">
              <div className="db-side"><div className="dos-stmt-row db-row"><span className="dt"></span><span className="pt">TOTAL ({sides.left.length} lines · Jama {inr(sides.jamaTotal)})</span><span className="rf"></span><span className="iv"></span><span className="am" data-testid={`daybook-total-left-${a.id}`}>{inr(sides.total)}</span></div></div>
              <div className="db-side"><div className="dos-stmt-row db-row"><span className="dt"></span><span className="pt">TOTAL ({sides.right.length} lines · Kharch {inr(sides.kharchTotal)})</span><span className="rf"></span><span className="iv"></span><span className="am" data-testid={`daybook-total-right-${a.id}`}>{inr(sides.total)}</span></div></div>
            </div>
          </div>
        );
      })}

      {idle.length > 0 && (
        <div className="db-account" data-testid="daybook-idle">
          <div className="dos-group uppercase">Anya accounts — is period me koi lenden nahi (Opening = Closing)</div>
          <div className="dos-stmt-row dos-head db-row"><span className="dt">Code</span><span className="pt">Account</span><span className="rf"></span><span className="iv"></span><span className="am">Balance</span></div>
          {idle.map((a) => (
            <div className="dos-stmt-row db-row" key={a.id} data-testid={`daybook-idle-${a.id}`}>
              <span className="dt">{a.code || ""}</span><span className="pt">{a.name}</span><span className="rf"></span><span className="iv"></span>
              <span className="am">{inr(Math.abs(a.closing))} {a.closing < 0 ? "Cr" : "Dr"}</span>
            </div>
          ))}
        </div>
      )}

      {accounts.length > 1 && (
        <div className="dos-grand" data-testid="daybook-grand">
          <div className="flex justify-between font-bold uppercase">
            <span>Sabhi Accounts</span>
            <span>Opening {inr(Math.abs(grand.opening))} {grand.opening < 0 ? "Cr" : "Dr"} + Jama {inr(grand.jama)} − Kharch {inr(grand.kharch)} = Closing {inr(Math.abs(grand.closing))} {grand.closing < 0 ? "Cr" : "Dr"}</span>
          </div>
        </div>
      )}

      <div className="flex justify-between mt-3 text-[10px] uppercase">
        <span>B/F = Baki pichhle din se · C/F = Agle din ko</span>
        <span>E.&amp;O.E.</span>
        <span>Printed {new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {BRAND.app} {appVersionLabel()}</span>
      </div>
      <div className="dos-sign"><div>Munim</div><div>Checked By</div><div>For {firmName || BRAND.app}</div></div>
    </div>
  );
};

export default DayBookSheet;
