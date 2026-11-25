import { describe, expect, it } from "vitest";
import { checkBriefIntegrity } from "./integrity";
import type { BriefAnalysis } from "./schema";
import { SAMPLE_BRIEFS } from "@/lib/samples";

// Developer / landlord leads (added 2026-11-25): space to fill, never a space need.
const worth = SAMPLE_BRIEFS.find((s) => s.analysis.rating === "worth_monitoring" && s.sector !== "retail")!.analysis;
const fact = worth.ledger.find((e) => e.evidenceType === "fact" && e.relevance === "signal")!.id;
const point = [{ text: "x", sourceIds: [fact] }];
const deal = (dealType: string) => ({ dealType, description: "x", statedSize: null, location: null, sourceIds: [fact] }) as NonNullable<BriefAnalysis["dealPotential"]>["opportunities"][number];
const brief = (over: Partial<BriefAnalysis>): BriefAnalysis => ({
  ...worth,
  otherPremises: { assessment: "not_indicated", address: null, text: "x", sourceIds: [] },
  companyType: "developer_landlord",
  brokerAngle: { type: "leasing_mandate", headline: "x", talkingPoints: point, urgency: "act_now" },
  dealPotential: { summary: "x", opportunities: [deal("lease_up"), deal("disposition")] },
  ...over,
});

describe("landlord leads", () => {
  it("accepts a leasing mandate with lease-up and disposition", () => {
    expect(checkBriefIntegrity(worth)).toEqual([]);
    expect(checkBriefIntegrity(brief({}))).toEqual([]);
  });

  it("rejects a new requirement angle and new-space deals for a developer or landlord", () => {
    const errors = checkBriefIntegrity(
      brief({ brokerAngle: { type: "new_requirement", headline: "x", talkingPoints: point, urgency: "act_now" }, dealPotential: { summary: "x", opportunities: [deal("site_search")] } }),
    ).join("\n");
    expect(errors).toMatch(/never new_requirement/);
    expect(errors).toMatch(/site_search.*offering space/);
  });

  it("keeps leasing mandate and lease-up for developer / landlord leads only", () => {
    const errors = checkBriefIntegrity(brief({ companyType: "retailer" })).join("\n");
    expect(errors).toMatch(/"leasing_mandate" is only for companyType developer_landlord/);
    expect(errors).toMatch(/lease_up is only for companyType developer_landlord/);
    expect(errors).toMatch(/disposition.*otherPremises/);
  });

  it("rejects a leasing mandate on a No Meaningful Signal brief", () => {
    const nms = SAMPLE_BRIEFS.find((s) => s.analysis.rating === "no_meaningful_signal")!.analysis;
    const errors = checkBriefIntegrity({ ...brief({}), ...{ rating: nms.rating, commercialValue: null, countercase: nms.countercase, unknowns: nms.unknowns } }).join("\n");
    expect(errors).toMatch(/leasing_mandate.*No Meaningful Signal/);
    expect(errors).toMatch(/lease_up.*No Meaningful Signal/);
  });
});
