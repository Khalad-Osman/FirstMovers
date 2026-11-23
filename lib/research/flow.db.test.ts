// Integration test against the LOCAL Supabase (npm run db:start). Runs the real
// pipeline, DB store, analyze step and Add to feed, with Firecrawl and the LLM
// faked. Run: npm run test:db
import { afterAll, describe, expect, it } from "vitest";
import type { ModelOutput } from "@/lib/brief/schema";
import { createFakeProvider } from "@/lib/llm/fake";
import type { ScrapeResult } from "@/lib/firecrawl/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCompanyResearch } from "./pipeline";
import { createDbStore } from "./store";
import { attachRecords } from "./records-db";
import { analyzeSession, saveSessionToFeed } from "./session";

const TODAY = "2026-11-10";
const stamp = Date.now();
const COMPANY = `Testbed Fabrication ${stamp} Inc.`;
const urls = [1, 2, 3].map((n) => `https://example.com/flow-${stamp}/item-${n}`);
const db = createAdminClient();
const created: { sessions: string[]; users: string[]; signals: string[] } = { sessions: [], users: [], signals: [] };

function fakeFirecrawl() {
  const usage = { requests: 0, credits: 0 };
  return {
    usage,
    async search() {
      usage.requests++;
      usage.credits += 2;
      return urls.map((url, i) => ({ url, title: `${COMPANY} Ontario plant news ${i + 1}`, description: "Ontario facility" }));
    },
    async scrape(url: string): Promise<ScrapeResult> {
      usage.requests++;
      usage.credits++;
      const n = urls.indexOf(url) + 1;
      return {
        url,
        markdown: `# ${COMPANY} item ${n}\n\n${"Ontario manufacturing details. ".repeat(20)}`,
        rawHtml: null,
        metadata: { title: `Item ${n}`, "og:site_name": "Example News", "article:published_time": `2026-10-0${n}` },
      };
    },
  };
}

function modelOutput(): ModelOutput {
  return {
    company: { name: COMPANY, entityNotes: null, localConnection: "Plant in Brampton, Ontario.", entityStatus: "verified" },
    ledger: [
      { sourceId: "S1", evidenceType: "fact", relevance: "signal", finding: "New contract.", repeatCoverageOf: null },
      { sourceId: "S2", evidenceType: "fact", relevance: "signal", finding: "Same contract, repeat coverage.", repeatCoverageOf: "S1" },
      { sourceId: "S3", evidenceType: "fact", relevance: "context", finding: "Company profile.", repeatCoverageOf: null },
    ],
    chain: {
      whatChanged: { status: "supported", text: "Won a contract.", sourceIds: ["S1"] },
      operationalConsequence: { status: "inferred", text: "More volume.", sourceIds: ["S1"] },
      facilityPressure: { status: "unknown", text: "Not established.", sourceIds: [] },
      forcingEvent: { status: "unknown", text: "Not established.", sourceIds: [] },
      realEstateDecision: { status: "unknown", text: "Not established.", sourceIds: [] },
    },
    countercase: ["Existing capacity may absorb the volume."],
    alternativesAssessment: "alternatives_possible",
    existingFacilityInvestment: false,
    otherPremises: { assessment: "not_indicated", address: null, text: "No other premises identified.", sourceIds: [] },
    companyType: "unknown",
    dealIndicators: [],
    brokerAngle: { type: "monitor_only", headline: "Nothing to act on yet.", talkingPoints: [] }, dealPotential: { summary: "No transaction indicated yet.", opportunities: [] }, contacts: { website: null, phone: null, people: [], premises: [] },
    workingHypothesis: null,
    unknowns: ["Plant utilization."],
    commercialValue: null,
    nextStep: { action: "monitor", text: "Watch for hiring.", validatingQuestion: null },
    rating: "worth_monitoring",
    ratingReason: "Real contract, no facility pressure yet.",
    stage: "undetermined",
  };
}

async function newSession(userId: string, companyId: string | null = null) {
  const { data, error } = await db
    .from("research_sessions")
    .insert({ mode: "company", query: COMPANY, created_by: userId, company_id: companyId })
    .select("id")
    .single();
  if (error) throw error;
  created.sessions.push(data.id);
  return data.id;
}

