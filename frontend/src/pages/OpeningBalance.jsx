import { useEffect, useState } from "react";
import { useSearchParams, Link, useOutletContext } from "react-router-dom";
import api, { formatApiErrorDetail, todayISO } from "@/lib/api";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";
import { OpeningBalanceSheet } from "@/components/OpeningBalanceSheet";
import { fetchClearBreakdown, clearRowLabel } from "@/lib/accountClear";
import { BookOpen, CalendarCheck } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

export default function OpeningBalance() {
  const { settings } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const fyId = params.get("fy") || "";
  const asOn = params.get("as_on") || todayISO();
  const [data, setData] = useState(null);
  const [years, setYears] = useState([]);
  const [breakdown, setBreakdown] = useState(null);   // Account Clear → party-wise rows
  const [showClear, setShowClear] = useState(false);  // "+" clicked → breakdown on screen & print

  useEffect(() => {
    api.get("/year-end/history").then((r) => setYears(r.data.years || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setData(null);
    api.get("/reports/opening-balances", { params: fyId ? { fy_id: fyId } : { as_on: asOn } })
      .then((r) => { if (alive) setData(r.data); })
      .catch((err) => { if (alive) toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message); });
    return () => { alive = false; };
  }, [fyId, asOn]);

  // Party-wise make-up of the Account Clear head (what every party's settlement put there, as on date)
  useEffect(() => {
    let alive = true;
    setBreakdown(null);
    if (!data?.settle_account_id || !data?.as_on) return undefined;
    const head = data.sections.flatMap((sec) => sec.rows).find((r) => r.id === data.settle_account_id);
    fetchClearBreakdown(data.settle_account_id, head ? head.balance : undefined, data.as_on)
      .then((b) => { if (alive) setBreakdown(b); }).catch(() => {});
    return () => { alive = false; };
  }, [data]);

  const setAsOn = (d) => d && setParams({ as_on: d });
  const quick = [
    { l: "Aaj", d: todayISO(), tid: "ob-quick-today" },
    { l: "Working Date", d: settings?.current_date, tid: "ob-quick-working" },
    { l: "FY Start", d: settings?.fy_start, tid: "ob-quick-fystart" },
    { l: "FY End", d: settings?.fy_end, tid: "ob-quick-fyend" },
  ].filter((q) => q.d);

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
      ...sec.rows.flatMap((r) => [
        { group: sec.group_name, code: r.code || "", name: r.name, debit: r.balance > 0 ? r.balance : 0, credit: r.balance < 0 ? -r.balance : 0 },
        ...(showClear && breakdown && r.id === breakdown.ledgerId
          ? breakdown.rows.map((b) => ({ group: sec.group_name, code: "", name: `   ${clearRowLabel(b)}`,
              debit: b.net > 0 ? b.net : 0, credit: b.net < 0 ? -b.net : 0 }))
          : []),
      ]),
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
            Har party/account ka balance <b>as on date</b> (opening + us date tak ki saari entries) — DOS-style print (A4 landscape, 2 column).
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input-dense h-9 text-sm !w-auto max-w-[340px]" value={fyId}
            onChange={(e) => setParams(e.target.value ? { fy: e.target.value } : {})} data-testid="select-ob-source">
            <option value="">Chalu saal (live, as on date)</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>Carry-forward opening: FY {y.new_fy_start} → {y.new_fy_end} (band: {y.fy_start})</option>
            ))}
          </select>
          {!fyId && (
            <div className="flex items-center gap-1" data-testid="ob-asof-controls">
              <label className="lbl !mb-0 mr-1 whitespace-nowrap">As on</label>
              <input type="date" className="input-dense h-9 text-sm !w-[150px]" value={asOn}
                onChange={(e) => setAsOn(e.target.value)} data-testid="input-ob-as-on" />
              {quick.map((q) => (
                <button key={q.l} type="button" data-testid={q.tid}
                  className={`kbd !text-[11px] px-2 py-1 cursor-pointer whitespace-nowrap hover:bg-khaki/60 ${asOn === q.d ? "!bg-terracotta !text-white !border-terracotta" : ""}`}
                  onClick={() => setAsOn(q.d)}>{q.l}</button>
              ))}
            </div>
          )}
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
          <OpeningBalanceSheet data={data} breakdown={breakdown} expanded={showClear} onToggle={() => setShowClear((v) => !v)} />
        )}
      </div>

      <style>{`@media print { @page { size: A4 landscape; margin: 8mm 9mm; } }`}</style>
    </div>
  );
}
