import { useRef, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { FileArrowUp, Database, CheckCircle, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function ImportDBF() {
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null); // {table, count, fields, rows}
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

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
      const tableGuess = f.name.replace(/\.DBF$/i, "").toUpperCase();
      const { data } = await api.post("/import-dbf/upload", null, {
        params: { file_b64: b64, table: tableGuess },
        // Workaround: send as query so multipart isn't needed
      }).catch(async () => {
        // fall back to body params
        return api.post("/import-dbf/upload", { file_b64: b64, table: tableGuess });
      });
      setPreview(data);
      toast.success(`${data.count} rows parsed from ${data.table}.DBF`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const doImport = async () => {
    if (!preview) return;
    if (preview.table !== "LEDGR") {
      toast.info(`${preview.table}.DBF import abhi LEDGR ke liye supported hai (Phase 1).`);
      return;
    }
    if (!window.confirm(`${preview.count} ledger rows import karein? Existing codes update ho jayenge.`)) return;
    setImporting(true);
    try {
      const { data } = await api.post("/import-dbf/ledger", { rows: preview.rows });
      setResult(data);
      toast.success(`Imported ${data.imported}, Skipped ${data.skipped}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setImporting(false); }
  };

  return (
    <div className="space-y-5" data-testid="page-import-dbf">
      <div>
        <div className="section-title">Maintenance · DBF Import</div>
        <h1 className="font-heading font-semibold text-3xl tracking-tight flex items-center gap-2">
          <Database size={28} color="#8B2520" weight="bold" />
          Import from FoxPro
        </h1>
        <div className="text-muted2 text-sm mt-1">
          Apke purane <span className="font-mono-data">LEDGR.DBF</span> (chart of accounts / parties),
          <span className="font-mono-data"> CASHBOOK.DBF</span>, <span className="font-mono-data">TRANSPR.DBF</span> etc.
          ko upload kar ke directly app me import karein.
        </div>
      </div>

      <div className="card-flat p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileArrowUp size={22} color="#8B2520" weight="bold" />
          <div className="font-heading font-semibold text-lg">Step 1 — DBF File Upload</div>
        </div>
        <div className="text-sm text-muted2 mb-4">
          Apni <span className="font-mono-data">FOXPRO2/WS2026/</span> folder se koi bhi <span className="font-mono-data">.DBF</span> file upload karein.
          Pehle preview dikhega, phir confirm karke import hoga.
        </div>
        <input ref={fileRef} type="file" accept=".dbf,.DBF" onChange={onPick} className="hidden" />
        <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={parsing}
          data-testid="btn-pick-dbf">
          <FileArrowUp size={16} weight="bold" /> {parsing ? "Parsing..." : "DBF File Chunein"}
        </button>
        <div className="mt-3 text-[11px] text-muted2 font-mono-data">
          Currently supported for IMPORT: LEDGR.DBF (chart of accounts → parties). Other tables show preview only.
        </div>
      </div>

      {preview && (
        <div className="card-flat overflow-hidden">
          <div className="px-5 py-3 border-b border-khaki flex items-center justify-between">
            <div>
              <div className="section-title">Preview · {preview.table}.DBF</div>
              <div className="text-xs text-muted2 mt-0.5 font-mono-data">
                {preview.count} rows · {preview.fields.length} columns
              </div>
            </div>
            {preview.table === "LEDGR" && (
              <button className="btn-primary" onClick={doImport} disabled={importing}
                data-testid="btn-import-dbf">
                <CheckCircle size={16} weight="bold" />
                {importing ? "Importing..." : `Import ${preview.count} Ledgers`}
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
            <div>
              <div className="font-heading font-semibold">Import Complete</div>
              <div className="text-sm mt-1">
                <span className="text-jama font-medium">{result.imported} imported</span> ·
                <span className="text-muted2 ml-2">{result.skipped} skipped</span>
              </div>
              {result.errors?.length > 0 && (
                <div className="mt-2 text-xs">
                  <div className="text-kharch font-medium flex items-center gap-1">
                    <Warning size={12} /> {result.errors.length} errors
                  </div>
                  <ul className="list-disc pl-5 mt-1 text-muted2">
                    {result.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>Code {e.code}: {e.error}</li>
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
