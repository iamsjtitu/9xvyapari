import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell, WarningCircle, CalendarCheck, Clock, X, ArrowRight,
} from "@phosphor-icons/react";
import api, { inr } from "@/lib/api";

export default function NotificationBell() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const r = await api.get("/summary/due-bills");
      setData(r.data);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // refresh every 60s
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!data) return null;
  const overdueCount = data.overdue?.length || 0;
  const todayCount = data.due_today?.length || 0;
  const soonCount = data.due_soon?.length || 0;
  const total = overdueCount + todayCount + soonCount;

  const goToBill = (b) => {
    setOpen(false);
    if (b.party_id) navigate(`/parties/${b.party_id}`);
    else navigate(`/bills/${b.id}`);
  };

  return (
    <div ref={ref} className="fixed top-4 right-4 z-50 print:hidden" data-testid="notification-bell">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-10 w-10 grid place-items-center rounded-full bg-white border border-khaki shadow-md hover:shadow-lg hover:border-terracotta transition-all"
        title={`${total} bills due`}
        data-testid="btn-bell"
      >
        <Bell size={18} weight={total > 0 ? "fill" : "regular"} color={total > 0 ? "#8B2520" : "#595959"} />
        {total > 0 && (
          <span
            className="absolute -top-1 -right-1 bg-terracotta text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] px-1 grid place-items-center leading-none"
            data-testid="bell-count"
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
        {overdueCount > 0 && (
          <span className="absolute -top-1 -right-1 -ml-1 bg-terracotta rounded-full h-[20px] w-[20px] animate-ping opacity-30"></span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-12 right-0 w-[420px] max-h-[80vh] overflow-auto card-flat shadow-xl"
          data-testid="bell-dropdown"
        >
          <div className="px-4 py-3 border-b border-khaki flex items-center justify-between bg-parchment">
            <div className="flex items-center gap-2">
              <Bell size={16} color="#8B2520" weight="bold" />
              <div className="font-heading font-semibold text-sm">Due Bills</div>
            </div>
            <button className="btn-ghost p-1" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>

          {total === 0 ? (
            <div className="p-6 text-center text-muted2 text-sm">
              <CalendarCheck size={28} className="mx-auto mb-2 opacity-40" />
              Sab settled! Koi due bill nahi.
            </div>
          ) : (
            <>
              {/* Quick links / summary */}
              <div className="grid grid-cols-3 border-b border-khaki">
                <QuickLink
                  count={overdueCount}
                  amount={data.totals?.overdue_amount}
                  label="Overdue"
                  color="#B71C1C"
                  bg="#FFEBEE"
                  icon={WarningCircle}
                />
                <QuickLink
                  count={todayCount}
                  amount={data.totals?.today_amount}
                  label="Today"
                  color="#8B2520"
                  bg="#FFF3E0"
                  icon={CalendarCheck}
                />
                <QuickLink
                  count={soonCount}
                  amount={data.totals?.soon_amount}
                  label="In 7 days"
                  color="#1B5E20"
                  bg="#E8F5E9"
                  icon={Clock}
                />
              </div>

              {/* Lists */}
              <Section
                title="Overdue · पार हुआ"
                items={data.overdue}
                color="#B71C1C"
                onClick={goToBill}
                tid="bell-overdue"
              />
              <Section
                title="Due Today · आज का"
                items={data.due_today}
                color="#8B2520"
                onClick={goToBill}
                tid="bell-today"
              />
              <Section
                title="Due Soon (within 7 days)"
                items={data.due_soon}
                color="#1B5E20"
                onClick={goToBill}
                tid="bell-soon"
              />

              <div className="px-4 py-2 border-t border-khaki bg-parchment text-center">
                <Link
                  to="/"
                  onClick={() => setOpen(false)}
                  className="text-xs text-terracotta hover:underline font-heading"
                >
                  Dashboard pe full view dekho →
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function QuickLink({ count, amount, label, color, bg, icon: Icon }) {
  return (
    <div className="p-3 text-center border-r border-khaki last:border-r-0" style={{ background: count > 0 ? bg : "white" }}>
      <Icon size={14} color={color} weight="bold" className="mx-auto mb-1" />
      <div className="font-mono-data text-lg font-medium" style={{ color: count > 0 ? color : "#595959" }}>
        {count}
      </div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: count > 0 ? color : "#595959" }}>
        {label}
      </div>
      {count > 0 && (
        <div className="text-[10px] font-mono-data mt-1" style={{ color }}>
          ₹ {inr(amount || 0)}
        </div>
      )}
    </div>
  );
}

function Section({ title, items, color, onClick, tid }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="border-b border-khaki" data-testid={tid}>
      <div
        className="px-4 py-1.5 text-[10px] uppercase tracking-wider font-heading font-semibold"
        style={{ color, background: "white" }}
      >
        {title} · {items.length}
      </div>
      {items.slice(0, 5).map((b) => (
        <button
          key={b.id}
          onClick={() => onClick(b)}
          className="w-full px-4 py-2 hover:bg-parchment flex items-center justify-between text-left border-b border-khaki/40 last:border-b-0 transition-colors"
          data-testid={`bell-item-${b.id}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono-data text-[11px] text-terracotta">{b.bill_no}</span>
              <span className="font-medium text-sm truncate">{b.party_name}</span>
            </div>
            <div className="text-[10px] text-muted2 mt-0.5 font-mono-data">
              Due: {b.due_date} ·{" "}
              {b.days_diff < 0
                ? `${Math.abs(b.days_diff)} din late`
                : b.days_diff === 0
                ? "AAJ"
                : `${b.days_diff} din me`}
            </div>
          </div>
          <div className="text-right flex items-center gap-2">
            <div className="font-mono-data text-sm font-medium" style={{ color }}>
              ₹ {inr(b.balance)}
            </div>
            <ArrowRight size={12} color="#595959" />
          </div>
        </button>
      ))}
      {items.length > 5 && (
        <div className="px-4 py-1.5 text-[10px] text-muted2 italic">
          + {items.length - 5} more on dashboard
        </div>
      )}
    </div>
  );
}
