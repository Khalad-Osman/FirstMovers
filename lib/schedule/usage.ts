// Usage aggregation (pure). Live Research usage comes from research_sessions
// that are NOT part of a discovery run; discovery usage comes from
// discovery_runs.usage, which already includes its research sessions.

export type UsageNumbers = {
  firecrawlCredits: number;
  firecrawlRequests: number;
  llmCalls: number;
  screeningCalls: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
  briefs: number;
};
export type UsageBucket = "live_research" | "discovery_manual" | "discovery_scheduled";
export type MonthUsage = { month: string; total: UsageNumbers; by: Record<UsageBucket, UsageNumbers> };

export type SessionRow = { created_at: string; discovery_run_id: string | null; usage: unknown; brief_id: string | null };
export type RunRow = { started_at: string; trigger: "manual" | "scheduled"; usage: unknown; analyzed: number };

const empty = (): UsageNumbers => ({ firecrawlCredits: 0, firecrawlRequests: 0, llmCalls: 0, screeningCalls: 0, inputTokens: 0, outputTokens: 0, runs: 0, briefs: 0 });

function num(u: unknown, key: string): number {
  if (!u || typeof u !== "object") return 0;
  const v = (u as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function add(target: UsageNumbers, u: unknown, briefs: number) {
  target.firecrawlCredits += num(u, "firecrawl_credits");
  target.firecrawlRequests += num(u, "firecrawl_requests");
  target.llmCalls += num(u, "llm_calls");
  target.screeningCalls += num(u, "screening_llm_calls");
  target.inputTokens += num(u, "input_tokens");
  target.outputTokens += num(u, "output_tokens");
  target.runs += 1;
  target.briefs += briefs;
}

// Month key in Toronto time.
export function monthOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
}

export function aggregateUsage(sessions: SessionRow[], runs: RunRow[]): MonthUsage[] {
  const months = new Map<string, MonthUsage>();
  const get = (m: string) => {
    let x = months.get(m);
    if (!x) {
      x = { month: m, total: empty(), by: { live_research: empty(), discovery_manual: empty(), discovery_scheduled: empty() } };
      months.set(m, x);
    }
    return x;
  };
  for (const s of sessions) {
    if (s.discovery_run_id) continue; // counted in its discovery run
    const m = get(monthOf(s.created_at));
    add(m.by.live_research, s.usage, s.brief_id ? 1 : 0);
    add(m.total, s.usage, s.brief_id ? 1 : 0);
  }
  for (const r of runs) {
    const m = get(monthOf(r.started_at));
    add(r.trigger === "scheduled" ? m.by.discovery_scheduled : m.by.discovery_manual, r.usage, r.analyzed);
    add(m.total, r.usage, r.analyzed);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}
