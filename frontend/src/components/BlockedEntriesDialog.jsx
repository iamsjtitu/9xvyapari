import { useNavigate } from "react-router-dom";
import { inr } from "@/lib/api";
import { ArrowSquareOut, Prohibit, X } from "@phosphor-icons/react";
import { backdropClose } from "@/lib/backdrop";
import { useEscClose } from "@/hooks/useEscClose";

const fmtDate = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "");
const KIND = { rokad: "Rokad", bill: "Bill", inward: "Inward", staff: "Staff" };
const TYPE = { jama: "Receipt", kharch: "Payment", sale: "Sale", purchase: "Purchase", inward: "Inward", staff: "Staff" };

// 409 from PUT /accounts|/parties when a group change can't move the ledger: lists the exact vouchers, one-click open to fix
export const BlockedEntriesDialog = ({ info, onClose, returnTo }) => {
  const navigate = useNavigate();
  useEscClose(onClose, !!info);
  if (!info) return null;
  const rows = info.blocking || [];
  const where = info.to === "parties" ? "Party Khata" : "Accounts (Khate)";
  const open = (r) => {
    onClose();
    const back = encodeURIComponent(returnTo || "/accounts");
    if (r.kind === "rokad") navigate(`/rokad?edit=${r.id}&return=${back}`);
    else if (r.kind === "bill") navigate(`/bills/${r.id}`);
    else if (r.kind === "inward") navigate("/inward");
    else navigate("/staff");
  };
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-[70] p-4" {...backdropClose(onClose)} data-testid="blocked-entries-dialog">
      <div className="card-flat w-full max-w-3xl p-5 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-sm flex-shrink-0" style={{ background: "#7A3E00" }}><Prohibit size={18} weight="bold" color="#fff" /></div>
            <div>
              <div className="font-heading font-semibold text-lg">"{info.ledger}" abhi {where} me nahi ja sakta</div>
              <div className="text-sm text-muted2 mt-0.5" data-testid="blocked-entries-message">{info.message}</div>
            </div>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose} data-testid="blocked-entries-close"><X size={16} /></button>
        </div>
        <div className="text-xs text-muted2 mb-2">
          {info.to === "parties"
            ? <>In Rokad entries me yeh ledger <b>Cash/Bank account (Mode)</b> ke roop me chuna gaya tha. <b>Kholo</b> → sahi Cash/Bank account chunein (ya party badlein) → Update. Aap apne-aap isi Edit form par wapas aa jaoge (group pehle se chuna hoga) — phir ek baar <b>Save</b> dabao.</>
            : <>In entries me yeh ledger <b>party</b> ke roop me use hua hai. <b>Kholo</b> → sahi party par le jao ya hatao → Update. Aap apne-aap isi Edit form par wapas aa jaoge — phir ek baar <b>Save</b> dabao.</>}
        </div>
        <div className="overflow-auto border border-khaki rounded-sm">
          <table className="dense w-full">
            <thead><tr><th style={{ width: 90 }}>Date</th><th style={{ width: 70 }}>Type</th><th style={{ width: 80 }}>V.No.</th><th>{info.to === "parties" ? "Party" : "Account / Vivran"}</th><th>Vivran</th><th className="num" style={{ width: 120 }}>Amount</th><th style={{ width: 90 }}></th></tr></thead>
            <tbody data-testid="blocked-entries-list">
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} data-testid={`blocked-entry-${r.id}`}>
                  <td className="font-mono-data text-xs">{fmtDate(r.date)}</td>
                  <td><span className="kbd !text-[10px] !px-1.5 !py-0 uppercase">{KIND[r.kind]} · {TYPE[r.type] || r.type}</span></td>
                  <td className="font-mono-data text-xs text-terracotta">{r.ref || "—"}</td>
                  <td className="truncate max-w-[220px]" title={r.other}>{r.other || "—"}</td>
                  <td className="truncate max-w-[260px] text-muted2 text-xs" title={r.description}>{r.description}</td>
                  <td className="num font-mono-data whitespace-nowrap">{r.amount != null && r.kind !== "inward" ? `₹ ${inr(r.amount)}` : r.kind === "inward" ? `${r.amount || 0} bags` : "—"}</td>
                  <td>
                    <button type="button" className="btn-outline !py-1 !px-2 text-xs inline-flex items-center gap-1" onClick={() => open(r)} data-testid={`blocked-entry-open-${r.id}`}>
                      <ArrowSquareOut size={12} /> Kholo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted2">
          <span data-testid="blocked-entries-count">{rows.length} entr{rows.length === 1 ? "y" : "ies"}{rows.length >= 100 ? " (pehli 100)" : ""}</span>
          <button type="button" className="btn-primary" onClick={onClose} data-testid="blocked-entries-ok">Theek hai</button>
        </div>
      </div>
    </div>
  );
};
