export const BRAND = {
  app: "9x Vyapari",
  developer: "9x.design",
  developerUrl: "https://9x.design",
  contact: "7587922222",
  year: 2026,
  // CI injects REACT_APP_VERSION (= desktop release 1.0.<run>); dev/preview falls back
  version: process.env.REACT_APP_VERSION || "1.0.0",
};

// Desktop: Electron's app.getVersion() is authoritative; web: build-time version
export const appVersion = () => window.vyapari?.version || BRAND.version;
export const appVersionLabel = () => `v${appVersion()}${window.vyapari?.isDesktop ? "" : " (web)"}`;

export const copyrightText = () => `© ${BRAND.year} ${BRAND.app}. All Rights Reserved.`;
