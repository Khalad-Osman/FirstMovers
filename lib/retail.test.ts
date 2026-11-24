import { describe, expect, it } from "vitest";
import { buildCandidates, signalWeight, type SignalForCandidate } from "@/lib/discovery/candidates";
import { RETAIL_SCREENING_SYSTEM, SCREENING_SYSTEM, screenCandidates } from "@/lib/discovery/screen";
import { buildSystemPrompt, loadPromptDocs } from "@/lib/analysis/prompt";
import { companyQueries } from "@/lib/research/queries";
import { mapGrant } from "@/lib/ingest/grants";
import { mapMississauga, mapToronto } from "@/lib/ingest/permits";
import { mapCaledon, mapOakville } from "@/lib/ingest/permits-halton-peel";
import { parseProspectFilters } from "@/lib/prospects";
import { parseSector, parseSectorFilter } from "@/lib/sector";
import { createFakeProvider } from "@/lib/llm/fake";
import type { IngestItem, SignalRow } from "@/lib/ingest/types";

const ctx = { today: "2026-11-23", cutoff: "2025-11-23", canadabuysMinValue: 100000, grantsMinValue: 100000 };
const rowOf = (i: IngestItem): SignalRow => {
  if (!("row" in i)) throw new Error(`skipped: ${i.skip}`);
  return i.row;
};
const ms = (d: string) => Date.parse(`${d}T05:00:00Z`);

describe("sector parsing", () => {
  it("defaults to industrial", () => {
    expect(parseSector("retail")).toBe("retail");
    expect(parseSector(undefined)).toBe("industrial");
    expect(parseSector("x")).toBe("industrial");
    expect(parseSectorFilter("retail")).toBe("retail");
    expect(parseSectorFilter(undefined)).toBe("all");
    expect(parseProspectFilters({ sector: "retail" }).sector).toBe("retail");
    expect(parseProspectFilters({}).sector).toBe("industrial");
  });
});

describe("retail signals from existing sources", () => {
  it("Mississauga: commercial retail permits are retail and name the store", () => {
    const r = rowOf(mapMississauga({ BP_NO: "BP 9ALT 26-1", FILE_TYPE: "COMMERCIAL", BLDG_TYPE: "COMMERCIAL RETAIL - MULTI-USER", SCOPE: "FASCIA SIGN", DESCRIPTION: "ONE FASCIA SIGN - DOLLARAMA", ISSUE_DATE: ms("2026-10-01"), ADDRESS: "1 MAIN ST" }, ctx));
    expect(r).toMatchObject({ sector: "retail", raw_entity_name: "DOLLARAMA", signal_strength: "sign" });
    const ind = rowOf(mapMississauga({ BP_NO: "BP 9ALT 26-2", FILE_TYPE: "INDUSTRIAL", SCOPE: "ALTERATION TO EXISTING BLDG", DESCRIPTION: "RACKING - ACME LTD.", ISSUE_DATE: ms("2026-10-01") }, ctx));
    expect(ind.sector).toBe("industrial");
  });

  it("Toronto: a retail permit is kept only when it names the business; plumbing/HVAC copies are dropped", () => {
    const base = { PERMIT_NUM: "26 1 BLD", REVISION_NUM: "00", ISSUED_DATE: "2026-10-01", WORK: "Interior Alterations", PROPOSED_USE: "Retail", MERCANTILE: 1, STREET_NUM: "1", STREET_NAME: "Queen", STREET_TYPE: "St" };
    expect(rowOf(mapToronto({ ...base, DESCRIPTION: "NEW TENANT - JOURNEYS - INTERIOR ALTERATIONS" }, ctx))).toMatchObject({ sector: "retail", raw_entity_name: "JOURNEYS" });
    expect(mapToronto({ ...base, DESCRIPTION: "Interior alterations to a retail unit" }, ctx)).toEqual({ skip: "retail: no business named" });
    expect(mapToronto({ ...base, WORK: "Building Permit Related(PS)", DESCRIPTION: "Plumbing - NEW TENANT - JOURNEYS" }, ctx)).toEqual({ skip: "retail: plumbing or HVAC permit for another permit" });
  });

  it("Caledon and Oakville: commercial/retail records named only", () => {
    const cal = { CUSTOMFOLDERNUMBER: "2026 1 COMM", STATUSDESC: "Issued", WORKDESC: "Alteration/Renovation", FOLDERTYPE: "COMM", SUBDESC: "Stores / Shops", ISSUEDATE: ms("2026-09-01"), INDATE: ms("2026-08-01"), FOLDERNAME: "1 QUEEN ST" };
    expect(rowOf(mapCaledon({ ...cal, FOLDERDESCRIPTION: "Alter Commercial (Tenant Fit-out - Shoppers Drug Mart)" }, ctx))).toMatchObject({ sector: "retail", raw_entity_name: "Shoppers Drug Mart" });
    expect(mapCaledon({ ...cal, FOLDERDESCRIPTION: "Alter Commercial (Tenant Fit-Out for Restaurant)" }, ctx)).toEqual({ skip: "retail: no business named" });
    const oak = { CUSTOMFOLDERNUMBER: "2026 1 BDP", Subtype: "Stores (Jewellery)", Worktype: "Alteration/repair", Status: "Issued", ISSUEDATE: ms("2026-09-01"), FOLDERNAME: "1 Main St" };
    expect(rowOf(mapOakville({ ...oak, FOLDERDESCRIPTION: "Cosmetic interior alterations for existing occupant - People&apos;s Jewellers Ltd. NO GFA" }, ctx))).toMatchObject({ sector: "retail" });
    expect(mapOakville({ ...oak, FOLDERDESCRIPTION: "Interior alterations for a new store." }, ctx)).toEqual({ skip: "retail: no business named" });
  });

  it("Federal grants: retail and food-service industries are retail", () => {
    const g = { ref_number: "1", owner_org: "x", recipient_legal_name: "Cafe Co Inc.", recipient_province: "ON", recipient_type: "F", agreement_value: "500000", agreement_start_date: "2026-06-01", recipient_city: "Toronto" };
    expect(rowOf(mapGrant({ ...g, naics_identifier: "722511" }, ctx)).sector).toBe("retail");
    expect(rowOf(mapGrant({ ...g, naics_identifier: "332999" }, ctx)).sector).toBe("industrial");
  });
});

