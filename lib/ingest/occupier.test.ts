import { describe, expect, it } from "vitest";
import { resolveOccupier } from "./occupier";

describe("resolveOccupier", () => {
  it.each([
    // Real description patterns seen in Mississauga / Brampton / Toronto data
    ["ONE (1) FASCIA SIGN - GREAT SELL", "GREAT SELL"],
    ["ONE (1) FASCIA SIGN  - ROYAL DRUGS", "ROYAL DRUGS"],
    ["Interior alterations for ACME FABRICATION LTD - new office", "ACME FABRICATION LTD"],
    ["Install racking for Northline Distribution Inc.", "Northline Distribution Inc."],
    ["Tenant: Halloway Switchgear; interior fit-out", "Halloway Switchgear"],
    ["Proposed addition to existing warehouse for PEMBERTON FINE FOODS LIMITED", "PEMBERTON FINE FOODS LIMITED"],
    ["Fascia sign - Bank of Nova Scotia", "Bank of Nova Scotia"],
    ["New warehouse addition built for HALDON LOGISTICS INC.", "HALDON LOGISTICS INC."],
  ])("%s -> %s", (desc, name) => {
    const r = resolveOccupier(desc);
    expect(r.status).toBe("named");
    expect(r.name).toBe(name);
    expect(r.entityKey).toBeTruthy();
  });

  it.each([
    "NEW OVERHEAD DOOR IN THE SIDE YARD - LANDLORD WORK",
    "ONE (1) FASCIA SIGN - ILLUMINATED",
    "Interior alterations to existing industrial unit",
    "Proposal to construct a one-storey industrial building",
    "",
    "SPRINKLER UPGRADE",
  ])("unresolved: %s", (desc) => {
    expect(resolveOccupier(desc)).toEqual({ name: null, entityKey: null, status: "unresolved" });
  });

  it("produces the same key regardless of case and legal suffix", () => {
    expect(resolveOccupier("Racking for ACME FABRICATION INC").entityKey).toBe(resolveOccupier("Tenant: Acme Fabrication").entityKey);
  });
});
