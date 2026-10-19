export const BRAND = {
  app: "9x Vyapari",
  developer: "9x.design",
  developerUrl: "https://9x.design",
  contact: "7587922222",
  year: 2026,
  // Base MAJOR.MINOR lives in electron/package.json; CI builds <major.minor>.<run>. Keep this fallback in sync.
  version: process.env.REACT_APP_VERSION || "1.1.0",
};

// Desktop: Electron's app.getVersion() is authoritative; web: build-time version
export const appVersion = () => window.vyapari?.version || BRAND.version;
export const appVersionLabel = () => `v${appVersion()}${window.vyapari?.isDesktop ? "" : " (web)"}`;

export const copyrightText = () => `© ${BRAND.year} ${BRAND.app}. All Rights Reserved.`;
