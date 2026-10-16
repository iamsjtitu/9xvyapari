import { useEffect, useRef, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { CloudArrowUp, CloudArrowDown, Warning, LockKey } from "@phosphor-icons/react";
import { toast } from "sonner";
import { AutoBackupList } from "@/components/AutoBackupList";
import { BackupPasswordCard } from "@/components/BackupPasswordCard";
import { RestorePasswordDialog } from "@/components/RestorePasswordDialog";

const isVbk = (name) => /\.vbk$/i.test(name || "");

export default function Backup() {
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // File chosen for restore → password dialog
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [g, a, p, i, b, r, j] = await Promise.all([
          api.get("/account-groups"), api.get("/accounts"), api.get("/parties"),
          api.get("/items"), api.get("/bills"), api.get("/rokad"), api.get("/journal"),
        ]);
        setStats({
          groups: g.data.length, accounts: a.data.length, parties: p.data.length,
          items: i.data.length, bills: b.data.length, rokad: r.data.length, journal: j.data.length,
        });
      } catch {}
    })();
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get("/backup", { responseType: "blob" });
      const name = /filename="?([^";]+)"?/.exec(res.headers["content-disposition"] || "")?.[1]
        || `vyapari-backup_${new Date().toISOString().slice(0, 10)}_download.vbk`;
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Encrypted backup (.vbk) download ho gaya");
    } catch (err) {
      let detail = err.response?.data?.detail;
      if (err.response?.data instanceof Blob) {
        try { detail = JSON.parse(await err.response.data.text()).detail; } catch {}
      }
      toast.error(formatApiErrorDetail(detail) || err.message);
    } finally { setBusy(false); }
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setPending(file);
  };

  const doRestore = async (password) => {
    if (!pending) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", pending, pending.name);
      fd.append("password", password || "");
      const { data } = await api.post("/restore", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Restored: ${Object.entries(data.restored).map(([k, v]) => `${k}:${v}`).join(", ")}`);
      setPending(null);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="page-backup">
      <div>
        <div className="section-title">Maintenance · Backup</div>
        <h1 className="font-heading font-semibold text-3xl tracking-tight">Backup & Restore</h1>
        <div className="text-muted2 text-sm mt-1 flex items-center gap-1.5">
          <LockKey size={14} weight="bold" color="#1B5E20" /> Har backup encrypted <span className="font-mono-data">.vbk</span> file hai — sirf 9x Vyapari + Backup Password se khulti hai. (Users / Auth shamil nahi.)
        </div>
      </div>

      {stats && (
        <div className="card-flat p-5">
          <div className="section-title mb-3">Current Data</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} className="border border-khaki rounded-sm p-3 bg-parchment/50">
                <div className="text-[11px] uppercase tracking-wider text-muted2">{k}</div>
                <div className="font-mono-data text-2xl mt-1">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <BackupPasswordCard />

      <AutoBackupList />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-flat p-6">
          <div className="flex items-center gap-2 mb-3">
            <CloudArrowDown size={22} color="#1B5E20" weight="bold" />
            <div className="font-heading font-semibold text-lg">Backup (Export)</div>
          </div>
          <div className="text-sm text-muted2 mb-4">
            Sare khate, parties, items, bills, rokad, journal entries ek encrypted <span className="font-mono-data">.vbk</span> file me. Pen drive / dusre PC par safely rakhein — bina password ke koi padh nahi sakta.
          </div>
          <button className="btn-primary" onClick={download} disabled={busy} data-testid="btn-download">
            <CloudArrowDown size={16} weight="bold" /> Download Encrypted Backup (.vbk)
          </button>
        </div>

        <div className="card-flat p-6">
          <div className="flex items-center gap-2 mb-3">
            <CloudArrowUp size={22} color="#8B2520" weight="bold" />
            <div className="font-heading font-semibold text-lg">Restore (Import)</div>
          </div>
          <div className="text-sm text-muted2 mb-3">
            Backup file (<span className="font-mono-data">.vbk</span>, ya purani <span className="font-mono-data">.json</span>) chunein — Backup Password poochha jayega. Pura existing data <strong className="text-kharch">replace</strong> ho jayega.
          </div>
          <div className="flex items-start gap-2 p-3 mb-4 border border-kharch/30 bg-kharch-bg/40 rounded-sm">
            <Warning size={16} color="#B71C1C" weight="bold" className="mt-0.5" />
            <div className="text-xs text-ink">
              <strong>Warning:</strong> Restore karne se purana data permanent delete ho jayega. Pehle current data ka backup le lein.
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".vbk,.json,application/json,application/octet-stream" onChange={onPick} className="hidden" data-testid="restore-file-input" />
          <button className="btn-outline" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="btn-restore">
            <CloudArrowUp size={16} /> Backup File Upload karein
          </button>
        </div>
      </div>

      <RestorePasswordDialog
        file={pending ? { name: pending.name, encrypted: isVbk(pending.name) } : null}
        busy={busy} onCancel={() => setPending(null)} onConfirm={doRestore} />
    </div>
  );
}