async function researchAndSave(userId: string, companyId: string | null) {
  const id = await newSession(userId, companyId);
  await runCompanyResearch(id, COMPANY, { firecrawl: fakeFirecrawl(), store: createDbStore(), today: TODAY, maxSources: 5 });
  const { provider } = createFakeProvider([modelOutput()]);
  await analyzeSession(id, { provider, model: "fake-model", today: TODAY });
  const { data: s } = await db.from("research_sessions").select("status, analysis_errors, usage").eq("id", id).single();
  expect(s?.analysis_errors).toBeNull();
  expect(s?.status).toBe("analyzed");
  return { id, save: await saveSessionToFeed(id, userId) };
}

describe("Live Research flow (local DB)", () => {
  let userId: string;

  it("research -> analyze -> add to feed creates version 1 with linked sources", async () => {
    const { data: u, error } = await db.auth.admin.createUser({ email: `flow${stamp}@test.local`, password: "password123", email_confirm: true });
    if (error) throw error;
    userId = u.user.id;
    created.users.push(userId);

    const { id, save } = await researchAndSave(userId, null);
    expect(save.ok).toBe(true);
    if (!save.ok) return;

    const { data: brief } = await db.from("briefs").select("version, origin, trigger_query, company_id, model").eq("id", save.briefId).single();
    expect(brief).toMatchObject({ version: 1, origin: "live_research", trigger_query: COMPANY, model: "fake-model" });

    const { data: company } = await db.from("companies").select("display_name, normalized_key").eq("id", brief!.company_id).single();
    expect(company?.display_name).toBe(COMPANY);
    expect(company?.normalized_key).toBe(`testbed fabrication ${stamp}`);

    const { data: links } = await db.from("brief_sources").select("id, relevance, is_repeat_coverage_of, sources(url, published_at, date_method)").eq("brief_id", save.briefId);
    expect(links).toHaveLength(3);
    expect(links!.filter((l) => l.is_repeat_coverage_of !== null)).toHaveLength(1);
    expect(links!.every((l) => l.sources?.date_method === "metadata")).toBe(true);

    const { data: s } = await db.from("research_sessions").select("status, brief_id").eq("id", id).single();
    expect(s).toMatchObject({ status: "saved", brief_id: save.briefId });

    // Saving the same session again is idempotent.
    const again = await saveSessionToFeed(id, userId);
    expect(again).toEqual({ ok: true, briefId: save.briefId });
  });

  it("re-analysis of the same company creates version 2", async () => {
    const { data: company } = await db.from("companies").select("id").eq("normalized_key", `testbed fabrication ${stamp}`).single();
    const { save } = await researchAndSave(userId, company!.id);
    expect(save.ok).toBe(true);
    if (!save.ok) return;
    const { data: versions } = await db.from("briefs").select("version").eq("company_id", company!.id).order("version");
    expect(versions?.map((v) => v.version)).toEqual([1, 2]);
  });

  it("refuses to save an unverified entity", async () => {
    const id = await newSession(userId);
    await runCompanyResearch(id, COMPANY, { firecrawl: fakeFirecrawl(), store: createDbStore(), today: TODAY, maxSources: 5 });
    const out = { ...modelOutput(), rating: "no_meaningful_signal" as const, company: { ...modelOutput().company, entityStatus: "not_verified" as const } };
    const { provider } = createFakeProvider([out]);
    await analyzeSession(id, { provider, model: "fake-model", today: TODAY });
    const res = await saveSessionToFeed(id, userId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Entity not verified/);
  });

  it("stores validation errors instead of a brief when analysis fails twice", async () => {
    const id = await newSession(userId);
    await runCompanyResearch(id, COMPANY, { firecrawl: fakeFirecrawl(), store: createDbStore(), today: TODAY, maxSources: 5 });
    const { provider } = createFakeProvider(["not json", "still not json"]);
    await analyzeSession(id, { provider, model: "fake-model", today: TODAY });
    const { data: s } = await db.from("research_sessions").select("status, analysis, analysis_errors, error, usage").eq("id", id).single();
    expect(s).toMatchObject({ status: "ready", analysis: null });
    expect(s?.analysis_errors).toEqual(["Output is not valid JSON."]);
    expect(s?.usage).toMatchObject({ llm_calls: 2, firecrawl_credits: 9 }); // 3 searches x 2 + 3 scrapes
  });

  it("uses the company's stored permits as public record sources", async () => {
    const key = `testbed fabrication ${stamp}`;
    const permit = (n: number, strength: "addition" | "alteration", issued: string) => ({
      source_type: "permit_mississauga" as const,
      source_record_id: `BP TEST ${stamp}-${n}`,
      raw_entity_name: COMPANY.toUpperCase(),
      entity_key: key,
      occupier_status: "named" as const,
      signal_strength: strength,
      title: `Mississauga permit: ${strength} at ${n} TEST DR`,
      summary: `${strength.toUpperCase()} - ${COMPANY.toUpperCase()}. Est. value $1,000,000`,
      published_at: issued,
      location: `${n} TEST DR, Mississauga, Ontario`,
      raw: { BP_NO: `BP TEST ${stamp}-${n}`, ADDRESS: `${n} TEST DR`, BUILDER: "Not The Occupier Ltd" },
    });
    const { data: sigs, error } = await db
      .from("signals")
      .insert([permit(1, "addition", "2026-09-01"), permit(2, "alteration", "2026-10-01")])
      .select("id");
    if (error) throw error;
    created.signals.push(...sigs.map((s) => s.id));

    const recordIds = await attachRecords(db, { names: [COMPANY], today: TODAY });
    expect(recordIds).toHaveLength(2);
    expect(await attachRecords(db, { names: [COMPANY], today: TODAY })).toEqual(recordIds); // one source per signal

    const { data: recs } = await db.from("sources").select("id, url, publisher, published_at, date_method, signal_id, excerpt").in("id", recordIds);
    const first = recs!.find((r) => r.id === recordIds[0])!;
    expect(first).toMatchObject({ publisher: "City of Mississauga – Building permits", published_at: "2026-09-01", date_method: "public_record", signal_id: sigs[0].id });
    expect(first.url).toContain("services6.arcgis.com");
    expect(first.excerpt).toContain(`Record number: BP TEST ${stamp}-1`);
    expect(first.excerpt).not.toContain("Not The Occupier");

    const id = await newSession(userId);
    await runCompanyResearch(id, COMPANY, { firecrawl: fakeFirecrawl(), store: createDbStore(), today: TODAY, maxSources: 5, recordSourceIds: recordIds });
    const out = modelOutput();
    out.ledger = [
      { sourceId: "S1", evidenceType: "fact", relevance: "signal", finding: "Addition permit at an occupied site.", repeatCoverageOf: null },
      { sourceId: "S2", evidenceType: "fact", relevance: "signal", finding: "Alteration permit.", repeatCoverageOf: null },
      ...out.ledger.map((e, i) => ({ ...e, sourceId: `S${i + 3}`, repeatCoverageOf: e.repeatCoverageOf ? "S3" : null })),
    ];
    out.chain.whatChanged = { status: "supported", text: "Building an addition.", sourceIds: ["S1"] };
    out.existingFacilityInvestment = true;
    const { provider, requests } = createFakeProvider([out]);
    await analyzeSession(id, { provider, model: "fake-model", today: TODAY });
    expect(JSON.stringify(requests[0])).toContain("City of Mississauga – Building permits");

    const save = await saveSessionToFeed(id, userId);
    expect(save.ok).toBe(true);
    if (!save.ok) return;
    const { data: links } = await db.from("brief_sources").select("sources(date_method, signal_id)").eq("brief_id", save.briefId);
    expect(links).toHaveLength(5);
    expect(links!.filter((l) => l.sources?.date_method === "public_record").map((l) => l.sources?.signal_id).sort()).toEqual(sigs.map((s) => s.id).sort());
  });

  afterAll(async () => {
    if (created.signals.length) {
      await db.from("sources").delete().in("signal_id", created.signals);
      await db.from("signals").delete().in("id", created.signals);
    }
    const { data: companies } = await db.from("companies").select("id").eq("normalized_key", `testbed fabrication ${stamp}`);
    if (created.sessions.length) await db.from("research_sessions").delete().in("id", created.sessions);
    for (const c of companies ?? []) await db.from("companies").delete().eq("id", c.id);
    await db.from("sources").delete().in("url", urls);
    for (const u of created.users) await db.auth.admin.deleteUser(u);
  });
});
