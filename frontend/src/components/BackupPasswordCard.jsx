import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { LockKey, Warning, Eye, EyeSlash, Key } from "@phosphor-icons/react";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN") : "");

// Backup Password: every backup (.vbk) is AES-256 locked with it — needs this software + this password to open
export const BackupPasswordCard = ({ forced = false, onDone }) => {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(forced);
  const [forgot, setForgot] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ current_password: "", login_password: "", new_password: "", confirm: "", hint: "" });

  const load = () => api.get("/backup/security").then((r) => setInfo(r.data)).catch(() => setInfo({ configured: false }));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const configured = !!info?.configured;

  const submit = async (e) => {
    e.preventDefault();
    if (f.new_password.length < 6) return toast.error("Backup password kam se kam 6 characters ka ho");
    if (f.new_password !== f.confirm) return toast.error("Dono baar same password likhein");
    if (configured && !forgot && !f.current_password) return toast.error("Purana backup password dein");
    if (configured && forgot && !f.login_password) return toast.error("Login password dein");
    setBusy(true);
    try {
      const { data } = await api.post("/backup/password", {
        new_password: f.new_password, hint: f.hint,
        current_password: configured && !forgot ? f.current_password : "",
        login_password: configured && forgot ? f.login_password : "",
      });
      toast.success(data.changed
        ? `Backup password badal gaya. Purane backups purane password se hi khulenge.${data.migrated ? ` ${data.migrated} purani file encrypt hui.` : ""}`
        : `Backup password set ho gaya.${data.migrated ? ` ${data.migrated} purani plain backup file(s) encrypt kar di gayi.` : ""}`);
      setF({ current_password: "", login_password: "", new_password: "", confirm: "", hint: "" });
      setForgot(false);
      setOpen(false);
      await load();
      onDone?.(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const pw = (key, label, testid, extra = {}) => (
    <div>
      <label className="lbl">{label}</label>
      <input type={show ? "text" : "password"} className="input-dense" value={f[key]} onChange={set(key)}
        autoComplete="new-password" data-testid={testid} {...extra} />
    </div>
  );

  return (
    <div className="card-flat p-6" data-testid="backup-password-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 grid place-items-center rounded-sm flex-shrink-0" style={{ background: configured ? "#1B5E20" : "#8B2520" }}>
            <LockKey size={20} weight="bold" color="#fff" />
          </div>
          <div>
            <div className="font-heading font-semibold text-lg">Backup Password · Encryption</div>
            <div className="text-sm text-muted2 mt-0.5 max-w-2xl">
              Har backup file (<span className="font-mono-data">.vbk</span>) AES-256 se lock hoti hai — kholne ke liye <strong>9x Vyapari + yeh password</strong> dono chahiye.
              Bina password ke backup kisi bhi software me nahi khulega.
            </div>
            {info && (
              <div className="text-xs mt-2 font-mono-data" data-testid="backup-password-status">
                {configured ? (
                  <span className="text-jama">● Set hai{info.hint ? ` · Hint: "${info.hint}"` : ""}{info.changed_at ? ` · ${fmt(info.changed_at)}` : ""}</span>
                ) : (
                  <span className="text-kharch">● Abhi set nahi — backup nahi ban sakta</span>
                )}
                {info.plain_files > 0 && <span className="text-kharch ml-2">· {info.plain_files} purani plain JSON file(s) encrypt hona baaki</span>}
              </div>
            )}
          </div>
        </div>
        {!forced && (
          <button type="button" className={open ? "btn-outline" : "btn-primary"} onClick={() => setOpen((v) => !v)} data-testid="backup-password-toggle">
            <Key size={16} weight="bold" /> {open ? "Band karein" : configured ? "Password Badlein" : "Password Set Karein"}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4 max-w-xl" data-testid="backup-password-form">
          <div className="flex items-start gap-2 p-3 border border-kharch/30 bg-kharch-bg/40 rounded-sm">
            <Warning size={16} color="#B71C1C" weight="bold" className="mt-0.5 flex-shrink-0" />
            <div className="text-xs text-ink">
              <strong>Yaad rakhein:</strong> yeh password bhool gaye to backup files <u>kabhi nahi khulengi</u> — koi recovery nahi hai. Kahin surakshit likh kar rakhein (hint bhi daal sakte hain).
            </div>
          </div>
          {configured && !forgot && pw("current_password", "Purana Backup Password", "backup-current-password", { autoComplete: "current-password" })}
          {configured && forgot && pw("login_password", "Aapka Login Password (pehchaan ke liye)", "backup-login-password", { autoComplete: "current-password" })}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pw("new_password", configured ? "Naya Backup Password" : "Backup Password (min 6)", "backup-new-password")}
            {pw("confirm", "Dobara likhein", "backup-confirm-password")}
          </div>
          <div>
            <label className="lbl">Hint (optional — file me dikhega, password nahi)</label>
            <input className="input-dense" value={f.hint} onChange={set("hint")} placeholder="Eg: Dukaan ka purana naam" maxLength={120} data-testid="backup-password-hint" />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <button type="button" className="btn-ghost text-xs inline-flex items-center gap-1" onClick={() => setShow((v) => !v)} data-testid="backup-password-show">
                {show ? <EyeSlash size={14} /> : <Eye size={14} />} {show ? "Chhupayein" : "Dikhayein"}
              </button>
              {configured && (
                <button type="button" className="btn-ghost text-xs" onClick={() => setForgot((v) => !v)} data-testid="backup-password-forgot">
                  {forgot ? "Purana password yaad hai" : "Purana password bhool gaye?"}
                </button>
              )}
            </div>
            <button type="submit" className="btn-primary" disabled={busy} data-testid="backup-password-submit">
              <LockKey size={16} weight="bold" /> {configured ? "Password Badlein" : "Set Karein"}
            </button>
          </div>
          {configured && forgot && (
            <div className="text-xs text-kharch" data-testid="backup-password-forgot-note">
              Note: purane backups purane password se hi khulenge — naya password sirf aage ki backups par lagega.
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default BackupPasswordCard;
