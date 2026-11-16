import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { INGEST_SOURCES } from "@/lib/ingest/sources";
import type { Database } from "@/lib/supabase/database.types";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Signals · First Movers" };

type Source = Database["public"]["Enums"]["signal_source_type"];
type Strength = Database["public"]["Enums"]["signal_strength"];
type Occupier = Database["public"]["Enums"]["occupier_status"];

const PAGE = 50;
const STRENGTH_LABEL: Record<Strength, string> = {
  award: "Award",
  grant: "Grant",
  new_building: "New building",
  addition: "Addition",
  change_of_use: "Change of use",
  alteration: "Alteration",
  demolition: "Demolition",
  sign: "Sign",
  other: "Other",
};
const STRENGTH_CLASS: Record<Strength, string> = {
  award: "badge-signal",
  grant: "badge-signal",
  new_building: "badge-strong",
  addition: "badge-strong",
  change_of_use: "badge-worth",
  alteration: "badge-context",
  demolition: "badge-context",
  sign: "badge-stage",
  other: "badge-stage",
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function SignalsPage({ searchParams }: PageProps<"/signals">) {
  const params = await searchParams;
  const source = INGEST_SOURCES.find((s) => s.source === one(params.source))?.source as Source | undefined;
  const strength = one(params.strength) && one(params.strength)! in STRENGTH_LABEL ? (one(params.strength) as Strength) : undefined;
  const occupier = (["named", "unresolved"] as const).find((o) => o === one(params.occupier)) as Occupier | undefined;
  const q = one(params.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Number(one(params.page)) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("signals")
    .select("id, source_type, title, summary, raw_entity_name, occupier_status, signal_strength, published_at, event_at, location, url, company_id, companies(display_name)", { count: "exact" })
    .order("published_at", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (source) query = query.eq("source_type", source);
  if (strength) query = query.eq("signal_strength", strength);
  if (occupier) query = query.eq("occupier_status", occupier);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, " ")}%,raw_entity_name.ilike.%${q.replace(/[%,()]/g, " ")}%,location.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  const { data: signals, count, error } = await query;
  if (error) throw new Error(`Could not load signals: ${error.message}`);

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { source, strength, occupier, q, page, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    const s = p.toString();
    return s ? `/signals?${s}` : "/signals";
  };

  return (
    <div className="grid gap-5">
      <PageHeader title="Signals" description="Raw signals from structured sources. Discovery groups these into candidates; nothing here is a finding on its own." />

      <form className="flex flex-wrap items-end gap-2 border border-line bg-panel p-3" action="/signals">
        <Select name="source" label="Source" value={source} options={INGEST_SOURCES.map((s) => [s.source, s.label])} />
        <Select name="strength" label="Type" value={strength} options={Object.entries(STRENGTH_LABEL)} />
        <Select name="occupier" label="Occupier" value={occupier} options={[["named", "Named"], ["unresolved", "Unresolved"]]} />
        <label className="grid min-w-0 flex-1 basis-48 gap-1">
          <span className="field-label">Search</span>
          <input name="q" defaultValue={q} placeholder="Company, title or address" className="input" />
        </label>
        <button type="submit" className="btn btn-primary">
          Filter
        </button>
        <Link href="/signals" className="btn">
          Clear
        </Link>
      </form>

      <p className="mono text-[0.875rem] text-meta">
        {total.toLocaleString("en-CA")} signal{total === 1 ? "" : "s"}
        {pages > 1 ? ` · page ${page} of ${pages}` : ""}
      </p>

      {signals.length === 0 ? (
        <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
          <p className="font-semibold">No signals match.</p>
          <p className="mt-1 text-meta">Signals appear after an admin runs a source on the Data sources page.</p>
        </div>
      ) : (
        <ul>
          {signals.map((s) => (
            <li key={s.id} className="grid gap-1 border-b border-line py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${STRENGTH_CLASS[s.signal_strength]}`}>{STRENGTH_LABEL[s.signal_strength]}</span>
                <span className="min-w-0 font-semibold">{s.title}</span>
              </div>
              {s.summary && <p className="text-[0.9375rem]">{s.summary}</p>}
              <div className="mono flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-meta">
                <span>Published {formatDate(s.published_at)}</span>
                {s.event_at && s.event_at !== s.published_at && <span>Event {formatDate(s.event_at)}</span>}
                {s.location && <span>{s.location}</span>}
                {s.source_type.startsWith("permit_") && (
                  <span>{s.occupier_status === "named" ? `Occupier named: ${s.raw_entity_name}` : "Occupier unresolved"}</span>
                )}
                {s.source_type === "canadabuys_award" && s.raw_entity_name && <span>Supplier: {s.raw_entity_name}</span>}
                {s.source_type === "federal_grant" && s.raw_entity_name && <span>Recipient: {s.raw_entity_name}</span>}
                {s.source_type === "federal_grant" && <span>Date is the agreement start</span>}
                {s.companies?.display_name && <span>Linked: {s.companies.display_name}</span>}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="link">
                    Original record
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex gap-2" aria-label="Pages">
          {page > 1 && (
            <Link href={href({ page: page - 1 })} className="btn">
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={href({ page: page + 1 })} className="btn">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="grid gap-1">
      <span className="field-label">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="input">
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
