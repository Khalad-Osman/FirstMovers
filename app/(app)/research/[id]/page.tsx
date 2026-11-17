import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { briefAnalysisSchema } from "@/lib/brief/schema";
import { recencyTier } from "@/lib/analysis/recency";
import { RECENCY_LABEL } from "@/lib/brief/schema";
import { formatDate } from "@/lib/format";
import { BriefView } from "@/components/brief-view";
import { ActionButton } from "@/components/action-button";
import { analyzeSources, addToFeed } from "../actions";
import { ResearchForm } from "../research-form";
import { RUNNING, ResearchStatusBadge } from "../status";
import { Poller } from "./poller";
import { checkFilters, hasFilters, researchFiltersSchema } from "@/lib/research/filters";
import { FilterCheck, FilterSummary } from "./filter-check";

export const metadata: Metadata = { title: "Live Research · First Movers" };
export const maxDuration = 300; // analysis continues in after()

const STALE_MS = 10 * 60 * 1000;

// Server component: evaluated once per request, so reading the clock is fine.
function isStale(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > STALE_MS;
}

const DATE_METHOD_LABEL = {
  metadata: "page metadata",
  structured_data: "structured data",
  url: "URL",
  text: "page text",
  none: "no date found",
  public_record: "public record",
} as const;

