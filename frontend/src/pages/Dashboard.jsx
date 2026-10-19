import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import {
  ArrowDown, ArrowUp, UsersThree, Package, Receipt, CurrencyInr, Wallet, Plus,
  Bell, WarningCircle, Clock, CalendarCheck,
} from "@phosphor-icons/react";
import { CashBankBalances } from "@/components/CashBankBalances";
import { LoadState } from "@/components/LoadState";
import { AttendanceReminderCard } from "@/components/staff/AttendanceReminderCard";

const Stat = ({ icon: Icon, label, value, accent, testid }) => (
  <div className="card-flat p-4" data-testid={testid}>
    <div className="flex items-center justify-between">
      <div className="section-title">{label}</div>
      <Icon size={18} color={accent || "#595959"} weight="bold" />
    </div>
    <div
      className="mt-3 font-mono-data text-2xl font-medium"
      style={{ color: accent || "#1A1A1A" }}
    >
      {value}
    </div>
  </div>
);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [bills, setBills] = useState([]);
  const [dueData, setDueData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    (async () => {
      try {
        const [s, b, due] = await Promise.all([
          api.get("/summary/dashboard"),
          api.get("/bills"),
          api.get("/summary/due-bills"),
        ]);
        if (!alive) return;
        setData(s.data);
        setBills(b.data.slice(0, 6));
        setDueData(due.data);
      } catch (err) {
        if (alive) setError(err);
      }
    })();
    return () => { alive = false; };
  }, [attempt]);

  if (!data)
    return <LoadState error={error} onRetry={() => setAttempt((a) => a + 1)} backTo="/rokad" backLabel="Rokad Panna kholein" testid="dashboard" />;

  return (
    <div className="space-y-6" data-testid="page-dashboard">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="section-title">Dashboard · मुख्य</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Aaj ka Hisab
          </h1>
          <div className="text-muted2 text-sm mt-1">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/bills" className="btn-primary" data-testid="btn-new-bill">
            <Plus size={16} weight="bold" /> Naya Bill
          </Link>
          <Link to="/rokad" className="btn-outline" data-testid="btn-new-entry">
            <Plus size={16} /> Rokad Entry
          </Link>
        </div>
      </div>

      <AttendanceReminderCard />

      {/* Today */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={ArrowDown}
          label="Aaj Jama (+)"
          value={`₹ ${inr(data.today.jama)}`}
          accent="#1B5E20"
          testid="stat-today-jama"
        />
        <Stat
          icon={ArrowUp}
          label="Aaj Kharch (-)"
          value={`₹ ${inr(data.today.kharch)}`}
          accent="#B71C1C"
          testid="stat-today-kharch"
        />
        <Stat
          icon={Wallet}
          label="Aaj Baki"
          value={`₹ ${inr(data.today.baki)}`}
          accent={data.today.baki >= 0 ? "#1B5E20" : "#B71C1C"}
          testid="stat-today-baki"
        />
        <Stat
          icon={CurrencyInr}
          label="Kul Udhaar"
          value={`₹ ${inr(data.total_udhaar)}`}
          accent="#8B2520"
          testid="stat-total-udhaar"
        />
      </div>

      {/* Due-date Notifications */}
      {dueData && (dueData.overdue.length > 0 || dueData.due_today.length > 0 || dueData.due_soon.length > 0) && (
        <DueBillsNotifier data={dueData} />
      )}


      {/* Kis account me kitna paisa */}
      <CashBankBalances />

      {/* Month */}
      <div className="card-flat p-5">
        <div className="section-title mb-4">Is Mahine · This Month</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-muted2">Sales</div>
            <div className="font-mono-data text-xl mt-1">₹ {inr(data.month.sales)}</div>
          </div>
          <div>
            <div className="text-xs text-muted2">Purchase</div>
            <div className="font-mono-data text-xl mt-1">₹ {inr(data.month.purchase)}</div>
          </div>
          <div>
            <div className="text-xs text-muted2">Jama</div>
            <div className="font-mono-data text-xl mt-1 text-jama">₹ {inr(data.month.jama)}</div>
          </div>
          <div>
            <div className="text-xs text-muted2">Kharch</div>
            <div className="font-mono-data text-xl mt-1 text-kharch">₹ {inr(data.month.kharch)}</div>
          </div>
        </div>
      </div>

      {/* Counts & Recent Bills */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Stat
          icon={UsersThree}
          label="Parties"
          value={data.parties_count}
          testid="stat-parties"
        />
        <Stat
          icon={Package}
          label="Galla Items"
          value={data.items_count}
          testid="stat-items"
        />
        <Stat
          icon={Receipt}
          label="Hum Owe Karte hain"
          value={`₹ ${inr(data.total_owed)}`}
          accent="#B71C1C"
          testid="stat-owed"
        />
      </div>

      {/* Recent Bills */}
      <div className="card-flat overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-khaki">
          <div className="section-title">Recent Bills</div>
          <Link to="/bills" className="text-xs text-terracotta hover:underline font-heading">
            Sabhi dekhein →
          </Link>
        </div>
        {bills.length === 0 ? (
          <div className="p-8 text-center text-muted2 text-sm">
            Abhi koi bill nahi bana. <Link to="/bills" className="text-terracotta">Naya Bill</Link> banayein.
          </div>
        ) : (
          <table className="dense w-full" data-testid="table-recent-bills">
            <thead>
              <tr>
                <th>Bill No.</th>
                <th>Date</th>
                <th>Type</th>
                <th>Party</th>
                <th className="num">Total</th>
                <th className="num">Baki</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link
                      to={`/bills/${b.id}`}
                      className="font-mono-data text-terracotta hover:underline"
                    >
                      {b.bill_no}
                    </Link>
                  </td>
                  <td className="font-mono-data">{b.date}</td>
                  <td>
                    <span
                      className="text-[11px] font-heading uppercase tracking-wider"
                      style={{ color: b.bill_type === "sale" ? "#1B5E20" : "#8B2520" }}
                    >
                      {b.bill_type === "sale" ? "Sale" : "Purchase"}
                    </span>
                  </td>
                  <td>{b.party_name}</td>
                  <td className="num">₹ {inr(b.total)}</td>
                  <td className="num" style={{ color: b.balance > 0 ? "#B71C1C" : "#1B5E20" }}>
                    ₹ {inr(b.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DueBillsNotifier({ data }) {
  const { overdue, due_today, due_soon, totals } = data;
  const totalCount = (overdue?.length || 0) + (due_today?.length || 0) + (due_soon?.length || 0);

  const Section = ({ label, items, color, bg, icon: Icon, accent }) => (
    items.length > 0 && (
      <div className="card-flat overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
        <div className="px-4 py-3 border-b border-khaki flex items-center justify-between" style={{ background: bg }}>
          <div className="flex items-center gap-2">
            <Icon size={18} color={color} weight="bold" />
            <div className="font-heading font-semibold text-sm" style={{ color }}>{label}</div>
          </div>
          <div className="text-xs font-mono-data" style={{ color }}>
            {items.length} bill{items.length > 1 ? "s" : ""} · ₹ {inr(items.reduce((s, b) => s + (b.balance || 0), 0))}
          </div>
        </div>
        <table className="dense w-full" data-testid={`due-${accent}`}>
          <thead>
            <tr>
              <th>Bill No.</th>
              <th>Party</th>
              <th>Due Date</th>
              <th className="num">Days</th>
              <th className="num">Baki (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} data-testid={`due-bill-${b.id}`}>
                <td>
                  <Link to={`/bills/${b.id}`} className="font-mono-data text-terracotta hover:underline">
                    {b.bill_no}
                  </Link>
                </td>
                <td>
                  {b.party_id ? (
                    <Link to={`/parties/${b.party_id}`} className="font-medium hover:text-terracotta hover:underline">
                      {b.party_name}
                    </Link>
                  ) : (
                    <span className="font-medium">{b.party_name}</span>
                  )}
                </td>
                <td className="font-mono-data text-xs">{b.due_date}</td>
                <td className="num font-mono-data" style={{ color }}>
                  {b.days_diff < 0
                    ? `${Math.abs(b.days_diff)}d overdue`
                    : b.days_diff === 0
                    ? "TODAY"
                    : `in ${b.days_diff}d`}
                </td>
                <td className="num font-medium" style={{ color }}>
                  ₹ {inr(b.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <div className="space-y-3" data-testid="due-bills-notifier">
      <div className="flex items-center gap-3 px-1">
        <div className="relative">
          <Bell size={22} color="#8B2520" weight="bold" />
          {totalCount > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-terracotta text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
              {totalCount}
            </span>
          )}
        </div>
        <div>
          <div className="font-heading font-semibold text-lg">Bills Due — Notifications</div>
          <div className="text-xs text-muted2">
            {totals.overdue_count > 0 && (
              <span className="text-kharch font-medium">{totals.overdue_count} overdue (₹ {inr(totals.overdue_amount)})</span>
            )}
            {totals.today_count > 0 && (
              <span className="text-terracotta ml-3">{totals.today_count} due today (₹ {inr(totals.today_amount)})</span>
            )}
            {totals.soon_count > 0 && (
              <span className="ml-3">{totals.soon_count} due in 7 days (₹ {inr(totals.soon_amount)})</span>
            )}
          </div>
        </div>
      </div>

      <Section
        label="Overdue · पार हुआ"
        items={overdue}
        color="#B71C1C"
        bg="#FFEBEE"
        icon={WarningCircle}
        accent="overdue"
      />
      <Section
        label="Due Today · आज का"
        items={due_today}
        color="#8B2520"
        bg="#FFF3E0"
        icon={CalendarCheck}
        accent="today"
      />
      <Section
        label="Due Soon (within 7 days)"
        items={due_soon}
        color="#1B5E20"
        bg="#E8F5E9"
        icon={Clock}
        accent="soon"
      />
    </div>
  );
}

