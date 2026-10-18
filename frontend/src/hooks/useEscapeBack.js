import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;
const overlayOpen = () => !!document.querySelector('.fixed.inset-0, [role="dialog"][data-state="open"]');

// DOS-style Esc: field → blur, sub-screen → parent screen, main screen (Dashboard) → "Logout?" prompt.
// Runs after page/modal handlers (setTimeout) and only if none of them consumed the key.
export function useEscapeBack(onLogoutPrompt) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape" || e.repeat) return;
      setTimeout(() => {
        if (e.defaultPrevented || overlayOpen()) return;
        const el = document.activeElement;
        if (el && (FIELD.test(el.tagName) || el.isContentEditable)) { el.blur(); return; }
        const path = location.pathname.replace(/\/+$/, "");
        if (!path || path === "/") { onLogoutPrompt(); return; }
        navigate(path.split("/").slice(0, -1).join("/") || "/");
      }, 0);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [location.pathname, navigate, onLogoutPrompt]);
}

export default useEscapeBack;
