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
  parts.push(sc.key.toUpperCase());
  return parts.join(" + ");
}
