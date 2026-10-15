import { useDesktopUpdate } from "@/hooks/useDesktopUpdate";
import { UpdateProgressBar } from "@/components/UpdateProgressBar";
import { ArrowsClockwise, DownloadSimple } from "@phosphor-icons/react";

const BUSY = new Set(["checking", "downloading"]);

export const SoftwareUpdateCard = () => {
  const { status, act, isDesktop, version } = useDesktopUpdate();
  const busy = BUSY.has(status?.state);

  return (
    <div className="card-flat p-6 max-w-2xl space-y-4" data-testid="software-update-card">
      <div>
        <div className="section-title mb-1 flex items-center gap-2"><DownloadSimple size={14} /> Software Update</div>
        <div className="font-heading font-semibold text-lg" data-testid="software-version">
          9x Vyapari {isDesktop ? `Desktop v${version}` : "· Web version"}
        </div>
        <div className="text-muted2 text-sm mt-0.5">
          {isDesktop
            ? "Naya update aane par apne aap download hota hai aur yahin progress dikhta hai."
            : "Auto-update sirf Desktop app me milta hai."}
        </div>
      </div>

      <div className="rounded-sm border border-khaki bg-[#FBF9F4] p-3 text-sm" data-testid="software-update-status">
        <div className="text-ink" data-testid="software-update-message">
          {status?.message || (isDesktop ? "Abhi tak update check nahi hua." : "—")}
        </div>
        {status?.state === "downloading" && <UpdateProgressBar percent={status.percent} className="mt-2" />}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-outline"
          disabled={!isDesktop || busy}
          onClick={() => act("check")}
          data-testid="software-update-check-btn"
        >
          <ArrowsClockwise size={14} className={status?.state === "checking" ? "animate-spin" : ""} /> Update Check Karein
        </button>
        {status?.state === "downloaded" && (
          <button className="btn-primary" onClick={() => act("install")} data-testid="software-update-install-btn">
            Restart & Install v{status.version}
          </button>
        )}
        {status?.state === "portable-available" && (
          <button className="btn-primary" onClick={() => act("openRelease")} data-testid="software-update-open-release-btn">
            Download Page Kholein
          </button>
        )}
      </div>
    </div>
  );
};

export default SoftwareUpdateCard;
