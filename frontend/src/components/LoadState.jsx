import { Link } from "react-router-dom";
import { CircleNotch, WarningCircle, ArrowClockwise } from "@phosphor-icons/react";
import { formatApiErrorDetail } from "@/lib/api";

export const errorText = (err) =>
  err?.response?.status === 404
    ? "Yeh khata nahi mila — shayad delete ho gaya hai."
    : formatApiErrorDetail(err?.response?.data?.detail) || err?.message || "Data load nahi ho paya.";

// Loading / error state for a page. Never leaves the user on a silent "Loading..." forever.
export const LoadState = ({ error, onRetry, backTo = "/", backLabel = "Dashboard par wapas", testid = "page" }) => {
  if (!error) {
    return (
      <div className="flex items-center gap-2 text-muted2 font-heading" data-testid={`${testid}-loading`}>
        <CircleNotch size={16} className="animate-spin" /> Loading...
      </div>
    );
  }
  return (
    <div className="card-flat p-6 max-w-xl" data-testid={`${testid}-error`} style={{ borderLeft: "4px solid #B71C1C" }}>
      <div className="flex items-start gap-3">
        <WarningCircle size={22} color="#B71C1C" weight="bold" className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold text-lg">Data load nahi ho paya</div>
          <div className="text-sm text-muted2 mt-1 break-words" data-testid={`${testid}-error-message`}>{errorText(error)}</div>
          <div className="flex flex-wrap gap-2 mt-4">
            {onRetry && (
              <button type="button" className="btn-primary" onClick={onRetry} data-testid={`${testid}-retry-btn`}>
                <ArrowClockwise size={14} /> Dobara Try Karein
              </button>
            )}
            <Link to={backTo} className="btn-outline" data-testid={`${testid}-back-link`}>{backLabel}</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadState;
