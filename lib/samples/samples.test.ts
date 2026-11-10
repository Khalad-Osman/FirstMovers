import { describe, expect, it } from "vitest";
import { briefAnalysisSchema } from "@/lib/brief/schema";
import { checkBriefIntegrity } from "@/lib/brief/integrity";
import { SAMPLE_BRIEFS } from "./index";

describe("sample briefs", () => {
  it("there are three, one per rating", () => {
    expect(SAMPLE_BRIEFS.map((s) => s.analysis.rating).sort()).toEqual([
      "no_meaningful_signal",
      "strong_signal",
      "worth_monitoring",
    ]);
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
    expect(checkBriefIntegrity(bad).join()).toMatch(/missing ledger entry S99/);
  });

  it("rejects a Supported step backed only by Context sources", () => {
    const bad = {
      ...base,
      chain: { ...base.chain, facilityPressure: { status: "supported" as const, text: "x", sourceIds: ["S4"] } },
    };
    expect(checkBriefIntegrity(bad).join()).toMatch(/requires at least one Signal source/);
  });

  it("rejects Strong Signal without a Supported What changed", () => {
    const bad = {
      ...base,
      chain: { ...base.chain, whatChanged: { ...base.chain.whatChanged, status: "inferred" as const } },
    };
    expect(checkBriefIntegrity(bad).join()).toMatch(/Strong Signal requires/);
  });
});
