import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  House, Notebook, UsersThree, Package, Receipt, ChartBar, SignOut, Storefront,
} from "@phosphor-icons/react";

const nav = [
  { to: "/", label: "Dashboard", labelHi: "मुख्य", icon: House, end: true, tid: "nav-dashboard" },
  { to: "/rokad", label: "Rokad Panna", labelHi: "रोकड़ पन्ना", icon: Notebook, tid: "nav-rokad" },
  { to: "/parties", label: "Party Khata", labelHi: "पार्टी खाता", icon: UsersThree, tid: "nav-parties" },
  { to: "/items", label: "Galla Master", labelHi: "गल्ला", icon: Package, tid: "nav-items" },
  { to: "/bills", label: "Naya Bill", labelHi: "नया बिल", icon: Receipt, tid: "nav-bills" },
  { to: "/reports", label: "Reports", labelHi: "रिपोर्ट", icon: ChartBar, tid: "nav-reports" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="h-screen flex paper-bg" data-testid="app-shell">
      {/* Sidebar */}
      <aside
        className="w-64 flex flex-col text-[#E5E5E5] flex-shrink-0"
        style={{ background: "#2C2A29" }}
        data-testid="app-sidebar"
      >
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              className="h-9 w-9 grid place-items-center rounded-sm"
              style={{ background: "#8B2520" }}
            >
              <Storefront size={20} weight="bold" color="#fff" />
            </div>
            <div className="leading-tight">
              <div className="font-heading font-semibold text-[15px] text-white">
                Galla Bahi
              </div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">
                Hisab Kitab
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={n.tid}
                className={({ isActive }) =>
                  `flex items-center gap-3 mx-2 my-0.5 px-3 py-2.5 rounded-sm transition-colors text-[13px] font-heading font-medium ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} weight={isActive ? "bold" : "regular"} />
                    <div className="flex-1">
                      <div>{n.label}</div>
                    </div>
                    <div className="font-mono-data text-[10px] text-white/30">
                      {n.labelHi}
                    </div>
                  </>
                )}
              </NavLink>
            );
          })}
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
              title="Logout"
              data-testid="btn-logout"
            >
              <SignOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-5 max-w-[1500px] mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
