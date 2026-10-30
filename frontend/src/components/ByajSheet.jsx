import { inr } from "@/lib/api";
import { BRAND, appVersionLabel } from "@/lib/brand";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

const Side = ({ rows, title, total, testId }) => (
  <div className="db-side" data-testid={testId}>
    <div className="dos-stmt-row dos-head db-row"><span className="dt">Date</span><span className="pt">{title}</span><span className="rf">V.No</span><span className="iv">INV No</span><span className="am">Amount</span></div>
    {rows.length === 0 && <div className="dos-stmt-row db-row"><span className="dt"></span><span className="pt">-- nil --</span><span className="rf"></span><span className="iv"></span><span className="am"></span></div>}
    {rows.map((e) => (
      <div className="dos-stmt-row db-row" key={e.id}>
        <span className="dt">{fmtDate(e.date)}</span>
        <span className="pt" title={`${e.ledger_name} ${e.description || ""}`}>{e.ledger_name}{e.description ? ` · ${e.description}` : ""}</span>
        <span className="rf">{e.voucher_no}</span>
        <span className="iv">{e.inv_no}</span>
        <span className="am">{inr(e.amount)}</span>
      </div>
    ))}
    <div className="dos-stmt-row db-row db-bold db-daytotal"><span className="dt"></span><span className="pt">TOTAL ({rows.length})</span><span className="rf"></span><span className="iv"></span><span className="am">{inr(total)}</span></div>
  </div>
);

// DOS-style printable Byaj register: har reference party ka apna T (Jama | Kharch) + party total, end me grand total
export const ByajSheet = ({ data }) => {
  const { firm_name, date_from, date_to, groups, count, total_received, total_paid, net, ledgers = [] } = data;
  const period = date_from ? `${fmtDate(date_from)} To ${fmtDate(date_to)}` : `Upto ${fmtDate(date_to)}`;
  return (
    <div className="dos-sheet dos-stmt card-flat p-5" id="byaj-printable" data-testid="byaj-sheet">
      <div className="text-center">
        <div className="font-bold text-base uppercase tracking-wide">{firm_name || BRAND.app}</div>
        <div className="font-bold uppercase">Byaj Register · Interest Received / Paid · Party-wise</div>
        <div className="uppercase">Period {period} · {groups.length} parties · {count} entries</div>
        <div className="text-[10px] uppercase">Ledgers: {ledgers.map((l) => l.name).join(", ") || "—"}</div>
      </div>
      {groups.length === 0 && <div className="dos-stmt-row mt-3"><span className="dt"></span><span className="pt">-- is period me koi byaj entry nahi --</span></div>}
      {groups.map((g) => {
        const gid = g.ref_party_id || "none";
        return (
          <div className="db-account" key={gid} data-testid={`byaj-sheet-party-${gid}`}>
            <div className="dos-stmt-row dos-group">
              <span className="pt">{g.ref_party_name}</span>
              <span className="am">AAYA {inr(g.received)}</span>
              <span className="am">GAYA {inr(g.paid)}</span>
              <span className="bl">NET {inr(Math.abs(g.net))} {g.net >= 0 ? "AAYA" : "GAYA"}</span>
            </div>
            <div className="db-t">
              <Side rows={g.entries.filter((e) => e.type === "jama")} total={g.received} title="Byaj Aaya (Jama)" testId={`byaj-sheet-jama-${gid}`} />
              <Side rows={g.entries.filter((e) => e.type === "kharch")} total={g.paid} title="Byaj Diya (Kharch)" testId={`byaj-sheet-kharch-${gid}`} />
            </div>
          </div>
        );
      })}
      <div className="dos-grand" data-testid="byaj-sheet-grand">
        <div className="dos-stmt-row dos-total"><span className="pt">GRAND TOTAL ({groups.length} parties · {count} entries)</span>
          <span className="am">AAYA {inr(total_received)}</span><span className="am">GAYA {inr(total_paid)}</span>
          <span className="bl">NET {inr(Math.abs(net))} {net >= 0 ? "AAYA" : "GAYA"}</span></div>
      </div>
      <div className="flex justify-between mt-3 text-[10px] uppercase">
        <span>Memo report — party ke mool (balance) par asar nahi · hisab byaj ledgers me</span>
        <span>E.&amp;O.E.</span>
        <span>Printed {new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {BRAND.app} {appVersionLabel()}</span>
      </div>
    </div>
  );
};
