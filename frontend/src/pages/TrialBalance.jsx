import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";
import { Scales } from "@phosphor-icons/react";
import { ExportBar, FoxProPrintHeader } from "@/components/ExportBar";

const NATURE_COLORS = {
  asset: "#1B5E20", liability: "#8B2520",
  income: "#1B5E20", expense: "#B71C1C",
};

export default function TrialBalance() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/reports/trial-balance").then((r) => setData(r.data));
  }, []);

  if (!data) return <div className="text-muted2 font-heading">Loading Trial Balance...</div>;

  const excelSheets = [
    {
      name: "Trial Balance",
      columns: [
        { key: "group", label: "Group", width: 28 },
        { key: "code", label: "Code", width: 8, num: true },
        { key: "name", label: "Name", width: 35 },
        { key: "debit", label: "Debit", width: 16, num: true },
        { key: "credit", label: "Credit", width: 16, num: true },
      ],
      rows: data.sections.flatMap((sec) => [
        ...sec.rows.map((r) => ({
          group: sec.group_name, code: r.code || "",
          name: r.name, debit: r.balance > 0 ? r.balance : 0,
          credit: r.balance < 0 ? Math.abs(r.balance) : 0,
        })),
        { group: `${sec.group_name} TOTAL`, code: "", name: "",
          debit: sec.dr_total, credit: sec.cr_total },
        { group: "", code: "", name: "", debit: "", credit: "" },
      ]).concat([
        { group: "GRAND TOTAL", code: "", name: "",
          debit: data.grand_dr, credit: data.grand_cr },
      ]),
    },
  ];

  return (
    <div className="space-y-5" data-testid="page-trial-balance">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <div className="section-title">Reports · Trial Balance</div>
          <h1 className="font-heading font-semibold text-3xl tracking-tight flex items-center gap-2">
            <Scales size={28} color="#8B2520" weight="bold" />
            Trial Balance
          </h1>
          <div className="text-muted2 text-sm mt-1">
            Group-wise Debit / Credit balance summary (FoxPro AA.TXT style).
          </div>
        </div>
        <ExportBar filename="trial-balance" sheets={excelSheets} />
      </div>

      <FoxProPrintHeader title="TRIAL BALANCE"
        subtitle={`AS ON ${new Date().toLocaleDateString("en-IN")}`} />

      <div className="card-flat p-6 bg-white" id="tb-printable">
        <div className="border-b-2 border-terracotta pb-3 mb-4 text-center print:hidden">
          <div className="font-heading font-bold text-xl">TRIAL BALANCE</div>
          <div className="text-xs text-muted2 mt-1 font-mono-data">
            As of {new Date().toLocaleDateString("en-IN")}
          </div>
        </div>

        {data.sections.map((sec) => (
          <div key={sec.group_id || sec.group_name} className="mb-5">
            <div className="flex items-baseline justify-between border-b border-khaki pb-1 mb-1">
              <div className="font-heading font-semibold text-sm uppercase tracking-wider"
                style={{ color: NATURE_COLORS[sec.nature] || "#1A1A1A" }}>
                {sec.group_name}
                <span className="text-[10px] text-muted2 ml-2 font-mono-data">
                  {sec.fcode}–{sec.lcode}
                </span>
              </div>
              <div className="text-[10px] text-muted2 uppercase tracking-wider">{sec.nature}</div>
            </div>

            {sec.rows.length === 0 ? (
              <div className="text-xs text-muted2 italic py-1">(koi entry nahi)</div>
            ) : (
              <table className="dense w-full">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Code</th>
                    <th>Narration</th>
                    <th className="num" style={{ width: 140 }}>Debit (₹)</th>
                    <th className="num" style={{ width: 140 }}>Credit (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((r, i) => (
                    <tr key={`${r.kind}-${i}-${r.code}`}>
                      <td className="font-mono-data text-muted2">{r.code || "—"}</td>
                      <td>
                        <span className="font-medium">{r.name}</span>
                        {r.kind === "account" && <span className="text-[10px] text-muted2 ml-2">(A/C)</span>}
                      </td>
                      <td className="num">
                        {r.balance > 0 ? inr(r.balance) : ""}
                      </td>
                      <td className="num">
                        {r.balance < 0 ? inr(Math.abs(r.balance)) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F4F1EA" }}>
                    <td></td>
                    <td className="text-right text-xs uppercase tracking-wider text-muted2 font-heading">Group Total</td>
                    <td className="num font-medium border-t-2 border-ink">{inr(sec.dr_total)}</td>
                    <td className="num font-medium border-t-2 border-ink">{inr(sec.cr_total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        ))}

        {/* Grand totals */}
        <div className="mt-6 border-t-4 border-terracotta pt-3">
          <table className="dense w-full">
            <tbody>
              <tr style={{ background: "#FBF9F4" }}>
                <td className="font-heading font-bold uppercase tracking-wider text-base">Grand Total</td>
                <td className="num font-mono-data font-bold text-base" style={{ width: 160 }}>
                  ₹ {inr(data.grand_dr)}
                </td>
                <td className="num font-mono-data font-bold text-base" style={{ width: 160 }}>
                  ₹ {inr(data.grand_cr)}
                </td>
              </tr>
              <tr>
                <td className="text-xs text-muted2 text-right" colSpan={3}>
                  {Math.abs(data.grand_dr - data.grand_cr) < 0.01 ? (
                    <span className="text-jama">✓ Books are balanced</span>
                  ) : (
                    <span className="text-kharch">
                      Difference: ₹ {inr(Math.abs(data.grand_dr - data.grand_cr))}
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .paper-bg { background: white !important; }
          aside, .print\\:hidden { display: none !important; }
          #tb-printable { box-shadow: none !important; border: none !important; }
          @page { margin: 12mm; size: A4; }
        }
      `}</style>
    </div>
  );
}
