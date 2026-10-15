import axios from "axios";

// Desktop (Electron) build is served by the backend itself → same origin
const BACKEND_URL =
  process.env.REACT_APP_DESKTOP === "1" ? window.location.origin : process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  // Custom header = CSRF guard (cross-site forms can't send it); backend requires it on cookie-auth writes
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

// Bearer fallback (works even if 3rd-party cookies are blocked)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Kuch galat hua. Phir koshish karein.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  if (detail && typeof detail.message === "string") return detail.message;
  return String(detail);
}

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(n || 0));

// Local calendar date (toISOString() is UTC → wrong date before 05:30 IST)
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default api;
