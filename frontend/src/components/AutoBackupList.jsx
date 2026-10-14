import { useCallback, useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { ClockCounterClockwise, FloppyDisk, ArrowCounterClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const AutoBackupList = () => {
  const [info, setInfo] = useState({ folder: "", files: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/backup/files");
      setInfo(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const backupNow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/backup/auto", { reason: "manual" });
      toast.success(`Backup ban gaya: ${data.name}`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const restoreFile = async (name) => {
    if (!window.confirm(`"${name}" se restore karein?\n\nSara existing data REPLACE ho jayega.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/backup/restore-file", { name });
      toast.success(`Restored: ${Object.entries(data.restored).map(([k, v]) => `${k}:${v}`).join(", ")}`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="card-flat p-6" data-testid="auto-backup-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <ClockCounterClockwise size={22} color="#1B5E20" weight="bold" />
            <div className="font-heading font-semibold text-lg">Auto Backups</div>
          </div>
          <div className="text-sm text-muted2 mt-1">
            Har logout par automatic backup banta hai (last 30 rakhe jaate hain).
          </div>
          <div className="text-[11px] font-mono-data text-muted2 mt-1 break-all" data-testid="backup-folder">
            Folder: {info.folder}
          </div>
        </div>
        <button className="btn-primary whitespace-nowrap" onClick={backupNow} disabled={busy} data-testid="btn-backup-now">
          <FloppyDisk size={16} weight="bold" /> Abhi Backup Lein
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted2 py-4 text-center" data-testid="backups-loading">Loading...</div>
      ) : info.files.length === 0 ? (
        <div className="text-sm text-muted2 py-4 text-center" data-testid="no-backups">Abhi koi auto backup nahi hai.</div>
      ) : (
        <div className="overflow-auto max-h-72 border border-khaki rounded-sm">
          <table className="w-full text-sm">
            <thead className="bg-parchment/60 sticky top-0">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted2">
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Kab</th>
                <th className="px-3 py-2 text-right">Size</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {info.files.map((f) => (
                <tr key={f.name} className="border-t border-khaki/60" data-testid={`backup-row-${f.name}`}>
                  <td className="px-3 py-2 font-mono-data text-xs">{f.name}</td>
                  <td className="px-3 py-2 text-xs">{new Date(f.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 text-right font-mono-data text-xs">{fmtSize(f.size)}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="btn-outline text-xs" disabled={busy} onClick={() => restoreFile(f.name)}
                      data-testid={`btn-restore-${f.name}`}>
                      <ArrowCounterClockwise size={14} /> Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
