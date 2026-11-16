import "server-only";
import type { Firecrawl } from "@/lib/firecrawl/client";
import type { LLMProvider } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { runCompanyResearch } from "@/lib/research/pipeline";
import { createDbStore } from "@/lib/research/store";
import { attachRecords } from "@/lib/research/records-db";
import { analyzeSession, saveSessionToFeed } from "@/lib/research/session";
import { DISCOVERY_CAP_MAX } from "@/lib/settings";
import { buildCandidates, groupKey, selectForScreening, type Candidate, type SignalForCandidate } from "./candidates";
import { screenCandidates, shortlist, type ScreenVerdict } from "./screen";

// Discovery pipeline (CLAUDE.md §4 steps 2–6), run one step per invocation:
//   step 1: build candidates + screen  (status queued -> running)
//   step n: research + analyze + publish ONE shortlisted candidate
//   last:   finalize                    (status -> completed)
// Each step claims its work with an optimistic check on `outcomes`, so two
// overlapping invocations never process the same candidate twice.

export const SCREEN_TOP_K = 30;
export const STALE_STEP_MS = 15 * 60 * 1000;

type Db = ReturnType<typeof createAdminClient>;
type JsonValue = NonNullable<Json>;

export type DiscoveryDeps = {
  db: Db;
  today: string;
  screening: { provider: LLMProvider; model: string };
  analysis: { provider: LLMProvider; model: string };
  firecrawl: () => Pick<Firecrawl, "search" | "scrape" | "usage">;
};

export type StoredCandidate = {
  key: string;
  displayName: string;
  aliases: string[];
  score: number;
  scoreParts: string[];
  signalCount: number;
  topSignal: { id: string; title: string; source: string; url: string | null; date: string | null };
  screened: boolean;
  verdict: ScreenVerdict | null;
  shortlisted: boolean;
};

export type Outcome =
  | { key: string; displayName: string; status: "running"; startedAt: string }
  | { key: string; displayName: string; status: "brief"; briefId: string; rating: string; sessionId: string }
  | { key: string; displayName: string; status: "not_verified"; sessionId: string; reason: string }
  | { key: string; displayName: string; status: "failed"; sessionId: string | null; error: string }
  | { key: string; displayName: string; status: "skipped"; reason: string };

type Usage = Record<string, number>;
const addUsage = (a: Usage, b: Usage): Usage => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (typeof v === "number") out[k] = (out[k] ?? 0) + v;
  return out;
};
const asArray = <T>(v: Json | null): T[] => (Array.isArray(v) ? (v as unknown as T[]) : []);
const asUsage = (v: Json | null): Usage => (v && typeof v === "object" && !Array.isArray(v) ? (v as Usage) : {});

export async function createDiscoveryRun(db: Db, startedBy: string | null, trigger: "manual" | "scheduled" = "manual"): Promise<string> {
  const { data: s } = await db.from("settings").select("*").maybeSingle();
  const settings = {
    discovery_cap: s?.discovery_cap ?? 3,
    sources_per_candidate: s?.sources_per_candidate ?? 5,
    skip_window_days: s?.skip_window_days ?? 7,
    screening_top_k: SCREEN_TOP_K,
  };
  const { data, error } = await db
    .from("discovery_runs")
    .insert({ started_by: startedBy, status: "queued", progress: "Queued", settings, trigger })
    .select("id")
    .single();
  if (error) throw new Error(`Could not start discovery: ${error.message}`);
  return data.id;
}

