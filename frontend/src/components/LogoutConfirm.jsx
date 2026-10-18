import { useEffect, useRef } from "react";
import { SignOut, FloppyDisk } from "@phosphor-icons/react";

// "Logout karna hai kya?" — Enter = haan (auto backup + logout), Esc = nahi
export const LogoutConfirm = ({ open, busy, onConfirm, onCancel }) => {
  const yesRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    yesRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onConfirm(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4 print:hidden" data-testid="logout-confirm">
      <div className="card-flat w-full max-w-sm p-6" style={{ borderTop: "4px solid #8B2520" }}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 grid place-items-center rounded-sm flex-shrink-0" style={{ background: "#8B2520" }}>
            <SignOut size={20} weight="bold" color="#fff" />
          </div>
          <div>
            <div className="font-heading font-semibold text-xl">Logout karna hai kya?</div>
            <div className="text-sm text-muted2 mt-1 flex items-center gap-1.5">
              <FloppyDisk size={14} /> Logout se pehle encrypted auto-backup ban jayega.
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn-outline" onClick={onCancel} disabled={busy} data-testid="logout-confirm-no">
            Nahi <span className="kbd ml-1">Esc</span>
          </button>
          <button ref={yesRef} type="button" className="btn-primary" onClick={onConfirm} disabled={busy} data-testid="logout-confirm-yes">
            <SignOut size={14} weight="bold" /> {busy ? "Backup ban raha hai..." : "Haan, Logout"} <span className="kbd ml-1" style={{ background: "rgba(255,255,255,.18)", color: "#fff", borderColor: "rgba(255,255,255,.45)" }}>Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutConfirm;
