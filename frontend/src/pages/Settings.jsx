import { useEffect, useState } from "react";
import api, { formatApiErrorDetail, todayISO } from "@/lib/api";
import { FloppyDisk, Calendar } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";

export default function Settings() {
  const [form, setForm] = useState(null);

  useEffect(() => {
    api.get("/settings").then((r) => setForm(r.data));
  }, []);

  const save = async () => {
    try {
      await api.put("/settings", form);
      toast.success("Settings saved");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  if (!form) return <div className="text-muted2 font-heading">Loading...</div>;

  // Helpful FY presets
  const year = parseInt(form.fy_start?.slice(0, 4) || new Date().getFullYear());
  const presets = [
    { l: `FY ${year - 1}-${year}`, s: `${year - 1}-04-01`, e: `${year}-03-31` },
    { l: `FY ${year}-${year + 1}`, s: `${year}-04-01`, e: `${year + 1}-03-31` },
    { l: `FY ${year + 1}-${year + 2}`, s: `${year + 1}-04-01`, e: `${year + 2}-03-31` },
  ];

  return (
    <div className="space-y-5" data-testid="page-settings">
      <div>
        <div className="section-title">Maintenance · Change Date / Settings</div>
        <h1 className="font-heading font-semibold text-3xl tracking-tight">Settings</h1>
        <div className="text-muted2 text-sm mt-1">Firm name, financial year aur current working date.</div>
      </div>

      <div className="card-flat p-6 max-w-2xl space-y-5">
        <div>
          <label className="lbl">Firm Name</label>
          <input className="input-dense" value={form.firm_name || ""}
            onChange={(e) => setForm({ ...form, firm_name: e.target.value })}
            data-testid="input-firm-name" />
        </div>

        <div>
          <div className="section-title mb-2 flex items-center gap-2">
            <Calendar size={14} /> Financial Year
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">From</label>
              <input type="date" className="input-dense" value={form.fy_start}
                onChange={(e) => setForm({ ...form, fy_start: e.target.value })}
                data-testid="input-fy-start" />
            </div>
            <div>
              <label className="lbl">To</label>
              <input type="date" className="input-dense" value={form.fy_end}
                onChange={(e) => setForm({ ...form, fy_end: e.target.value })}
                data-testid="input-fy-end" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {presets.map((p) => (
              <button key={p.l} className="btn-outline text-xs"
                onClick={() => setForm({ ...form, fy_start: p.s, fy_end: p.e })}>
                {p.l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="lbl">Current Working Date</label>
          <input type="date" className="input-dense" value={form.current_date || todayISO()}
            onChange={(e) => setForm({ ...form, current_date: e.target.value })}
            data-testid="input-current-date" />
          <div className="text-[11px] text-muted2 mt-1">
            New entries by-default me ye date use hoga. Pichli date pe entry karne ke liye useful.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-khaki pt-4">
          <button className="btn-primary" onClick={save} data-testid="btn-save-settings">
            <FloppyDisk size={16} weight="bold" /> Save Settings
          </button>
        </div>
      </div>

      <ChangePasswordCard />
    </div>
  );
}
