import { describe, expect, it } from "vitest";
import type { ModelOutput } from "@/lib/brief/schema";
import { createFakeProvider } from "@/lib/llm/fake";
import { analyzeCompany } from "./analyze";
import { buildBrief } from "./build";
import { FIXTURES } from "./fixtures";
import { analysisInputSchema } from "./types";

const fixture = (name: string) => FIXTURES.find((f) => f.name === name)!;
const SYSTEM = "test system prompt";

// A rule-abiding model output for the "strong-capacity" fixture.
function strongOutput(): ModelOutput {
  return {
    company: {
      name: "Halloway Switchgear Enclosures Inc.",
      entityNotes: null,
      localConnection: "Manufacturing plant in Vaughan, Ontario.",
      entityStatus: "verified",
    },
    ledger: [
      { sourceId: "S1", evidenceType: "fact", relevance: "signal", finding: "Five-year enclosure contract, first deliveries Q2 2027.", repeatCoverageOf: null },
      { sourceId: "S2", evidenceType: "fact", relevance: "signal", finding: "Hiring 22 production staff for a new second GTA facility.", repeatCoverageOf: null },
      { sourceId: "S3", evidenceType: "fact", relevance: "signal", finding: "Evaluating York and Peel sites; Vaughan plant has no room.", repeatCoverageOf: null },
    ],
    chain: {
      whatChanged: { status: "supported", text: "Won a five-year utility enclosure contract.", sourceIds: ["S1"] },
      operationalConsequence: { status: "supported", text: "Needs dedicated production capacity in Ontario.", sourceIds: ["S1", "S2"] },
      facilityPressure: { status: "supported", text: "Vaughan plant is at full capacity with no room for a line.", sourceIds: ["S2", "S3"] },
      forcingEvent: { status: "supported", text: "First deliveries due Q2 2027.", sourceIds: ["S1"] },
      realEstateDecision: { status: "inferred", text: "Likely a second industrial facility in York or Peel.", sourceIds: ["S3"] },
    },
    countercase: ["A third shift was considered but the building has no room for another welding line."],
    alternativesAssessment: "alternatives_possible",
    existingFacilityInvestment: false,
    workingHypothesis: "Halloway will lease or buy a second plant in York or Peel before mid-2027.",
    unknowns: ["Size of the second facility."],
    commercialValue: "Site search support against a fixed delivery date.",
    nextStep: { action: "validate", text: "Contact the COO.", validatingQuestion: "Have you shortlisted sites yet?" },
    rating: "strong_signal",
    ratingReason: "Dated contract, full plant, active site evaluation.",
    stage: "active_search",
  };
}

describe("analyzeCompany", () => {
  const input = fixture("strong-capacity").input;

  it("returns a validated brief with URLs and dates from the source records", async () => {
    const { provider, requests } = createFakeProvider([strongOutput()]);
    const res = await analyzeCompany(input, { provider, model: "m", systemPrompt: SYSTEM });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attempts).toBe(1);
    expect(res.usage).toEqual({ llmCalls: 1, inputTokens: 100, outputTokens: 50 });
    const s1 = res.brief.ledger.find((e) => e.id === "S1")!;
    expect(s1).toMatchObject({
      url: "https://example.com/fixtures/halloway-award",
      publishedAt: "2026-09-22",
      eventAt: "2026-09-15",
      recencyTier: "recent",
    });
    expect(requests[0].system).toBe(SYSTEM);
    expect(requests[0].schemaName).toBe("commercial_intelligence_brief");
  });

  it("retries once with the errors, then succeeds", async () => {
    const { provider, requests } = createFakeProvider(["not json", strongOutput()]);
    const res = await analyzeCompany(input, { provider, model: "m", systemPrompt: SYSTEM });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
    expect(res.usage.llmCalls).toBe(2);
    const retry = requests[1].messages;
    expect(retry).toHaveLength(3);
    expect(retry[2].content).toContain("Output is not valid JSON.");
  });

  it("records an error after two failures and returns no brief", async () => {
    const bad = { ...strongOutput(), rating: "excellent" };
    const { provider } = createFakeProvider([bad, bad]);
    const res = await analyzeCompany(input, { provider, model: "m", systemPrompt: SYSTEM });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.attempts).toBe(2);
    expect(res.errors.join()).toMatch(/Schema: rating/);
    expect("brief" in res).toBe(false);
  });

  it("rejects rule violations, not just schema errors", async () => {
    const out = strongOutput();
    out.alternativesAssessment = "alternatives_likely"; // Strong + likely alternatives is inconsistent
    const { provider, requests } = createFakeProvider([out, out]);
    const res = await analyzeCompany(input, { provider, model: "m", systemPrompt: SYSTEM });
    expect(res.ok).toBe(false);
    expect(requests[1].messages[2].content).toMatch(/alternatives are likely/);
  });

  it("rejects ledger entries for sources that were not supplied", async () => {
    const out = strongOutput();
    out.ledger.push({ sourceId: "S9", evidenceType: "fact", relevance: "signal", finding: "Invented.", repeatCoverageOf: null });
    const { provider } = createFakeProvider([out, out]);
    const res = await analyzeCompany(input, { provider, model: "m", systemPrompt: SYSTEM });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/S9 is not one of the supplied sources/);
  });

  it("returns provider errors without retrying", async () => {
    const { provider } = createFakeProvider([new Error("OpenAI error: invalid api key")]);
    const res = await analyzeCompany(input, { provider, model: "m", systemPrompt: SYSTEM });
    expect(res).toMatchObject({ ok: false, errors: ["OpenAI error: invalid api key"], attempts: 1 });
  });

  it("refuses more than 8 sources (5 web + 3 records) before calling the model", async () => {
    const parsed = analysisInputSchema.parse(input);
    const sources = Array.from({ length: 9 }, (_, i) => ({ ...parsed.sources[0], id: `S${i + 1}` }));
    const { provider, requests } = createFakeProvider([]);
    const res = await analyzeCompany({ ...input, sources }, { provider, model: "m", systemPrompt: SYSTEM });
    expect(res.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });
});

describe("rule checks on built briefs", () => {
  const sources = analysisInputSchema.parse(fixture("historical-only").input).sources;
  const base: ModelOutput = {
    ...strongOutput(),
    company: { name: "Brightwater Polymer Extrusions Ltd.", entityNotes: null, localConnection: "Cambridge, Ontario.", entityStatus: "verified" },
    ledger: [
      { sourceId: "S1", evidenceType: "fact", relevance: "context", finding: "2023 plan.", repeatCoverageOf: null },
      { sourceId: "S2", evidenceType: "fact", relevance: "context", finding: "2024 opening.", repeatCoverageOf: null },
    ],
  };
  const check = async (out: ModelOutput) => {
    const { provider } = createFakeProvider([out, out]);
    return analyzeCompany(fixture("historical-only").input, { provider, model: "m", systemPrompt: SYSTEM });
  };

  it("historical sources cannot be Signal", async () => {
    const out = { ...base, ledger: base.ledger.map((e) => ({ ...e, relevance: "signal" as const })) };
    const res = await check(out);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/older than 12 months cannot be Signal/);
  });

  it("no step can be Supported by historical sources alone", async () => {
    const res = await check({ ...base, rating: "no_meaningful_signal", commercialValue: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toMatch(/"Supported" requires/);
  });

  it("buildBrief drops an event date equal to the publication date", () => {
    const built = buildBrief(base, [{ ...sources[0], eventAt: sources[0].publishedAt }, sources[1]], "2026-11-10");
    expect(built.ok && built.brief.ledger[0].eventAt).toBeNull();
  });
});
