import { useEffect, useState } from "react";
import { useDesktopUpdate } from "@/hooks/useDesktopUpdate";
import { UpdateProgressBar } from "@/components/UpdateProgressBar";
import { ArrowsClockwise, DownloadSimple, CheckCircle, WarningCircle, X, RocketLaunch } from "@phosphor-icons/react";

const ALWAYS = new Set(["available", "downloading", "downloaded", "portable-available"]);
const ICONS = {
  checking: ArrowsClockwise, available: DownloadSimple, downloading: DownloadSimple,
  downloaded: CheckCircle, "not-available": CheckCircle, "portable-available": RocketLaunch, error: WarningCircle,
};

export const UpdateBanner = () => {
  const { status, act } = useDesktopUpdate();
  const [dismissedKey, setDismissedKey] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const key = status ? `${status.state}:${status.version || ""}` : "";

  useEffect(() => {
    if (status?.state === "not-available") {
      const t = setTimeout(() => setDismissedKey(key), 5000);
      return () => clearTimeout(t);
    }
  }, [status, key]);

  if (!status || dismissedKey === key) return null;
  if (!ALWAYS.has(status.state) && !status.manual) return null;

  const Icon = ICONS[status.state] || DownloadSimple;
  const title = {
    checking: "Update check", available: "Naya Update Available", downloading: "Update Download Ho Raha Hai",
    downloaded: "Update Taiyaar Hai", "not-available": "Software Up-to-date", "portable-available": "Naya Version Available", error: "Update Problem",
  }[status.state];

  return (
    <div
      className="fixed bottom-5 right-16 z-50 print:hidden w-[400px] max-w-[calc(100vw-5rem)] text-[#E5E5E5] shadow-2xl rounded-sm border border-white/10 animate-fade-in"
      style={{ background: "#2C2A29" }}
      data-testid="update-banner"
      data-state={status.state}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="h-9 w-9 grid place-items-center rounded-sm flex-shrink-0" style={{ background: status.state === "error" ? "#7A3E00" : "#8B2520" }}>
          <Icon size={18} weight="bold" color="#fff" className={status.state === "checking" ? "animate-spin" : ""} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold text-[14px] text-white" data-testid="update-banner-title">
            {title}{status.version && status.state !== "not-available" ? ` · v${status.version}` : ""}
          </div>
          <div className="text-[12px] text-white/70 mt-0.5 break-words" data-testid="update-banner-message">{status.message}</div>
          {status.state === "downloading" && <UpdateProgressBar percent={status.percent} dark className="mt-2" />}
          {status.state === "error" && status.detail && showDetail && (
            <pre className="mt-2 text-[11px] text-white/60 whitespace-pre-wrap font-mono-data max-h-40 overflow-auto" data-testid="update-banner-detail">{status.detail}</pre>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {status.state === "downloaded" && (
              <>
                <button className="btn-primary !py-1.5 !px-3 text-[12px]" onClick={() => act("install")} data-testid="update-install-btn">Abhi Restart Karein</button>
                <button className="px-3 py-1.5 text-[12px] rounded-sm border border-white/20 hover:bg-white/10" onClick={() => setDismissedKey(key)} data-testid="update-later-btn">Baad Me</button>
              </>
            )}
            {status.state === "portable-available" && (
              <button className="btn-primary !py-1.5 !px-3 text-[12px]" onClick={() => act("openRelease")} data-testid="update-open-release-btn">Download Page Kholein</button>
            )}
            {status.state === "error" && (
              <>
                <button className="btn-primary !py-1.5 !px-3 text-[12px]" onClick={() => act("check")} data-testid="update-retry-btn">Dobara Try Karein</button>
                {status.detail && (
                  <button className="px-3 py-1.5 text-[12px] rounded-sm border border-white/20 hover:bg-white/10" onClick={() => setShowDetail((v) => !v)} data-testid="update-detail-toggle">
                    {showDetail ? "Chhupayein" : "Details"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {status.state !== "downloaded" && (
          <button className="p-1 text-white/50 hover:text-white" onClick={() => setDismissedKey(key)} title="Band karein" data-testid="update-dismiss-btn">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default UpdateBanner;
