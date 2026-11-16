"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIngestSource } from "@/lib/ingest/sources";
import { runIngestionJob } from "@/lib/ingest/run";

// Admin only. Ingestion uses no Firecrawl or LLM credits (public downloads).
export async function startIngestion(source: string) {
  const admin = await requireAdmin();
  const def = getIngestSource(source);
  if (!def) return { error: "Unknown data source." };

  const db = createAdminClient();
  const { data: running } = await db
    .from("ingestion_runs")
    .select("id, started_at")
    .eq("source", def.source)
    .eq("status", "running")
    .gte("started_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .limit(1);
  if (running?.length) return { error: `${def.label} is already running.` };

  const { data, error } = await db
    .from("ingestion_runs")
    .insert({ source: def.source, started_by: admin.id, status: "running", progress: "Starting" })
    .select("id")
    .single();
  if (error) return { error: `Could not start ingestion: ${error.message}` };

  after(() => runIngestionJob(data.id, def.source));
  revalidatePath("/sources");
}
