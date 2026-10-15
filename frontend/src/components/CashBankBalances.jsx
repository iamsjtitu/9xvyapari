import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr, todayISO } from "@/lib/api";
import { Wallet, Bank, ArrowRight } from "@phosphor-icons/react";

const isBank = (r) => /bank|sbi|hdfc|icici|axis|pnb|bob|canara|union|kotak|idbi|upi/i.test(r.name) && !/cash/i.test(r.name);

// "Kis account me kitna paisa" — closing balance as on today for every cash/bank ledger
export const CashBankBalances = () => {
  const [data, setData] = useState(null);
  const today = todayISO();

  useEffect(() => {
    api.get(`/rokad/accounts-summary?date_from=${today}&date_to=${today}`).then((r) => setData(r.data)).catch(() => setData({ rows: [], total: {} }));
  }, [today]);

  const rows = data?.rows || [];
  return (
    <div className="card-flat overflow-hidden" data-testid="cash-bank-balances">
      <div className="flex items-center justify-between px-5 py-3 border-b border-khaki">
        <div className="section-title">Cash & Bank Balance · Aaj</div>
        <Link to="/rokad" className="text-xs text-terracotta hover:underline inline-flex items-center gap-1" data-testid="cash-bank-open-rokad">
          Rokad Panna <ArrowRight size={12} />
        </Link>
      </div>
      {!data ? (
        <div className="px-5 py-6 text-sm text-muted2">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted2">
          Koi cash/bank account nahi. <Link to="/parties" className="text-terracotta hover:underline">CASH & BANK BALANCE group me khata banayein</Link>.
        </div>
      ) : (
        <div className="divide-y divide-khaki/60">
          {rows.map((r) => {
            const Icon = isBank(r) ? Bank : Wallet;
            const neg = r.closing < 0;
            return (
              <Link key={r.id} to={`/parties/${r.id}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-parchment/60 transition-colors"
                data-testid={`cash-bank-row-${r.id}`} title="Ledger kholein">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 grid place-items-center rounded-sm flex-shrink-0" style={{ background: isBank(r) ? "#1B5E20" : "#8B2520" }}>
                    <Icon size={16} weight="bold" color="#fff" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-[10px] text-muted2 font-mono-data">
                      {r.code ? `Code ${r.code} · ` : ""}{r.jama || r.kharch ? `Aaj: +${inr(r.jama)} / −${inr(r.kharch)}` : "Aaj koi entry nahi"}
                    </div>
                  </div>
                </div>
                <div className="font-mono-data text-lg font-medium whitespace-nowrap" style={{ color: neg ? "#B71C1C" : "#1B5E20" }} data-testid={`cash-bank-balance-${r.id}`}>
                  ₹ {inr(Math.abs(r.closing))} <span className="text-xs">{neg ? "Cr" : "Dr"}</span>
                </div>
              </Link>
            );
          })}
          <div className="flex items-center justify-between px-5 py-3 bg-parchment/60 font-semibold" data-testid="cash-bank-total">
            <div className="section-title">Kul Cash + Bank</div>
            <div className="font-mono-data text-lg" style={{ color: (data.total?.closing || 0) < 0 ? "#B71C1C" : "#1A1A1A" }}>
              ₹ {inr(Math.abs(data.total?.closing || 0))} <span className="text-xs">{(data.total?.closing || 0) < 0 ? "Cr" : "Dr"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashBankBalances;
