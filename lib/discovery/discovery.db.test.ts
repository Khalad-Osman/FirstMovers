// Full discovery run against the LOCAL Supabase, with Firecrawl and both models
// faked. Run: npm run test:db
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModelOutput } from "@/lib/brief/schema";
import type { LLMProvider, StructuredRequest } from "@/lib/llm";
import type { ScrapeResult } from "@/lib/firecrawl/client";
import { FirecrawlError } from "@/lib/firecrawl/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCompanyName } from "@/lib/research/normalize";
import { createDiscoveryRun, stepDiscovery, type DiscoveryDeps, type Outcome } from "./run";

const TODAY = "2026-11-10";
const stamp = Date.now();
const NAME = (x: string) => `Zz Discovery Test ${x} ${stamp} Inc.`;
const A = NAME("Alpha"); // verified -> brief
const B = NAME("Bravo"); // analysis says entity not verified
const C = NAME("Charlie"); // web finds nothing (records only), then the model call fails -> failed
const db = createAdminClient();
let userId = "";
const runIds: string[] = [];

const usage = { inputTokens: 10, outputTokens: 5 };
const respond = (req: StructuredRequest, body: unknown) => ({ text: JSON.stringify(body), usage, model: req.model });

// Screening: recommend only our test companies; everything else (real ingested data) gets 0.
const screening: LLMProvider = {
  name: "fake-screen",
  async generateStructured(req) {
    const items = [...req.messages[req.messages.length - 1].content.matchAll(/<candidate key="([^"]+)">\nName: ([^\n]+)/g)];
    return respond(req, {
      results: items.map(([, key, name]) => {
        const ours = name.startsWith("Zz Discovery Test");
        return { key, industrialOccupier: ours ? "yes" : "no", physicalSignal: ours ? 5 : 0, reason: ours ? "Test company with a new building permit." : "Not a test company.", research: ours };
      }),
    });
  },
};

function briefFor(name: string, sourceCount: number, verified: boolean): ModelOutput {
  const ids = Array.from({ length: sourceCount }, (_, i) => `S${i + 1}`);
  return {
    company: { name, entityNotes: null, localConnection: "Plant in Mississauga, Ontario.", entityStatus: verified ? "verified" : "not_verified" },
    ledger: ids.map((id, i) => ({ sourceId: id, evidenceType: "fact", relevance: i === 0 && verified ? "signal" : "context", finding: `Finding ${id}.`, repeatCoverageOf: null })),
    chain: {
      whatChanged: verified ? { status: "supported", text: "New building permit.", sourceIds: ["S1"] } : { status: "unknown", text: "Not established.", sourceIds: [] },
      operationalConsequence: { status: "unknown", text: "Not established.", sourceIds: [] },
      facilityPressure: { status: "unknown", text: "Not established.", sourceIds: [] },
      forcingEvent: { status: "unknown", text: "Not established.", sourceIds: [] },
      realEstateDecision: { status: "unknown", text: "Not established.", sourceIds: [] },
    },
    countercase: ["Existing space may suffice."],
    alternativesAssessment: "alternatives_possible",
    existingFacilityInvestment: false,
    otherPremises: { assessment: "not_indicated", address: null, text: "No other premises identified.", sourceIds: [] },
    companyType: "unknown",
    dealIndicators: [],
    brokerAngle: { type: "monitor_only", headline: "Nothing to act on yet.", talkingPoints: [] }, dealPotential: { summary: "No transaction indicated yet.", opportunities: [] }, contacts: { website: null, phone: null, people: [], premises: [] },
    workingHypothesis: null,
    unknowns: ["Utilization."],
    commercialValue: null,
    nextStep: { action: "monitor", text: "Watch.", validatingQuestion: null },
    rating: verified ? "worth_monitoring" : "no_meaningful_signal",
    ratingReason: "Test.",
    stage: "undetermined",
  };
}

const analysis: LLMProvider = {
  name: "fake-analysis",
  async generateStructured(req) {
    const msg = req.messages[0].content;
    const name = /Company under review: ([^\n]+)/.exec(msg)![1];
    const count = Number(/Number of sources: (\d+)/.exec(msg)![1]);
    if (name === C) throw new Error("Simulated provider outage for Charlie");
    return respond(req, briefFor(name, count, name !== B));
  },
};

