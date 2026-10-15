import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { formatApiErrorDetail } from "@/lib/api";
import { Storefront, Eye, EyeSlash } from "@phosphor-icons/react";
import { toast } from "sonner";
import AppFooter from "@/components/AppFooter";

const LOGIN_BG =
  "https://static.prod-images.emergentagent.com/jobs/5310cfb1-247e-4bde-89f4-53c2779393b0/images/3a7d9f0a75e96c1d8e8a4a3bd61df26ccfd6fcfc9a9bcd8a4c653ad039d30bc7.png";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username.trim(), password);
      toast.success("Swagat hai!");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen flex" data-testid="login-page">
      {/* Left – brand panel */}
      <div
        className="hidden md:flex md:w-1/2 relative overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(rgba(20,8,5,0.55), rgba(20,8,5,0.55)), url(${LOGIN_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="relative z-10 p-12 flex flex-col justify-between text-white w-full">
          <div className="flex items-center gap-2">
            <div
              className="h-10 w-10 grid place-items-center rounded-sm"
              style={{ background: "#8B2520" }}
            >
              <Storefront size={22} weight="bold" />
            </div>
            <div>
              <div className="font-heading font-bold text-lg">9x Vyapari</div>
              <div className="text-[11px] uppercase tracking-widest text-white/70">
                Kaccha Arhat Hisab
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/60">
              Modern Bahi Khata
            </div>
            <h1 className="font-heading font-semibold text-4xl leading-tight tracking-tight">
              Rokad Panna,<br />Party Khata,<br />Naya Bill —<br />ek hi jagah.
            </h1>
            <p className="text-white/70 text-sm max-w-md font-mono-data">
              Galla mandi ka pura hisab — jama, kharch, udhaar aur reports.
              Tally ki simplicity, modern desktop ka feel.
            </p>
          </div>

          <div className="text-[11px] text-white/40 font-mono-data">
            v1.0  ·  Desktop Edition
          </div>
        </div>
      </div>

      {/* Right – form */}
      <div className="w-full md:w-1/2 grid place-items-center paper-bg px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="font-heading font-bold text-2xl tracking-tight">Swagat hai</div>
            <div className="text-muted2 text-sm mt-1">Apne hisab-kitab me login karein.</div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="lbl">Username</label>
              <input
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                className="input-dense"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                data-testid="input-username"
              />
            </div>
            <div>
              <label className="lbl">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  required
                  className="input-dense pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted2 hover:text-ink"
                >
                  {showPwd ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full justify-center"
              data-testid="btn-submit"
            >
              {busy ? "Ek sec..." : "Login karein"}
            </button>
          </form>

          <div className="mt-8 text-[11px] text-muted2/70 text-center font-mono-data">
            Single-user software · Username/Password badalne ke liye Settings me jayein
          </div>
          <AppFooter className="mt-6 pt-4 border-t border-khaki/60" />
        </div>
      </div>
    </div>
  );
}
