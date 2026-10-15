import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";
import AppFooter from "@/components/AppFooter";
import { ShieldCheck, SignOut } from "@phosphor-icons/react";

// First-run gate: shown instead of the app while the admin is still on the default password
export default function SetPassword() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen paper-bg flex flex-col" data-testid="set-password-page">
      <div className="flex-1 grid place-items-center px-6 py-10">
        <div className="w-full max-w-3xl space-y-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 grid place-items-center rounded-sm flex-shrink-0" style={{ background: "#8B2520" }}>
              <ShieldCheck size={24} weight="bold" color="#fff" />
            </div>
            <div>
              <div className="section-title">Pehli Baar Login · Suraksha</div>
              <h1 className="font-heading font-semibold text-3xl tracking-tight">Pehle naya password set karein</h1>
              <p className="text-muted2 text-sm mt-1 max-w-xl">
                Aap abhi default password (<span className="font-mono-data">admin123</span>) use kar rahe hain, jo sabko pata hai.
                Apna hisab surakshit rakhne ke liye ek naya password banayein — uske baad hi software khulega.
              </p>
            </div>
          </div>
          <ChangePasswordCard forced onDone={() => navigate("/", { replace: true })} />
          <button className="btn-ghost text-sm inline-flex items-center gap-1 w-auto" onClick={async () => { await logout(); navigate("/login", { replace: true }); }} data-testid="set-password-logout">
            <SignOut size={14} /> Logout
          </button>
        </div>
      </div>
      <AppFooter className="px-6 py-3 border-t border-khaki/60" />
    </div>
  );
}
