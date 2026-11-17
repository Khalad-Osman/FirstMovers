"use client";

import { useState, useTransition } from "react";
import { COMPANY_TYPES, COMPANY_TYPE_KEYS, DEAL_TYPES, DEAL_TYPE_KEYS, REGIONS, REGION_KEYS } from "@/lib/research/filters";
import { parseDealsCsv, type PastDealDraft } from "@/lib/deals/normalize";
import { extractPdfDeals, savePastDeals } from "./actions";

type Row = PastDealDraft & { include: boolean };

export function DealsUploader() {
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<{ kind: "csv" | "pdf"; filename: string } | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [confirmPdf, setConfirmPdf] = useState<File | null>(null);

  function reset() {
    setRows([]);
    setSource(null);
  }

  async function onFile(file: File) {
    setMessage(null);
    reset();
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      setConfirmPdf(file); // reading a PDF spends one AI call: ask first
      return;
    }
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      setMessage({ kind: "error", text: "Upload a CSV (in Excel: File → Save As → CSV) or a PDF." });
      return;
    }
    const r = await parseDealsCsv(await file.text());
    if (r.error) return setMessage({ kind: "error", text: r.error });
    setRows(r.drafts.map((d) => ({ ...d, include: true })));
    setSource({ kind: "csv", filename: file.name });
    const found = Object.keys(r.columns).length;
    setMessage({ kind: "info", text: `Read ${r.drafts.length} deals (${found} columns recognised${r.skipped ? `, ${r.skipped} rows without an occupier skipped` : ""}). Check the fields, then save.` });
  }

  function readPdf(file: File) {
    setConfirmPdf(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = await extractPdfDeals(fd);
      if ("error" in r) return setMessage({ kind: "error", text: r.error });
      setRows(r.drafts.map((d) => ({ ...d, include: true })));
      setSource({ kind: "pdf", filename: file.name });
      setMessage({ kind: "info", text: `AI read ${r.drafts.length} deals${r.dropped ? ` (${r.dropped} without an occupier dropped)` : ""}. Check every field against the PDF, then save.` });
    });
  }

  function save() {
    const included = rows.filter((r) => r.include).map(({ include: _i, ...d }) => (void _i, d));
    if (!source || included.length === 0) return;
    start(async () => {
      const r = await savePastDeals({ drafts: included, source: source.kind, filename: source.filename });
      if ("error" in r) return setMessage({ kind: "error", text: r.error });
      setMessage({ kind: "info", text: `Saved ${r.saved} deal${r.saved === 1 ? "" : "s"}.` });
      reset();
    });
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (v: string) => {
    const n = Number(v.replace(/[,\s]/g, ""));
    return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <section className="grid gap-4 border border-line bg-panel p-4">
      <div className="grid gap-1">
        <h2 className="font-semibold">Upload deals</h2>
        <p className="text-[0.875rem] text-meta">
          CSV files are read in your browser with no AI. A PDF is read once by the analysis model (about $0.02–0.05). Either way you review every field before saving; values the file doesn&apos;t give stay blank.
        </p>
      </div>
      <label className="grid w-fit gap-1">
        <span className="field-label">Choose a file (CSV or PDF, PDF up to 3 MB)</span>
        <input
          type="file"
          accept=".csv,.tsv,.txt,.pdf,text/csv,application/pdf"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {confirmPdf && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-l-4 border-[#b45309] bg-[#fffbeb] px-3 py-2 text-[0.9375rem]">
          <span>
            Read <strong>{confirmPdf.name}</strong> with AI? One analysis-model call (about $0.02–0.05).
          </span>
          <button type="button" className="btn btn-primary" onClick={() => readPdf(confirmPdf)}>
            Read PDF
          </button>
          <button type="button" className="btn" onClick={() => setConfirmPdf(null)}>
            Cancel
          </button>
        </div>
      )}
      {pending && <p role="status">Working…</p>}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "form-error" : "text-[0.9375rem]"}>
          {message.text}
        </p>
      )}

      {rows.length > 0 && (
        <div className="grid gap-3">
          <div className="overflow-x-auto border border-line bg-white">
            <table className="w-full min-w-[1100px] border-collapse text-left text-[0.875rem]">
              <thead className="bg-panel">
                <tr>
                  {["Save", "Occupier", "Company type", "Region", "Municipality", "Deal type", "Sq ft", "Clear ft", "Date", "Notes"].map((h) => (
                    <th key={h} className="label px-2 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t border-line align-top ${r.include ? "" : "opacity-50"}`}>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" aria-label={`Save row ${i + 1}`} checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} className="h-4 w-4" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Occupier" className="input w-48" value={r.occupier} maxLength={200} onChange={(e) => update(i, { occupier: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <select aria-label="Company type" className="input" value={r.companyType ?? ""} onChange={(e) => update(i, { companyType: (e.target.value || null) as Row["companyType"] })}>
                        <option value="">—</option>
                        {COMPANY_TYPE_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {COMPANY_TYPES[k].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select aria-label="Region" className="input" value={r.region ?? ""} onChange={(e) => update(i, { region: (e.target.value || null) as Row["region"] })}>
                        <option value="">—</option>
                        {REGION_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {REGIONS[k].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Municipality" className="input w-36" value={r.municipality ?? ""} maxLength={120} onChange={(e) => update(i, { municipality: e.target.value || null })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <select aria-label="Deal type" className="input" value={r.dealType ?? ""} onChange={(e) => update(i, { dealType: (e.target.value || null) as Row["dealType"] })}>
                        <option value="">—</option>
                        {DEAL_TYPE_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {DEAL_TYPES[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Size in square feet" inputMode="numeric" className="input mono w-28" defaultValue={r.sizeSqft ?? ""} onChange={(e) => update(i, { sizeSqft: num(e.target.value) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Clear height in feet" inputMode="decimal" className="input mono w-20" defaultValue={r.clearHeightFt ?? ""} onChange={(e) => update(i, { clearHeightFt: num(e.target.value) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Deal date" type="date" className="input mono" value={r.dealDate ?? ""} onChange={(e) => update(i, { dealDate: e.target.value || null })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Notes" className="input w-56" value={r.notes ?? ""} maxLength={2000} onChange={(e) => update(i, { notes: e.target.value || null })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" disabled={pending || !rows.some((r) => r.include && r.occupier.trim())} onClick={save}>
              Save {rows.filter((r) => r.include).length} deals
            </button>
            <button type="button" className="btn" disabled={pending} onClick={reset}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
