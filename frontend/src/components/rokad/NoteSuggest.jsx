import { useEffect, useRef, useState } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import api from "@/lib/api";

// Vivran (note) input with suggestions from earlier Rokad entries (this party's first, then most used).
// Type to filter · ↓/↑ to highlight · Enter picks the highlighted one (else Enter = next field / save) · Esc closes.
export const NoteSuggest = ({ value, onChange, partyId, placeholder, testId = "input-desc" }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [hi, setHi] = useState(-1);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      api.get("/rokad/descriptions", { params: { q: value || "", ...(partyId ? { party_id: partyId } : {}) } })
        .then((r) => { if (alive) { setItems(r.data || []); setHi(-1); } })
        .catch(() => { if (alive) setItems([]); });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [open, value, partyId]);

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = (value || "").trim().toLowerCase();
  const list = items.filter((it) => it.text.toLowerCase() !== q);   // already typed exactly → no point suggesting it
  const pick = (text) => { onChange(text); setOpen(false); setHi(-1); };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
    else if (e.key === "Enter" && open && hi >= 0 && list[hi]) { e.preventDefault(); pick(list[hi].text); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative" data-testid={`${testId}-wrap`}>
      <input
        className="input-dense"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={testId}
      />
      {open && list.length > 0 && (
        <div className="absolute z-50 mt-0.5 w-full bg-white border border-khaki rounded-sm shadow-lg max-h-56 overflow-y-auto" data-testid={`${testId}-list`}>
          {list.map((it, idx) => (
            <button type="button" key={it.text} tabIndex={-1}
              onMouseEnter={() => setHi(idx)}
              onMouseDown={(e) => { e.preventDefault(); pick(it.text); }}
              className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 ${idx === hi ? "bg-parchment" : "hover:bg-parchment/60"}`}
              data-testid={`${testId}-opt-${idx}`}>
              <ClockCounterClockwise size={12} className="text-muted2 shrink-0" />
              <span className="truncate text-ink">{it.text}</span>
              <span className="ml-auto text-[10px] text-muted2 shrink-0 font-mono-data">{it.mine ? "is party · " : ""}{it.count}×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default NoteSuggest;
