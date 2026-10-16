import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { BackupPasswordCard } from "@/components/BackupPasswordCard";
import AppFooter from "@/components/AppFooter";
import { LockKey, SignOut } from "@phosphor-icons/react";

// Gate: backups are password-locked, so the app opens only once a Backup Password exists
export default function SetBackupPassword() {
  const { logout, backupPasswordSet } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen paper-bg flex flex-col" data-testid="set-backup-password-page">
      <div className="flex-1 grid place-items-center px-6 py-10">
        <div className="w-full max-w-3xl space-y-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 grid place-items-center rounded-sm flex-shrink-0" style={{ background: "#8B2520" }}>
              <LockKey size={24} weight="bold" color="#fff" />
            </div>
            <div>
              <div className="section-title">Suraksha · Backup Encryption</div>
              <h1 className="font-heading font-semibold text-3xl tracking-tight">Backup Password set karein</h1>
              <p className="text-muted2 text-sm mt-1 max-w-xl">
                Aapki har backup file is password se lock hogi — bina 9x Vyapari aur bina is password ke koi bhi usse hisab nahi nikaal payega.
                Yeh login password se alag hai (chaahein to same rakh sakte hain). Set karte hi software khul jayega.
              </p>
            </div>
          </div>
          <BackupPasswordCard forced onDone={() => { backupPasswordSet(); navigate("/", { replace: true }); }} />
          <button className="btn-ghost text-sm inline-flex items-center gap-1 w-auto" onClick={async () => { await logout(); navigate("/login", { replace: true }); }} data-testid="set-backup-password-logout">
            <SignOut size={14} /> Logout
          </button>
        </div>
      </div>
      <AppFooter className="px-6 py-3 border-t border-khaki/60" />
    </div>
  );
}
