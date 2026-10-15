export const UpdateProgressBar = ({ percent = 0, dark = false, className = "" }) => {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return (
    <div className={className} data-testid="update-progress">
      <div className={`h-2 w-full rounded-full overflow-hidden ${dark ? "bg-white/15" : "bg-khaki/60"}`}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: "#C9553E" }}
          data-testid="update-progress-fill"
        />
      </div>
      <div className={`mt-1 text-[11px] font-mono-data text-right ${dark ? "text-white/60" : "text-muted2"}`} data-testid="update-progress-percent">
        {pct}%
      </div>
    </div>
  );
};

export default UpdateProgressBar;