function firecrawl() {
  const u = { requests: 0, credits: 0 };
  return {
    usage: u,
    async search({ query }: { query: string }) {
      u.requests++;
      u.credits += 2;
      if (query.includes("Charlie")) return [];
      const who = query.includes("Alpha") ? "alpha" : "bravo";
      return [1, 2].map((i) => ({ url: `https://example.com/disc-${stamp}/${who}/${i}`, title: `${who} Ontario plant ${i}`, description: "Ontario facility expansion" }));
    },
    async scrape(url: string): Promise<ScrapeResult> {
      u.requests++;
      if (url.includes("/charlie/")) throw new FirecrawlError("blocked", 403);
      u.credits++;
      const who = url.includes("/alpha/") ? A : B; // pages must name the company to be kept
      return { url, markdown: `# ${who}\n\n${"Ontario manufacturing expansion details. ".repeat(15)}`, rawHtml: null, metadata: { "article:published_time": "2026-10-01" } };
    },
  };
}

const deps: DiscoveryDeps = {
  db,
  today: TODAY,
  screening: { provider: screening, model: "fake-cheap" },
  analysis: { provider: analysis, model: "fake-strong" },
  firecrawl,
};

async function runToEnd(runId: string) {
  for (let i = 0; i < 12; i++) if ((await stepDiscovery(runId, deps)).done) return;
  throw new Error("run did not finish");
}

beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({ email: `disc${stamp}@test.local`, password: "password123", email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  await db.from("profiles").update({ role: "admin" }).eq("id", userId);
  const signals = [A, B, C].flatMap((name, i) =>
    (["new_building", "addition"] as const).map((strength, j) => ({
      source_type: "permit_mississauga" as const,
      source_record_id: `ZZTEST-${stamp}-${i}-${j}`,
      raw_entity_name: name,
      entity_key: normalizeCompanyName(name),
      occupier_status: "named" as const,
      signal_strength: strength,
      title: `Mississauga permit: ${strength} for ${name}`,
      summary: "Test signal",
      published_at: "2026-10-20",
      location: "1 Test Rd, Mississauga, Ontario",
      raw: { test: true },
    })),
  );
  const { error: sErr } = await db.from("signals").insert(signals);
  if (sErr) throw sErr;
});

