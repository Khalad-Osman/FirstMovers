"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobSecret, realDiscoveryDeps, triggerStep } from "@/lib/discovery/job";
import { appendRunError, createDiscoveryRun, PAUSED_PREFIX, STALE_STEP_MS } from "@/lib/discovery/run";

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  if (!host) throw new Error("Could not determine the server address.");
  return `${proto}://${host}`;
}

export type StartDiscoveryState = { error?: string } | undefined;

// Admin only. Spends Firecrawl and LLM credits within the configured caps.
export async function startDiscovery(): Promise<StartDiscoveryState> {
  const admin = await requireAdmin();
  try {
    jobSecret();
    await realDiscoveryDeps(); // keys + models configured?
  } catch (e) {
    return { error: `Discovery isn't configured yet: ${e instanceof Error ? e.message : String(e)}` };
  }

  const db = createAdminClient();
  const { data: active } = await db.from("discovery_runs").select("id").in("status", ["queued", "running"]).limit(1);
  if (active?.length) return { error: "A discovery run is already in progress. Wait for it to finish." };

  const runId = await createDiscoveryRun(db, admin.id);
  const base = await origin();
  after(() => triggerStep(base, runId).catch(async (e) => {
    await db.from("discovery_runs").update({ status: "failed", errors: [String(e)], finished_at: new Date().toISOString() }).eq("id", runId);
  }));
  redirect(`/discovery/${runId}`);
}

export async function resumeDiscovery(runId: string) {
  await requireAdmin();
  const id = z.uuid().parse(runId);
  const db = createAdminClient();
  const { data: run } = await db.from("discovery_runs").select("status, outcomes, started_at").eq("id", id).single();
  if (!run || (run.status !== "running" && run.status !== "queued")) return { error: "This run isn't in progress." };
  const outcomes = Array.isArray(run.outcomes) ? (run.outcomes as { status?: string; startedAt?: string }[]) : [];
  const last = outcomes[outcomes.length - 1];
  if (last?.status === "running" && last.startedAt && Date.now() - Date.parse(last.startedAt) < STALE_STEP_MS) {
    return { error: "A step is still running. Try again in a few minutes." };
  }
  const base = await origin();
  await db.from("discovery_runs").update({ progress: "Resuming" }).eq("id", id); // clears a "Paused" state
  after(() =>
    triggerStep(base, id).catch((e) =>
      appendRunError(db, id, `${e instanceof Error ? e.message : String(e)}. Use Resume run to continue.`, { progress: `${PAUSED_PREFIX}: could not start the next step` }),
    ),
  );
  revalidatePath(`/discovery/${id}`);
}
