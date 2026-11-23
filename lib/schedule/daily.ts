import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { INGEST_SOURCES } from "@/lib/ingest/sources";
import { runIngestionJob } from "@/lib/ingest/run";
import { createDiscoveryRun, failRun } from "@/lib/discovery/run";
import { jobSecret, realDiscoveryDeps, triggerStep } from "@/lib/discovery/job";
import { dailyOrder, decideScheduledDiscovery, torontoParts } from "./plan";
import { monthToDateCredits } from "./usage-db";

const RUNNING_GRACE_MS = 15 * 60 * 1000;
// The whole daily job must finish inside Vercel's 300 s function limit (found
// 2026-11-19: the registry scraper's own 220 s budget started after ~100 s of
// other sources, the function was killed and the permit sources never ran).
const DAILY_BUDGET_MS = 250_000;
const MIN_SOURCE_MS = 20_000;

export type DailySummary = {
  date: string;
  ingestion: { source: string; status: string; detail?: string }[];
  discovery: { started: boolean; runId?: string; reason?: string };
};

// The daily scheduled job. Ingestion runs inline (fast, free); discovery is
// started and continues through the chained step route.
export async function runDaily(origin: string, now = new Date()): Promise<DailySummary> {
  const db = createAdminClient();
  const today = torontoParts(now);
  const { data: s } = await db.from("settings").select("*").maybeSingle();
  const summary: DailySummary = { date: today.date, ingestion: [], discovery: { started: false } };

  // 1. Ingestion
  if (!s?.schedule_ingestion_enabled) {
    summary.ingestion.push({ source: "all", status: "skipped", detail: "Scheduled ingestion is off." });
  } else {
    const deadline = now.getTime() + DAILY_BUDGET_MS;
    // A run ended by the function time limit never records its end: close it.
    await db
      .from("ingestion_runs")
      .update({ status: "failed", progress: null, finished_at: new Date().toISOString(), errors: ["Stopped: the server's time limit ended the run."] })
      .eq("status", "running")
      .lt("started_at", new Date(now.getTime() - RUNNING_GRACE_MS).toISOString());
    for (const src of dailyOrder(INGEST_SOURCES)) {
      if (deadline - Date.now() < MIN_SOURCE_MS) {
        summary.ingestion.push({ source: src.source, status: "skipped", detail: "Not enough time left in today's job; runs tomorrow." });
        continue;
      }
      const { data: running } = await db
        .from("ingestion_runs")
        .select("id")
        .eq("source", src.source)
        .eq("status", "running")
        .gte("started_at", new Date(now.getTime() - RUNNING_GRACE_MS).toISOString())
        .limit(1);
      if (running?.length) {
        summary.ingestion.push({ source: src.source, status: "skipped", detail: "Already running." });
        continue;
      }
      const { data: run, error } = await db
        .from("ingestion_runs")
        .insert({ source: src.source, status: "running", progress: "Starting (scheduled)", trigger: "scheduled" })
        .select("id")
        .single();
      if (error) {
        summary.ingestion.push({ source: src.source, status: "failed", detail: error.message });
        continue;
      }
      await runIngestionJob(run.id, src.source, { deadline }); // never throws; outcome stored on the run
      const { data: done } = await db.from("ingestion_runs").select("status, inserted, updated, errors").eq("id", run.id).single();
      summary.ingestion.push({
        source: src.source,
        status: done?.status ?? "unknown",
        detail: done?.status === "completed" ? `new ${done.inserted}, updated ${done.updated}` : JSON.stringify(done?.errors ?? []),
      });
    }
  }

  // 2. Discovery
  const { data: active } = await db.from("discovery_runs").select("id").in("status", ["queued", "running"]).limit(1);
  const decision = decideScheduledDiscovery({
    enabled: Boolean(s?.schedule_discovery_enabled),
    schedule: {
      frequency: (s?.discovery_frequency as "daily" | "weekly" | "monthly" | undefined) ?? "weekly",
      weekdays: s?.discovery_weekdays ?? [1],
      monthDay: s?.discovery_month_day ?? 1,
    },
    today,
    activeRun: Boolean(active?.length),
    monthCredits: await monthToDateCredits(db, now),
    budget: s?.firecrawl_monthly_budget ?? 800,
    cap: s?.discovery_cap ?? 3,
  });
  if (!decision.run) {
    summary.discovery = { started: false, reason: decision.reason };
    return summary;
  }
  try {
    jobSecret();
    await realDiscoveryDeps(); // keys and models configured?
  } catch (e) {
    summary.discovery = { started: false, reason: `Discovery isn't configured: ${e instanceof Error ? e.message : String(e)}` };
    return summary;
  }
  const runId = await createDiscoveryRun(db, null, "scheduled");
  try {
    await triggerStep(origin, runId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failRun(db, runId, msg); // also notifies the team
    summary.discovery = { started: false, runId, reason: `Could not start the run: ${msg}` };
    return summary;
  }
  summary.discovery = { started: true, runId };
  return summary;
}
