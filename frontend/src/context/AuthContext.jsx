import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = guest, object = user
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    setUser({ id: data.id, username: data.username, name: data.name, role: data.role,
      must_change_password: !!data.must_change_password });
    return data;
  };

  // After a password change the old tokens are revoked → store the fresh one and clear the first-run flag
  const passwordChanged = (data) => {
    if (data?.access_token) localStorage.setItem("access_token", data.access_token);
    setUser((u) => (u ? { ...u, username: data?.username || u.username, must_change_password: false } : u));
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("access_token");
    setUser(false);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh, passwordChanged }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
