import { toast } from "sonner";

// FoxPro-style feedback sounds via Web Audio (no files). Device-level preference in localStorage.
const KEY = "vyapari.sound";
let ctx = null;
let lastAt = 0;

export const isSoundOn = () => localStorage.getItem(KEY) !== "off";
export const setSoundOn = (on) => localStorage.setItem(KEY, on ? "on" : "off");

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// tones: [{ f, t, type, gain }] played back-to-back
function play(tones, force = false) {
  if (!force && !isSoundOn()) return;
  const now = performance.now();
  if (now - lastAt < 120) return; // de-dupe bursts (several toasts at once)
  lastAt = now;
  const ac = audio();
  if (!ac) return;
  let at = ac.currentTime + 0.005;
  for (const { f, t, type = "sine", gain = 0.07, slide } of tones) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, at);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, at + t);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + t);
    osc.connect(g).connect(ac.destination);
    osc.start(at);
    osc.stop(at + t + 0.01);
    at += t;
  }
}

// Soft ascending two-tone "saved" chirp (like FoxPro's ?? CHR(7), but gentler)
export const beepOk = (force) => play([{ f: 880, t: 0.07 }, { f: 1318, t: 0.09, gain: 0.06 }], force);
// Low descending buzz for validation / errors
export const beepError = (force) => play([{ f: 330, t: 0.11, type: "square", gain: 0.035, slide: 250 }, { f: 220, t: 0.16, type: "square", gain: 0.035 }], force);

let installed = false;
// Hook sounds into every success/error toast + native form validation, app-wide
export function installSoundHooks() {
  if (installed) return;
  installed = true;
  const okOrig = toast.success;
  const errOrig = toast.error;
  toast.success = (...a) => { beepOk(); return okOrig(...a); };
  toast.error = (...a) => { beepError(); return errOrig(...a); };
  document.addEventListener("invalid", () => beepError(), true);
  // unlock audio on the first user gesture (browser autoplay policy)
  const unlock = () => { audio(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}
