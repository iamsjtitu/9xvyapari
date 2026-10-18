import { useEffect, useRef, useState } from "react";
import { LockKey, X, ArrowCounterClockwise } from "@phosphor-icons/react";

// Asks for the Backup Password before restoring a .vbk file (legacy .json needs none)
export const RestorePasswordDialog = ({ file, onCancel, onConfirm, busy }) => {
  const [pw, setPw] = useState("");
  const ref = useRef(null);
  useEffect(() => { setPw(""); setTimeout(() => ref.current?.focus(), 50); }, [file]);
  if (!file) return null;
  const encrypted = file.encrypted !== false;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4 print:hidden" data-testid="restore-password-dialog">
      <form className="card-flat w-full max-w-md p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); onConfirm(pw); }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 grid place-items-center rounded-sm flex-shrink-0" style={{ background: "#8B2520" }}>
              <LockKey size={20} weight="bold" color="#fff" />
            </div>
            <div>
              <div className="font-heading font-semibold text-lg">Restore karein</div>
              <div className="text-xs font-mono-data text-muted2 break-all" data-testid="restore-file-name">{file.name}</div>
            </div>
          </div>
          <button type="button" className="btn-ghost p-1" onClick={onCancel} title="Band karein" data-testid="restore-cancel-x"><X size={16} /></button>
        </div>
        <div className="text-sm text-kharch font-medium">Sara existing data REPLACE ho jayega. <span className="text-muted2 font-normal">(Pehle current data ka safety backup apne aap ban jayega.)</span></div>
        {encrypted ? (
          <div>
            <label className="lbl">Backup Password{file.hint ? <span className="normal-case tracking-normal text-muted2"> · Hint: "{file.hint}"</span> : null}</label>
            <input ref={ref} type="password" className="input-dense" value={pw} onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password" placeholder="Jis password se backup liya tha" data-testid="restore-password-input" />
          </div>
        ) : (
          <div className="text-xs text-muted2" data-testid="restore-legacy-note">Yeh purani (plain JSON) backup hai — password nahi lagega.</div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onCancel} disabled={busy} data-testid="restore-cancel-btn">Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || (encrypted && !pw)} data-testid="restore-confirm-btn">
            <ArrowCounterClockwise size={16} /> Restore Karein
          </button>
        </div>
      </form>
    </div>
  );
};

export default RestorePasswordDialog;
