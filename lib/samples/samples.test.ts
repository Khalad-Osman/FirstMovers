import { describe, expect, it } from "vitest";
import { briefAnalysisSchema } from "@/lib/brief/schema";
import { checkBriefIntegrity } from "@/lib/brief/integrity";
import { recencyTier } from "@/lib/analysis/recency";
import { SAMPLE_BRIEFS } from "./index";

describe("sample briefs", () => {
  it("there are four: one per rating for industrial, plus one retail", () => {
    expect(SAMPLE_BRIEFS.filter((s) => s.sector !== "retail").map((s) => s.analysis.rating).sort()).toEqual([
      "no_meaningful_signal",
      "strong_signal",
      "worth_monitoring",
    ]);
    expect(SAMPLE_BRIEFS.filter((s) => s.sector === "retail").map((s) => s.slug)).toEqual(["larchmere-finch-bakehouse"]);
  });

  for (const sample of SAMPLE_BRIEFS) {
    describe(sample.slug, () => {
      it("is flagged as a sample", () => expect(sample.isSample).toBe(true));

      it("validates against the brief schema", () => {
        const result = briefAnalysisSchema.safeParse(sample.analysis);
        expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      });

      it("passes integrity checks", () => {
        expect(checkBriefIntegrity(sample.analysis)).toEqual([]);
      });

      it("recency tiers match the analysis date", () => {
        for (const e of sample.analysis.ledger) expect(e.recencyTier, e.id).toBe(recencyTier(e, sample.analyzedAt));
      });

      it("uses only example.com source links", () => {
        for (const e of sample.analysis.ledger) expect(new URL(e.url).hostname).toBe("example.com");
      });
    });
  }
});

describe("checkBriefIntegrity", () => {
  const base = SAMPLE_BRIEFS[0].analysis;

  it("rejects a chain step citing a missing source", () => {
    const bad = {
      ...base,
      chain: { ...base.chain, whatChanged: { ...base.chain.whatChanged, sourceIds: ["S99"] } },
    };
    expect(checkBriefIntegrity(bad).join()).toMatch(/cites S99, which is not in the ledger/);
  });

  it("rejects a Supported step backed only by Context sources", () => {
    const bad = {
      ...base,
      chain: { ...base.chain, facilityPressure: { status: "supported" as const, text: "x", sourceIds: ["S4"] } },
    };
    expect(checkBriefIntegrity(bad).join()).toMatch(/"Supported" requires at least one cited Signal source/);
  });

  it("rejects Strong Signal without a Supported What changed", () => {
    const bad = {
      ...base,
      chain: { ...base.chain, whatChanged: { ...base.chain.whatChanged, status: "inferred" as const } },
    };
    expect(checkBriefIntegrity(bad).join()).toMatch(/Strong Signal: "What changed" must be Supported/);
  });

  it("rejects a 12–24 month source labelled Signal", () => {
    const bad = { ...base, ledger: base.ledger.map((e) => (e.id === "S4" ? { ...e, relevance: "signal" as const } : e)) };
    expect(checkBriefIntegrity(bad).join()).toMatch(/older than 12 months cannot be Signal/);
  });

  it("rejects a rating above No Meaningful Signal for an unverified entity", () => {
    const bad = { ...base, company: { ...base.company, entityStatus: "not_verified" as const } };
    expect(checkBriefIntegrity(bad).join()).toMatch(/unverified entity/);
  });

  it("rejects existing-facility investment with no alternatives identified", () => {
    const bad = { ...base, existingFacilityInvestment: true, alternativesAssessment: "no_alternatives_identified" as const };
    expect(checkBriefIntegrity(bad).join()).toMatch(/evidence against an external move/);
  });
});

describe("sample broker angles", () => {
  it("have urgencies that match their cited sources' dates", async () => {
    const { angleUrgency } = await import("@/lib/brief/angle");
    for (const s of SAMPLE_BRIEFS) {
      const a = s.analysis.brokerAngle!;
      expect(a, s.slug).toBeDefined();
      expect(a.urgency, s.slug).toBe(angleUrgency(a, s.analysis.ledger, s.analyzedAt));
    }
  });
});
