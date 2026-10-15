import { X, Keyboard, Info } from "@phosphor-icons/react";
import { fmtKey } from "@/hooks/useKeyboardShortcuts";
import { BRAND, appVersionLabel, copyrightText } from "@/lib/brand";

/**
 * Floating overlay showing all available shortcuts for the current page.
 * Pass `shortcuts` (the same array passed to useKeyboardShortcuts).
 * Toggle with `?` key handled by the parent.
 */
export default function ShortcutHelp({ open, onClose, shortcuts, navShortcuts }) {
  if (!open) return null;

  // Filter only ones with descriptions
  const local = (shortcuts || []).filter((s) => s.description);
  const nav = (navShortcuts || []).filter((s) => s.description);

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-[100] p-4"
      onClick={onClose}
      data-testid="shortcut-help-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-flat w-full max-w-3xl max-h-[80vh] overflow-auto p-6"
      >
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-khaki">
          <div className="flex items-center gap-2">
            <Keyboard size={22} color="#8B2520" weight="bold" />
            <div>
              <div className="font-heading font-semibold text-lg">Keyboard Shortcuts</div>
              <div className="text-xs text-muted2">Press <span className="kbd">?</span> anytime to toggle this help</div>
            </div>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {local.length > 0 && (
            <div>
              <div className="section-title mb-2">Is page ke shortcuts</div>
              <div className="space-y-1.5">
                {local.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted2">{s.description}</span>
                    <span className="kbd">{fmtKey(s)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {nav.length > 0 && (
            <div>
              <div className="section-title mb-2">Navigation (Alt + Letter)</div>
              <div className="space-y-1.5">
                {nav.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted2">{s.description}</span>
                    <span className="kbd">{fmtKey(s)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 pt-3 border-t border-khaki text-xs text-muted2">
          <div className="font-heading font-semibold text-ink mb-1">Universal shortcuts</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex justify-between"><span>Show this help</span><span className="kbd">?</span></div>
            <div className="flex justify-between"><span>Close dialog / modal</span><span className="kbd">Esc</span></div>
            <div className="flex justify-between"><span>Print</span><span className="kbd">Ctrl + P</span></div>
            <div className="flex justify-between"><span>Save (in form)</span><span className="kbd">Ctrl + S</span></div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-khaki" data-testid="help-about-section">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-sm flex-shrink-0" style={{ background: "#8B2520" }}>
              <Info size={18} weight="bold" color="#fff" />
            </div>
            <div className="text-sm flex-1">
              <div className="font-heading font-semibold text-ink">
                About {BRAND.app}
                <span className="text-muted2 font-normal" data-testid="about-version"> · Version {appVersionLabel()}</span>
              </div>
              <div className="text-xs text-muted2 mt-0.5">Galla / Kaccha Arhat Hisab Kitab – Offline Desktop Software</div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono-data">
                <div className="flex justify-between gap-3">
                  <span className="text-muted2">Design and Developed by</span>
                  <span className="font-semibold text-ink" data-testid="about-developer">{BRAND.developer}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted2">Contact</span>
                  <a href={`tel:${BRAND.contact}`} className="font-semibold text-ink hover:underline" data-testid="about-contact">{BRAND.contact}</a>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted2 font-mono-data" data-testid="about-copyright">{copyrightText()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
