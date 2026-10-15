import { useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LockKey, UserCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

const MIN_LEN = 6;

// forced=true → first-run screen: new password is mandatory, username optional
export const ChangePasswordCard = ({ forced = false, onDone }) => {
  const { user, passwordChanged } = useAuth();
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newUser, setNewUser] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const uname = newUser.trim().toLowerCase();
    if (!nw && !uname) return toast.error("Naya password ya naya username to dein");
    if (forced && !nw) return toast.error("Naya password set karna zaroori hai");
    if (nw && nw.length < MIN_LEN) return toast.error(`Naya password kam se kam ${MIN_LEN} characters ka ho`);
    if (nw && nw !== confirm) return toast.error("Naya password aur confirm password match nahi karte");
    if (uname && !/^[a-z0-9._-]{3,32}$/.test(uname)) return toast.error("Username 3-32 chars: sirf a-z, 0-9, . _ -");
    setBusy(true);
    try {
      const body = { current_password: cur };
      if (nw) body.new_password = nw;
      if (uname) body.new_username = uname;
      const { data } = await api.post("/auth/change-password", body);
      passwordChanged?.(data);
      toast.success(
        uname && nw ? `Username "${data.username}" aur password badal gaye.`
          : uname ? `Username ab "${data.username}" hai.`
          : "Password badal gaya."
      );
      setCur(""); setNw(""); setConfirm(""); setNewUser("");
      onDone?.(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-flat p-6 max-w-3xl space-y-4" data-testid="change-password-card">
      <div className="section-title flex items-center gap-2"><LockKey size={14} /> {forced ? "Naya Password Set Karein" : "Login Username / Password Badlein"}</div>
      <div className="flex items-center gap-2 text-sm text-muted2">
        <UserCircle size={18} /> Abhi ka username: <span className="font-mono-data text-ink" data-testid="current-username">{user?.username}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="lbl">{forced ? "Abhi ka (default) Password" : "Purana Password (zaroori)"}</label>
          <input type="password" className="input-dense" value={cur} required autoComplete="current-password" autoFocus={forced}
            onChange={(e) => setCur(e.target.value)} data-testid="input-current-password" />
        </div>
        <div>
          <label className="lbl">Naya Username (optional)</label>
          <input type="text" className="input-dense" value={newUser} autoComplete="username" autoCapitalize="none"
            placeholder={user?.username} onChange={(e) => setNewUser(e.target.value)} data-testid="input-new-username" />
        </div>
        <div>
          <label className="lbl">Naya Password {forced ? "(zaroori, min 6)" : "(optional, min 6)"}</label>
          <input type="password" className="input-dense" value={nw} autoComplete="new-password" required={forced}
            onChange={(e) => setNw(e.target.value)} data-testid="input-new-password" />
        </div>
        <div>
          <label className="lbl">Confirm Naya Password</label>
          <input type="password" className="input-dense" value={confirm} autoComplete="new-password" required={forced}
            onChange={(e) => setConfirm(e.target.value)} data-testid="input-confirm-password" />
        </div>
      </div>
      <div className="flex justify-end border-t border-khaki pt-4">
        <button type="submit" className="btn-primary" disabled={busy} data-testid="btn-change-password">
          <LockKey size={16} weight="bold" /> {busy ? "Badal raha hai..." : forced ? "Password Set Karein" : "Save Karein"}
        </button>
      </div>
    </form>
  );
};
