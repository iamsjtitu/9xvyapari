import { useRef, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { FileArrowUp, Database, CheckCircle, Warning, Lightning } from "@phosphor-icons/react";
import { toast } from "sonner";

// Map of FoxPro table -> {label, importEndpoint, extraPayload?}
const IMPORT_MAP = {
  LEDGR:    { label: "Master Ledger / Chart of Accounts (LEDGR.DBF)",
              endpoint: "/import-dbf/ledger", target: "parties" },
  LEDGRMAS: { label: "Master Ledger (LEDGRMAS.DBF)",
              endpoint: "/import-dbf/ledger", target: "parties" },
  LEDGRTEM: { label: "Master Ledger (LEDGRTEM.DBF)",
              endpoint: "/import-dbf/ledger", target: "parties" },
  ANT:      { label: "Master Ledger (ANT.DBF)",
              endpoint: "/import-dbf/ledger", target: "parties" },
  CASHBOOK: { label: "Cash Book (CASHBOOK.DBF)",
              endpoint: "/import-dbf/cashbook", target: "rokad entries" },
  CASHTEM:  { label: "Cash Book Temp (CASHTEM.DBF)",
              endpoint: "/import-dbf/cashbook", target: "rokad entries" },
  INWARDS:  { label: "Cold Storage Inward (INWARDS.DBF)",
              endpoint: "/import-dbf/inward", target: "inward entries" },
  INWARDP:  { label: "Cold Storage Inward (INWARDP.DBF)",
              endpoint: "/import-dbf/inward", target: "inward entries" },
  PROFIT:   { label: "Stock Items (PROFIT.DBF)",
              endpoint: "/import-dbf/items", target: "stock items" },
  AAGSTRET: { label: "GST Returns (AAGSTRET.DBF)",
              endpoint: "/import-dbf/gst", target: "gst returns", payload: { replace: true } },
  TRANSPR:  { label: "Purchase Transactions (TRANSPR.DBF)",
              endpoint: "/import-dbf/transactions", target: "bills",
              payload: { bill_type: "purchase" } },
  TRANSPUR: { label: "Purchase Transactions (TRANSPUR.DBF)",
              endpoint: "/import-dbf/transactions", target: "bills",
              payload: { bill_type: "purchase" } },
  TRANSTEM: { label: "Transactions Template (TRANSTEM.DBF)",
              endpoint: "/import-dbf/transactions", target: "bills",
              payload: { bill_type: "purchase" } },
};

function tableKey(name) {
  const up = (name || "").toUpperCase().replace(/\.DBF$/, "").trim();
  // handle "TRANSTEM - Copy" etc.
  if (up.startsWith("TRANSTEM")) return "TRANSTEM";
  if (up.startsWith("TRANSPR")) return "TRANSPR";
  if (up.startsWith("TRANSPUR")) return "TRANSPUR";
  return up;
}

export default function ImportDBF() {
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const migrateAll = async () => {
    if (!window.confirm(
      "Pura DOS data migrate karein?\n\n" +
      "Yeh /tmp/galla_audit/FOXPRO2/WS2026/ se sabhi DBF files ek baar me import karega:\n" +
      "• Master Ledger (LEDGR)\n" +
      "• Stock Items (PROFIT)\n" +
      "• Cash Book (CASHBOOK + CASHTEM)\n" +
      "• Cold Storage Inward (INWARDP + INWARDS)\n" +
      "• GST Returns (AAGSTRET)\n" +
      "• Bills (TRANSTEM)\n" +
      "• Journal / Transaction History (AN.DBF)\n\n" +
      "Yeh idempotent hai — dobara chalane par duplicates nahi banenge."
    )) return;
    setMigrating(true);
    setMigrationResult(null);
    try {
      const { data } = await api.post("/migrate-dos-data", {});
      setMigrationResult(data);
      toast.success(`Migration complete: ${data.total_imported} records imported`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setMigrating(false);
    }
  };

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setParsing(true); setPreview(null); setResult(null);
    try {
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = window.btoa(bin);
      const t = tableKey(f.name);
      const { data } = await api.post("/import-dbf/upload", { file_b64: b64, table: t });
      data.detected_key = t;
      setPreview(data);
      toast.success(`${data.count} rows parsed from ${t}.DBF`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const doImport = async () => {
    if (!preview) return;
    const def = IMPORT_MAP[preview.detected_key];
    if (!def) {
      toast.info(`${preview.detected_key}.DBF — import abhi supported nahi. Preview hi available hai.`);
      return;
    }
    if (!window.confirm(`${preview.count} rows ko ${def.target} me import karein?`)) return;
    setImporting(true);
    try {
      const body = { rows: preview.rows, ...(def.payload || {}) };
      const { data } = await api.post(def.endpoint, body);
      setResult({ ...data, target: def.target });
      toast.success(`Imported ${data.imported} ${def.target}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setImporting(false); }
  };

  const supported = Object.keys(IMPORT_MAP);

  return (
    <div className="space-y-5" data-testid="page-import-dbf">
      <div>
        <div className="section-title">Maintenance · DBF Import</div>
        <h1 className="font-heading font-semibold text-3xl tracking-tight flex items-center gap-2">
          <Database size={28} color="#8B2520" weight="bold" />
          Import from FoxPro
        </h1>
        <div className="text-muted2 text-sm mt-1">
          Apke purane FoxPro <span className="font-mono-data">.DBF</span> files ko upload kar ke directly app me import karein.
          Pehle preview milega, phir confirm karke import hoga.
        </div>
      </div>

      <div className="card-flat p-6 border-l-4 border-jama bg-gradient-to-r from-jama-bg/60 to-transparent">
        <div className="flex items-center gap-3 mb-3">
          <Lightning size={22} color="#1B5E20" weight="bold" />
          <div className="font-heading font-semibold text-lg">Complete DOS Data Migration</div>
        </div>
        <div className="text-sm text-muted2 mb-3">
          Ek button click se <span className="font-mono-data text-ink">/tmp/galla_audit/FOXPRO2/WS2026/</span> ke
          sabhi DBF files (Master Ledger, Items, Cash Book, Inward, GST, Bills, Journal AN.DBF) directly import ho jayenge.
          Yeh <strong>idempotent</strong> hai — dobara chalane par duplicates nahi banenge.
        </div>
        <button
          className="btn-primary"
          onClick={migrateAll}
          disabled={migrating}
          data-testid="btn-migrate-all"
        >
          <Lightning size={16} weight="bold" />
          {migrating ? "Migrating... please wait" : "Migrate Complete DOS Data"}
        </button>

        {migrationResult && (
          <div className="mt-4 border-t border-khaki pt-3">
            <div className="text-sm mb-2">
              <span className="text-jama font-medium">{migrationResult.total_imported} records imported</span>
              {migrationResult.total_skipped > 0 && (
                <span className="text-muted2"> · {migrationResult.total_skipped} skipped</span>
              )}
              <span className="text-muted2 font-mono-data ml-2 text-xs">
                from {migrationResult.folder}
              </span>
            </div>
            <table className="dense w-full text-xs">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th className="num">Rows</th>
                  <th className="num">Imported</th>
                  <th className="num">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {migrationResult.steps.map((s, i) => (
                  <tr key={i} data-testid={`migrate-step-${i}`}>
                    <td className="font-mono-data text-terracotta">{s.file}</td>
                    <td className="text-muted2">{s.kind}</td>
                    <td>
                      <span style={{
                        color: s.status === "ok" ? "#1B5E20" :
                               s.status === "missing" ? "#595959" : "#B71C1C"
                      }}>{s.status}</span>
                    </td>
                    <td className="num font-mono-data">{s.count ?? "—"}</td>
                    <td className="num font-mono-data text-jama">{s.imported ?? "—"}</td>
                    <td className="num font-mono-data text-muted2">{s.skipped ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-flat p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileArrowUp size={22} color="#8B2520" weight="bold" />
          <div className="font-heading font-semibold text-lg">DBF File Upload</div>
        </div>
        <input ref={fileRef} type="file" accept=".dbf,.DBF" onChange={onPick} className="hidden" />
        <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={parsing}
          data-testid="btn-pick-dbf">
          <FileArrowUp size={16} weight="bold" /> {parsing ? "Parsing..." : "DBF File Chunein"}
        </button>

        <div className="mt-4 border-t border-khaki pt-3">
          <div className="section-title mb-2">Supported tables ({supported.length})</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
            {supported.map((k) => (
              <div key={k} className="flex items-center gap-2 text-muted2">
                <span className="font-mono-data text-terracotta w-24">{k}.DBF</span>
                <span>→ {IMPORT_MAP[k].target}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {preview && (
        <div className="card-flat overflow-hidden">
          <div className="px-5 py-3 border-b border-khaki flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="section-title">Preview · {preview.detected_key}.DBF</div>
              <div className="text-xs text-muted2 mt-0.5 font-mono-data">
                {preview.count} rows · {preview.fields.length} columns
                {IMPORT_MAP[preview.detected_key] && (
                  <span className="ml-2 text-terracotta">
                    → {IMPORT_MAP[preview.detected_key].target}
                  </span>
                )}
              </div>
            </div>
            {IMPORT_MAP[preview.detected_key] && (
              <button className="btn-primary" onClick={doImport} disabled={importing}
                data-testid="btn-import-dbf">
                <CheckCircle size={16} weight="bold" />
                {importing ? "Importing..." : `Import ${preview.count} rows`}
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[480px]">
            <table className="dense w-full text-[11px]">
              <thead>
                <tr>
                  {preview.fields.slice(0, 14).map((f) => (
                    <th key={f[0]}>{f[0]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    {preview.fields.slice(0, 14).map((f) => (
                      <td key={f[0]} className="font-mono-data text-xs">
                        {String(r[f[0]] ?? "").slice(0, 30)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 100 && (
              <div className="px-3 py-2 text-xs text-muted2 bg-parchment border-t border-khaki">
                ...and {preview.rows.length - 100} more rows.
              </div>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="card-flat p-5 border-l-4 border-jama">
          <div className="flex items-start gap-3">
            <CheckCircle size={22} color="#1B5E20" weight="bold" />
            <div className="flex-1">
              <div className="font-heading font-semibold">Import Complete</div>
              <div className="text-sm mt-1">
                <span className="text-jama font-medium">{result.imported} imported</span>
                {result.target && <span className="text-muted2"> as {result.target}</span>}
                {result.skipped > 0 && <span className="text-muted2"> · {result.skipped} skipped</span>}
              </div>
              {result.errors?.length > 0 && (
                <div className="mt-2 text-xs">
                  <div className="text-kharch font-medium flex items-center gap-1">
                    <Warning size={12} /> {result.errors.length} errors
                  </div>
                  <ul className="list-disc pl-5 mt-1 text-muted2">
                    {result.errors.slice(0, 5).map((e, i) => (
                      <li key={i} className="font-mono-data">
                        {JSON.stringify(e).slice(0, 100)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
