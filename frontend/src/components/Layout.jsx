import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import ShortcutHelp from "@/components/ShortcutHelp";
import { LogoutConfirm } from "@/components/LogoutConfirm";
import { useEscapeBack } from "@/hooks/useEscapeBack";
import AppFooter from "@/components/AppFooter";
import {
  House, Notebook, UsersThree, Package, Receipt, ChartBar, SignOut, Storefront,
  TreeStructure, IdentificationCard, BookOpenText, CloudArrowUp, Calendar, Power,
  Truck, Scales, Database, Keyboard, CalendarCheck, BookOpen, HandCoins,
} from "@phosphor-icons/react";

const sections = [
  {
    title: "Operations",
    items: [
      { to: "/", label: "Dashboard", key: "M", icon: House, end: true, tid: "nav-dashboard" },
      { to: "/rokad", label: "Cash Register", key: "C", icon: Notebook, tid: "nav-rokad" },
      { to: "/journal", label: "Journal Entry", key: "D", icon: BookOpenText, tid: "nav-journal" },
      { to: "/bills?type=purchase", label: "Purchase Entry", key: "E", icon: Package, tid: "nav-purchase" },
      { to: "/bills?type=sale", label: "Sale / Bill Entry", key: "F", icon: Receipt, tid: "nav-sale" },
      { to: "/inward", label: "Inward Register", key: "N", icon: Truck, tid: "nav-inward" },
      { to: "/reports", label: "Reports", key: "G", icon: ChartBar, tid: "nav-reports" },
      { to: "/trial-balance", label: "Trial Balance", key: "T", icon: Scales, tid: "nav-tb" },
      { to: "/opening-balance", label: "Opening Balance", key: "O", icon: BookOpen, tid: "nav-opening-balance" },
      { to: "/outstanding", label: "Outstanding List", key: "L", icon: HandCoins, tid: "nav-outstanding" },
      { to: "/gst-returns", label: "GST Returns", key: "X", icon: Receipt, tid: "nav-gst" },
    ],
  },
  {
    title: "Setup",
    items: [
      { to: "/account-groups", label: "Account Group", key: "A", icon: TreeStructure, tid: "nav-groups" },
      { to: "/accounts", label: "Accounts", key: "B", icon: IdentificationCard, tid: "nav-accounts" },
      { to: "/parties", label: "Party Khata", key: "P", icon: UsersThree, tid: "nav-parties" },
      { to: "/items", label: "Galla Master", key: "I", icon: Package, tid: "nav-items" },
    ],
  },
  {
    title: "Maintenance",
    items: [
      { to: "/import-dbf", label: "Import (DBF)", key: "K", icon: Database, tid: "nav-import" },
      { to: "/backup", label: "Backup / Restore", key: "H", icon: CloudArrowUp, tid: "nav-backup" },
      { to: "/settings", label: "Settings / Date", key: "J", icon: Calendar, tid: "nav-settings" },
      { to: "/year-end", label: "Naya Saal (Year-End)", key: "Y", icon: CalendarCheck, tid: "nav-yearend" },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutAsk, setLogoutAsk] = useState(false);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { data } = await api.post("/backup/auto", { reason: "logout" });
      toast.success(`Auto backup ban gaya: ${data.name}`);
    } catch (err) {
      toast.error("Auto backup nahi ban paya: " + (formatApiErrorDetail(err.response?.data?.detail) || err.message));
    }
    await logout();
    setLoggingOut(false);
    setLogoutAsk(false);
    navigate("/login", { replace: true });
  }, [loggingOut, logout, navigate]);

  // Esc = back (field → screen → Dashboard); on Dashboard Esc asks "Logout karna hai kya?" (Enter = haan)
  const askLogout = useCallback(() => setLogoutAsk(true), []);
  const cancelLogout = useCallback(() => setLogoutAsk(false), []);
  useEscapeBack(askLogout);

  // Flatten nav for shortcut binding
  const navShortcuts = sections.flatMap((sec) =>
    sec.items.map((n) => ({
      alt: true, key: n.key.toLowerCase(),
      description: `${sec.title}: ${n.label}`,
      action: () => navigate(n.to),
    }))
  );

  // Global shortcuts
  useKeyboardShortcuts([
    ...navShortcuts,
    { key: "?", action: () => setHelpOpen((v) => !v),
      allowInInputs: true, description: "Show keyboard help" },
    helpOpen ? { key: "Escape", action: () => setHelpOpen(false), allowInInputs: true } : null,
    { ctrl: true, key: "/", action: () => setHelpOpen((v) => !v),
      allowInInputs: true, description: "Show keyboard help" },
  ], [navigate, helpOpen]);

  return (
    <div className="h-screen flex paper-bg" data-testid="app-shell">
      <aside
        className="w-64 flex flex-col text-[#E5E5E5] flex-shrink-0"
        style={{ background: "#2C2A29" }}
        data-testid="app-sidebar"
      >
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              className="h-9 w-9 grid place-items-center rounded-sm"
              style={{ background: "#8B2520" }}
            >
              <Storefront size={20} weight="bold" color="#fff" />
            </div>
            <div className="leading-tight">
              <div className="font-heading font-semibold text-[15px] text-white">
                {settings?.firm_name || "9x Vyapari"}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-white/50" data-testid="app-version-badge">
                {window.vyapari?.version ? `9x Vyapari Desktop v${window.vyapari.version}` : "9x Vyapari · Hisab Kitab"}
              </div>
            </div>
          </div>
          {settings?.fy_start && (
            <div className="mt-3 text-[10px] font-mono-data text-white/40 border-t border-white/10 pt-2">
              FY: {settings.fy_start} → {settings.fy_end}
            </div>
          )}
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {sections.map((sec) => (
            <div key={sec.title} className="mb-2">
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] text-white/35 font-heading font-semibold">
                {sec.title}
              </div>
              {sec.items.map((n) => {
                const Icon = n.icon;
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    data-testid={n.tid}
                    className={({ isActive }) =>
                      `flex items-center gap-3 mx-2 my-0.5 px-3 py-2 rounded-sm transition-colors text-[13px] font-heading font-medium ${
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={16} weight={isActive ? "bold" : "regular"} />
                        <div className="flex-1">{n.label}</div>
                        <span className="kbd text-white/50 border-white/15 bg-transparent" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                          {n.key}
                        </span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12px] text-white truncate" data-testid="user-name">
                {user?.name || "User"}
              </div>
              <div className="text-[10px] text-white/50 truncate" data-testid="user-username">
                @{user?.username}
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="p-2 rounded-sm hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-50"
              title="Logout (auto backup ke saath)"
              data-testid="btn-logout"
            >
              <Power size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col">
        <div className="px-6 py-5 max-w-[1500px] mx-auto animate-fade-in w-full flex-1">
          <Outlet context={{ settings, openShortcutHelp: () => setHelpOpen(true) }} />
        </div>
        <AppFooter className="px-6 py-3 border-t border-khaki/60 mt-4" />

        {/* Floating "?" help button */}
        <button
          className="fixed bottom-4 right-4 print:hidden h-10 w-10 rounded-full bg-terracotta text-white grid place-items-center shadow-lg hover:bg-terracotta-hover transition-colors z-40"
          onClick={() => setHelpOpen(true)}
          title="Keyboard Shortcuts (press ? )"
          data-testid="btn-shortcut-help"
        >
          <Keyboard size={18} weight="bold" />
        </button>

        <LogoutConfirm open={logoutAsk} busy={loggingOut} onConfirm={handleLogout} onCancel={cancelLogout} />
        <ShortcutHelp
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          navShortcuts={navShortcuts}
        />
      </main>
    </div>
  );
}
