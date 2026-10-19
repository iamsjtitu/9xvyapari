import { useEffect } from "react";

// Esc closes this dialog only (capture phase, before page shortcuts / DOS Esc-back get the key)
export function useEscClose(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const h = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      onClose?.();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose, enabled]);
}

export default useEscClose;
