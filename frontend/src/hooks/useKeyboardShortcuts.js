import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcut hook (FoxPro DOS-style).
 * Usage:
 *   useKeyboardShortcuts([
 *     { key: "a", action: () => addNew(), description: "Add new" },
 *     { ctrl: true, key: "s", action: save, description: "Save" },
 *     { alt: true, key: "c", action: () => navigate("/rokad") },
 *   ]);
 *
 * Notes:
 * - When user is typing in an input/textarea, only Ctrl/Alt/Meta combos fire (plain letters are ignored).
 * - Set `allowInInputs: true` on a shortcut to override (e.g. Esc closes modal even from input).
 */
export function useKeyboardShortcuts(shortcuts, deps = []) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        e.target?.isContentEditable;

      for (const sc of ref.current || []) {
        if (!sc || !sc.key) continue;
        const needsModifier = sc.ctrl || sc.alt || sc.meta;
        // Skip plain letter shortcuts while typing (unless allowInInputs or has modifier)
        if (isEditable && !sc.allowInInputs && !needsModifier) continue;

        const ctrlMatch = sc.ctrl ? (e.ctrlKey || e.metaKey) : !(sc.requiresNoCtrl) || true;
        const altMatch = sc.alt ? e.altKey : true;
        const shiftMatch = sc.shift ? e.shiftKey : (sc.shift === false ? !e.shiftKey : true);

        // Strict modifier check: if user pressed Ctrl/Alt but shortcut doesn't expect it, skip
        if (!sc.ctrl && (e.ctrlKey || e.metaKey)) continue;
        if (!sc.alt && e.altKey) continue;
        if (sc.shift === undefined && e.shiftKey && sc.key.length === 1 && /^[a-zA-Z]$/.test(sc.key))
          continue;

        const keyMatch =
          e.key.toLowerCase() === sc.key.toLowerCase() ||
          (sc.key === "?" && e.key === "?");

        if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
          e.preventDefault();
          e.stopPropagation();
          e.handledByShortcut = true;   // lets the global Ctrl+S fallback (Layout) stay quiet
          try { sc.action(e); } catch (err) { console.error("Shortcut error:", err); }
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function fmtKey(sc) {
  const parts = [];
  if (sc.ctrl) parts.push("Ctrl");
  if (sc.alt) parts.push("Alt");
  if (sc.shift) parts.push("Shift");
  parts.push(sc.key.length > 1 ? sc.key : sc.key.toUpperCase());
  return parts.join(" + ");
}

// Ctrl+S fallback: submit the form inside the top-most open modal (or the form the cursor is in).
// Pages with their own Ctrl+S shortcut mark the event (handledByShortcut) so this stays quiet.
export function useGlobalSave() {
  useEffect(() => {
    const handler = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();   // never the browser's "Save page as"
      setTimeout(() => {
        if (e.handledByShortcut) return;
        const overlays = document.querySelectorAll(".fixed.inset-0");
        const top = overlays[overlays.length - 1];
        const form = top?.querySelector("form") || document.activeElement?.closest?.("form");
        if (form && typeof form.requestSubmit === "function") form.requestSubmit();
      }, 0);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
