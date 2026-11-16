import { describe, expect, it } from "vitest";
import { SAMPLE_BRIEFS } from "@/lib/samples";
import { checkBriefIntegrity } from "./integrity";
import { briefAnalysisSchema, modelOutputSchema, type BriefAnalysis } from "./schema";

// "Space likely to be vacated" (CLAUDE.md §7, added 2026-11-16).
const base: BriefAnalysis = SAMPLE_BRIEFS.find((s) => s.analysis.rating === "worth_monitoring")!.analysis;
const signalId = base.ledger.find((e) => e.relevance === "signal" && e.recencyTier === "recent")!.id;
const contextId = base.ledger.find((e) => e.id !== signalId)!.id;
const withPremises = (op: BriefAnalysis["otherPremises"]): BriefAnalysis => ({ ...base, otherPremises: op });

describe("otherPremises", () => {
  it("is optional on stored briefs saved before the field existed, but required from the model", () => {
    const { otherPremises: _drop, ...old } = withPremises(undefined);
    void _drop;
    expect(briefAnalysisSchema.safeParse(old).success).toBe(true);
    expect(checkBriefIntegrity(old as BriefAnalysis)).toEqual([]);
    expect(modelOutputSchema.shape.otherPremises.safeParse(undefined).success).toBe(false);
  });

  it("accepts a likely vacated address backed by a recent Signal and a FACT", () => {
    const brief = withPremises({ assessment: "likely", address: "375 Admiral Blvd, Mississauga", text: "New building permitted; directory lists the current address.", sourceIds: [signalId, contextId] });
    expect(checkBriefIntegrity(brief)).toEqual([]);
  });

  it("works on a No Meaningful Signal brief: the rating is about a new requirement", () => {
    const nms = SAMPLE_BRIEFS.find((s) => s.analysis.rating === "no_meaningful_signal")!.analysis;
    const id = nms.ledger[0].id;
    expect(checkBriefIntegrity({ ...nms, otherPremises: { assessment: "possible", address: "1 Old Rd, Toronto", text: "Unclear.", sourceIds: [id] } })).toEqual([]);
  });

  it("requires an address and citations unless not indicated", () => {
    const errs = checkBriefIntegrity(withPremises({ assessment: "possible", address: null, text: "x", sourceIds: [] }));
    expect(errs.join(" ")).toMatch(/needs the other address/);
    expect(errs.join(" ")).toMatch(/must cite the sources/);
  });

  it("requires a recent Signal for 'likely' and rejects unknown source ids", () => {
    const errs = checkBriefIntegrity(withPremises({ assessment: "likely", address: "9 Elm St", text: "x", sourceIds: [contextId, "S99"] }));
    expect(errs.join(" ")).toMatch(/S99, which is not in the ledger/);
    if (base.ledger.find((e) => e.id === contextId)!.relevance !== "signal") expect(errs.join(" ")).toMatch(/requires a cited recent Signal/);
  });

  it("keeps the address empty when not indicated", () => {
    expect(checkBriefIntegrity(withPremises({ assessment: "not_indicated", address: "9 Elm St", text: "x", sourceIds: [] })).join(" ")).toMatch(/leave address null/);
    expect(checkBriefIntegrity(withPremises({ assessment: "not_indicated", address: null, text: "None identified.", sourceIds: [] }))).toEqual([]);
  });
});