describe("retail scoring and candidates", () => {
  let n = 0;
  const sig = (over: Partial<SignalForCandidate>): SignalForCandidate => ({
    id: `r${++n}`, source_type: "permit_mississauga", raw_entity_name: "BOOSTER JUICE", entity_key: "booster juice", signal_strength: "alteration",
    title: "Mississauga permit", summary: "Tenant fit-up", url: null, published_at: "2026-10-01", event_at: null, location: "1 Main St, Mississauga, Ontario", raw: {}, sector: "retail", ...over,
  });
  it("weights store fit-outs and named store signs for retail, not for industrial", () => {
    expect(signalWeight(sig({}))).toEqual({ weight: 3, label: "retail: store fit-out" });
    expect(signalWeight(sig({ signal_strength: "sign" }))).toEqual({ weight: 3, label: "retail: store sign (new or rebranded store)" });
    expect(signalWeight(sig({ signal_strength: "sign", sector: "industrial" })).weight).toBe(0.5);
  });
  it("keeps restaurants for retail and drops offices and property companies", () => {
    const signals = [sig({}), sig({ raw_entity_name: "SMITH LAW PROFESSIONAL CORPORATION", entity_key: "smith law" })];
    const retail = buildCandidates(signals, { today: "2026-11-23", skipKeys: new Set(), sector: "retail" });
    expect(retail.candidates.map((c) => c.displayName)).toEqual(["BOOSTER JUICE"]);
    expect(retail.skipped.map((s) => s.displayName)).toEqual(["SMITH LAW PROFESSIONAL CORPORATION"]);
    const restaurant = [sig({ raw_entity_name: "PITA LAND RESTAURANT", entity_key: "pita land restaurant" })];
    expect(buildCandidates(restaurant, { today: "2026-11-23", skipKeys: new Set(), sector: "retail" }).candidates).toHaveLength(1);
    expect(buildCandidates(restaurant, { today: "2026-11-23", skipKeys: new Set() }).candidates).toHaveLength(0);
  });
});

describe("retail screening, search and analysis prompt", () => {
  it("uses the retail screening question for retail runs", async () => {
    const [c] = buildCandidates(
      [{ id: "x", source_type: "permit_mississauga", raw_entity_name: "EDO JAPAN", entity_key: "edo japan", signal_strength: "sign", title: "t", summary: "s", url: null, published_at: "2026-10-01", event_at: null, location: "Mississauga, Ontario", raw: {}, sector: "retail" }],
      { today: "2026-11-23", skipKeys: new Set(), sector: "retail" },
    ).candidates;
    const verdict = { results: [{ key: c.key, industrialOccupier: "yes", physicalSignal: 3, reason: "Store sign.", research: true }] };
    const retail = createFakeProvider([verdict]);
    await screenCandidates([c], { provider: retail.provider, model: "m", sector: "retail" });
    expect(retail.requests[0].system).toBe(RETAIL_SCREENING_SYSTEM);
    const industrial = createFakeProvider([verdict]);
    await screenCandidates([c], { provider: industrial.provider, model: "m" });
    expect(industrial.requests[0].system).toBe(SCREENING_SYSTEM);
  });
  it("searches for store changes in retail mode", () => {
    expect(companyQueries("Acme Foods Inc.", "retail")[0]).toMatch(/new store OR location/);
    expect(companyQueries("Acme Foods Inc.")[0]).toMatch(/plant OR warehouse/);
  });
  it("uses the retail model word for word, with the shared rules", () => {
    const { retailModel, model, rules } = loadPromptDocs();
    const retail = buildSystemPrompt(undefined, "retail");
    expect(retail).toContain(retailModel);
    expect(retail).toContain(rules);
    expect(retail).not.toContain(model);
    expect(retail).toMatch(/This brief is for a retail real-estate broker/);
    const industrial = buildSystemPrompt();
    expect(industrial).toContain(model);
    expect(industrial).not.toContain("This brief is for a retail real-estate broker");
  });
});

describe("retail occupier names", () => {
  it("rejects bare business types, fragments and landlords", async () => {
    const { resolveOccupier } = await import("@/lib/ingest/occupier");
    expect(resolveOccupier("INTERIOR ALTERATIONS - Beauty Salon").name).toBeNull();
    expect(resolveOccupier("INTERIOR ALTERATIONS (TENANT FIT-UP) - DENTAL").name).toBeNull();
    expect(resolveOccupier("CHANGE OF USE - DAYCARE TENANT FIT UP AT GROUND FLOOR AND EXTERIOR PLAYGROUND AT GRADE").name).toBeNull();
    expect(resolveOccupier("INTERIOR ALTERATIONS CRU 42A RETURN TO BASE FOR THE CADILLAC FAIRVIEW CORPORATION").name).toBeNull();
    expect(resolveOccupier("ONE FASCIA SIGN - SMASH BURGER").name).toBe("SMASH BURGER");
    expect(resolveOccupier("INTERIOR ALTERATIONS (TENANT FIT-UP) - BOOSTER JUICE").name).toBe("BOOSTER JUICE");
  });
});
