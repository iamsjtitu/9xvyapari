import { useEffect, useMemo, useState } from "react";
import api, { inr, todayISO, formatApiErrorDetail } from "@/lib/api";
import { Plus, Trash, ArrowDown, ArrowUp, X } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function RokadPanna() {
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState([]);
  const [parties, setParties] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    type: "jama",
    amount: "",
    party_id: "",
    party_name: "",
    description: "",
    mode: "Cash",
    cash_account_id: "",
    cash_account_name: "",
    voucher_no: "",
    chq_no: "",
  });

  const load = async () => {
    const { data } = await api.get(`/rokad?date_from=${date}&date_to=${date}`);
    setEntries(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [date]);

  useEffect(() => {
    Promise.all([api.get("/parties"), api.get("/accounts")]).then(([p, a]) => {
      setParties(p.data);
      // cash/bank accounts = parties under CASH & BANK BALANCE group + accounts collection legacy
      const partyCash = p.data.filter((x) =>
        /cash|bank/i.test(x.group_name || "")
      );
      const oldAcc = a.data.filter((x) => /cash|bank/i.test(x.group_name || ""))
                           .map((x) => ({ ...x, _isAccount: true }));
      setAccounts([...partyCash, ...oldAcc]);
    });
  }, []);

  const totals = useMemo(() => {
    let jama = 0, kharch = 0;
    for (const e of entries) {
      if (e.type === "jama") jama += e.amount;
      else kharch += e.amount;
    }
    return { jama, kharch, baki: jama - kharch };
  }, [entries]);

  const jamaList = entries.filter((e) => e.type === "jama");
  const kharchList = entries.filter((e) => e.type === "kharch");

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, amount: parseFloat(form.amount || 0) };
      if (!payload.amount || payload.amount <= 0) {
        toast.error("Amount daalein");
        return;
      }
      await api.post("/rokad", payload);
      toast.success("Entry add ki gayi");
      setShowAdd(false);
      setForm({
        date,
        type: "jama",
        amount: "",
        party_id: "",
        party_name: "",
        description: "",
        mode: "Cash",
        cash_account_id: "",
        cash_account_name: "",
        voucher_no: "",
        chq_no: "",
      });
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await api.delete(`/rokad/${id}`);
    toast.success("Entry delete ki gayi");
    load();
  };

  const Side = ({ side, list, color, bg, label, icon: Icon }) => (
    <div className="card-flat overflow-hidden flex flex-col">
      <div
        className="px-4 py-3 flex items-center justify-between border-b border-khaki"
        style={{ background: bg }}
      >
        <div className="flex items-center gap-2">
          <Icon size={18} color={color} weight="bold" />
          <div className="font-heading font-semibold text-sm" style={{ color }}>
            {label}
          </div>
        </div>
        <div className="font-mono-data text-lg font-medium" style={{ color }}>
          ₹ {inr(side === "jama" ? totals.jama : totals.kharch)}
        </div>
      </div>
      <table className="dense w-full">
        <thead>
          <tr>
            <th style={{ width: 60 }}>V.No.</th>
            <th style={{ width: 90 }}>Cash A/C</th>
            <th>Party / Vivran</th>
            <th className="num" style={{ width: 130 }}>Amount</th>
            <th style={{ width: 36 }}></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center text-muted2 py-8 text-sm">
                Koi entry nahi.
              </td>
            </tr>
          ) : (
            list.map((e) => (
              <tr key={e.id} data-testid={`rokad-row-${e.id}`}>
                <td className="font-mono-data text-xs text-terracotta">
                  {e.voucher_no || "—"}
                </td>
                <td className="text-[11px] uppercase tracking-wider text-muted2">
                  {e.cash_account_name || e.mode || "Cash"}
                </td>
                <td>
                  <div className="font-medium">{e.party_name || "—"}</div>
                  {e.description && (
                    <div className="text-xs text-muted2 mt-0.5">{e.description}</div>
                  )}
                  {e.chq_no && (
                    <div className="text-xs text-muted2 mt-0.5 font-mono-data">Chq: {e.chq_no}</div>
                  )}
                </td>
                <td className="num" style={{ color }}>
                  ₹ {inr(e.amount)}
                </td>
                <td>
                  <button
                    className="btn-ghost p-1.5"
                    onClick={() => del(e.id)}
                    data-testid={`rokad-del-${e.id}`}
                  >
                    <Trash size={14} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="page-rokad">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Operations · Cash Register / Rokad Panna</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Cash Book — रोकड़ पन्ना
          </h1>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="lbl">Date</label>
            <input
              type="date"
              className="input-dense"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-date"
            />
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              setForm((f) => ({ ...f, date }));
              setShowAdd(true);
            }}
            data-testid="btn-add-entry"
          >
            <Plus size={16} weight="bold" /> Nayi Entry
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="card-flat px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted2">Jama</div>
            <div className="amount-jama text-lg font-medium" data-testid="total-jama">
              ₹ {inr(totals.jama)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted2">Kharch</div>
            <div className="amount-kharch text-lg font-medium" data-testid="total-kharch">
              ₹ {inr(totals.kharch)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted2">Baki</div>
            <div
              className="font-mono-data text-lg font-medium"
              style={{ color: totals.baki >= 0 ? "#1B5E20" : "#B71C1C" }}
              data-testid="total-baki"
            >
              ₹ {inr(totals.baki)}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted2 font-mono-data">
          Date: {date} · Entries: {entries.length}
        </div>
      </div>

      {/* Two-column ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Side
          side="jama"
          list={jamaList}
          color="#1B5E20"
          bg="#E8F5E9"
          label="Receipt / Jama (आमद) — Money In"
          icon={ArrowDown}
        />
        <Side
          side="kharch"
          list={kharchList}
          color="#B71C1C"
          bg="#FFEBEE"
          label="Payment / Kharch (खर्च) — Money Out"
          icon={ArrowUp}
        />
      </div>

      {/* Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4"
          onClick={() => setShowAdd(false)}
          data-testid="modal-add-rokad"
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="card-flat w-full max-w-lg p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-heading font-semibold text-lg">Nayi Rokad Entry</div>
              <button type="button" className="btn-ghost p-1.5" onClick={() => setShowAdd(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, type: "jama" })}
                      className={`flex-1 py-2 rounded-sm border text-sm font-heading font-medium ${
                        form.type === "jama"
                          ? "bg-jama-bg border-jama text-jama"
                          : "bg-white border-khaki text-muted2"
                      }`}
                      data-testid="btn-type-jama"
                    >
                      Receipt (R) · Jama
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, type: "kharch" })}
                      className={`flex-1 py-2 rounded-sm border text-sm font-heading font-medium ${
                        form.type === "kharch"
                          ? "bg-kharch-bg border-kharch text-kharch"
                          : "bg-white border-khaki text-muted2"
                      }`}
                      data-testid="btn-type-kharch"
                    >
                      Payment (P) · Kharch
                    </button>
                  </div>
                </div>
                <div>
                  <label className="lbl">Date</label>
                  <input
                    type="date"
                    className="input-dense"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-dense num"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    autoFocus
                    data-testid="input-amount"
                  />
                </div>
                <div>
                  <label className="lbl">Mode</label>
                  <select
                    className="input-dense"
                    value={form.mode}
                    onChange={(e) => setForm({ ...form, mode: e.target.value })}
                  >
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Bank</option>
                    <option>Cheque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Cash / Bank Account</label>
                  <select
                    className="input-dense"
                    value={form.cash_account_id}
                    onChange={async (e) => {
                      const a = accounts.find((x) => x.id === e.target.value);
                      let voucher_no = "";
                      if (a && !a._isAccount) {
                        try {
                          const { data } = await api.get(`/cash-accounts/${a.id}/next-voucher`);
                          voucher_no = data.next_voucher || "";
                        } catch {}
                      }
                      setForm({
                        ...form,
                        cash_account_id: e.target.value,
                        cash_account_name: a ? a.name : "",
                        mode: a ? (/bank/i.test(a.group_name || "") ? "Bank" : "Cash") : form.mode,
                        voucher_no,
                      });
                    }}
                    data-testid="select-cash-account"
                  >
                    <option value="">— Default Cash —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code ? `${a.code} · ` : ""}{a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl">Voucher No.</label>
                  <input
                    className="input-dense num"
                    value={form.voucher_no}
                    onChange={(e) => setForm({ ...form, voucher_no: e.target.value })}
                    placeholder="Auto from cash a/c"
                    data-testid="input-voucher-no"
                  />
                </div>
              </div>

              <div>
                <label className="lbl">Cheque No. (if applicable)</label>
                <input
                  className="input-dense"
                  value={form.chq_no}
                  onChange={(e) => setForm({ ...form, chq_no: e.target.value, mode: e.target.value ? "Cheque" : form.mode })}
                  placeholder="Cheque number"
                />
              </div>

              <div>
                <label className="lbl">Party (Optional)</label>
                <select
                  className="input-dense"
                  value={form.party_id}
                  onChange={(e) => {
                    const p = parties.find((x) => x.id === e.target.value);
                    setForm({
                      ...form,
                      party_id: e.target.value,
                      party_name: p ? p.name : "",
                    });
                  }}
                  data-testid="select-party"
                >
                  <option value="">— Koi nahi —</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl">Vivran (Note)</label>
                <input
                  className="input-dense"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Eg: Mandi se gehu kharidi"
                  data-testid="input-desc"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-outline" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" data-testid="btn-save-rokad">
                Save Entry
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
