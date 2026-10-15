import { useCallback, useEffect, useState } from "react";

const newer = (prev, s) => !prev || (s?.at || 0) >= (prev.at || 0);

// Desktop auto-update status (Electron bridge). `vyapari:update` window event lets the web build simulate it.
export function useDesktopUpdate() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const apply = (s) => s && s.state !== "idle" && setStatus((prev) => (newer(prev, s) ? s : prev));
    const onEvt = (e) => apply(e.detail);
    window.addEventListener("vyapari:update", onEvt);
    const bridge = window.vyapari;
    const off = bridge?.onUpdateStatus?.(apply);
    bridge?.getUpdateStatus?.().then(apply).catch(() => {});
    return () => {
      window.removeEventListener("vyapari:update", onEvt);
      off?.();
    };
  }, []);

  const act = useCallback((action) => window.vyapari?.updateAction?.(action).catch(() => {}), []);
  return { status, act, isDesktop: !!window.vyapari?.isDesktop, version: window.vyapari?.version };
}
