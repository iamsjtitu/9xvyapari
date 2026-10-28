import { useEffect, useRef, useState } from "react";
import { Warning } from "@phosphor-icons/react";

// In-app confirm (replaces window.confirm). Native dialogs in Electron/Windows leave the page's inputs
// "deaf" for a while after they close — typing stops working until the window is re-focused. This never does.
let _show = null;

export function confirmBox(message, { okText = "Haan", cancelText = "Nahi", danger, title = "" } = {}) {
  if (!_show) return Promise.resolve(window.confirm(message));   // host not mounted (tests) → native fallback
  if (danger === undefined) danger = /\b(delete|hata|undo)/i.test(String(message));
  return _show({ message, okText, cancelText, danger, title });
}

export const ConfirmHost = () => {
  const [req, setReq] = useState(null);
  const okRef = useRef(null);
  const prevFocus = useRef(null);

  useEffect(() => {
    // a second confirmBox while one is open → the earlier one answers "Nahi" so no Promise hangs
    _show = (r) => new Promise((resolve) => {
      setReq((cur) => { if (cur) cur.resolve(false); else prevFocus.current = document.activeElement; return { ...r, resolve }; });
    });
    return () => { _show = null; };
  }, []);

  useEffect(() => { if (req) setTimeout(() => okRef.current?.focus(), 0); }, [req]);

  if (!req) return null;
  const done = (v) => {
    req.resolve(v);
    setReq(null);
    const el = prevFocus.current;
    setTimeout(() => { if (el && typeof el.focus === "function" && document.contains(el)) el.focus(); }, 0);
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); done(false); }
    else if (e.key === "Enter") { e.preventDefault(); done(true); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const btns = [...e.currentTarget.querySelectorAll("button")];
      const i = btns.indexOf(document.activeElement);
      btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length]?.focus();
    }
  };
  const lines = String(req.message || "").split("\n");
  return (
    <div className="fixed inset-0 bg-black/45 grid place-items-center z-[200] p-4" onKeyDown={onKey}
      onMouseDown={(e) => { if (e.target === e.currentTarget) done(false); }} data-testid="confirm-dialog" role="alertdialog" aria-modal="true">
      <div className="card-flat w-full max-w-md p-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 grid place-items-center rounded-sm flex-shrink-0" style={{ background: req.danger ? "#B71C1C" : "#7A3E00" }}>
            <Warning size={18} weight="bold" color="#fff" />
          </div>
          <div className="min-w-0">
            <div className="font-heading font-semibold text-lg" data-testid="confirm-title">{req.title || (req.danger ? "Pakka delete karein?" : "Confirm karein")}</div>
            <div className="text-sm text-ink mt-1 whitespace-pre-wrap break-words" data-testid="confirm-message">{lines.join("\n")}</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn-outline" onClick={() => done(false)} data-testid="confirm-cancel">{req.cancelText}</button>
          <button type="button" ref={okRef} className={req.danger ? "btn-primary !bg-[#B71C1C] !border-[#B71C1C]" : "btn-primary"} onClick={() => done(true)} data-testid="confirm-ok">
            {req.okText}
          </button>
        </div>
        <div className="text-[10px] text-muted2 font-mono-data mt-3">Enter = {req.okText} · Esc = {req.cancelText}</div>
      </div>
    </div>
  );
};

export default ConfirmHost;
