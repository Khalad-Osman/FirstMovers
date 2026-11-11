import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { INGEST_SOURCES } from "@/lib/ingest/sources";
import { runIngestionJob } from "@/lib/ingest/run";
import { createDiscoveryRun } from "@/lib/discovery/run";
import { jobSecret, realDiscoveryDeps, triggerStep } from "@/lib/discovery/job";
import { decideScheduledDiscovery, torontoParts } from "./plan";
import { monthToDateCredits } from "./usage-db";

const RUNNING_GRACE_MS = 15 * 60 * 1000;

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
    for (const src of INGEST_SOURCES) {
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
      await runIngestionJob(run.id, src.source); // never throws; outcome stored on the run
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
    weekday: s?.discovery_weekday ?? 1,
    todayWeekday: today.weekday,
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
  await triggerStep(origin, runId);
  summary.discovery = { started: true, runId };
  return summary;
}