async function loadSignals(db: Db, cutoff: string): Promise<SignalForCandidate[]> {
  const out: SignalForCandidate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("signals")
      .select("id, source_type, raw_entity_name, entity_key, signal_strength, title, summary, url, published_at, event_at, location, raw")
      .not("entity_key", "is", null)
      .gte("published_at", cutoff)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Could not load signals: ${error.message}`);
    out.push(...(data as SignalForCandidate[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function recentlyAnalyzedKeys(db: Db, days: number): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db.from("briefs").select("companies(normalized_key, display_name, aliases)").gte("analyzed_at", since);
  if (error) throw new Error(`Could not load recent briefs: ${error.message}`);
  const keys = new Set<string>();
  for (const b of data) {
    const c = b.companies;
    if (!c) continue;
    keys.add(c.normalized_key);
    keys.add(groupKey(c.display_name));
    for (const a of c.aliases ?? []) keys.add(groupKey(a));
  }
  return keys;
}

function monthsBefore(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function toStored(c: Candidate, verdict: ScreenVerdict | null, screened: boolean, shortlisted: boolean): StoredCandidate {
  const top = c.signals.find((s) => s.id === c.topSignalId) ?? c.signals[0];
  return {
    key: c.key,
    displayName: c.displayName,
    aliases: c.aliases.slice(0, 5),
    score: c.score,
    scoreParts: c.scoreParts,
    signalCount: c.signals.length,
    topSignal: { id: top.id, title: top.title ?? "", source: top.source_type, url: top.url, date: top.event_at ?? top.published_at },
    screened,
    verdict,
    shortlisted,
  };
}

// ---- step 1 -------------------------------------------------------------------
async function buildAndScreen(runId: string, run: { settings: Json }, deps: DiscoveryDeps) {
  const { db } = deps;
  const settings = (run.settings ?? {}) as Record<string, number>;
  const cap = Math.min(DISCOVERY_CAP_MAX, Math.max(1, settings.discovery_cap ?? 3));

  await db.from("discovery_runs").update({ status: "running", progress: "Building candidates from signals" }).eq("id", runId);
  const signals = await loadSignals(db, monthsBefore(deps.today, 12));
  const { candidates, skipped } = buildCandidates(signals, {
    today: deps.today,
    skipKeys: await recentlyAnalyzedKeys(db, settings.skip_window_days ?? 7),
  });

  const top = selectForScreening(candidates, settings.screening_top_k ?? SCREEN_TOP_K);
  await db.from("discovery_runs").update({ progress: `Screening ${top.length} of ${candidates.length} candidates`, candidates_found: candidates.length }).eq("id", runId);
  const screening = await screenCandidates(top, deps.screening);
  const chosen = new Set(shortlist(top, screening.verdicts, cap).map((c) => c.key));
  const stored = top.map((c) => toStored(c, screening.verdicts.get(c.key) ?? null, screening.verdicts.has(c.key), chosen.has(c.key)));

  await db
    .from("discovery_runs")
    .update({
      candidates: stored as unknown as JsonValue,
      skipped: skipped.map((s) => ({ company: s.displayName, reason: s.reason })) as unknown as JsonValue,
      usage: { screening_llm_calls: screening.usage.llmCalls, llm_calls: screening.usage.llmCalls, input_tokens: screening.usage.inputTokens, output_tokens: screening.usage.outputTokens },
      errors: screening.errors,
      progress: chosen.size ? `Shortlisted ${chosen.size} for research` : "No candidates recommended for research",
    })
    .eq("id", runId);
  return chosen.size;
}

// ---- step n -------------------------------------------------------------------
async function processCandidate(runId: string, c: StoredCandidate, startedBy: string | null, settings: Record<string, number>, deps: DiscoveryDeps): Promise<{ outcome: Outcome; usage: Usage; stop?: string }> {
  const { db } = deps;
  let sessionId: string | null = null;
  try {
    const { data: session, error } = await db
      .from("research_sessions")
      .insert({ mode: "company", query: c.displayName, created_by: startedBy, status: "searching", progress: "Starting (discovery)", discovery_run_id: runId })
      .select("id")
      .single();
    if (error) throw new Error(`Could not create research session: ${error.message}`);
    sessionId = session.id;

    await db.from("discovery_runs").update({ progress: `Researching ${c.displayName}` }).eq("id", runId);
    // The candidate's own stored records (incl. the signal that surfaced it) are
    // evidence; a CanadaBuys award is read from the record, not scraped.
    const recordSourceIds = await attachRecords(db, { names: [c.displayName, ...c.aliases], mustInclude: c.topSignal.id, today: deps.today }).catch(
      () => [] as string[], // records are a bonus; web research still runs
    );
    await runCompanyResearch(sessionId, c.displayName, {
      firecrawl: deps.firecrawl(),
      store: createDbStore(),
      today: deps.today,
      maxSources: Math.min(5, settings.sources_per_candidate ?? 5),
      recordSourceIds,
    });
    let { data: s } = await db.from("research_sessions").select("status, error, usage, analysis, analysis_errors").eq("id", sessionId).single();
    if (!s || s.status === "failed") {
      const err = s?.error ?? "Research failed";
      return { outcome: { key: c.key, displayName: c.displayName, status: "failed", sessionId, error: err }, usage: asUsage(s?.usage ?? null), stop: /credits are used up/i.test(err) ? err : undefined };
    }

    await db.from("discovery_runs").update({ progress: `Analyzing ${c.displayName}` }).eq("id", runId);
    await analyzeSession(sessionId, { ...deps.analysis, today: deps.today, trigger: c.topSignal.title || c.displayName });
    ({ data: s } = await db.from("research_sessions").select("status, error, usage, analysis, analysis_errors").eq("id", sessionId).single());
    const usage = asUsage(s?.usage ?? null);
    if (!s || s.status !== "analyzed") {
      const errs = asArray<string>(s?.analysis_errors ?? null);
      return { outcome: { key: c.key, displayName: c.displayName, status: "failed", sessionId, error: errs.length ? `Analysis failed validation: ${errs.join(" ")}` : (s?.error ?? "Analysis failed") }, usage };
    }

    const entity = (s.analysis as { company?: { entityStatus?: string } } | null)?.company?.entityStatus;
    if (entity !== "verified") {
      return { outcome: { key: c.key, displayName: c.displayName, status: "not_verified", sessionId, reason: "Sources don't confirm an operating business with Ontario operations." }, usage };
    }

    const saved = await saveSessionToFeed(sessionId, startedBy, { origin: "discovered", triggerSignalId: c.topSignal.id, discoveryRunId: runId });
    if (!saved.ok) return { outcome: { key: c.key, displayName: c.displayName, status: "failed", sessionId, error: saved.error }, usage };
    const { data: brief } = await db.from("briefs").select("rating").eq("id", saved.briefId).single();
    return { outcome: { key: c.key, displayName: c.displayName, status: "brief", briefId: saved.briefId, rating: brief?.rating ?? "unknown", sessionId }, usage };
  } catch (e) {
    return { outcome: { key: c.key, displayName: c.displayName, status: "failed", sessionId, error: e instanceof Error ? e.message : String(e) }, usage: {} };
  }
}

// Returns done=true when the run has finished (or another worker owns the step).
export async function stepDiscovery(runId: string, deps: DiscoveryDeps): Promise<{ done: boolean }> {
  const { db } = deps;
  const { data: run, error } = await db.from("discovery_runs").select("*").eq("id", runId).single();
  if (error || !run) return { done: true };
  if (run.status === "completed" || run.status === "failed") return { done: true };

  try {
    if (run.status === "queued") {
      // Claim step 1: only one worker moves queued -> running.
      const { data: claimed } = await db.from("discovery_runs").update({ status: "running", progress: "Starting" }).eq("id", runId).eq("status", "queued").select("id");
      if (!claimed?.length) return { done: true };
      const shortlisted = await buildAndScreen(runId, run, deps);
      if (shortlisted === 0) {
        await finalize(db, runId, []);
        return { done: true };
      }
      return { done: false };
    }

    const settings = (run.settings ?? {}) as Record<string, number>;
    const candidates = asArray<StoredCandidate>(run.candidates).filter((c) => c.shortlisted);
    let outcomes = asArray<Outcome>(run.outcomes);

    // Recover a step that died mid-way.
    const last = outcomes[outcomes.length - 1];
    if (last?.status === "running") {
      if (Date.now() - Date.parse(last.startedAt) < STALE_STEP_MS) return { done: true }; // someone is working on it
      outcomes = [...outcomes.slice(0, -1), { key: last.key, displayName: last.displayName, status: "failed", sessionId: null, error: "Step stopped responding; skipped." }];
      await db.from("discovery_runs").update({ outcomes: outcomes as unknown as JsonValue }).eq("id", runId);
    }

    const next = candidates[outcomes.length];
    if (!next) {
      await finalize(db, runId, outcomes);
      return { done: true };
    }

    // Claim this candidate (optimistic: outcomes must be unchanged since we read it).
    const claim: Outcome[] = [...outcomes, { key: next.key, displayName: next.displayName, status: "running", startedAt: new Date().toISOString() }];
    const { data: claimed } = await db
      .from("discovery_runs")
      .update({ outcomes: claim as unknown as JsonValue })
      .eq("id", runId)
      .eq("outcomes", JSON.stringify(outcomes))
      .select("id");
    if (!claimed?.length) return { done: true };

    const result = await processCandidate(runId, next, run.started_by, settings, deps);
    const { data: fresh } = await db.from("discovery_runs").select("usage, errors").eq("id", runId).single();
    let finalOutcomes: Outcome[] = [...outcomes, result.outcome];
    const errors = asArray<string>(fresh?.errors ?? null);
    if (result.outcome.status === "failed") errors.push(`${next.displayName}: ${result.outcome.error}`);

    if (result.stop) {
      // Out of Firecrawl credits: skip the rest and finish.
      const rest = candidates.slice(finalOutcomes.length).map<Outcome>((c) => ({ key: c.key, displayName: c.displayName, status: "skipped", reason: "Firecrawl credits used up" }));
      finalOutcomes = [...finalOutcomes, ...rest];
    }
    await db
      .from("discovery_runs")
      .update({
        outcomes: finalOutcomes as unknown as JsonValue,
        usage: addUsage(asUsage(fresh?.usage ?? null), result.usage),
        errors,
        analyzed: finalOutcomes.filter((o) => o.status === "brief").length,
        progress: `Finished ${finalOutcomes.length} of ${candidates.length}`,
      })
      .eq("id", runId);
    // Finish in this step when nothing is left: one fewer chained request
    // (Vercel answers long self-call chains with 508 Loop Detected).
    if (finalOutcomes.length >= candidates.length) {
      await finalize(db, runId, finalOutcomes);
      return { done: true };
    }
    return { done: false };
  } catch (e) {
    await failRun(db, runId, e instanceof Error ? e.message : String(e));
    return { done: true };
  }
}

async function finalize(db: Db, runId: string, outcomes: Outcome[]) {
  await db
    .from("discovery_runs")
    .update({ status: "completed", progress: null, finished_at: new Date().toISOString(), analyzed: outcomes.filter((o) => o.status === "brief").length })
    .eq("id", runId)
    .in("status", ["queued", "running"]);
}

// Add a message to the run's errors without losing earlier ones.
export async function appendRunError(db: Db, runId: string, message: string, patch: Record<string, unknown> = {}) {
  const { data } = await db.from("discovery_runs").select("errors").eq("id", runId).maybeSingle();
  const errors = [...asArray<string>(data?.errors ?? null), message];
  await db.from("discovery_runs").update({ ...patch, errors }).eq("id", runId).in("status", ["queued", "running"]);
}

export async function failRun(db: Db, runId: string, message: string) {
  await appendRunError(db, runId, message, { status: "failed", progress: null, finished_at: new Date().toISOString() });
}

export const PAUSED_PREFIX = "Paused";

