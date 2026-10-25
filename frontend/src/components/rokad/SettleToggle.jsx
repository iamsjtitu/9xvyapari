import { useEffect, useMemo, useState } from "react";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { drcr } from "@/lib/drcr";
import { toast } from "sonner";
import { Broom, LinkSimple, Plus, Star, X } from "@phosphor-icons/react";

// All linked Account Clear ledgers from settings (default first); legacy single-ledger settings still work
export const linkedLedgers = (s) => {
  const list = (s?.settle_accounts || []).filter((a) => a?.id).map((a) => ({ id: a.id, name: a.name || "" }));
  if (s?.settle_account_id && !list.some((a) => a.id === s.settle_account_id)) list.unshift({ id: s.settle_account_id, name: s.settle_account_name || "" });
  return list.sort((a, b) => (a.id === s?.settle_account_id ? -1 : b.id === s?.settle_account_id ? 1 : 0));
};

// Links / unlinks the "Account Clear" ledgers that Account Settled can post leftovers to (saved in Settings); one is the default
export const SettleAccountPicker = ({ settings, onSaved, compact = false }) => {
  const [parties, setParties] = useState([]);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/parties").then((r) => setParties(r.data)).catch(() => {}); }, []);
  const options = useMemo(() => parties.filter((p) => !/cash|bank/i.test(p.group_name || "")), [parties]);
  const linked = useMemo(() => linkedLedgers(settings).map((l) => ({ ...l, name: options.find((p) => p.id === l.id)?.name || l.name })), [settings, options]);
  const defaultId = settings?.settle_account_id || linked[0]?.id || "";

  const saveList = async (list, defId, msg) => {
    setBusy(true);
    try {
      const def = list.find((l) => l.id === defId) || list[0];
      const { data } = await api.put("/settings", { settle_accounts: list, settle_account_id: def?.id || null, settle_account_name: def?.name || "" });
      toast.success(msg);
      setChoice("");
      onSaved?.(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };
  const link = (p) => saveList(linked.some((l) => l.id === p.id) ? linked : [...linked, { id: p.id, name: p.name }], defaultId || p.id, `"${p.name}" ab Account Clear ledger hai`);
  const unlink = (l) => saveList(linked.filter((x) => x.id !== l.id), defaultId === l.id ? "" : defaultId, `"${l.name}" unlink ho gaya`);
  const makeDefault = (l) => saveList(linked, l.id, `"${l.name}" ab default Account Clear ledger hai`);

  const createDefault = async () => {
    setBusy(true);
    try {
      let led = parties.find((p) => (p.name || "").trim().toUpperCase() === "ACCOUNT CLEAR");
      if (!led) {
        const groups = (await api.get("/account-groups")).data || [];
        const grp = groups.find((g) => /discount|indirect exp|expense|kharch/i.test(g.name || ""));
        led = (await api.post("/parties", { name: "ACCOUNT CLEAR", type: "both", ...(grp ? { group_id: grp.id, group_name: grp.name } : {}) })).data;
        setParties((prev) => [...prev, led]);
      }
      await link(led);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "text-xs" : ""} data-testid="settle-account-picker">
      {linked.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2" data-testid="settle-account-current">
          <span className="flex items-center gap-1 text-jama"><LinkSimple size={12} weight="bold" /> Account Clear ledger{linked.length > 1 ? "s" : ""}:</span>
          {linked.map((l) => (
            <span key={l.id} className={`inline-flex items-center gap-1 border px-1.5 py-0.5 ${l.id === defaultId ? "border-jama bg-jama-bg text-jama" : "border-khaki bg-parchment/60"}`} data-testid={`settle-linked-${l.id}`}>
              {l.id === defaultId && <Star size={11} weight="fill" title="Default" />}
              <strong>{l.name}</strong>
              {l.id === defaultId ? <span className="text-[10px] uppercase">default</span>
                : <button type="button" className="text-[10px] uppercase underline decoration-dotted hover:text-jama" disabled={busy} onClick={() => makeDefault(l)} title="Isse default banao" data-testid={`settle-make-default-${l.id}`}>default banao</button>}
              <button type="button" className="hover:text-kharch" disabled={busy} onClick={() => unlink(l)} title="Unlink" data-testid={`settle-unlink-${l.id}`}><X size={11} weight="bold" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select className={`input-dense ${compact ? "h-8 text-xs" : ""} !w-auto`} style={{ minWidth: 200 }} value={choice}
          onChange={(e) => setChoice(e.target.value)} data-testid="settle-account-select">
          <option value="">{linked.length ? "— Aur ek ledger link karein —" : "— Ledger chunein —"}</option>
          {options.filter((p) => !linked.some((l) => l.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.group_name ? ` (${p.group_name})` : ""}</option>)}
        </select>
        <button type="button" className={`btn-outline ${compact ? "text-xs h-8" : ""}`} disabled={!choice || busy}
          onClick={() => { const p = options.find((x) => x.id === choice); if (p) link(p); }} data-testid="settle-account-save">
          <LinkSimple size={14} /> Link karein
        </button>
        {linked.length === 0 && (
          <button type="button" className={`btn-primary ${compact ? "text-xs h-8" : ""}`} disabled={busy} onClick={createDefault} data-testid="settle-account-create">
            <Plus size={14} weight="bold" /> "ACCOUNT CLEAR" ledger banao & link karo
          </button>
        )}
      </div>
      {linked.length > 1 && <div className="text-[11px] text-muted2 mt-1" data-testid="settle-multi-hint">Rokad entry me "Account Settled" tick karte waqt in me se koi bhi ledger chun sakte ho (★ default pehle se chuna rahega).</div>}
    </div>
  );
};

// Checkbox inside the Rokad form: leftover balance (after this entry) → chosen Account Clear ledger, party = 0 as on entry date
export const SettleToggle = ({ form, onChange, onLedgerChange, editEntry }) => {
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
    if (editing && editEntry.party_id === form.party_id && (editEntry.date || "").slice(0, 10) <= form.date) {
      // as-on balance already holds the old entry + its old adjustment → strip both before previewing
      base = bal + Number(editEntry.settled_amount || 0) - effect(editEntry.type, Number(editEntry.amount) || 0);
    }
    rem = base + effect(form.type, amount);
  }
  const ledgers = linkedLedgers(settings);
  const configured = ledgers.length > 0;
  const chosenId = (form.settle_account_id && ledgers.some((l) => l.id === form.settle_account_id)) ? form.settle_account_id : (settings?.settle_account_id || ledgers[0]?.id || "");
  const chosenName = ledgers.find((l) => l.id === chosenId)?.name || settings?.settle_account_name || "Account Clear";
  const fmtRem = (v) => `₹ ${inr(Math.abs(v))} ${drcr(v)}`.trim();
  const dmy = (form.date || "").split("-").reverse().join("-");

  return (
    <div className={`mt-2 border rounded-sm p-2.5 ${form.settle ? "border-jama/50 bg-jama-bg/40" : "border-khaki bg-parchment/40"}`} data-testid="settle-box">
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1B5E20]" checked={!!form.settle} onChange={(e) => onChange(e.target.checked)} data-testid="settle-checkbox" />
        <div className="text-sm">
          <div className="font-heading font-semibold flex items-center gap-1.5"><Broom size={14} weight="bold" /> Account Settled</div>
          <div className="text-xs text-muted2 mt-0.5" data-testid="settle-info">
            {rem == null
              ? `Is entry ke baad jo baki bachega wo "${chosenName}" me jayega aur party ka ledger is date tak 0 ho jayega.`
              : Math.abs(rem) < 0.005
                ? "Is entry ke baad ledger 0 ho jayega — koi adjustment nahi lagega."
                : <>Is entry ke baad baki <strong className="font-mono-data">{fmtRem(rem)}</strong> → <strong data-testid="settle-info-ledger">{chosenName}</strong> me jayega; ledger <strong>{dmy}</strong> tak 0. Narration auto: “Account cleared upto {dmy}”.</>}
          </div>
          {editing && editEntry.settle_journal_id && (
            <div className="text-[11px] text-jama mt-0.5" data-testid="settle-existing">Pehle se settled{editEntry.settle_account_name ? ` → ${editEntry.settle_account_name}` : ""} · adjustment journal bana hua hai (edit par dobara calculate hoga).</div>
          )}
        </div>
      </label>
      {form.settle && configured && ledgers.length > 1 && (
        <div className="mt-2 pl-6 flex flex-wrap items-center gap-2" data-testid="settle-ledger-row">
          <span className="text-xs font-heading font-semibold">Kis ledger me?</span>
          <select className="input-dense h-8 text-xs !w-auto" style={{ minWidth: 180 }} value={chosenId}
            onChange={(e) => onLedgerChange?.(e.target.value)} data-testid="settle-ledger-select">
            {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}{l.id === settings?.settle_account_id ? " (default)" : ""}</option>)}
          </select>
        </div>
      )}
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
