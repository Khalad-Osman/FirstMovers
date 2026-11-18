import { describe, expect, it } from "vitest";
import { SAMPLE_BRIEFS } from "@/lib/samples";
import { angleUrgency, deriveAngle, effectiveAngle } from "./angle";
import { checkBriefIntegrity } from "./integrity";
import type { BriefAnalysis } from "./schema";

const strong = SAMPLE_BRIEFS.find((s) => s.analysis.rating === "strong_signal")!;
const nms = SAMPLE_BRIEFS.find((s) => s.analysis.rating === "no_meaningful_signal")!;
const withAngle = (a: BriefAnalysis, angle: Partial<NonNullable<BriefAnalysis["brokerAngle"]>>): BriefAnalysis => ({
  ...a,
  brokerAngle: { type: "monitor_only", headline: "x", talkingPoints: [], urgency: "watch", ...angle },
});

describe("angleUrgency", () => {
  const ledger = strong.analysis.ledger; // S1 event 2026-09-12, S3 published 2026-10-22, S4 2025-06-10 (context)
  const angle = (ids: string[]) => ({ type: "new_requirement" as const, talkingPoints: [{ text: "t", sourceIds: ids }] });
  it("is act_now within 90 days of a cited Signal, follow_up within a year, else watch", () => {
    expect(angleUrgency(angle(["S1"]), ledger, "2026-11-04")).toBe("act_now");
    expect(angleUrgency(angle(["S1"]), ledger, "2027-03-01")).toBe("follow_up");
    expect(angleUrgency(angle(["S1"]), ledger, "2028-01-01")).toBe("watch");
    expect(angleUrgency(angle(["S4"]), ledger, "2026-11-04")).toBe("watch"); // context source doesn't count
    expect(angleUrgency({ type: "monitor_only", talkingPoints: [] }, ledger, "2026-11-04")).toBe("watch");
  });
});

describe("deriveAngle (briefs saved before angles)", () => {
  const { brokerAngle: _drop, ...old } = strong.analysis;
  void _drop;
  it("derives a conservative angle and marks it", () => {
    expect(deriveAngle(old as BriefAnalysis, strong.analyzedAt)).toMatchObject({ type: "new_requirement", derived: true, urgency: "act_now" });
    const vac = { ...(old as BriefAnalysis), rating: "no_meaningful_signal" as const, otherPremises: { assessment: "possible" as const, address: "375 Admiral Blvd", text: "Directory lists it.", sourceIds: ["S1"] } };
    expect(deriveAngle(vac, strong.analyzedAt)).toMatchObject({ type: "vacated_space", headline: expect.stringContaining("375 Admiral Blvd") });
    const inPlace = { ...(old as BriefAnalysis), rating: "no_meaningful_signal" as const, existingFacilityInvestment: true };
    expect(deriveAngle(inPlace, strong.analyzedAt).type).toBe("capacity_conversation");
    const none = { ...(old as BriefAnalysis), rating: "no_meaningful_signal" as const };
    expect(deriveAngle(none, strong.analyzedAt)).toMatchObject({ type: "monitor_only", urgency: "watch" });
  });
  it("prefers the stored angle", () => {
    expect(effectiveAngle(strong.analysis, strong.analyzedAt).derived).toBeUndefined();
  });
});

describe("integrity: broker angle", () => {
  it("rejects a new requirement on a No Meaningful Signal brief", () => {
    const errs = checkBriefIntegrity(withAngle(nms.analysis, { type: "new_requirement", talkingPoints: [{ text: "t", sourceIds: ["S1"] }] }));
    expect(errs.join(" ")).toMatch(/inconsistent with a No Meaningful Signal/);
  });
  it("requires vacated space for a vacated_space angle", () => {
    const errs = checkBriefIntegrity(withAngle(strong.analysis, { type: "vacated_space", talkingPoints: [{ text: "t", sourceIds: ["S1"] }] }));
    expect(errs.join(" ")).toMatch(/requires otherPremises/);
  });
  it("requires cited, existing sources with at least one FACT", () => {
    const errs = checkBriefIntegrity(withAngle(strong.analysis, { type: "relationship", talkingPoints: [{ text: "t", sourceIds: [] }, { text: "u", sourceIds: ["S99"] }] }));
    expect(errs.join(" ")).toMatch(/S99, which is not in the ledger/);
    expect(errs.join(" ")).toMatch(/every talking point must cite a source/);
    expect(checkBriefIntegrity(withAngle(strong.analysis, { type: "relationship", talkingPoints: [] })).join(" ")).toMatch(/needs at least one talking point/);
  });
  it("accepts monitor_only with no points", () => {
    expect(checkBriefIntegrity(withAngle(nms.analysis, { type: "monitor_only" }))).toEqual([]);
  });
});