describe("discovery run (local DB)", () => {
  it("screens, researches the shortlist, and publishes within the cap", async () => {
    const runId = await createDiscoveryRun(db, userId);
    runIds.push(runId);

    // Step 1: build + screen
    expect((await stepDiscovery(runId, deps)).done).toBe(false);
    const { data: afterScreen } = await db.from("discovery_runs").select("status, candidates, candidates_found").eq("id", runId).single();
    const shortlisted = (afterScreen!.candidates as { displayName: string; shortlisted: boolean }[]).filter((c) => c.shortlisted);
    expect(afterScreen!.status).toBe("running");
    expect(shortlisted).toHaveLength(3);
    expect(shortlisted.every((c) => c.displayName.startsWith("Zz Discovery Test"))).toBe(true);

    // Two overlapping workers: only one may process the next candidate.
    await Promise.all([stepDiscovery(runId, deps), stepDiscovery(runId, deps)]);
    const { data: mid } = await db.from("discovery_runs").select("outcomes").eq("id", runId).single();
    expect((mid!.outcomes as Outcome[]).length).toBe(1);
    const { count: sessionsForFirst } = await db.from("research_sessions").select("id", { count: "exact", head: true }).eq("query", (mid!.outcomes as Outcome[])[0].displayName);
    expect(sessionsForFirst).toBe(1);

    await runToEnd(runId);
    const { data: run } = await db.from("discovery_runs").select("*").eq("id", runId).single();
    const outcomes = run!.outcomes as Outcome[];
    const by = Object.fromEntries(outcomes.map((o) => [o.displayName, o]));

    expect(run!.status).toBe("completed");
    const { data: notes } = await db.from("notifications").select("kind, title, body, link").eq("discovery_run_id", runId);
    expect(notes).toEqual([
      expect.objectContaining({ kind: "discovery_completed", title: "Discovery finished: 1 brief", link: `/discovery/${runId}` }),
    ]);
    expect(notes![0].body).toMatch(/1 Worth Monitoring · 1 not verified · 1 failed/);
    expect(by[A].status).toBe("brief");
    expect(by[B].status).toBe("not_verified");
    expect(by[C].status).toBe("failed");
    expect(run!.analyzed).toBe(1);
    expect((run!.errors as string[]).join()).toMatch(/Charlie/);

    // Each company's stored permits went in as public record sources, first.
    const sessionOf = async (name: string) =>
      (await db.from("research_sessions").select("source_ids, progress, status").eq("query", name).eq("discovery_run_id", runId).single()).data!;
    const alpha = await sessionOf(A);
    const { data: alphaSources } = await db.from("sources").select("id, date_method").in("id", alpha.source_ids);
    const methodOf = new Map(alphaSources!.map((s) => [s.id, s.date_method]));
    expect(alpha.source_ids.map((id: string) => methodOf.get(id))).toEqual(["public_record", "public_record", "metadata", "metadata"]);
    // Charlie: no web results, but research is ready from its records alone (it failed later, at the model call).
    const charlie = await sessionOf(C);
    expect(charlie.source_ids).toHaveLength(2);
    expect(by[C].status === "failed" && by[C].error).toMatch(/Simulated provider outage/);

    const usageTotals = run!.usage as Record<string, number>;
    expect(usageTotals.screening_llm_calls).toBeGreaterThanOrEqual(1);
    expect(usageTotals.llm_calls).toBe(usageTotals.screening_llm_calls + 2); // one analysis each for Alpha and Bravo
    expect(usageTotals.firecrawl_credits).toBeGreaterThan(0);

    // The published brief: Discovered, linked to its trigger signal and the run.
    const briefId = (by[A] as Extract<Outcome, { status: "brief" }>).briefId;
    const { data: brief } = await db.from("briefs").select("origin, trigger_signal_id, discovery_run_id, trigger_query, signals(title), companies(display_name)").eq("id", briefId).single();
    expect(brief).toMatchObject({ origin: "discovered", discovery_run_id: runId, trigger_query: null });
    expect(brief!.signals?.title).toMatch(/Alpha/);
    expect(brief!.companies?.display_name).toBe(A);

    // Its signals were linked to the new company.
    const { count: linked } = await db.from("signals").select("id", { count: "exact", head: true }).like("source_record_id", `ZZTEST-${stamp}-0-%`).not("company_id", "is", null);
    expect(linked).toBe(2);

    // Not-verified entity is not in the feed.
    const { count: bravoBriefs } = await db.from("briefs").select("id, companies!inner(display_name)", { count: "exact", head: true }).eq("companies.display_name", B);
    expect(bravoBriefs).toBe(0);
  });

  it("skips the company analyzed in the skip window on the next run", async () => {
    const runId = await createDiscoveryRun(db, userId);
    runIds.push(runId);
    await stepDiscovery(runId, deps);
    const { data: run } = await db.from("discovery_runs").select("skipped, candidates").eq("id", runId).single();
    expect((run!.skipped as { company: string; reason: string }[])).toContainEqual({ company: A, reason: "analyzed in the skip window" });
    const shortlisted = (run!.candidates as { displayName: string; shortlisted: boolean }[]).filter((c) => c.shortlisted).map((c) => c.displayName);
    expect(shortlisted.some((n) => n.includes("Alpha"))).toBe(false);
    await runToEnd(runId);
  });
});

afterAll(async () => {
  // Companies first (their briefs cascade), then the runs.
  const { data: companies } = await db.from("companies").select("id").like("display_name", `Zz Discovery Test %${stamp}%`);
  for (const c of companies ?? []) await db.from("companies").delete().eq("id", c.id);
  const { error: runErr } = await db.from("discovery_runs").delete().in("id", runIds);
  if (runErr) throw new Error(`cleanup failed: ${runErr.message}`);
  await db.from("research_sessions").delete().like("query", `Zz Discovery Test %${stamp}%`);
  const { data: testSignals } = await db.from("signals").select("id").like("source_record_id", `ZZTEST-${stamp}-%`);
  if (testSignals?.length) await db.from("sources").delete().in("signal_id", testSignals.map((s) => s.id));
  await db.from("signals").delete().like("source_record_id", `ZZTEST-${stamp}-%`);
  await db.from("sources").delete().like("url", `https://example.com/disc-${stamp}/%`);
  if (userId) await db.auth.admin.deleteUser(userId);
});
