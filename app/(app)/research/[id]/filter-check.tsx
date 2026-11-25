import { COMPANY_TYPES, DEAL_TYPES, REGIONS, type CheckRow, type ResearchFilters } from "@/lib/research/filters";

const STATUS = {
  match: { label: "Matches", className: "badge badge-supported" },
  no_match: { label: "Doesn't match", className: "badge badge-inferred" },
  not_stated: { label: "Not stated", className: "badge badge-stage" },
} as const;

export function FilterSummary({ filters }: { filters: ResearchFilters }) {
  const fmt = (n: number) => n.toLocaleString("en-CA");
  const parts = [
    ...filters.regions.map((r) => REGIONS[r].label),
    ...filters.companyTypes.map((t) => COMPANY_TYPES[t].label),
    ...filters.dealTypes.map((d) => DEAL_TYPES[d]),
    filters.minSqft !== undefined ? `≥ ${fmt(filters.minSqft)} sq ft` : null,
    filters.maxSqft !== undefined ? `≤ ${fmt(filters.maxSqft)} sq ft` : null,
    filters.minClearHeightFt !== undefined ? `≥ ${filters.minClearHeightFt} ft clear` : null,
  ].filter((p): p is string => Boolean(p));
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.875rem]">
      <span className="text-meta">Filters:</span>
      {parts.map((p) => (
        <span key={p} className="badge badge-stage">
          {p}
        </span>
      ))}
    </div>
  );
}

export function FilterCheck({ rows, analyzed }: { rows: CheckRow[]; analyzed: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section className="grid gap-3">
      <h2 className="label border-b border-line pb-1.5">Fits your filters?</h2>
      <p className="text-[0.8125rem] text-meta">
        Checked against {analyzed ? "the brief and " : ""}the collected sources. &quot;Not stated&quot; means the sources don&apos;t say; nothing is assumed.
      </p>
      <ul className="grid">
        {rows.map((r) => (
          <li key={r.filter} className="grid gap-1 border-b border-line py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.filter}</span>
              <span className="text-[0.875rem] text-meta">wanted: {r.wanted}</span>
              <span className={STATUS[r.status].className}>{STATUS[r.status].label}</span>
            </div>
            <p className="text-[0.9375rem]">{r.detail}</p>
            {r.evidence && r.evidence.length > 0 && (
              <ul className="grid gap-1 pl-4 text-[0.875rem]">
                {r.evidence.map((e, i) => (
                  <li key={`${e.sourceId}-${i}`}>
                    <span className="mono font-semibold">{e.sourceId}</span>: {e.quote}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
