import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import {
  House, Notebook, UsersThree, Package, Receipt, ChartBar, SignOut, Storefront,
  TreeStructure, IdentificationCard, BookOpenText, CloudArrowUp, Calendar, Power,
  Truck, Scales, Database,
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
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

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
                {settings?.firm_name || "Galla Bahi"}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">
                Hisab Kitab v1.3
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
              <div className="text-[10px] text-white/50 truncate">
                {user?.email}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-sm hover:bg-white/10 text-white/70 hover:text-white"
              title="Quit / Logout"
              data-testid="btn-logout"
            >
              <Power size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="px-6 py-5 max-w-[1500px] mx-auto animate-fade-in">
          <Outlet context={{ settings }} />
        </div>
      </main>
    </div>
  );
}
