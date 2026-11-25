import type { Metadata } from "next";
import { SECTOR_LABEL } from "@/lib/sector";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAUSED_PREFIX, STALE_STEP_MS, type Outcome, type StoredCandidate } from "@/lib/discovery/run";
import { RATING_LABEL, type Rating } from "@/lib/brief/schema";
import { RatingBadge } from "@/components/badges";
import { ActionButton } from "@/components/action-button";
import { Poller } from "../../research/[id]/poller";
import { resumeDiscovery } from "../actions";
import { RunStatusBadge, formatTime } from "../ui";

export const metadata: Metadata = { title: "Discovery run · First Movers" };
export const maxDuration = 300;

const VERDICT_CLASS = { yes: "badge-supported", no: "badge-not-relevant", unclear: "badge-inferred" } as const;

// Server component: evaluated once per request, so reading the clock is fine.
function isStale(outcomes: Outcome[], startedAt: string): boolean {
  const last = outcomes[outcomes.length - 1];
  const since = last?.status === "running" ? last.startedAt : startedAt;
  return Date.now() - Date.parse(since) > STALE_STEP_MS;
}

export default async function DiscoveryRunPage({ params }: PageProps<"/discovery/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: run, error }, user] = await Promise.all([supabase.from("discovery_runs").select("*").eq("id", id).maybeSingle(), getCurrentUser()]);
  if (error) throw new Error(`Could not load run: ${error.message}`);
  if (!run) notFound();

  const candidates = (Array.isArray(run.candidates) ? run.candidates : []) as unknown as StoredCandidate[];
  const outcomes = (Array.isArray(run.outcomes) ? run.outcomes : []) as unknown as Outcome[];
  const skipped = (Array.isArray(run.skipped) ? run.skipped : []) as { company: string; reason: string }[];
  const errors = (Array.isArray(run.errors) ? run.errors : []) as string[];
  const usage = (run.usage ?? {}) as Record<string, number>;
  const settings = (run.settings ?? {}) as Record<string, number>;
  const active = run.status === "queued" || run.status === "running";
  const paused = active && (run.progress ?? "").startsWith(PAUSED_PREFIX);
  const stale = active && (paused || isStale(outcomes, run.started_at));
  const shortlisted = candidates.filter((c) => c.shortlisted);

  return (
    <div className="grid gap-6">
      {active && !stale && <Poller intervalMs={4000} />}
      <Link href="/discovery" className="link w-fit text-[0.875rem]">
        ← Discovery
      </Link>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <RunStatusBadge status={run.status} />
          <span className="badge badge-stage">{SECTOR_LABEL[run.sector]}</span>
          {run.trigger === "scheduled" && <span className="badge badge-stage">Scheduled</span>}
          <span className="mono text-[0.875rem] text-meta">
            Started {formatTime(run.started_at)}
            {run.finished_at ? ` · finished ${formatTime(run.finished_at)}` : ""}
          </span>
        </div>
        <h1 className="text-[1.5rem] font-semibold">Discovery run</h1>
        {active && !stale && (
          <p role="status" className="flex items-center gap-2 text-[0.9375rem]">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            {run.progress ?? "Working"}… The run continues if you leave this page.
          </p>
        )}
        {stale && (
          <div role="alert" className="grid gap-2 border-l-4 border-[#b45309] bg-[#fffbeb] px-4 py-2 text-[0.9375rem]">
            <p>
              {paused
                ? "This run paused: the server could not start its next step. The work so far is saved."
                : "This run hasn't made progress for over 15 minutes."}
            </p>
            {user?.role === "admin" && <ActionButton action={resumeDiscovery.bind(null, run.id)} label="Resume run" pendingLabel="Resuming…" className="btn w-fit" />}
          </div>
        )}
        <dl className="mono flex flex-wrap gap-2 text-[0.875rem]">
          <Stat label="Candidates" value={run.candidates_found} />
          <Stat label="Screened" value={candidates.filter((c) => c.screened).length} />
          <Stat label="Shortlisted" value={shortlisted.length} />
          <Stat label="Briefs" value={run.analyzed} />
        </dl>
        {/* Run usage and caps, collapsed so the summary reads cleanly (2026-11-25). */}
        <details className="grid gap-2">
          <summary className="mono w-fit cursor-pointer text-[0.8125rem] text-meta">Usage and caps</summary>
          <dl className="mono mt-2 flex flex-wrap gap-2 text-[0.875rem]">
            <Stat label="Firecrawl credits" value={`~${usage.firecrawl_credits ?? 0}`} />
            <Stat label="Firecrawl requests" value={usage.firecrawl_requests ?? 0} />
            <Stat label="LLM calls" value={usage.llm_calls ?? 0} />
            <Stat label="Tokens in / out" value={`${(usage.input_tokens ?? 0).toLocaleString("en-CA")} / ${(usage.output_tokens ?? 0).toLocaleString("en-CA")}`} />
          </dl>
          <p className="mono mt-2 text-[0.8125rem] text-meta">
            Caps: {settings.discovery_cap ?? 3} companies · {settings.sources_per_candidate ?? 5} sources each · screened top {settings.screening_top_k ?? 30} · skip window {settings.skip_window_days ?? 7} days
          </p>
        </details>
      </header>

      {errors.length > 0 && (
        <section role="alert" className="grid gap-1 border-l-4 border-[var(--error-fg)] bg-[var(--error-bg)] px-4 py-3 text-[0.9375rem]">
          <p className="font-semibold text-[var(--error-fg)]">Problems in this run</p>
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="label border-b border-line pb-1.5">Researched companies · {shortlisted.length}</h2>
        {shortlisted.length === 0 ? (
          <p className="text-meta">{active ? "Not chosen yet." : "No candidate was recommended for research in this run."}</p>
        ) : (
          <ul>
            {shortlisted.map((c, i) => {
              const o = outcomes[i];
              return (
                <li key={c.key} className="grid gap-1 border-b border-line py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.displayName}</span>
                    {o?.status === "brief" && <RatingBadge rating={o.rating as Rating} />}
                    {o?.status === "not_verified" && <span className="badge badge-unknown">Entity not verified</span>}
                    {o?.status === "failed" && <span className="badge badge-failed">Failed</span>}
                    {o?.status === "skipped" && <span className="badge badge-stage">Skipped</span>}
                    {o?.status === "running" && <span className="badge badge-context">In progress</span>}
                    {!o && <span className="badge badge-stage">Waiting</span>}
                  </div>
                  <p className="text-[0.875rem] text-meta">Surfaced by: {c.topSignal.title}</p>
                  {o?.status === "brief" && (
                    <Link href={`/briefs/${o.briefId}`} className="link w-fit text-[0.875rem]">
                      Open brief ({RATING_LABEL[o.rating as Rating] ?? o.rating})
                    </Link>
                  )}
                  {o?.status === "not_verified" && <p className="text-[0.875rem]">{o.reason} Listed here only, not in the feed.</p>}
                  {o?.status === "failed" && <p className="text-[0.875rem] text-[var(--error-fg)]">{o.error}</p>}
                  {o?.status === "skipped" && <p className="text-[0.875rem]">{o.reason}</p>}
                  {o && "sessionId" in o && o.sessionId && (
                    <Link href={`/research/${o.sessionId}`} className="link w-fit text-[0.8125rem]">
                      Sources collected
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="label border-b border-line pb-1.5">Screened candidates · {candidates.length}</h2>
        {candidates.length === 0 ? (
          <p className="text-meta">{active ? "Building and screening candidates…" : "No candidates."}</p>
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[760px] border-collapse text-left text-[0.875rem]">
              <thead className="bg-panel">
                <tr>
                  <th className="label px-3 py-2">Candidate</th>
                  <th className="label px-3 py-2">Rule score</th>
                  <th className="label px-3 py-2">Industrial</th>
                  <th className="label px-3 py-2">Physical</th>
                  <th className="label px-3 py-2">Screening reason</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.key} className={`border-t border-line align-top ${c.shortlisted ? "bg-[#eef2ff]" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-semibold">
                        {c.displayName}
                        {c.shortlisted && <span className="badge badge-signal ml-2">Researched</span>}
                      </div>
                      <div className="text-[0.8125rem] text-meta">
                        {c.signalCount} signal{c.signalCount === 1 ? "" : "s"} · {c.topSignal.title}
                      </div>
                    </td>
                    <td className="mono px-3 py-2">
                      {c.score}
                      <div className="text-[0.75rem] text-meta">{c.scoreParts.join("; ")}</div>
                    </td>
                    <td className="px-3 py-2">{c.verdict ? <span className={`badge ${VERDICT_CLASS[c.verdict.industrialOccupier]}`}>{c.verdict.industrialOccupier}</span> : <span className="text-meta">not screened</span>}</td>
                    <td className="mono px-3 py-2">{c.verdict ? `${c.verdict.physicalSignal}/5` : "—"}</td>
                    <td className="px-3 py-2">{c.verdict?.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {run.candidates_found > candidates.length && (
          <p className="text-[0.8125rem] text-meta">
            {run.candidates_found - candidates.length} lower-scoring candidates were not screened (screening depth {settings.screening_top_k ?? 30}).
          </p>
        )}
      </section>

      {skipped.length > 0 && (
        <details className="border-t border-line pt-3">
          <summary className="label cursor-pointer">Skipped before screening · {skipped.length}</summary>
          <ul className="mt-2 grid gap-1 text-[0.875rem]">
            {skipped.map((s) => (
              <li key={`${s.company}-${s.reason}`}>
                {s.company}: <span className="text-meta">{s.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-line px-3 py-1.5">
      <dt className="text-[0.75rem] text-meta">{label}</dt>
      <dd className="font-semibold">{typeof value === "number" ? value.toLocaleString("en-CA") : value}</dd>
    </div>
  );
}
