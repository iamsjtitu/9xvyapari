import { useEffect, useMemo, useState } from "react";
import api, { formatApiErrorDetail, todayISO } from "@/lib/api";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle, Printer } from "@phosphor-icons/react";
import { FoxProPrintHeader } from "@/components/ExportBar";
import { MonthPicker, MARK_META, MARK_CYCLE, thisMonth, monthLabel, StaffPageHeader } from "@/components/staff/common";

const nextMark = (cur) => MARK_CYCLE[(MARK_CYCLE.indexOf(cur ?? null) + 1) % MARK_CYCLE.length];

export default function StaffAttendance() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [busyCell, setBusyCell] = useState("");
  const load = () => api.get("/staff/attendance", { params: { month } }).then((r) => setData(r.data))
    .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  useEffect(() => { setData(null); load(); /* eslint-disable-next-line */ }, [month]);

  const today = todayISO();
  const dates = useMemo(() => (data ? Array.from({ length: data.days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`) : []), [data, month]);

  // click = cycle P → H → A → C → blank; right-click = clear
  const mark = async (staff, date, forced) => {
    if (date > today) { toast.info("Aage ki date ki attendance nahi lag sakti"); return; }
    const cur = staff.marks[date] ?? null;
    const next = forced === undefined ? nextMark(cur) : forced;
    const key = `${staff.id}:${date}`;
    setBusyCell(key);
    try {
      await api.put("/staff/attendance", { staff_id: staff.id, date, mark: next });
      setData((d) => {
        const rows = d.rows.map((r) => {
          if (r.id !== staff.id) return r;
          const marks = { ...r.marks }; if (next) marks[date] = next; else delete marks[date];
          const counts = { P: 0, H: 0, A: 0, C: 0 }; Object.values(marks).forEach((m) => { counts[m] += 1; });
          const paid_days = counts.P + counts.H * 0.5 + counts.C;
          return { ...r, marks, counts, paid_days, unmarked: d.days - Object.keys(marks).length };
        });
        return { ...d, rows };
      });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusyCell(""); }
  };

  const bulk = async (m) => {
    const date = month === thisMonth() ? today : `${month}-${String(data.days).padStart(2, "0")}`;
    const ids = data.rows.filter((r) => r.active !== false).map((r) => r.id);
    try {
      const { data: res } = await api.post("/staff/attendance/bulk", { date, mark: m, staff_ids: ids, only_unmarked: true });
      toast.success(`${res.marked} staff ko ${date.split("-").reverse().join("-")} par ${MARK_META[m].label} mark kiya`);
      load();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
  };

  return (
    <div className="space-y-4" data-testid="page-staff-attendance">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } .att-grid td, .att-grid th { font-size: 9px !important; padding: 1px 2px !important; } }`}</style>
      <StaffPageHeader title="Staff Attendance" icon={CalendarCheck} subtitle="Cell par click karo: P → H → A → C → khaali. Right-click se saaf. P/C = poora din, H = aadha, A = kata.">
        <MonthPicker value={month} onChange={setMonth} testId="att-month" />
        {month === thisMonth() && data && (
          <button className="btn-outline" onClick={() => bulk("P")} title="Jin par aaj mark nahi hai unhe Present" data-testid="btn-att-all-present">
            <CheckCircle size={14} weight="bold" /> Aaj sab Present
          </button>
        )}
        <button className="btn-outline" onClick={() => window.print()} data-testid="btn-att-print"><Printer size={14} /> Print</button>
      </StaffPageHeader>

      <div className="flex flex-wrap gap-3 text-xs print:hidden" data-testid="att-legend">
        {Object.entries(MARK_META).map(([k, m]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={`inline-flex w-5 h-5 items-center justify-center font-bold text-[11px] ${m.cls}`}>{k}</span>{m.label} <span className="text-muted2">({m.pay})</span></span>
        ))}
      </div>

      <div className="card-flat overflow-x-auto" id="att-printable">
        <div className="hidden print:block p-2"><FoxProPrintHeader title={`STAFF ATTENDANCE · ${monthLabel(month).toUpperCase()}`} subtitle="P = Present · H = Half · A = Absent · C = Choot" /></div>
        {!data ? <div className="p-8 text-center text-muted2">Loading…</div> : data.rows.length === 0 ? (
          <div className="p-10 text-center text-muted2" data-testid="att-empty">Koi active staff nahi — pehle Staff Master me add karein.</div>
        ) : (
          <table className="dense w-full att-grid select-none" data-testid="table-attendance">
            <thead>
              <tr>
                <th className="sticky left-0 bg-parchment z-10" style={{ minWidth: 150 }}>Staff</th>
                {dates.map((d, i) => {
                  const sun = data.weekdays[i] === "Sun";
                  return (
                    <th key={d} className={`!px-0 text-center ${d === today ? "bg-[#FFF8E1]" : sun ? "bg-khaki/40" : ""}`} style={{ width: 26 }} title={`${d.split("-").reverse().join("-")} ${data.weekdays[i]}`}>
                      <div className="font-mono-data text-[10px] leading-tight">{i + 1}</div>
                      <div className={`text-[8px] leading-tight ${sun ? "text-[#B71C1C]" : "text-muted2"}`}>{data.weekdays[i].slice(0, 2)}</div>
                    </th>
                  );
                })}
                <th className="num" title="Present">P</th><th className="num" title="Half">H</th><th className="num" title="Absent">A</th><th className="num" title="Choot">C</th>
                <th className="num" title="Paid days = P + H/2 + C">Din</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} data-testid={`att-row-${r.id}`}>
                  <td className="sticky left-0 bg-white font-medium whitespace-nowrap z-10">{r.name}{r.active === false && <span className="kbd !text-[8px] !px-1 !py-0 ml-1">INACTIVE</span>}</td>
                  {dates.map((d, i) => {
                    const m = r.marks[d]; const meta = m ? MARK_META[m] : null; const sun = data.weekdays[i] === "Sun";
                    const future = d > today; const busy = busyCell === `${r.id}:${d}`;
                    return (
                      <td key={d} className={`!p-0 text-center ${d === today ? "bg-[#FFF8E1]" : sun ? "bg-khaki/30" : ""}`}>
                        <button type="button" disabled={future || busy} onClick={() => mark(r, d)} onContextMenu={(e) => { e.preventDefault(); if (m) mark(r, d, null); }}
                          className={`w-6 h-6 text-[11px] font-bold leading-none ${meta ? meta.cls : "text-khaki hover:bg-khaki/60"} ${future ? "opacity-30 cursor-not-allowed" : "cursor-pointer"} ${busy ? "animate-pulse" : ""}`}
                          title={`${d.split("-").reverse().join("-")} · ${meta ? meta.label : "mark nahi"}`} data-testid={`att-cell-${r.id}-${d}`} data-mark={m || ""}>
                          {m || "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="num font-mono-data" data-testid={`att-p-${r.id}`}>{r.counts.P}</td>
                  <td className="num font-mono-data">{r.counts.H}</td>
                  <td className="num font-mono-data text-[#B71C1C]">{r.counts.A}</td>
                  <td className="num font-mono-data text-[#1565C0]">{r.counts.C}</td>
                  <td className="num font-mono-data font-semibold" data-testid={`att-days-${r.id}`}>{r.paid_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