function plainExcerpt(text: string | null, max = 280): string {
  if (!text) return "";
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

type Usage = { firecrawl_requests?: number; firecrawl_credits?: number; llm_calls?: number; input_tokens?: number; output_tokens?: number };

export default async function ResearchSessionPage({ params }: PageProps<"/research/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: session, error } = await supabase.from("research_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load research: ${error.message}`);
  if (!session) notFound();

  const { data: sourceRows, error: sErr } = session.source_ids.length
    ? await supabase.from("sources").select("id, url, publisher, title, published_at, date_method, excerpt").in("id", session.source_ids)
    : { data: [], error: null };
  if (sErr) throw new Error(`Could not load sources: ${sErr.message}`);
  const byId = new Map((sourceRows ?? []).map((s) => [s.id, s]));
  const sources = session.source_ids.map((sid) => byId.get(sid)).filter((s): s is NonNullable<typeof s> => Boolean(s));

  const running = RUNNING.includes(session.status);
  const stale = running && isStale(session.updated_at);
  const usage = (session.usage ?? {}) as Usage;
  const analysis = session.analysis ? briefAnalysisSchema.safeParse(session.analysis) : null;
  const errors = Array.isArray(session.analysis_errors) ? (session.analysis_errors as string[]) : [];
  const themeResults = (Array.isArray(session.theme_results) ? session.theme_results : []) as {
    url: string;
    title: string;
    description: string;
    publisher: string;
    matches?: string[];
  }[];
  const parsedFilters = session.filters ? researchFiltersSchema.safeParse(session.filters) : null;
  const filters = parsedFilters?.success && hasFilters(parsedFilters.data) ? parsedFilters.data : null;
  const filterRows =
    filters && session.mode === "company" && sources.length > 0
      ? checkFilters({
          filters,
          brief: analysis?.success
            ? { localConnection: analysis.data.company.localConnection, companyType: analysis.data.companyType, dealIndicators: analysis.data.dealIndicators }
            : null,
          sources: sources.map((s, i) => ({ id: `S${i + 1}`, text: `${s.title ?? ""}
${s.excerpt ?? ""}` })),
        })
      : [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

  return (
    <div className="grid gap-6">
      {running && !stale && <Poller />}
      <Link href="/research" className="link w-fit text-[0.875rem]">
        ← Live Research
      </Link>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ResearchStatusBadge status={session.status} />
          <span className="text-[0.875rem] text-meta">{session.mode === "theme" ? "Theme search" : "Company research"}</span>
        </div>
        <h1 className="text-[1.5rem] font-semibold">{session.query}</h1>
        {filters && <FilterSummary filters={filters} />}
        <div className="mono flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-meta">
          <span>Started {formatDate(session.created_at)}</span>
          <span>Firecrawl: {usage.firecrawl_requests ?? 0} requests · ~{usage.firecrawl_credits ?? 0} credits</span>
          {(usage.llm_calls ?? 0) > 0 && (
            <span>
              LLM: {usage.llm_calls} calls · {usage.input_tokens ?? 0} in / {usage.output_tokens ?? 0} out tokens
            </span>
          )}
        </div>
        {running && !stale && (
          <p role="status" className="flex items-center gap-2 text-[0.9375rem]">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            {session.progress ?? "Working"}… You can leave this page; the research keeps running.
          </p>
        )}
        {stale && (
          <p role="alert" className="form-error">
            This research stopped responding (no progress for over 10 minutes). Start it again from Live Research.
          </p>
        )}
        {session.error && !running && (
          <p role="alert" className="form-error">
            {session.error}
          </p>
        )}
      </header>

      {/* Theme mode: list results, then let the user pick a company to research */}
      {session.mode === "theme" && themeResults.length > 0 && (
        <section className="grid gap-3">
          <h2 className="label border-b border-line pb-1.5">Search results · {themeResults.length}</h2>
          <ol className="grid">
            {themeResults.map((r) => (
              <li key={r.url} className="grid gap-0.5 border-b border-line py-2.5">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="link font-semibold">
                  {r.title}
                </a>
                <span className="text-[0.8125rem] text-meta">{r.publisher}</span>
                {r.matches && r.matches.length > 0 && (
                  <span className="flex flex-wrap gap-1.5">
                    {r.matches.map((m) => (
                      <span key={m} className="badge badge-supported">
                        Matches {m}
                      </span>
                    ))}
                  </span>
                )}
                {r.description && <p className="text-[0.9375rem]">{r.description}</p>}
              </li>
            ))}
          </ol>
          <div className="grid gap-2 border border-line bg-panel p-4">
            <p className="text-[0.9375rem]">
              Pick a company from these results and enter its full name to research it.
            </p>
            <ResearchForm compact />
          </div>
        </section>
      )}

      {/* Company mode: unclassified evidence ledger */}
      {session.mode === "company" && sources.length > 0 && (
        <section className="grid gap-3">
          <h2 className="label border-b border-line pb-1.5">
            Collected sources · {sources.length} · {analysis?.success ? "classified in the brief below" : "not yet classified"}
          </h2>
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[720px] border-collapse text-left text-[0.9375rem]">
              <thead className="bg-panel">
                <tr>
                  <th className="label px-3 py-2">ID</th>
                  <th className="label px-3 py-2">Source</th>
                  <th className="label px-3 py-2">Published</th>
                  <th className="label px-3 py-2">Excerpt</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s, i) => {
                  const tier = recencyTier({ publishedAt: s.published_at, eventAt: null }, today);
                  return (
                    <tr key={s.id} className="border-t border-line align-top">
                      <td className="mono px-3 py-2.5">S{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="link">
                          {s.title || s.url}
                        </a>
                        <div className="text-[0.8125rem] text-meta">{s.publisher}</div>
                      </td>
                      <td className="mono whitespace-nowrap px-3 py-2.5">
                        {formatDate(s.published_at)}
                        <div className="text-[0.75rem] text-meta">
                          {RECENCY_LABEL[tier]} · {DATE_METHOD_LABEL[s.date_method]}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[0.875rem]">{plainExcerpt(s.excerpt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {session.status === "ready" && (
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton
                action={analyzeSources.bind(null, session.id)}
                label={errors.length ? "Analyze again" : "Analyze sources"}
                pendingLabel="Starting analysis…"
                className="btn btn-primary"
              />
              <span className="text-[0.8125rem] text-meta">Runs the analysis model once (twice if the first result fails validation).</span>
            </div>
          )}
        </section>
      )}

      {filterRows.length > 0 && <FilterCheck rows={filterRows} analyzed={Boolean(analysis?.success)} />}

      {errors.length > 0 && session.status !== "analyzing" && (
        <section role="alert" className="grid gap-2 border-l-4 border-[var(--error-fg)] bg-[var(--error-bg)] px-4 py-3">
          <p className="font-semibold text-[var(--error-fg)]">The analysis didn&apos;t pass validation, so no brief was produced.</p>
          <ul className="list-disc pl-5 text-[0.9375rem]">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      {analysis?.success && (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3 border border-line bg-panel px-4 py-3">
            {session.status === "saved" && session.brief_id ? (
              <>
                <span className="font-semibold">Added to the feed.</span>
                <Link href={`/briefs/${session.brief_id}`} className="btn btn-primary">
                  Open saved brief
                </Link>
              </>
            ) : analysis.data.company.entityStatus !== "verified" ? (
              <span className="text-[0.9375rem]">
                <strong>Entity not verified.</strong> The sources don&apos;t confirm an operating business with Ontario operations, so this brief can&apos;t be added to the feed.
              </span>
            ) : (
              <>
                <span className="text-[0.9375rem]">Preview. Nothing is saved until you add it.</span>
                <ActionButton action={addToFeed.bind(null, session.id)} label="Add to feed" pendingLabel="Saving…" className="btn btn-primary" />
              </>
            )}
          </div>
          <BriefView
            analysis={analysis.data}
            companyName={analysis.data.company.name}
            isSample={false}
            analyzedAt={session.updated_at}
            origin="live_research"
            surfacedBy={`Live Research: ${session.query}`}
          />
          {session.analysis_model && <p className="mono text-[0.8125rem] text-meta">Model: {session.analysis_model}</p>}
        </section>
      )}
    </div>
  );
}
