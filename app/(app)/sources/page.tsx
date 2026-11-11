import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { INGEST_SOURCES } from "@/lib/ingest/sources";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { Poller } from "../research/[id]/poller";
import { startIngestion } from "./actions";

export const metadata: Metadata = { title: "Data sources · First Movers" };
export const maxDuration = 300; // ingestion continues in after()

const STATUS_CLASS = { running: "badge-context", completed: "badge-supported", failed: "badge-failed", queued: "badge-stage" } as const;

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export default async function SourcesPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";
  const supabase = await createClient();

  const [{ data: runs, error }, counts] = await Promise.all([
    supabase.from("ingestion_runs").select("*").order("started_at", { ascending: false }).limit(40),
    Promise.all(
      INGEST_SOURCES.map(async (s) => {
        const [{ count: total }, { count: named }, { count: linked }] = await Promise.all([
          supabase.from("signals").select("id", { count: "exact", head: true }).eq("source_type", s.source),
          supabase.from("signals").select("id", { count: "exact", head: true }).eq("source_type", s.source).eq("occupier_status", "named"),
          supabase.from("signals").select("id", { count: "exact", head: true }).eq("source_type", s.source).not("company_id", "is", null),
        ]);
        return [s.source, { total: total ?? 0, named: named ?? 0, linked: linked ?? 0 }] as const;
      }),
    ),
  ]);
  if (error) throw new Error(`Could not load ingestion runs: ${error.message}`);
  const stats = Object.fromEntries(counts);
  const anyRunning = runs.some((r) => r.status === "running");

  return (
    <div className="grid gap-6">
      {anyRunning && <Poller intervalMs={4000} />}
      <PageHeader
        title="Data sources"
        description="Structured public sources ingested into signals. Each run reads the last 12 months; re-running updates records in place and never creates duplicates. No Firecrawl or LLM credits are used."
      />

      <ul className="grid gap-4 lg:grid-cols-2">
        {INGEST_SOURCES.map((s) => {
          const last = runs.find((r) => r.source === s.source);
          const st = stats[s.source];
          const reasons = last ? Object.entries((last.skip_reasons ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]) : [];
          return (
            <li key={s.source} className="grid content-start gap-3 border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[1.0625rem] font-semibold">{s.label}</h2>
                  <p className="text-[0.875rem] text-meta">{s.description}</p>
                </div>
                {isAdmin && (
                  <ActionButton
                    action={startIngestion.bind(null, s.source)}
                    label={last?.status === "running" ? "Running…" : "Run now"}
                    pendingLabel="Starting…"
                    className="btn btn-primary"
                  />
                )}
              </div>

              <dl className="mono grid grid-cols-3 gap-2 text-[0.875rem]">
                <Stat label="Signals" value={st.total} />
                <Stat label="Named occupier" value={s.source === "canadabuys_award" ? null : st.named} />
                <Stat label="Linked to company" value={st.linked} />
              </dl>

              {last ? (
                <div className="grid gap-1 text-[0.875rem]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${STATUS_CLASS[last.status]}`}>{last.status}</span>
                    <span className="mono text-meta">{formatTime(last.started_at)}</span>
                    {last.progress && last.status === "running" && <span>{last.progress}</span>}
                  </div>
                  {last.status !== "running" && (
                    <p className="mono text-meta">
                      Read {last.fetched.toLocaleString("en-CA")} · new {last.inserted} · updated {last.updated} · unchanged {last.unchanged} · skipped {last.skipped.toLocaleString("en-CA")}
                      {last.linked ? ` · linked ${last.linked}` : ""}
                    </p>
                  )}
                  {reasons.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-meta">Skip reasons</summary>
                      <ul className="mono mt-1 text-[0.8125rem]">
                        {reasons.map(([r, n]) => (
                          <li key={r}>
                            {r}: {n.toLocaleString("en-CA")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {Array.isArray(last.errors) && last.errors.length > 0 && (
                    <p role="alert" className="form-error">
                      {(last.errors as string[]).join(" ")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[0.875rem] text-meta">Never run.</p>
              )}
              <Link href={`/signals?source=${s.source}`} className="link w-fit text-[0.875rem]">
                Browse signals
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-[0.875rem] text-meta">
        Job Bank postings are not ingested: the open data has no employer names, so postings can&apos;t be tied to a company.
      </p>

      <section className="grid gap-2">
        <h2 className="label border-b border-line pb-1.5">Run history</h2>
        {runs.length === 0 ? (
          <p className="text-meta">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mono w-full min-w-[640px] text-left text-[0.8125rem]">
              <thead>
                <tr className="text-meta">
                  <th className="py-1 pr-3">Started</th>
                  <th className="py-1 pr-3">Source</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Trigger</th>
                  <th className="py-1 pr-3">Read</th>
                  <th className="py-1 pr-3">New</th>
                  <th className="py-1 pr-3">Updated</th>
                  <th className="py-1 pr-3">Unchanged</th>
                  <th className="py-1 pr-3">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-1 pr-3">{formatTime(r.started_at)}</td>
                    <td className="py-1 pr-3">{INGEST_SOURCES.find((s) => s.source === r.source)?.label ?? r.source}</td>
                    <td className="py-1 pr-3">{r.status}</td>
                    <td className="py-1 pr-3">{r.trigger}</td>
                    <td className="py-1 pr-3">{r.fetched}</td>
                    <td className="py-1 pr-3">{r.inserted}</td>
                    <td className="py-1 pr-3">{r.updated}</td>
                    <td className="py-1 pr-3">{r.unchanged}</td>
                    <td className="py-1 pr-3">{r.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-[0.75rem] text-meta">Times are Toronto time. Last updated {formatDate(new Date().toISOString())}.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="border border-line px-2 py-1.5">
      <dt className="text-[0.75rem] text-meta">{label}</dt>
      <dd className="text-base font-semibold">{value === null ? "n/a" : value.toLocaleString("en-CA")}</dd>
    </div>
  );
}
