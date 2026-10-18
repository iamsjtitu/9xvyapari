import { useEffect } from "react";

const SKIP_TYPES = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"]);
const SCOPE = "form, [data-enter-scope], .fixed.inset-0, main";
const FIELDS = "input, select, textarea";

const usable = (el) =>
  !el.disabled && !el.readOnly && el.tabIndex !== -1 && el.offsetParent !== null &&
  !(el.tagName === "INPUT" && (SKIP_TYPES.has(el.type) || el.type === "hidden"));

// FoxPro-style data entry: Enter = next field; Enter on the last field = save. Shift+Enter keeps its native meaning.
export function useEnterToNext() {
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.defaultPrevented) return;
      const el = e.target;
      if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || !usable(el)) return;
      const scope = el.closest(SCOPE);
      if (!scope) return;
      const fields = Array.from(scope.querySelectorAll(FIELDS)).filter(usable);
      const idx = fields.indexOf(el);
      if (idx === -1) return;
      e.preventDefault(); // no implicit form submit from the middle of the form
      if (idx < fields.length - 1) {
        const next = fields[idx + 1];
        next.focus();
        if (next.tagName === "INPUT" && /^(text|number|search|tel|email|password|url)$/.test(next.type || "text")) next.select?.();
        return;
      }
      // Last field → save (only inside a real form / modal / explicit scope, never for page filters)
      if (scope.tagName === "MAIN") { el.blur(); return; }
      const submit = scope.querySelector("[data-enter-submit]") || scope.querySelector('button[type="submit"]')
        || Array.from(scope.querySelectorAll("button.btn-primary")).pop();
      if (scope.tagName === "FORM" && !scope.querySelector("[data-enter-submit]") && typeof scope.requestSubmit === "function") scope.requestSubmit();
      else submit?.click();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

export default useEnterToNext;
