import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getFirecrawl } from "@/lib/firecrawl/client";
import { getProvider, resolveModel } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInToronto } from "@/lib/research/run";
import type { DiscoveryDeps } from "./run";

export const STEP_PATH = "/api/discovery/step";
export const SECRET_HEADER = "x-discovery-secret";

// Fails fast with a clear message if anything needed for a run is missing,
// before any credits are spent.
export async function realDiscoveryDeps(): Promise<DiscoveryDeps> {
  const db = createAdminClient();
  const { data: settings } = await db.from("settings").select("screening_model, analysis_model").maybeSingle();
  const provider = getProvider();
  getFirecrawl(); // throws if FIRECRAWL_API_KEY is missing
  return {
    db,
    today: todayInToronto(),
    screening: { provider, model: resolveModel("screening", settings) },
    analysis: { provider, model: resolveModel("analysis", settings) },
    firecrawl: () => getFirecrawl(),
  };
}

export function jobSecret(): string {
  const s = process.env.DISCOVERY_JOB_SECRET;
  if (!s || s.length < 16) throw new Error("DISCOVERY_JOB_SECRET is not set (at least 16 characters) in .env.local / Vercel env.");
  return s;
}

export function secretMatches(given: string | null): boolean {
  const expected = process.env.DISCOVERY_JOB_SECRET;
  if (!expected || expected.length < 16 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Ask the server to run the next step in a fresh invocation.
export async function triggerStep(origin: string, runId: string): Promise<void> {
  const res = await fetch(`${origin}${STEP_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [SECRET_HEADER]: jobSecret() },
    body: JSON.stringify({ runId }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Could not trigger discovery step (HTTP ${res.status})`);
}
