import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle, ArrowRight } from "@phosphor-icons/react";

// Dashboard card: "Aaj ki attendance baaki" with one-tap mark-all-present (only unmarked staff)
export const AttendanceReminderCard = () => {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/staff/attendance/today").then((r) => setInfo(r.data)).catch(() => setInfo({ total: 0 }));
  useEffect(() => { load(); }, []);
  if (info === null) return <div className="card-flat p-4 h-[88px] animate-pulse" data-testid="attendance-reminder-loading" />;  // keeps layout stable
  if (info.total === 0) return null;

  const pending = info.unmarked.length;
  const markAll = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/staff/attendance/bulk", { date: info.date, mark: "P", staff_ids: info.unmarked.map((s) => s.id), only_unmarked: true });
      toast.success(`${data.marked} staff aaj Present mark ho gaye`);
      load();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className={`card-flat p-4 border-l-4 ${pending ? "border-l-[#F59E0B]" : "border-l-jama"}`} data-testid="attendance-reminder">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-title flex items-center gap-1.5"><CalendarCheck size={14} /> Aaj ki attendance</div>
          {pending ? (
            <>
              <div className="font-heading font-semibold text-lg mt-1" data-testid="attendance-pending">{pending} staff ki attendance baaki</div>
              <div className="text-xs text-muted2 mt-0.5 truncate max-w-md" title={info.unmarked.map((s) => s.name).join(", ")}>{info.unmarked.map((s) => s.name).join(", ")}</div>
            </>
          ) : (
            <div className="font-heading font-semibold text-lg mt-1 text-jama flex items-center gap-1.5" data-testid="attendance-done"><CheckCircle size={18} weight="fill" /> Sab {info.total} staff ki attendance ho gayi</div>
          )}
          <div className="text-[11px] text-muted2 font-mono-data mt-1">P {info.counts.P} · H {info.counts.H} · A {info.counts.A} · C {info.counts.C} · {info.marked}/{info.total} marked</div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {pending > 0 && (
            <button className="btn-primary !h-8 text-xs" onClick={markAll} disabled={busy} data-testid="attendance-mark-all">
              <CheckCircle size={14} weight="bold" /> {busy ? "..." : `Sab ${pending} Present`}
            </button>
          )}
          <Link to="/staff/attendance" className="btn-outline !h-8 text-xs" data-testid="attendance-open">Attendance kholo <ArrowRight size={12} /></Link>
        </div>
      </div>
    </div>
  );
};

export default AttendanceReminderCard;
