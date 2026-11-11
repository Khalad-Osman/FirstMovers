import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { torontoParts } from "./plan";
import { aggregateUsage, type RunRow, type SessionRow } from "./usage";

type Db = SupabaseClient<Database>;

// Works with the user-session client (pages; RLS allows reads) or the admin client (jobs).
export async function loadUsageRows(db: Db, sinceIso?: string): Promise<{ sessions: SessionRow[]; runs: RunRow[] }> {
  let sq = db.from("research_sessions").select("created_at, discovery_run_id, usage, brief_id");
  let rq = db.from("discovery_runs").select("started_at, trigger, usage, analyzed");
  if (sinceIso) {
    sq = sq.gte("created_at", sinceIso);
    rq = rq.gte("started_at", sinceIso);
  }
  const [{ data: sessions, error: e1 }, { data: runs, error: e2 }] = await Promise.all([sq, rq]);
  if (e1 || e2) throw new Error(`Could not load usage: ${(e1 ?? e2)!.message}`);
  return { sessions, runs };
}

export async function monthToDateCredits(db: Db, now = new Date()): Promise<number> {
  const { month } = torontoParts(now);
  // Two days of slack before the month start covers the Toronto/UTC offset;
  // aggregateUsage then buckets by Toronto month exactly.
  const since = new Date(Date.parse(`${month}-01T00:00:00Z`) - 2 * 86_400_000).toISOString();
  const { sessions, runs } = await loadUsageRows(db, since);
  return aggregateUsage(sessions, runs).find((m) => m.month === month)?.total.firecrawlCredits ?? 0;
}
