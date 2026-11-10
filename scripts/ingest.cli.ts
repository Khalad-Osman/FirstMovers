// Command-line ingestion (same job as the "Run now" button). Free: public downloads only.
// Usage: npm run ingest -- <source|all>   e.g. npm run ingest -- permit_mississauga
import { it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { INGEST_SOURCES } from "@/lib/ingest/sources";
import { runIngestionJob } from "@/lib/ingest/run";

const wanted = (process.env.INGEST_SOURCE || "all").trim();
const targets = wanted === "all" ? INGEST_SOURCES : INGEST_SOURCES.filter((s) => s.source === wanted);

it(`ingest ${wanted}`, async () => {
  if (!targets.length) throw new Error(`Unknown source "${wanted}". Use one of: all, ${INGEST_SOURCES.map((s) => s.source).join(", ")}`);
  const db = createAdminClient();
  for (const s of targets) {
    const t0 = Date.now();
    const { data, error } = await db.from("ingestion_runs").insert({ source: s.source, status: "running", progress: "Starting (CLI)" }).select("id").single();
    if (error) throw error;
    await runIngestionJob(data.id, s.source);
    const { data: run } = await db.from("ingestion_runs").select("*").eq("id", data.id).single();
    console.log(`\n${s.label}: ${run?.status} in ${Math.round((Date.now() - t0) / 1000)}s`);
    console.log(`  read ${run?.fetched} · new ${run?.inserted} · updated ${run?.updated} · unchanged ${run?.unchanged} · skipped ${run?.skipped} · linked ${run?.linked}`);
    console.log(`  skip reasons: ${JSON.stringify(run?.skip_reasons)}`);
    if (Array.isArray(run?.errors) && run.errors.length) console.log(`  errors: ${JSON.stringify(run.errors)}`);
  }
}, 1_800_000);
