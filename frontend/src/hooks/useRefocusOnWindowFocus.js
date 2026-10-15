import { useEffect } from "react";

const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

// When the window regains focus with nothing focused (e.g. after a native dialog / print preview),
// put the cursor into the first field of the open modal so typing works right away.
export function useRefocusOnWindowFocus() {
  useEffect(() => {
    const onFocus = () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        const modal = Array.from(document.querySelectorAll(".fixed.inset-0")).pop();
        const field = (modal || document).querySelector(FOCUSABLE);
        if (field && modal) field.focus();
      }, 30);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
}
