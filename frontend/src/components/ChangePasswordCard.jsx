import { useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { LockKey } from "@phosphor-icons/react";
import { toast } from "sonner";

export const ChangePasswordCard = () => {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (nw.length < 4) return toast.error("Naya password kam se kam 4 characters ka ho");
    if (nw !== confirm) return toast.error("Naya password aur confirm password match nahi karte");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: nw });
      toast.success("Password badal gaya. Agli baar naye password se login karein.");
      setCur(""); setNw(""); setConfirm("");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-flat p-6 max-w-2xl space-y-4" data-testid="change-password-card">
      <div className="section-title flex items-center gap-2"><LockKey size={14} /> Login Password Badlein</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="lbl">Purana Password</label>
          <input type="password" className="input-dense" value={cur} required autoComplete="current-password"
            onChange={(e) => setCur(e.target.value)} data-testid="input-current-password" />
        </div>
        <div>
          <label className="lbl">Naya Password</label>
          <input type="password" className="input-dense" value={nw} required autoComplete="new-password"
            onChange={(e) => setNw(e.target.value)} data-testid="input-new-password" />
        </div>
        <div>
          <label className="lbl">Confirm Naya Password</label>
          <input type="password" className="input-dense" value={confirm} required autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)} data-testid="input-confirm-password" />
        </div>
      </div>
      <div className="flex justify-end border-t border-khaki pt-4">
        <button type="submit" className="btn-primary" disabled={busy} data-testid="btn-change-password">
          <LockKey size={16} weight="bold" /> {busy ? "Badal raha hai..." : "Password Badlein"}
        </button>
      </div>
    </form>
  );
};
