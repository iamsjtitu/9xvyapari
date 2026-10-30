import { inr } from "@/lib/api";
import { drcr } from "@/lib/drcr";
import { BRAND, appVersionLabel } from "@/lib/brand";
import { splitT } from "@/components/PartyTFormat";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

const Side = ({ side, t, title, asOn, dateFrom, moolLabel }) => {
  const list = t[side];
  const memo = side === "left" ? t.leftMemo : t.rightMemo;
  const mool = side === "left" ? t.leftMool : t.rightMool;
  return (
    <div className="db-side" data-testid={`stmt-tside-${side}`}>
      <div className="dos-stmt-row dos-head db-row"><span className="dt">Date</span><span className="pt">{title}</span><span className="rf">V.No</span><span className="iv">INV No</span><span className="am">Amount</span></div>
      {t.bf.side === side && t.bf.amount > 0 && (
        <div className="dos-stmt-row db-row db-bold"><span className="dt">{dateFrom ? fmtDate(dateFrom) : ""}</span><span className="pt">OPENING BALANCE B/F</span><span className="rf"></span><span className="iv"></span><span className="am">{inr(t.bf.amount)}</span></div>
      )}
      {list.map((r) => (
        <div className="dos-stmt-row db-row" key={`${r.kind}-${r.id}`}>
          <span className="dt">{fmtDate((r.date || "").slice(0, 10))}</span>
          <span className="pt" title={r.label}>{r.memo ? r.label.replace(/ \(memo[^)]*\)$/, "") : r.label}</span>
          <span className="rf">{r.vno || r.ref_no || ""}</span>
          <span className="iv">{r.inv || ""}</span>
          <span className="am">{inr(r.amount)}</span>
        </div>
      ))}
      <div className="dos-stmt-row db-row db-bold db-daytotal"><span className="dt"></span><span className="pt">{moolLabel} ({list.filter((r) => !r.memo).length})</span><span className="rf"></span><span className="iv"></span><span className="am">{inr(mool)}</span></div>
      {memo > 0 && <div className="dos-stmt-row db-row db-bold"><span className="dt"></span><span className="pt">TOTAL BYAJ ({list.filter((r) => r.memo).length}) · mool me nahi</span><span className="rf"></span><span className="iv"></span><span className="am">{inr(memo)}</span></div>}
      {t.cf.side === side && (
        <div className="dos-stmt-row db-row db-bold db-closing"><span className="dt">{fmtDate(asOn)}</span><span className="pt">CLOSING BALANCE C/F · {drcr(t.cf.negative ? -t.cf.amount : t.cf.amount)}</span><span className="rf"></span><span className="iv"></span><span className="am">{inr(t.cf.amount)}</span></div>
      )}
      <div className="dos-stmt-row db-row dos-total"><span className="dt"></span><span className="pt">TOTAL</span><span className="rf"></span><span className="iv"></span><span className="am">{inr(side === "left" ? t.grandLeft : t.grandRight)}</span></div>
    </div>
  );
};

// DOS-style printable party T-account (Jama | Kharch) — used for print when the T-format view is active
export const PartyTStatement = ({ firmName, party, rows, opening, closing, isCash, dateFrom, asOn }) => {
  const t = splitT(rows, opening, closing, isCash);
  const period = dateFrom ? `${fmtDate(dateFrom)} To ${fmtDate(asOn)}` : `Upto ${fmtDate(asOn)}`;
  return (
    <div className="dos-sheet dos-stmt card-flat p-5" id="party-t-printable" data-testid="party-t-statement">
      <div className="text-center">
        <div className="font-bold text-base uppercase tracking-wide">{firmName || BRAND.app}</div>
        <div className="font-bold uppercase">{party.name}{party.code ? ` · Code ${party.code}` : ""}{party.group_name ? ` · ${party.group_name}` : ""}</div>
        <div className="uppercase">Ledger (T-Format) · Period {period}{party.remark ? ` · ${party.remark}` : ""}</div>
      </div>
      <div className="db-t mt-2">
        <Side side="left" t={t} asOn={asOn} dateFrom={dateFrom} moolLabel="TOTAL JAMA (MOOL)" title={isCash ? "Aaya / Jama" : "Jama — party ne diya / byaj"} />
        <Side side="right" t={t} asOn={asOn} dateFrom={dateFrom} moolLabel="TOTAL KHARCH (MOOL)" title={isCash ? "Gaya / Kharch" : "Kharch — party ko diya"} />
      </div>
      <div className="dos-grand flex justify-between" data-testid="party-t-closing">
        <span>CLOSING BALANCE AS ON {fmtDate(asOn)}</span>
        <span>{inr(Math.abs(closing))} {drcr(closing)} · {isCash ? (closing >= 0 ? "BALANCE" : "OVERDRAWN") : closing > 0 ? "PARTY OWES US (LENA)" : closing < 0 ? "WE OWE PARTY (DENA)" : "SETTLED"}</span>
      </div>
      <div className="flex justify-between mt-3 text-[10px] uppercase">
        <span>Byaj lines = sirf jaankari — party ke mool me nahi judti</span><span>E.&amp;O.E.</span>
        <span>Printed {new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {BRAND.app} {appVersionLabel()}</span>
      </div>
    </div>
  );
};
