import { describe, expect, it } from "vitest";
import { resolveOccupier } from "./occupier";

describe("resolveOccupier", () => {
  it.each([
    // Real description patterns seen in Mississauga / Brampton / Toronto data
    ["ONE (1) FASCIA SIGN - GREAT SELL", "GREAT SELL"],
    ["ONE (1) FASCIA SIGN  - ROYAL DRUGS", "ROYAL DRUGS"],
    ["Interior alterations for ACME FABRICATION LTD - new office", "ACME FABRICATION LTD"],
    ["Interior fit-out for THE CHOCOLATE FACTORY INC.", "THE CHOCOLATE FACTORY INC."],
    ["Install racking for Northline Distribution Inc.", "Northline Distribution Inc."],
    ["Tenant: Halloway Switchgear; interior fit-out", "Halloway Switchgear"],
    ["Proposed addition to existing warehouse for PEMBERTON FINE FOODS LIMITED", "PEMBERTON FINE FOODS LIMITED"],
    ["Fascia sign - Bank of Nova Scotia", "Bank of Nova Scotia"],
    ["New warehouse addition built for HALDON LOGISTICS INC.", "HALDON LOGISTICS INC."],
    // Real Mississauga descriptions that previously captured the whole phrase
    ["INSTALL FIRE ALARM TO EXISTING STORAGE BUILDING - CANDU ENERGY INC.", "CANDU ENERGY INC."],
    ["INSTALLATION OF RACKING SYSTEM - 247 FULFILLMENT LTD.", "247 FULFILLMENT LTD."],
    ["ONE FASCIA SIGN -WAKEFIELD CANADA INC.", "WAKEFIELD CANADA INC."],
    ["FROM JUNE 17-JUNE 19 2026 - WESCO COMPANY", "WESCO COMPANY"],
    ["INSTALLATION OF STAND-ALONE RACKING SYSTEM - TRUE WORLD FOODS OF CANADA INC", "TRUE WORLD FOODS OF CANADA INC"],
    ["INSTALLATION OF FIRE SUPPRESSION SYSTEM 16295932 CANADA INC", "16295932 CANADA INC"],
    ["Interior alterations for Chiovitti Banana Co", "Chiovitti Banana Co"],
    ["FASCIA SIGN - CEVA LOGISTICS", "CEVA LOGISTICS"],
  ])("%s -> %s", (desc, name) => {
    const r = resolveOccupier(desc);
    expect(r.status).toBe("named");
    expect(r.name).toBe(name);
    expect(r.entityKey).toBeTruthy();
  });

  it.each([
    // A use, not a business (Toronto, 2026)
    "INTERIOR ALTERATIONS / FIT-OUT OF EXISTING VACANT UNIT 1 FOR CHOCOLATE FACTORY",
    "REVISION - INTERIOR ALTERATIONS / FIT-OUT OF EXISTING VACANT UNIT 1 FOR CHOCOLATE FACTORY WITH ACCESSORY RESTAURANT.",
    "NEW OVERHEAD DOOR IN THE SIDE YARD - LANDLORD WORK",
    "ONE (1) FASCIA SIGN - ILLUMINATED",
    "Interior alterations to existing industrial unit",
    "Proposal to construct a one-storey industrial building",
    "",
    "SPRINKLER UPGRADE",
    // Landlords on leasing signs / base-building work are not occupiers
    "PYLON SIGN - QUADREAL PROPERTIES",
    "INTERIOR ALTERATIONS OF UNIT 9 - MILDEV PROPERTIES INC.",
    "FASCIA SIGN - DREAM INDUSTRIAL TWOFER INC.",
    // Fragments seen in real Toronto / Mississauga text
    "Interior alterations for a take-out restaurant",
    "Interior alterations for food processing facility.",
    "Change of use for The scope of work is limited to interior",
    "FASCIA SIGN - FUTURE TENANT",
    "PYLON SIGN FOR A NEW INDOOR SWIMMING FACILITY",
  ])("unresolved: %s", (desc) => {
    expect(resolveOccupier(desc)).toEqual({ name: null, entityKey: null, status: "unresolved" });
  });

  it("produces the same key regardless of case and legal suffix", () => {
    expect(resolveOccupier("Racking for ACME FABRICATION INC").entityKey).toBe(resolveOccupier("Tenant: Acme Fabrication").entityKey);
  });
});
