import { useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { ClosingPreviewTable } from "./ClosingPreviewTable";
import { ArrowCounterClockwise, CaretDown, CaretUp, ClockCounterClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";

export const FiscalYearHistory = ({ history, onChanged }) => {
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setDetail(null);
    try { setDetail((await api.get(`/year-end/${id}`)).data); } catch {}
  };

  const undo = async () => {
    if (!window.confirm("Aakhri year-end UNDO karein?\n\nPurane saal ki saari entries wapas aa jayengi aur opening balances pehle jaise ho jayenge.")) return;
    setBusy(true);
    try {
      const { data } = await api.post("/year-end/undo");
      toast.success(`Undo ho gaya: FY ${data.restored_fy.fy_start} → ${data.restored_fy.fy_end} wapas active`);
      onChanged();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const years = history?.years || [];
  return (
    <div className="card-flat p-5" data-testid="fy-history">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ClockCounterClockwise size={20} weight="bold" color="#8B2520" />
          <div className="font-heading font-semibold text-lg">Band Kiye Gaye Saal</div>
        </div>
        {years.length > 0 && (
          <button className="btn-outline text-xs" onClick={undo} disabled={busy || !history.undo_possible}
            title={history.undo_possible ? "Aakhri year-end wapas lein" : "Naye saal me entries ho chuki hain – undo possible nahi"}
            data-testid="btn-undo-yearend">
            <ArrowCounterClockwise size={14} /> Aakhri Year-End Undo
          </button>
        )}
      </div>
      {years.length === 0 ? (
        <div className="text-sm text-muted2 py-3" data-testid="no-closed-years">Abhi tak koi saal band nahi kiya gaya.</div>
      ) : (
        <div className="space-y-2">
          {years.map((y) => (
            <div key={y.id} className="border border-khaki rounded-sm" data-testid={`fy-row-${y.id}`}>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-parchment/60" onClick={() => toggle(y.id)}>
                <div className="font-mono-data font-medium">FY {y.fy_start} → {y.fy_end}</div>
                <div className="text-xs text-muted2">
                  band kiya: {new Date(y.closed_at).toLocaleString("en-IN")} · bills {y.counts?.bills ?? 0} · rokad {y.counts?.rokad ?? 0} · journal {y.counts?.journal ?? 0}
                </div>
                <div className="ml-auto text-[11px] font-mono-data text-muted2 truncate max-w-[260px]">{y.backup_file}</div>
                {openId === y.id ? <CaretUp size={14} /> : <CaretDown size={14} />}
              </button>
              {openId === y.id && (
                <div className="p-3 border-t border-khaki bg-bone">
                  {detail ? (
                    <ClosingPreviewTable parties={detail.parties} accounts={detail.accounts}
                      title={`FY ${detail.fy_start} → ${detail.fy_end} ke closing balances`} />
                  ) : <div className="text-sm text-muted2">Loading...</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
