import { useEffect, useRef, useState, useMemo } from "react";
import { CaretDown, X, Plus } from "@phosphor-icons/react";

/**
 * Auto-suggesting text input for parties (or any name-list).
 * Type to filter, Up/Down/Enter to pick, Esc to close.
 *
 * Props:
 *  - value        : current text shown in input (party name)
 *  - selectedId   : selected party id (so we can show a clear pill)
 *  - options      : [{id, code, name, place, group_name, ...}]
 *  - onPick(opt)  : called when user selects a party (opt = full party obj)
 *  - onChangeText(t): called as user types (parent should clear selectedId
 *                    when t no longer matches the selected name)
 *  - onCreate(name): if provided, shows "+ Add '<name>' as new party" footer when
 *                    no exact match exists. Parent should create on server and
 *                    then call onPick with the newly-created party.
 *  - placeholder, testId, required, disabled
 *  - allowFreeText: if true, leaves whatever user types as-is (no clearing)
 */
export default function PartyAutocomplete({
  value = "",
  selectedId = "",
  options = [],
  onPick,
  onChangeText,
  onCreate,
  placeholder = "Type name to search...",
  testId,
  required = false,
  disabled = false,
  allowFreeText = true,
  createLabel = "as new party",
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    if (!q) return options.slice(0, 12);
    return options
      .filter((p) => {
        const name = (p.name || "").toLowerCase();
        const code = String(p.code || "").toLowerCase();
        const place = (p.place || "").toLowerCase();
        return name.includes(q) || code.includes(q) || place.includes(q);
      })
      .slice(0, 12);
  }, [value, options]);

  // Show "+ Add new" footer when onCreate is provided AND typed text doesn't match
  // any party name exactly (case-insensitive).
  const trimmed = (value || "").trim();
  const exactMatch = useMemo(
    () => options.some((p) => (p.name || "").trim().toLowerCase() === trimmed.toLowerCase()),
    [options, trimmed]
  );
  const canCreate = !!onCreate && trimmed.length > 0 && !exactMatch && !creating;

  useEffect(() => { setHi(0); }, [value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (opt) => {
    onPick && onPick(opt);
    setOpen(false);
    setHi(0);
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      setCreating(true);
      await onCreate(trimmed);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const clear = () => {
    onPick && onPick({ id: "", name: "" });
    onChangeText && onChangeText("");
    setOpen(false);
    inputRef.current && inputRef.current.focus();
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[hi]) {
        e.preventDefault();
        pick(filtered[hi]);
      } else if (canCreate) {
        e.preventDefault();
        handleCreate();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      // Tab: if exactly one match left, auto-select it for fast entry.
      if (open && filtered.length === 1) {
        pick(filtered[0]);
      } else {
        setOpen(false);
      }
    }
  };

  return (
    <div ref={wrapRef} className="relative" data-testid={testId ? `${testId}-wrap` : undefined}>
      <div className="flex items-center">
        <input
          ref={inputRef}
          className="input-dense pr-14"
          value={value || ""}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.target.value;
            onChangeText && onChangeText(t);
            if (!allowFreeText && selectedId) {
              // user is editing a selected value -> tell parent to clear id
              onPick && onPick({ id: "", name: t });
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          data-testid={testId}
          autoComplete="off"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              tabIndex={-1}
              className="p-1 text-muted2 hover:text-ink"
              onClick={clear}
              data-testid={testId ? `${testId}-clear` : undefined}
              title="Clear"
            >
              <X size={12} weight="bold" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            className="p-1 text-muted2 hover:text-ink"
            onClick={() => { setOpen((o) => !o); inputRef.current?.focus(); }}
            title="Show all"
          >
            <CaretDown size={12} weight="bold" />
          </button>
        </div>
      </div>

      {open && (filtered.length > 0 || canCreate) && (
        <div
          className="absolute z-50 mt-0.5 w-full bg-white border border-khaki rounded-sm shadow-lg max-h-72 overflow-y-auto"
          data-testid={testId ? `${testId}-list` : undefined}
        >
          {filtered.map((opt, idx) => {
            const active = idx === hi;
            return (
              <button
                type="button"
                key={opt.id}
                onMouseEnter={() => setHi(idx)}
                onMouseDown={(e) => { e.preventDefault(); pick(opt); }}
                className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 ${
                  active ? "bg-parchment" : "hover:bg-parchment/60"
                }`}
                data-testid={testId ? `${testId}-opt-${opt.id}` : undefined}
              >
                {opt.code && (
                  <span className="font-mono-data text-[10px] text-muted2 w-12 shrink-0">
                    {opt.code}
                  </span>
                )}
                <span className="font-medium text-ink truncate">{opt.name}</span>
                {opt.place && (
                  <span className="text-[10px] text-muted2 ml-auto truncate">{opt.place}</span>
                )}
              </button>
            );
          })}

          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleCreate(); }}
              className="w-full text-left px-2.5 py-2 text-xs flex items-center gap-2 border-t border-khaki bg-jama-bg/40 hover:bg-jama-bg text-jama font-medium"
              data-testid={testId ? `${testId}-create` : undefined}
              disabled={creating}
            >
              <Plus size={12} weight="bold" />
              <span>
                {creating ? "Adding..." : <>Add <span className="font-mono-data text-ink">"{trimmed}"</span> {createLabel}</>}
              </span>
              <span className="ml-auto text-[10px] text-muted2 font-mono-data">Enter</span>
            </button>
          )}
        </div>
      )}

      {open && filtered.length === 0 && !canCreate && value && (
        <div className="absolute z-50 mt-0.5 w-full bg-white border border-khaki rounded-sm shadow-lg px-3 py-2 text-xs text-muted2">
          Koi party nahi mili — "<span className="font-medium text-ink">{value}</span>"
        </div>
      )}
    </div>
  );
}
