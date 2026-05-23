import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
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
  return String(detail);
}

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(n || 0));

export const todayISO = () => new Date().toISOString().slice(0, 10);

export default api;
