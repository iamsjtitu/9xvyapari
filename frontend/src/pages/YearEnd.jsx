import { useCallback, useEffect, useState } from "react";
import api, { formatApiErrorDetail, inr } from "@/lib/api";
import { ClosingPreviewTable } from "@/components/yearend/ClosingPreviewTable";
import { FiscalYearHistory } from "@/components/yearend/FiscalYearHistory";
import { CalendarCheck, Warning, ArrowFatLinesRight } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function YearEnd() {
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState(null);
  const [newFy, setNewFy] = useState({ fy_start: "", fy_end: "" });
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setPreview(null);
    try {
      const [p, h] = await Promise.all([api.get("/year-end/preview"), api.get("/year-end/history")]);
      setPreview(p.data);
      setNewFy(p.data.suggested);
      setHistory(h.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const close = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/year-end/close", { ...newFy, confirm });
      toast.success(`Naya saal shuru! FY ${data.new_fy.fy_start} → ${data.new_fy.fy_end}. ${data.carried} ledgers carry-forward, backup: ${data.backup_file}`);
      setConfirm(""); setAck(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const canClose = ack && confirm.trim().toUpperCase() === (preview?.confirm_text || "NAYA SAAL") && !busy;
  const c = preview?.counts || {};

  return (
    <div className="space-y-5" data-testid="page-yearend">
      <div>
        <div className="section-title">Maintenance · Year-End</div>
        <h1 className="font-heading font-semibold text-3xl tracking-tight">Naya Saal (Carry Forward)</h1>
        <div className="text-muted2 text-sm mt-1">
          Saal band karein: sabhi party aur cash/bank ke closing balance naye saal ka opening ban jaate hain. Purane saal ki entries archive ho jaati hain.
        </div>
      </div>

      {!preview ? (
        <div className="text-muted2 font-heading" data-testid="yearend-loading">Closing balances nikal rahe hain...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card-flat p-5 lg:col-span-2">
              <div className="section-title mb-3 flex items-center gap-2"><CalendarCheck size={14} /> Financial Year</div>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <div className="lbl">Chalu Saal</div>
                  <div className="font-mono-data text-lg" data-testid="current-fy">{preview.fy_start} → {preview.fy_end}</div>
                </div>
                <ArrowFatLinesRight size={22} className="mb-2 text-terracotta" weight="bold" />
                <div>
                  <label className="lbl">Naya Saal Se</label>
                  <input type="date" className="input-dense" value={newFy.fy_start}
                    onChange={(e) => setNewFy({ ...newFy, fy_start: e.target.value })} data-testid="input-new-fy-start" />
                </div>
                <div>
                  <label className="lbl">Tak</label>
                  <input type="date" className="input-dense" value={newFy.fy_end}
                    onChange={(e) => setNewFy({ ...newFy, fy_end: e.target.value })} data-testid="input-new-fy-end" />
                </div>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-4 text-center">
                {[["Bills", c.bills], ["Rokad", c.rokad], ["Journal", c.journal], ["DOS Journal", c.dos_journal], ["Inward", c.inward], ["GST", c.gst_returns]].map(([l, v]) => (
                  <div key={l} className="border border-khaki rounded-sm p-2 bg-parchment/50">
                    <div className="text-[10px] uppercase tracking-wider text-muted2">{l}</div>
                    <div className="font-mono-data text-lg" data-testid={`count-${l.toLowerCase().replace(" ", "-")}`}>{v ?? 0}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-muted2 mt-2">Yeh sab entries archive ho jayengi (Band Kiye Gaye Saal me dekh sakte hain). Pending bills: {preview.pending_bills} — unka baki opening balance me shamil hai.</div>
            </div>

            <div className="card-flat p-5">
              <div className="section-title mb-3">Carry Forward Total</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span>Dr (lena hai)</span><span className="font-mono-data" data-testid="carry-dr">₹ {inr(preview.totals.carry_dr)}</span></div>
                <div className="flex justify-between text-sm"><span>Cr (dena hai)</span><span className="font-mono-data text-kharch" data-testid="carry-cr">₹ {inr(preview.totals.carry_cr)}</span></div>
                <div className="flex justify-between text-sm border-t border-khaki pt-2"><span>P&amp;L ledgers reset</span><span className="font-mono-data">{preview.totals.reset_count}</span></div>
              </div>
            </div>
          </div>

          <ClosingPreviewTable parties={preview.parties} accounts={preview.accounts} />

          <div className="card-flat p-5 border-kharch/40" data-testid="yearend-danger">
            <div className="flex items-start gap-2 mb-3">
              <Warning size={18} color="#B71C1C" weight="bold" className="mt-0.5" />
              <div className="text-sm">
                <strong>Dhyan dein:</strong> Pehle automatic full backup banega (Backups folder me <span className="font-mono-data">yearend_...</span>), phir entries archive hongi aur opening balance update honge.
                Jab tak naye saal me koi entry nahi hoti, "Undo" se wapas la sakte hain. Year-end ke baad DOS migration dobara na chalayein.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="ack-checkbox" />
                Maine closing balances check kar liye hain
              </label>
              <div className="w-56">
                <input className="input-dense font-mono-data" placeholder={`Likhein: ${preview.confirm_text}`} value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} data-testid="input-confirm-text" />
              </div>
              <button className="btn-primary" disabled={!canClose} onClick={close} data-testid="btn-close-year">
                <CalendarCheck size={16} weight="bold" /> {busy ? "Ho raha hai..." : "Naya Saal Shuru Karein"}
              </button>
            </div>
          </div>
        </>
      )}

      {history && <FiscalYearHistory history={history} onChanged={load} />}
    </div>
  );
}
