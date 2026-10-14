import { useEffect, useRef, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { CloudArrowUp, CloudArrowDown, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { AutoBackupList } from "@/components/AutoBackupList";

export default function Backup() {
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
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
      const { data } = await api.get("/backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `9x-vyapari-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup download ho gaya");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const onRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Sara existing data REPLACE ho jayega. Continue?")) {
      e.target.value = ""; return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const { data } = await api.post("/restore", json);
      toast.success(`Restored: ${Object.entries(data.restored).map(([k, v]) => `${k}:${v}`).join(", ")}`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-5" data-testid="page-backup">
      <div>
        <div className="section-title">Maintenance · Backup</div>
        <h1 className="font-heading font-semibold text-3xl tracking-tight">Backup & Restore</h1>
        <div className="text-muted2 text-sm mt-1">JSON file me sara data export / import karein. (Users / Auth shamil nahi.)</div>
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

      <AutoBackupList />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-flat p-6">
          <div className="flex items-center gap-2 mb-3">
            <CloudArrowDown size={22} color="#1B5E20" weight="bold" />
            <div className="font-heading font-semibold text-lg">Backup (Export)</div>
          </div>
          <div className="text-sm text-muted2 mb-4">
            Sare khate, parties, items, bills, rokad, journal entries ek JSON file me. Apne computer me safely rakhein.
          </div>
          <button className="btn-primary" onClick={download} disabled={busy} data-testid="btn-download">
            <CloudArrowDown size={16} weight="bold" /> Download JSON Backup
          </button>
        </div>

        <div className="card-flat p-6">
          <div className="flex items-center gap-2 mb-3">
            <CloudArrowUp size={22} color="#8B2520" weight="bold" />
            <div className="font-heading font-semibold text-lg">Restore (Import)</div>
          </div>
          <div className="text-sm text-muted2 mb-3">
            Pehle ki backup file upload karein. Pura existing data <strong className="text-kharch">replace</strong> ho jayega.
          </div>
          <div className="flex items-start gap-2 p-3 mb-4 border border-kharch/30 bg-kharch-bg/40 rounded-sm">
            <Warning size={16} color="#B71C1C" weight="bold" className="mt-0.5" />
            <div className="text-xs text-ink">
              <strong>Warning:</strong> Restore karne se purana data permanent delete ho jayega. Pehle current data ka backup le lein.
            </div>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onRestore} className="hidden" />
          <button className="btn-outline" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="btn-restore">
            <CloudArrowUp size={16} /> JSON Backup Upload karein
          </button>
        </div>
      </div>
    </div>
  );
}
