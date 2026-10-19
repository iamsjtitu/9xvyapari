import { useEffect, useMemo, useState } from "react";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { Broom, LinkSimple, Plus } from "@phosphor-icons/react";

// Picks / creates the "Account Clear" ledger that Account Settled posts leftovers to (saved in Settings)
export const SettleAccountPicker = ({ settings, onSaved, compact = false }) => {
  const [parties, setParties] = useState([]);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/parties").then((r) => setParties(r.data)).catch(() => {}); }, []);
  const options = useMemo(() => parties.filter((p) => !/cash|bank/i.test(p.group_name || "")), [parties]);

  const save = async (id, name) => {
    setBusy(true);
    try {
      const { data } = await api.put("/settings", { settle_account_id: id, settle_account_name: name });
      toast.success(`"${name}" ab Account Clear ledger hai`);
      onSaved?.(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const createDefault = async () => {
    setBusy(true);
    try {
      const existing = parties.find((p) => (p.name || "").trim().toUpperCase() === "ACCOUNT CLEAR");
      let led = existing;
      if (!led) {
        const groups = (await api.get("/account-groups")).data || [];
        const grp = groups.find((g) => /discount|indirect exp|expense|kharch/i.test(g.name || ""));
        led = (await api.post("/parties", { name: "ACCOUNT CLEAR", type: "both", ...(grp ? { group_id: grp.id, group_name: grp.name } : {}) })).data;
        setParties((prev) => [...prev, led]);
      }
      await save(led.id, led.name);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      setBusy(false);
    }
  };

  const current = settings?.settle_account_id ? (options.find((p) => p.id === settings.settle_account_id)?.name || settings.settle_account_name) : "";
  return (
    <div className={compact ? "text-xs" : ""} data-testid="settle-account-picker">
      {current && (
        <div className="flex items-center gap-1.5 text-jama mb-1" data-testid="settle-account-current">
          <LinkSimple size={12} weight="bold" /> Account Clear ledger: <strong>{current}</strong>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select className={`input-dense ${compact ? "h-8 text-xs" : ""} !w-auto`} style={{ minWidth: 200 }} value={choice}
          onChange={(e) => setChoice(e.target.value)} data-testid="settle-account-select">
          <option value="">{current ? "— Dusra ledger chunein —" : "— Ledger chunein —"}</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}{p.group_name ? ` (${p.group_name})` : ""}</option>)}
        </select>
        <button type="button" className={`btn-outline ${compact ? "text-xs h-8" : ""}`} disabled={!choice || busy}
          onClick={() => { const p = options.find((x) => x.id === choice); if (p) save(p.id, p.name); }} data-testid="settle-account-save">
          <LinkSimple size={14} /> Link karein
        </button>
        {!current && (
          <button type="button" className={`btn-primary ${compact ? "text-xs h-8" : ""}`} disabled={busy} onClick={createDefault} data-testid="settle-account-create">
            <Plus size={14} weight="bold" /> "ACCOUNT CLEAR" ledger banao & link karo
          </button>
        )}
      </div>
    </div>
  );
};

// Checkbox inside the Rokad form: leftover balance (after this entry) → Account Clear, ledger = 0 as on entry date
export const SettleToggle = ({ form, onChange, editEntry }) => {
  const [settings, setSettings] = useState(null);
  const [bal, setBal] = useState(null);
  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch(() => setSettings({})); }, []);
  useEffect(() => {
    if (!form.party_id || !form.date) { setBal(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      api.get(`/ledgers/${form.party_id}/balance`, { params: { as_on: form.date } })
        .then((r) => { if (alive) setBal(Number(r.data.balance || 0)); }).catch(() => { if (alive) setBal(null); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [form.party_id, form.date]);

  if (!form.party_id) return null;
  const amount = Number(form.amount) || 0;
  const editing = !!editEntry?.id;
  const effect = (type, amt) => (type === "jama" ? -amt : amt); // rokad effect on party balance (Dr +ve)
  let rem = null;
  if (bal != null) {
    let base = bal;
    if (editing && (editEntry.date || "").slice(0, 10) <= form.date) {
      // as-on balance already holds the old entry + its old adjustment → strip both before previewing
      base = bal + Number(editEntry.settled_amount || 0) - effect(editEntry.type, Number(editEntry.amount) || 0);
    }
    rem = base + effect(form.type, amount);
  }
  const configured = !!settings?.settle_account_id;
  const fmtRem = (v) => `₹ ${inr(Math.abs(v))} ${v > 0 ? "Dr" : v < 0 ? "Cr" : ""}`.trim();

  return (
    <div className={`mt-2 border rounded-sm p-2.5 ${form.settle ? "border-jama/50 bg-jama-bg/40" : "border-khaki bg-parchment/40"}`} data-testid="settle-box">
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1B5E20]" checked={!!form.settle} onChange={(e) => onChange(e.target.checked)} data-testid="settle-checkbox" />
        <div className="text-sm">
          <div className="font-heading font-semibold flex items-center gap-1.5"><Broom size={14} weight="bold" /> Account Settled</div>
          <div className="text-xs text-muted2 mt-0.5" data-testid="settle-info">
            {rem == null
              ? "Is entry ke baad jo baki bachega wo \"Account Clear\" me jayega aur party ka ledger is date tak 0 ho jayega."
              : Math.abs(rem) < 0.005
                ? "Is entry ke baad ledger 0 ho jayega — koi adjustment nahi lagega."
                : <>Is entry ke baad baki <strong className="font-mono-data">{fmtRem(rem)}</strong> → <strong>{settings?.settle_account_name || "Account Clear"}</strong> me jayega; ledger <strong>{(form.date || "").split("-").reverse().join("-")}</strong> tak 0. Narration auto: “Account cleared upto {(form.date || "").split("-").reverse().join("-")}”.</>}
          </div>
          {editing && editEntry.settle_journal_id && (
            <div className="text-[11px] text-jama mt-0.5" data-testid="settle-existing">Pehle se settled · adjustment journal bana hua hai (edit par dobara calculate hoga).</div>
          )}
        </div>
      </label>
      {form.settle && settings && !configured && (
        <div className="mt-2 pl-6" data-testid="settle-needs-account">
          <div className="text-xs text-kharch mb-1">Pehle "Account Clear" ledger link karein (ek baar):</div>
          <SettleAccountPicker settings={settings} compact onSaved={setSettings} />
        </div>
      )}
    </div>
  );
};

export default SettleToggle;
