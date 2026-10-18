import { useState } from "react";
import { SpeakerHigh, SpeakerSlash, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
import { isSoundOn, setSoundOn, beepOk, beepError } from "@/lib/sound";
import { toast } from "sonner";

// Settings → Entry sounds (FoxPro-style beep on save, buzz on error). Device-level preference.
export const SoundSettingsCard = () => {
  const [on, setOn] = useState(isSoundOn());
  const toggle = (v) => {
    setSoundOn(v);
    setOn(v);
    if (v) beepOk(true);
    toast.info(v ? "Entry sound ON — save par beep, galti par buzz" : "Entry sound OFF");
  };
  return (
    <div className="card-flat p-6" data-testid="sound-settings-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 grid place-items-center rounded-sm flex-shrink-0" style={{ background: on ? "#1B5E20" : "#595959" }}>
            {on ? <SpeakerHigh size={20} weight="bold" color="#fff" /> : <SpeakerSlash size={20} weight="bold" color="#fff" />}
          </div>
          <div>
            <div className="font-heading font-semibold text-lg">Entry Sound · Beep</div>
            <div className="text-sm text-muted2 mt-0.5 max-w-xl">
              FoxPro jaisa: entry save hone par halki <strong>beep</strong>, galti / validation fail par <strong>buzz</strong>. Yeh setting is computer ke liye hai.
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none" data-testid="sound-toggle-label">
          <span className="font-mono-data text-xs text-muted2" data-testid="sound-status">{on ? "ON" : "OFF"}</span>
          <Switch checked={on} onCheckedChange={toggle} data-testid="sound-toggle" />
        </label>
      </div>
      <div className="flex gap-2 mt-4 flex-wrap">
        <button type="button" className="btn-outline text-xs" onClick={() => beepOk(true)} data-testid="sound-test-ok">
          <CheckCircle size={14} weight="bold" color="#1B5E20" /> Save beep sunein
        </button>
        <button type="button" className="btn-outline text-xs" onClick={() => beepError(true)} data-testid="sound-test-error">
          <WarningCircle size={14} weight="bold" color="#B71C1C" /> Error buzz sunein
        </button>
      </div>
    </div>
  );
};

export default SoundSettingsCard;
