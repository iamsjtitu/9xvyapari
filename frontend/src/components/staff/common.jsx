import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const monthLabel = (m) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : "");
export const shiftMonth = (m, n) => { const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const MODES = ["Cash", "UPI", "Bank", "Cheque"];
export const MARK_META = {
  P: { label: "Present", short: "P", cls: "bg-jama text-white", pay: "poora din" },
  H: { label: "Half day", short: "H", cls: "bg-[#F59E0B] text-white", pay: "aadha din" },
  A: { label: "Absent", short: "A", cls: "bg-[#B71C1C] text-white", pay: "paisa katega" },
  C: { label: "Choot (paid chhutti)", short: "C", cls: "bg-[#1565C0] text-white", pay: "paisa nahi katega" },
};
export const MARK_CYCLE = ["P", "H", "A", "C", null];

// ◀ Jun 2026 ▶ month picker (also a native month input for typing)
export const MonthPicker = ({ value, onChange, testId = "month-picker" }) => (
  <div className="flex items-center gap-1" data-testid={testId}>
    <button type="button" className="btn-ghost p-1.5" onClick={() => onChange(shiftMonth(value, -1))} title="Pichla mahina" data-testid={`${testId}-prev`}><CaretLeft size={14} weight="bold" /></button>
    <input type="month" className="input-dense h-9 text-sm !w-[150px] font-mono-data" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} data-testid={`${testId}-input`} />
    <button type="button" className="btn-ghost p-1.5" onClick={() => onChange(shiftMonth(value, 1))} title="Agla mahina" data-testid={`${testId}-next`}><CaretRight size={14} weight="bold" /></button>
    <button type="button" className={`kbd !text-[11px] px-2 py-1 cursor-pointer hover:bg-khaki/60 ${value === thisMonth() ? "!bg-terracotta !text-white !border-terracotta" : ""}`} onClick={() => onChange(thisMonth())} data-testid={`${testId}-today`}>Is mahine</button>
  </div>
);

export const StaffPageHeader = ({ title, subtitle, icon: Icon, children }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
    <div>
      <div className="section-title">Staff Attendance &amp; Payments</div>
      <h1 className="font-heading font-semibold text-4xl tracking-tight flex items-center gap-2">{Icon && <Icon size={30} weight="duotone" color="#8B2321" />} {title}</h1>
      {subtitle && <div className="text-muted2 text-sm mt-1">{subtitle}</div>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);
