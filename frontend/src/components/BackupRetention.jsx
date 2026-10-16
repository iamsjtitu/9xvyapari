import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { Broom, Check } from "@phosphor-icons/react";

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Auto-delete policy for old backups: keep last N files and/or drop files older than N days (newest always kept)
export const BackupRetention = ({ onChanged }) => {
  const [info, setInfo] = useState(null);
  const [f, setF] = useState({ keep_files: 30, keep_days: 0 });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/backup/retention").then((r) => {
    setInfo(r.data);
    setF({ keep_files: r.data.keep_files, keep_days: r.data.keep_days });
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const dirty = info && (f.keep_files !== info.keep_files || f.keep_days !== info.keep_days);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/backup/retention", f);
      setInfo(data);
      toast.success(data.deleted.length ? `Auto-delete set · ${data.deleted.length} purani backup file(s) hata di gayi` : "Auto-delete setting save ho gayi");
      onChanged?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  if (!info) return null;
  const summary = [
    f.keep_files > 0 ? `aakhri ${f.keep_files} files rahengi` : "files ki koi limit nahi",
    f.keep_days > 0 ? `${f.keep_days} din se purani hat jayengi` : null,
  ].filter(Boolean).join(", ");

  return (
    <div className="mt-4 border border-khaki rounded-sm bg-parchment/40 p-3" data-testid="backup-retention">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex items-center gap-2 mr-1">
          <Broom size={18} color="#8B2520" weight="bold" />
          <div>
            <div className="font-heading font-semibold text-sm">Purane Backup Auto-Delete</div>
            <div className="text-[11px] text-muted2" data-testid="backup-retention-stats">
              Abhi {info.count} file(s) · {fmtSize(info.total_size)}{info.oldest_at ? ` · sabse purani ${new Date(info.oldest_at).toLocaleDateString("en-IN")}` : ""}
            </div>
          </div>
        </div>
        <div>
          <label className="lbl">Sirf aakhri files rakho</label>
          <select className="input-dense h-9 text-sm !w-auto" value={f.keep_files} onChange={(e) => setF({ ...f, keep_files: Number(e.target.value) })} data-testid="select-keep-files">
            {info.file_choices.map((n) => <option key={n} value={n}>{n === 0 ? "Kabhi delete na karo" : `Last ${n} files`}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Itne din se purani hatao</label>
          <select className="input-dense h-9 text-sm !w-auto" value={f.keep_days} onChange={(e) => setF({ ...f, keep_days: Number(e.target.value) })} data-testid="select-keep-days">
            {info.day_choices.map((n) => <option key={n} value={n}>{n === 0 ? "Off" : `${n} din se purani`}</option>)}
          </select>
        </div>
        <button className={dirty ? "btn-primary" : "btn-outline"} disabled={!dirty || busy} onClick={save} data-testid="btn-save-retention">
          <Check size={14} weight="bold" /> Save & Abhi Saaf Karo
        </button>
      </div>
      <div className="text-[11px] text-muted2 mt-2" data-testid="backup-retention-summary">
        Har naye backup ke baad apne aap lagta hai: {summary}. Sabse nayi backup kabhi delete nahi hoti.
      </div>
    </div>
  );
};

export default BackupRetention;
