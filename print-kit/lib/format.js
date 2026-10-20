// Standalone helpers so the print-kit works without 9x Vyapari's lib/api.js + lib/brand.js.
// Replace BRAND values with the target software's name/developer.
export const BRAND = {
  app: "Rice Mill Software",
  developer: "9x.design",
  developerUrl: "https://9x.design",
  contact: "",
  year: new Date().getFullYear(),
  version: process.env.REACT_APP_VERSION || "1.0.0",
};
export const appVersion = () => window.vyapari?.version || BRAND.version;
export const appVersionLabel = () => `v${appVersion()}${window.vyapari?.isDesktop ? "" : " (web)"}`;

// Indian grouping: 1,00,000.00
export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(n || 0));

// Local calendar date (toISOString() is UTC → wrong date before 05:30 IST)
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ISO → dd-mm-yyyy
export const fmtDate = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("-") : "");
