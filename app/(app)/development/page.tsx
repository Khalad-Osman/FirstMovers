import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { recordUrl, type RecordSignal } from "@/lib/research/records";
import { DEV_KIND_LABEL, type DevKind } from "@/lib/ingest/devapps";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Development watch · First Movers" };

// Development applications (added 2026-11-25): new commercial or industrial
// space, existing commercial sites being redeveloped and named new stores,
// before any permit. Public records only, no AI. Many name no company, so they
// don't appear on Prospects; this page lists them by area and kind.

// Every development source; the page has no city filter (decided 2026-11-25:
// listing only the cities covered so far made the page look incomplete).
const DEV_SOURCES = ["devapp_oakville", "devapp_hamilton"] as const;
const KINDS = Object.keys(DEV_KIND_LABEL) as DevKind[];
const KIND_HINT: Record<DevKind, string> = {
  named_store: "A named store or business is proposing a new building or use.",
  new_commercial_space: "New commercial space, usually without tenants yet: a leasing opportunity for the developer.",
  displacement: "An existing commercial site is being redeveloped: its tenants may need to move.",
  industrial_space: "New industrial or warehouse space, or an addition.",
};
const KIND_CLASS: Record<DevKind, string> = {
  named_store: "badge-strong",
  new_commercial_space: "badge-worth",
  displacement: "badge-signal",
  industrial_space: "badge-stage",
};

// Oakville file codes; Hamilton already writes them out.
const FILE_TYPE_LABEL: Record<string, string> = { SITE: "Site plan", ZBA: "Rezoning", OPA: "Official plan amendment", SUBD: "Plan of subdivision", CDM: "Plan of condominium" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

export default async function DevelopmentPage({ searchParams }: PageProps<"/development">) {
  const params = await searchParams;
  const kind = KINDS.find((k) => k === one(params.kind));

  const supabase = await createClient();
  let query = supabase
    .from("signals")
    .select("id, source_type, source_record_id, raw_entity_name, entity_key, signal_strength, title, summary, url, published_at, event_at, location, raw, sector")
    .in("source_type", [...DEV_SOURCES])
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(400);
  if (kind) query = query.eq("raw->>kind", kind);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load development applications: ${error.message}`);
  const items = data as unknown as RecordSignal[];

  const counts = new Map<DevKind, number>();
  for (const s of items) {
    const k = str((s.raw as Record<string, unknown>)?.kind) as DevKind;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const href = (over: { kind?: DevKind | null }) => {
    const p = new URLSearchParams();
    const k = over.kind === null ? undefined : (over.kind ?? kind);
    if (k) p.set("kind", k);
    const s = p.toString();
    return s ? `/development?${s}` : "/development";
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Development watch"
        description="Development applications from the last 24 months: new commercial or industrial space, existing commercial sites being redeveloped, and named new stores, before any building permit. Each item links to the municipality's own record."
      />

      <div className="grid gap-3 border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="field-label mr-1">Kind</span>
          <Link href={href({ kind: null })} className={`btn ${!kind ? "btn-primary" : ""}`}>
            All kinds
          </Link>
          {KINDS.map((k) => (
            <Link key={k} href={href({ kind: k })} className={`btn ${k === kind ? "btn-primary" : ""}`}>
              {DEV_KIND_LABEL[k]}
              {!kind && counts.get(k) ? <span className="mono ml-1.5 text-[0.8125rem]">{counts.get(k)}</span> : null}
            </Link>
          ))}
        </div>
        {kind && <p className="field-hint">{KIND_HINT[kind]}</p>}
      </div>

      <p className="mono text-[0.875rem] text-meta">
        {items.length} application{items.length === 1 ? "" : "s"}
        {items.length === 400 ? " (newest 400)" : ""}
      </p>

      {items.length === 0 ? (
        <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
          <p className="font-semibold">No development applications yet.</p>
          <p className="mt-1 text-meta">They appear after an admin runs the development application sources on the Data sources page, or after the daily job.</p>
        </div>
      ) : (
        <ul>
          {items.map((s) => {
            const raw = (s.raw ?? {}) as Record<string, unknown>;
            const k = str(raw.kind) as DevKind;
            const link = recordUrl(s);
            const address = (s.location ?? "").replace(/, Ontario$/, "");
            const status = str(raw.STATUS) || str(raw.DEVSTAT_EX);
            const fileType = str(raw.FILE_TYPE) || FILE_TYPE_LABEL[str(raw.FOLDERTYPE)] || str(raw.FOLDERTYPE);
            return (
              <li key={s.id} className="grid gap-1.5 border-b border-line py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${KIND_CLASS[k] ?? "badge-stage"}`}>{DEV_KIND_LABEL[k] ?? "Development"}</span>
                  {/formal consultation/i.test(fileType) && <span className="badge badge-stage">Pre-application</span>}
                  <span className="min-w-0 font-semibold">
                    {address}
                    {s.raw_entity_name ? ` · ${s.raw_entity_name}` : ""}
                  </span>
                </div>
                <p className="text-[0.9375rem]">{str(raw.description) || s.summary}</p>
                <div className="mono flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-meta">
                  <span>Received {formatDate(s.published_at)}</span>
                  {str(raw.latest_submission) && <span>Latest plans {str(raw.latest_submission)}</span>}
                  {fileType && <span>{fileType}</span>}
                  {status && <span>Status: {status}</span>}
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="link">
                      Municipal record
                    </a>
                  )}
                  {s.raw_entity_name && (
                    <Link href={`/research?company=${encodeURIComponent(s.raw_entity_name)}&sector=${s.sector ?? "retail"}`} className="link">
                      Research
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
