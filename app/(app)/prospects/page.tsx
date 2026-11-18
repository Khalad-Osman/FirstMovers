import type { Metadata } from "next";
import Link from "next/link";
import { getProspects } from "@/lib/data/prospects";
import { filterProspects, GTA_REGIONS, parseProspectFilters, type SignalFamily } from "@/lib/prospects";
import { REGIONS, REGION_KEYS } from "@/lib/research/filters";
import { ANGLE_LABEL, RATING_LABEL, type Rating } from "@/lib/brief/schema";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Prospects · First Movers" };

const PAGE = 50;
const FAMILY_LABEL: Record<SignalFamily, string> = { permit: "Permit", grant: "Grant", award: "Award" };
const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;

export default async function ProspectsPage({ searchParams }: PageProps<"/prospects">) {
  const params = await searchParams;
  const filters = parseProspectFilters(params);
  const all = await getProspects();
  const list = filterProspects(all, filters);
  const page = Math.max(1, Number(params.page) || 1);
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== "page" && typeof v === "string") query.set(k, v);
  for (const [k, v] of Object.entries(params)) if (Array.isArray(v)) v.forEach((x) => query.append(k, x));
  const pageHref = (p: number) => `/prospects?${new URLSearchParams([...query.entries(), ["page", String(p)]])}`;
  const selectedRegions = filters.regions === "all" ? [] : filters.regions;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Prospects"
        description="Every named company in the stored permits, grants and contract awards with recent physical activity, ranked by the discovery rule score. Public records only: no AI, no credits. Use Research for a full brief."
      >
        <a href={`/prospects/export?${query}`} className="btn">
          Export CSV
        </a>
      </PageHeader>

      <form method="get" className="grid gap-3 border border-line bg-panel p-4">
        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1">Region</legend>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-white px-2.5 py-1.5 text-[0.9375rem]">
              <input type="checkbox" name="region" value="all" defaultChecked={filters.regions === "all"} className="h-4 w-4" />
              All Ontario
            </label>
            {REGION_KEYS.map((r) => (
              <label key={r} className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-white px-2.5 py-1.5 text-[0.9375rem]">
                <input type="checkbox" name="region" value={r} defaultChecked={selectedRegions.includes(r)} className="h-4 w-4" />
                {REGIONS[r].label}
              </label>
            ))}
          </div>
          <span className="field-hint">Default: the GTA ({GTA_REGIONS.map((r) => REGIONS[r].label).join(", ")}). Untick all regions to get the GTA again.</span>
        </fieldset>
        <div className="flex flex-wrap items-end gap-4">
          <fieldset className="grid gap-1.5">
            <legend className="field-label mb-1">Signal type</legend>
            <div className="flex flex-wrap gap-2">
              {(["permit", "grant", "award"] as const).map((t) => (
                <label key={t} className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-white px-2.5 py-1.5 text-[0.9375rem]">
                  <input type="checkbox" name="type" value={t} defaultChecked={filters.families.includes(t)} className="h-4 w-4" />
                  {FAMILY_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1">
            <span className="field-label">Minimum value ($)</span>
            <input name="min" inputMode="numeric" defaultValue={filters.minValue ?? ""} className="input mono w-40" placeholder="e.g. 1,000,000" />
          </label>
          <label className="inline-flex items-center gap-2 pb-2 text-[0.9375rem]">
            <input type="checkbox" name="new" value="1" defaultChecked={filters.neverAnalyzed} className="h-4 w-4" />
            Never analyzed only
          </label>
          <div className="flex gap-2 pb-0.5">
            <button type="submit" className="btn btn-primary">
              Apply
            </button>
            <Link href="/prospects" className="btn">
              Reset
            </Link>
          </div>
        </div>
      </form>

      <p className="text-[0.9375rem]">
        <span className="mono font-semibold">{list.length}</span> of {all.length} companies with physical activity
        {list.length > PAGE && ` · page ${page} of ${pages}`}
      </p>

      {shown.length === 0 ? (
        <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
          <p className="font-semibold">No prospects match these filters.</p>
          <p className="mt-1 text-meta">Try All Ontario, or load signals from Data sources.</p>
        </div>
      ) : (
        <ol className="grid">
          {shown.map((p) => (
            <li key={p.key} className="grid gap-2 border-b border-line py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto min-w-0 text-[1.0625rem] font-semibold">{p.name}</h2>
                <span className="mono text-[0.875rem]" title="Discovery rule score">
                  Score {p.score}
                </span>
                {p.families.map((f) => (
                  <span key={f} className="badge badge-stage">
                    {FAMILY_LABEL[f]}
                  </span>
                ))}
                {p.brief ? (
                  <Link href={`/briefs/${p.brief.id}`} className="badge badge-signal">
                    Brief: {RATING_LABEL[p.brief.rating as Rating] ?? p.brief.rating}
                    {p.brief.angle && p.brief.angle !== "monitor_only" ? ` · ${ANGLE_LABEL[p.brief.angle as keyof typeof ANGLE_LABEL]}` : ""} · {formatDate(p.brief.analyzedAt)}
                  </Link>
                ) : (
                  <span className="badge badge-stage">Public record only</span>
                )}
              </div>
              <p className="text-[0.875rem] text-meta">
                {[p.municipality, p.regions.map((r) => REGIONS[r].label).join(", ")].filter(Boolean).join(" · ")}
                {p.maxValue !== null && ` · largest value ${money(p.maxValue)}`}
                {" · "}
                {p.reasons.join(", ")}
              </p>
              <ul className="grid gap-1 text-[0.9375rem]">
                {p.signals.slice(0, 3).map((s) => (
                  <li key={s.id} className="flex flex-wrap gap-x-3">
                    <span className="mono text-[0.875rem]">{formatDate(s.date)}</span>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="link min-w-0">
                        {s.title}
                      </a>
                    ) : (
                      <span className="min-w-0">{s.title}</span>
                    )}
                    {s.value !== null && <span className="mono text-[0.875rem] text-meta">{money(s.value)}</span>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/research?company=${encodeURIComponent(p.name)}`} className="btn">
                  Research
                </Link>
                {p.signals.length > 3 && (
                  <details className="text-[0.9375rem]">
                    <summary className="link cursor-pointer">All {p.signals.length} records</summary>
                    <ul className="mt-2 grid gap-1 border-l-2 border-line pl-3">
                      {[...p.signals].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).map((s) => (
                        <li key={s.id} className="flex flex-wrap gap-x-3">
                          <span className="mono text-[0.875rem]">{formatDate(s.date)}</span>
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="link min-w-0">
                              {s.title}
                            </a>
                          ) : (
                            <span className="min-w-0">{s.title}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="btn">
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={pageHref(page + 1)} className="btn">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
