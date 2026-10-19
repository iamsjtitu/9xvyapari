import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr, formatApiErrorDetail } from "@/lib/api";
import { Plus, PencilSimple, Trash, MagnifyingGlass } from "@phosphor-icons/react";
import { KhataModal } from "@/components/KhataModal";
import { toast } from "sonner";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTableNav } from "@/hooks/useTableNav";
import { LedgerInUseDialog, inUseInfo } from "@/components/LedgerInUseDialog";


export default function PartyKhata() {
  const [parties, setParties] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data } = await api.get("/parties");
    setParties(data);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.get("/account-groups").then((r) => {
      const d = r.data; d.sort((a, b) => (a.fcode || 0) - (b.fcode || 0));
      setGroups(d);
    });
  }, []);

  const startNew = () => setEditing({ id: null });
  const startEdit = (p) => setEditing(p);

  const [inUse, setInUse] = useState(null);
  const del = async (id) => {
    if (!window.confirm("Delete this ledger?")) return;
    try {
      await api.delete(`/parties/${id}`);
      toast.success("Deleted"); load();
    } catch (err) {
      const info = inUseInfo(err);
      if (info) setInUse(info);
      else toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const filtered = parties.filter((p) => {
    const matchQ =
      (p.name || "").toLowerCase().includes(q.toLowerCase()) ||
      String(p.code || "").includes(q) ||
      (p.phone || "").includes(q) ||
      (p.place || "").toLowerCase().includes(q.toLowerCase());
    const matchG = !filterGroup || p.group_id === filterGroup;
    return matchQ && matchG;
  });

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "a", action: startNew, description: "Add new ledger" },
    { key: "/", action: () => document.querySelector('[data-testid="input-search-party"]')?.focus(),
      description: "Focus search" },
    editing ? { key: "Escape", action: () => setEditing(null), allowInInputs: true, description: "Close dialog" } : null,
  ], []);

  // Arrow-key table navigation
  const { rowProps } = useTableNav({
    rows: filtered,
    onEdit: (p) => startEdit(p),
    onDelete: (p) => del(p.id),
    enabled: editing === null,
  });

  const totalUdhaar = parties.reduce((s, p) => s + Math.max(0, p.balance || 0), 0);
  const totalOwed = parties.reduce((s, p) => s + Math.max(0, -(p.balance || 0)), 0);

  return (
    <div className="space-y-5" data-testid="page-parties">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Setup · Party Khata / Ledger</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Master Ledger — खाता बही
          </h1>
          <div className="text-muted2 text-sm mt-1">
            Sales Party, Purchase Party, Cold Storage, Cash/Bank — sabhi yahan se manage hote hain.
          </div>
        </div>
        <div className="flex items-end gap-2">
          <ExportBar filename="ledger-master" sheets={[{
            name: "Ledger Master",
            columns: [
              { key: "code", label: "Code", width: 8, num: true },
              { key: "name", label: "Name", width: 32 },
              { key: "group_name", label: "Group", width: 24 },
              { key: "place", label: "Place", width: 16 },
              { key: "phone", label: "Phone", width: 14 },
              { key: "gstin", label: "GSTIN", width: 18 },
              { key: "opening_balance", label: "Opening Bal", width: 14, num: true },
              { key: "balance", label: "Current Bal", width: 14, num: true },
            ],
            rows: filtered,
          }]} />
          <button className="btn-primary" onClick={startNew} data-testid="btn-add-party">
            <Plus size={16} weight="bold" /> Naya Khata
          </button>
        </div>
      </div>

      <FoxProPrintHeader title="MASTER LEDGER / KHATA BAHI"
        subtitle={`Total ${filtered.length} ledgers · ${groups.length} groups`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-flat p-4">
          <div className="section-title">Total Khate</div>
          <div className="font-mono-data text-2xl mt-1">{parties.length}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Udhaar (milne hain)</div>
          <div className="font-mono-data text-2xl mt-1 amount-jama">₹ {inr(totalUdhaar)}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Humein dena hai</div>
          <div className="font-mono-data text-2xl mt-1 amount-kharch">₹ {inr(totalOwed)}</div>
        </div>
        <div className="card-flat p-4">
          <div className="section-title">Groups</div>
          <div className="font-mono-data text-2xl mt-1">{groups.length}</div>
        </div>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-4 py-3 border-b border-khaki flex flex-wrap items-center gap-3">
          <MagnifyingGlass size={16} color="#595959" />
          <input
            className="flex-1 min-w-[200px] bg-transparent outline-none text-sm"
            placeholder="Search by code, name, phone, place..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="input-search-party"
          />
          <select className="input-dense" style={{ width: 240 }}
            value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
            <option value="">Sabhi groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.fcode}–{g.lcode} · {g.name}</option>
            ))}
          </select>
        </div>

        <table className="dense w-full" data-testid="table-parties">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Code</th>
              <th>Naam</th>
              <th>Group</th>
              <th>Place</th>
              <th>Phone</th>
              <th className="num">Baki</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted2">
                  Koi ledger nahi. <button className="text-terracotta" onClick={startNew}>Add karein</button>
                </td>
              </tr>
            ) : filtered.map((p, idx) => (
              <tr key={p.id} data-testid={`party-row-${p.id}`} {...rowProps(idx)}>
                <td className="font-mono-data text-terracotta">{p.code || "—"}</td>
                <td>
                  <Link to={`/parties/${p.id}`} className="font-medium text-ink hover:text-terracotta">
                    {p.name}
                  </Link>
                  {p.alt_name && <div className="text-xs text-muted2">{p.alt_name}</div>}
                </td>
                <td className="text-xs text-muted2">{p.group_name || "—"}</td>
                <td className="text-xs">{p.place || "—"}</td>
                <td className="font-mono-data text-xs">{p.phone || "—"}</td>
                <td
                  className="num"
                  style={{
                    color: p.balance > 0 ? "#B71C1C" : p.balance < 0 ? "#1B5E20" : "#595959",
                  }}
                >
                  ₹ {inr(Math.abs(p.balance || 0))}
                  <div className="text-[10px] uppercase tracking-wider text-muted2">
                    {p.balance > 0 ? "Udhaar" : p.balance < 0 ? "Hum Owe" : "—"}
                  </div>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn-ghost p-1.5" onClick={() => startEdit(p)} data-testid={`party-edit-${p.id}`}>
                      <PencilSimple size={14} />
                    </button>
                    <button className="btn-ghost p-1.5" onClick={() => del(p.id)} data-testid={`party-del-${p.id}`}>
                      <Trash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <KhataModal khata={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <LedgerInUseDialog info={inUse} onClose={() => setInUse(null)} />
    </div>
  );
}
