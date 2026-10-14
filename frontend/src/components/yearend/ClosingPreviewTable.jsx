import { useState } from "react";
import { inr } from "@/lib/api";

const Bal = ({ v }) => (
  <span className="font-mono-data" style={{ color: v > 0 ? "#1A1A1A" : v < 0 ? "#B71C1C" : "#9A948A" }}>
    {v === 0 ? "—" : `₹ ${inr(Math.abs(v))} ${v > 0 ? "Dr" : "Cr"}`}
  </span>
);

export const ClosingPreviewTable = ({ parties = [], accounts = [], title = "Closing → Naya Opening" }) => {
  const [onlyNonZero, setOnlyNonZero] = useState(true);
  const [q, setQ] = useState("");
  const rows = [...accounts.map((a) => ({ ...a, kind: "A/C" })), ...parties.map((p) => ({ ...p, kind: "Party" }))]
    .filter((r) => !onlyNonZero || r.closing !== 0 || r.opening_before !== 0)
    .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || String(r.code).includes(q));

  return (
    <div className="card-flat p-0 overflow-hidden" data-testid="closing-preview">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-khaki bg-parchment/60">
        <div className="font-heading font-semibold">{title}</div>
        <div className="text-xs text-muted2">{rows.length} ledgers</div>
        <div className="ml-auto flex items-center gap-3">
          <div className="w-52">
            <input className="input-dense h-8 text-xs" placeholder="Party / code search..." value={q}
              onChange={(e) => setQ(e.target.value)} data-testid="closing-search" />
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={onlyNonZero} onChange={(e) => setOnlyNonZero(e.target.checked)}
              data-testid="toggle-nonzero" /> Sirf non-zero
          </label>
        </div>
      </div>
      <div className="overflow-auto max-h-[420px]">
        <table className="dense w-full text-[12px]">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 60 }}>Code</th>
              <th>Ledger</th>
              <th style={{ width: 70 }}>Type</th>
              <th className="num">Purana Opening</th>
              <th className="num">Closing (Aaj)</th>
              <th className="num">Naya Opening</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`closing-row-${r.id}`}>
                <td className="font-mono-data text-muted2">{r.code || ""}</td>
                <td>
                  {r.name}
                  {!r.carry && <span className="ml-2 text-[10px] uppercase tracking-wider text-kharch">reset (P&amp;L)</span>}
                </td>
                <td className="text-muted2">{r.kind}</td>
                <td className="num"><Bal v={r.opening_before} /></td>
                <td className="num"><Bal v={r.closing} /></td>
                <td className="num font-medium"><Bal v={r.new_opening} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted2 py-6">Koi ledger nahi mila.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
