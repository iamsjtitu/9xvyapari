import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { OpeningBalanceSheet } from "@/components/OpeningBalanceSheet";
import { BookOpen, CalendarCheck } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

export default function OpeningBalance() {
  const [params, setParams] = useSearchParams();
  const fyId = params.get("fy") || "";
  const [data, setData] = useState(null);
  const [years, setYears] = useState([]);

  useEffect(() => {
    api.get("/year-end/history").then((r) => setYears(r.data.years || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    api.get("/reports/opening-balances", { params: fyId ? { fy_id: fyId } : {} })
      .then((r) => setData(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message));
  }, [fyId]);

  const excelSheets = data ? [{
    name: "Opening Balance",
    columns: [
      { key: "group", label: "Group", width: 26 },
      { key: "code", label: "Code", width: 8, num: true },
      { key: "name", label: "Ledger", width: 36 },
      { key: "debit", label: "Debit", width: 16, num: true },
      { key: "credit", label: "Credit", width: 16, num: true },
    ],
    rows: data.sections.flatMap((sec) => [
      ...sec.rows.map((r) => ({ group: sec.group_name, code: r.code || "", name: r.name,
        debit: r.balance > 0 ? r.balance : 0, credit: r.balance < 0 ? -r.balance : 0 })),
      { group: `${sec.group_name} TOTAL`, code: "", name: "", debit: sec.dr_total, credit: sec.cr_total },
    ]).concat([{ group: "GRAND TOTAL", code: "", name: "", debit: data.grand_dr, credit: data.grand_cr }]),
  }] : [];

  return (
    <div className="space-y-5" data-testid="page-opening-balance">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <div className="section-title">Reports · Opening Balance</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight flex items-center gap-2">
            <BookOpen size={28} color="#8B2520" weight="bold" /> Opening Balance Sheet
          </h1>
          <div className="text-muted2 text-sm mt-1">
            Naye saal ke carry-forward Dr/Cr opening balances — DOS-style print (A4 landscape, 2 column).
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input-dense h-9 text-sm" value={fyId}
            onChange={(e) => setParams(e.target.value ? { fy: e.target.value } : {})} data-testid="select-ob-source">
            <option value="">Chalu saal ka opening (live)</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>Carry-forward: FY {y.new_fy_start} → {y.new_fy_end} (band: {y.fy_start})</option>
            ))}
          </select>
          <Link to="/year-end" className="btn-outline" data-testid="link-yearend"><CalendarCheck size={15} /> Naya Saal</Link>
          <ExportBar filename={`opening-balance-${data?.as_on || ""}`} sheets={excelSheets} />
        </div>
      </div>

      {data && (
        <FoxProPrintHeader firmName={(data.firm_name || "").toUpperCase()} title="OPENING BALANCE SHEET"
          subtitle={`AS ON ${fmtDate(data.as_on)}`} fyText={data.fy_text} />
      )}

      <div className="card-flat p-6 bg-white" id="ob-printable">
        {!data ? (
          <div className="text-muted2 font-heading" data-testid="ob-loading">Opening balances load ho rahe hain...</div>
        ) : (
          <OpeningBalanceSheet data={data} />
        )}
      </div>

      <style>{`@media print { @page { size: A4 landscape; margin: 8mm 9mm; } }`}</style>
    </div>
  );
}
