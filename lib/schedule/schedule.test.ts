import { describe, expect, it } from "vitest";
import { parseSettingsForm } from "@/lib/settings";
import { decideScheduledDiscovery, maxRunCredits, torontoParts } from "./plan";
import { aggregateUsage, monthOf } from "./usage";

describe("torontoParts", () => {
  it("uses Toronto time for date, weekday and month", () => {
    // 2026-11-10 03:00 UTC is still Monday Nov 9 in Toronto (UTC-5).
    expect(torontoParts(new Date("2026-11-10T03:00:00Z"))).toEqual({ date: "2026-11-09", weekday: 1, month: "2026-11" });
    // 2026-12-01 04:30 UTC is Nov 30 in Toronto.
    expect(torontoParts(new Date("2026-12-01T04:30:00Z")).month).toBe("2026-11");
    expect(torontoParts(new Date("2026-11-11T15:00:00Z")).weekday).toBe(3);
  });
});

describe("decideScheduledDiscovery", () => {
  const base = { enabled: true, weekday: 1, todayWeekday: 1, activeRun: false, monthCredits: 0, budget: 800, cap: 3 };

  it("runs on the configured day within budget", () => {
    expect(decideScheduledDiscovery(base)).toEqual({ run: true });
  });

  it.each([
    [{ enabled: false }, /off/],
    [{ todayWeekday: 2 }, /Not the discovery day \(Monday\)/],
    [{ activeRun: true }, /already in progress/],
    [{ monthCredits: 790 }, /790 used \+ up to 39 .* exceed 800/],
  ])("skips when %o", (over, reason) => {
    const d = decideScheduledDiscovery({ ...base, ...over });
    expect(d.run).toBe(false);
    if (!d.run) expect(d.reason).toMatch(reason);
  });

  it("allows a run that exactly fits the budget", () => {
    expect(decideScheduledDiscovery({ ...base, monthCredits: 800 - maxRunCredits(3) }).run).toBe(true);
  });
});

describe("aggregateUsage", () => {
  const sessions = [
    { created_at: "2026-11-05T15:00:00Z", discovery_run_id: null, usage: { firecrawl_credits: 11, firecrawl_requests: 8, llm_calls: 1, input_tokens: 7000, output_tokens: 1500 }, brief_id: "b1" },
    { created_at: "2026-11-06T15:00:00Z", discovery_run_id: null, usage: { firecrawl_credits: 2, firecrawl_requests: 1 }, brief_id: null },
    // Belongs to a discovery run: must not be counted again
    { created_at: "2026-11-07T15:00:00Z", discovery_run_id: "r1", usage: { firecrawl_credits: 12, llm_calls: 1 }, brief_id: "b2" },
    { created_at: "2026-10-20T15:00:00Z", discovery_run_id: null, usage: { firecrawl_credits: 5 }, brief_id: null },
  ];
  const runs = [
    { started_at: "2026-11-07T14:00:00Z", trigger: "manual" as const, usage: { firecrawl_credits: 30, llm_calls: 6, screening_llm_calls: 3, input_tokens: 20000, output_tokens: 4000 }, analyzed: 2 },
    { started_at: "2026-11-09T14:00:00Z", trigger: "scheduled" as const, usage: { firecrawl_credits: 25, llm_calls: 5, screening_llm_calls: 3 }, analyzed: 1 },
  ];

  it("buckets by Toronto month, newest first, without double counting discovery research", () => {
    const months = aggregateUsage(sessions, runs);
    expect(months.map((m) => m.month)).toEqual(["2026-11", "2026-10"]);
    const nov = months[0];
    expect(nov.by.live_research).toMatchObject({ runs: 2, briefs: 1, firecrawlCredits: 13, llmCalls: 1 });
    expect(nov.by.discovery_manual).toMatchObject({ runs: 1, briefs: 2, firecrawlCredits: 30, screeningCalls: 3 });
    expect(nov.by.discovery_scheduled).toMatchObject({ runs: 1, briefs: 1, firecrawlCredits: 25 });
    expect(nov.total.firecrawlCredits).toBe(68); // 13 + 30 + 25; the 12 inside run r1 is not added again
    expect(nov.total.briefs).toBe(4);
  });

  it("ignores malformed usage values", () => {
    expect(aggregateUsage([{ created_at: "2026-11-01T15:00:00Z", discovery_run_id: null, usage: { firecrawl_credits: "lots" }, brief_id: null }], [])[0].total.firecrawlCredits).toBe(0);
  });

  it("assigns month by Toronto time", () => {
    expect(monthOf("2026-12-01T03:00:00Z")).toBe("2026-11");
  });
});

describe("settings form", () => {
  const form = (over: Record<string, string> = {}) => {
    const f = new FormData();
    const values = {
      discovery_cap: "3", sources_per_candidate: "5", skip_window_days: "7", canadabuys_min_value: "100000",
      screening_model: "", analysis_model: "  my-model-1  ", discovery_weekday: "1", firecrawl_monthly_budget: "800",
      schedule_ingestion_enabled: "on", ...over,
    };
    for (const [k, v] of Object.entries(values)) f.set(k, v);
    return f;
  };

  it("parses valid input: blank model = default, checkboxes, trimming", () => {
    const r = parseSettingsForm(form());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ discovery_cap: 3, screening_model: null, analysis_model: "my-model-1", schedule_ingestion_enabled: true, schedule_discovery_enabled: false });
  });

  it.each([
    [{ discovery_cap: "4" }, /at most 3/], // limited to 3 until steps are triggered from outside the app
    [{ discovery_cap: "0" }, /at least 1/],
    [{ sources_per_candidate: "6" }, /At most 5/],
    [{ discovery_weekday: "7" }, /.+/],
    [{ analysis_model: "gpt; drop table" }, /may only contain/],
  ])("rejects %o", (over, msg) => {
    const r = parseSettingsForm(form(over));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(msg);
  });
});
