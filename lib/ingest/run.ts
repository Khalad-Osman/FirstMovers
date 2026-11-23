import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import { todayInToronto } from "@/lib/research/run";
import { INGEST_SOURCES } from "./sources";
import { monthsBefore, type IngestSource, type SignalRow } from "./types";

const BATCH = 500;

// Some government servers reject Node's default user agent (CanadaBuys returns
// 403). Use a generic client name; no personal or account details.
const USER_AGENT = "FirstMovers-OpenDataIngest/1.0";
export const ingestFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
  return fetch(input, { ...init, headers });
};

export type RunCounts = {
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  skip_reasons: Record<string, number>;
};

// Pure driver (testable): reads items from a source, writes batches via `write`.
export async function drive(
  source: IngestSource,
  ctx: Parameters<IngestSource["run"]>[0],
  write: (rows: SignalRow[]) => Promise<{ inserted: number; updated: number }>,
  onBatch: (counts: RunCounts) => Promise<void> = async () => {},
): Promise<RunCounts> {
  const counts: RunCounts = { fetched: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0, skip_reasons: {} };
  let batch: SignalRow[] = [];
  const flush = async () => {
    if (!batch.length) return;
    // Same record twice in one batch would make the upsert fail; keep the last.
    const unique = [...new Map(batch.map((r) => [r.source_record_id, r])).values()];
    const res = await write(unique);
    counts.inserted += res.inserted;
    counts.updated += res.updated;
    counts.unchanged += unique.length - res.inserted - res.updated;
    batch = [];
    await onBatch(counts);
  };
  for await (const item of source.run(ctx)) {
    counts.fetched++;
    if ("skip" in item) {
      counts.skipped++;
      counts.skip_reasons[item.skip] = (counts.skip_reasons[item.skip] ?? 0) + 1;
      continue;
    }
    batch.push(item.row);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return counts;
}

// Server runs stop starting new requests after this, to finish inside the 300 s function limit.
const RUN_BUDGET_MS = 220_000;

async function knownRange(db: ReturnType<typeof createAdminClient>, source: string) {
  const pick = (asc: boolean) =>
    db.from("signals").select("source_record_id, published_at").eq("source_type", source as never).order("source_record_id", { ascending: asc }).limit(1).maybeSingle();
  const [{ data: newest }, { data: oldest }] = await Promise.all([pick(false), pick(true)]);
  return { newestId: newest?.source_record_id ?? null, oldestId: oldest?.source_record_id ?? null, oldestDate: oldest?.published_at ?? null };
}

// Background job (after()). Never throws: the outcome is written to ingestion_runs.
export async function runIngestionJob(runId: string, sourceType: string, opts: { deadline?: number } = {}): Promise<void> {
  const db = createAdminClient();
  const update = async (patch: TablesUpdate<"ingestion_runs">) => {
    await db.from("ingestion_runs").update(patch).eq("id", runId);
  };

  const source = INGEST_SOURCES.find((s) => s.source === sourceType);
  if (!source) {
    await update({ status: "failed", finished_at: new Date().toISOString(), errors: [`Unknown source ${sourceType}`] });
    return;
  }

  try {
    const { data: settings } = await db.from("settings").select("canadabuys_min_value, grants_min_value").maybeSingle();
    const today = todayInToronto();
    const ctx = {
      today,
      cutoff: monthsBefore(today, 12),
      canadabuysMinValue: Number(settings?.canadabuys_min_value ?? 100000),
      grantsMinValue: Number(settings?.grants_min_value ?? 100000),
      known: await knownRange(db, source.source),
      deadline: Math.min(Date.now() + RUN_BUDGET_MS, opts.deadline ?? Infinity),
      fetchImpl: ingestFetch,
      progress: (message: string) => update({ progress: message }),
    };
    await update({ settings: { cutoff: ctx.cutoff, today, canadabuys_min_value: ctx.canadabuysMinValue, grants_min_value: ctx.grantsMinValue } });

    const linkedBefore = await countLinked(db, source.source);
    const counts = await drive(
      source,
      ctx,
      async (rows) => {
        const { data, error } = await db.rpc("upsert_signals", { rows: rows as unknown as Json });
        if (error) throw new Error(`Saving signals failed: ${error.message}`);
        return data?.[0] ?? { inserted: 0, updated: 0 };
      },
      (c) => update({ ...c, progress: `Saved ${(c.inserted + c.updated + c.unchanged).toLocaleString("en-CA")} signals` }),
    );
    await db.rpc("link_signals_to_companies");
    const linked = (await countLinked(db, source.source)) - linkedBefore;

    await update({ ...counts, linked, status: "completed", progress: null, finished_at: new Date().toISOString() });
  } catch (e) {
    await update({
      status: "failed",
      progress: null,
      finished_at: new Date().toISOString(),
      errors: [e instanceof Error ? e.message : String(e)],
    });
  }
}

async function countLinked(db: ReturnType<typeof createAdminClient>, source: IngestSource["source"]) {
  const { count } = await db
    .from("signals")
    .select("id", { count: "exact", head: true })
    .eq("source_type", source)
    .not("company_id", "is", null);
  return count ?? 0;
}
