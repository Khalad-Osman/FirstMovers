import { describe, expect, it } from "vitest";
import { contractValue, fiscalYearFiles, mapAward } from "./canadabuys";
import { isTorontoIndustrial, mapBrampton, mapMississauga, mapToronto, strengthFrom } from "./permits";
import { drive } from "./run";
import type { IngestSource, SignalRow } from "./types";

const ctx = { today: "2026-11-10", cutoff: "2025-11-10", canadabuysMinValue: 100000, grantsMinValue: 100000 };

// Shapes copied from real rows (values shortened).
const award = (over: Record<string, string> = {}) => ({
  "title-titre-eng": "Reverse Osmosis Desalination Chemicals",
  "referenceNumber-numeroReference": "cb-319-97459610",
  "amendmentNumber-numeroModification": "000",
  "contractNumber-numeroContrat": "W8482-265115/001/MP9",
  "publicationDate-datePublication": "2026-09-02",
  "contractAwardDate-dateAttributionContrat": "2026-08-17",
  "contractAmount-montantContrat": "0.00",
  "totalContractValue-valeurTotaleContrat": "144761.46",
  "contractCurrency-contratMonnaie": "CAD",
  "awardStatus-attributionStatut-eng": "Active",
  "procurementCategory-categorieApprovisionnement": "*GD",
  "gsinDescription-nibsDescription-eng": "*Additives\n*Compounds and mixtures",
  "supplierLegalName-nomLegalFournisseur-eng": "BluMetric Environmental Inc.",
  "supplierAddressCity-fournisseurAdresseVille-eng": "Ottawa",
  "supplierAddressProvince-fournisseurAdresseProvince-eng": "Ontario",
  "supplierAddressPostalCode-fournisseurAdresseCodePostal": "K2C 3R8",
  "contractingEntityName-nomEntitContractante-eng": "Department of National Defence (DND)",
  "regionsOfDelivery-regionsLivraison-eng": "*Nova Scotia\n*British Columbia",
  ...over,
});

describe("CanadaBuys", () => {
  it("maps an Ontario goods award to a signal", () => {
    const item = mapAward(award(), ctx);
    expect("row" in item).toBe(true);
    if (!("row" in item)) return;
    expect(item.row).toMatchObject({
      source_type: "canadabuys_award",
      source_record_id: "W8482-265115/001/MP9",
      raw_entity_name: "BluMetric Environmental Inc.",
      entity_key: "blumetric environmental",
      signal_strength: "award",
      published_at: "2026-09-02",
      event_at: "2026-08-17",
      location: "Ottawa, Ontario, K2C 3R8",
      url: "https://canadabuys.canada.ca/en/tender-opportunities/award-notice/cb-319-97459610",
    });
    expect(item.row.summary).toContain("$144,761 CAD");
    expect(item.row.summary).toContain("Goods: Additives; Compounds and mixtures");
  });

  it.each([
    [{ "supplierAddressProvince-fournisseurAdresseProvince-eng": "Quebec" }, "supplier not in Ontario"],
    [{ "awardStatus-attributionStatut-eng": "Cancelled" }, "award not active"],
    [{ "procurementCategory-categorieApprovisionnement": "*SRV" }, "services only"],
    [{ "contractAwardDate-dateAttributionContrat": "2025-06-01" }, "older than 12 months"],
    [{ "totalContractValue-valeurTotaleContrat": "99999" }, "below minimum contract value"],
  ])("skips %o", (over, reason) => {
    expect(mapAward(award(over), ctx)).toEqual({ skip: reason });
  });

  it("accepts ON abbreviation and mixed goods/services categories", () => {
    const item = mapAward(award({ "supplierAddressProvince-fournisseurAdresseProvince-eng": "ON", "procurementCategory-categorieApprovisionnement": "*SRV\n*GD" }), ctx);
    expect("row" in item).toBe(true);
  });

  it("uses the larger of contract amount and total value", () => {
    expect(contractValue(award({ "contractAmount-montantContrat": "500000.00", "totalContractValue-valeurTotaleContrat": "0.00" }))).toBe(500000);
  });

  it("lists the fiscal-year files covering the last 12 months", () => {
    expect(fiscalYearFiles("2025-11-10", "2026-11-10").map((u) => u.split("/").pop())).toEqual([
      "2025-2026-awardNotice-avisAttribution.csv",
      "2026-2027-awardNotice-avisAttribution.csv",
    ]);
    expect(fiscalYearFiles("2025-03-15", "2026-03-15")).toHaveLength(2);
  });
});

describe("permits", () => {
  it.each([
    ["NEW BUILDING", "new_building"],
    ["ADDITION AND ALTERATION", "addition"],
    ["ALTERATION TO EXISTING BLDG", "alteration"],
    ["FASCIA SIGN", "sign"],
    ["Change of Use", "change_of_use"],
    ["Non Residential Demolition", "demolition"],
    ["New Shell Building", "new_building"],
    ["SPRINKLERS", "other"],
  ])("strength %s -> %s", (text, strength) => expect(strengthFrom(text)).toBe(strength));

  it.each([
    // Cases seen in real data where description words used to override the work type
    ["Interior Alterations", "Remove partitions; demolition of interior walls", "alteration"],
    ["NEW BUILDING", "Demolish existing shed and construct new warehouse", "new_building"],
    ["Site Service", "construction of new storm sewer and addition of catch basins", "other"],
    ["Building Permit Related(MS)", "HVAC for addition", "other"],
    ["ALTERATION TO EXISTING BLDG", "Change of use from office to warehouse", "change_of_use"],
  ])("work %s + description -> %s", (work, desc, strength) => expect(strengthFrom(work, desc)).toBe(strength));

  it("maps a Mississauga permit and resolves a named occupier", () => {
    const item = mapMississauga(
      { BP_NO: "SGNBLD 26-1227", ADDRESS: "7045 BECKETT DR", DESCRIPTION: "ONE (1) FASCIA SIGN - GREAT SELL", SCOPE: "FASCIA SIGN", BLDG_TYPE: "MULTI-TENANT INDUSTRIAL", EST_CON_VALUE: 15000, ISSUE_DATE: 1780272000000 },
      ctx,
    );
    expect("row" in item && item.row).toMatchObject({
      source_record_id: "SGNBLD 26-1227",
      occupier_status: "named",
      raw_entity_name: "GREAT SELL",
      signal_strength: "sign",
      published_at: "2026-06-01",
      location: "7045 BECKETT DR, Mississauga, Ontario",
    });
  });

  it("keeps landlord work unresolved", () => {
    const item = mapMississauga({ BP_NO: "BP 3ALT 26-1345", ADDRESS: "1024 RANGEVIEW RD", DESCRIPTION: "NEW OVERHEAD DOOR IN THE SIDE YARD - LANDLORD WORK", SCOPE: "ALTERATION TO EXISTING BLDG", ISSUE_DATE: 1780272000000 }, ctx);
    expect("row" in item && item.row.occupier_status).toBe("unresolved");
  });

  it("maps a Brampton permit without using builder/contractor as occupier", () => {
    const item = mapBrampton({ PERMITNUMBER: "26-123456", ADDRESS: "10 Industrial Rd", SUBDESC: "F2: Industrial", WORKDESC: "New Complete Building", ISSUEDATE: 1780272000000, BUILDER: "BIG BUILD CORP", CONTRACTOR: "XYZ CONTRACTING LTD" }, ctx);
    expect("row" in item && item.row).toMatchObject({ occupier_status: "unresolved", raw_entity_name: null, entity_key: null, signal_strength: "new_building" });
  });

  it("skips future-dated Brampton permits", () => {
    expect(mapBrampton({ PERMITNUMBER: "x", ISSUEDATE: Date.UTC(2026, 10, 15) }, ctx)).toEqual({ skip: "issue date in the future" });
  });

  it("detects Toronto industrial permits by area or use", () => {
    expect(isTorontoIndustrial({ INDUSTRIAL: 1200 })).toBe(true);
    expect(isTorontoIndustrial({ INDUSTRIAL: 0, PROPOSED_USE: "Warehouse" })).toBe(true);
    expect(isTorontoIndustrial({ INDUSTRIAL: 0, CURRENT_USE: "Sfd - Detached", PROPOSED_USE: "4 Unit Dwelling" })).toBe(false);
  });

  it("maps a Toronto permit with revision in the record id", () => {
    const item = mapToronto(
      { PERMIT_NUM: "26 100001 BLD", REVISION_NUM: "01", WORK: "Interior Alterations", STREET_NUM: "50", STREET_NAME: "BERMONDSEY", STREET_TYPE: "RD", POSTAL: "M4B", ISSUED_DATE: "2026-10-01", DESCRIPTION: "Interior alterations for NORTHLINE DISTRIBUTION INC.", CURRENT_USE: "Warehouse", PROPOSED_USE: "Warehouse", EST_CONST_COST: "250000", INDUSTRIAL: 0 },
      ctx,
    );
    expect("row" in item && item.row).toMatchObject({
      source_record_id: "26 100001 BLD:01",
      occupier_status: "named",
      entity_key: "northline distribution",
      signal_strength: "alteration",
      location: "50 BERMONDSEY RD, Toronto, Ontario M4B",
    });
  });

  it("skips unissued, old and non-industrial Toronto permits", () => {
    expect(mapToronto({ PERMIT_NUM: "a", ISSUED_DATE: null }, ctx)).toEqual({ skip: "not issued (read in the applications pass)" });
    expect(mapToronto({ PERMIT_NUM: "a", ISSUED_DATE: "2025-01-01", INDUSTRIAL: 5 }, ctx)).toEqual({ skip: "older than 12 months" });
    expect(mapToronto({ PERMIT_NUM: "a", ISSUED_DATE: "2026-10-01", PROPOSED_USE: "Apartment" }, ctx)).toEqual({ skip: "not industrial or retail" });
  });

  it("keeps a live Toronto application, dated when received, in the applications pass", () => {
    const app = { PERMIT_NUM: "26 123456 BLD", REVISION_NUM: "00", ISSUED_DATE: null, APPLICATION_DATE: "2026-10-20", STATUS: "Under Review ", WORK: "Interior Alterations", INDUSTRIAL: 2000, DESCRIPTION: "Interior alterations for ACME LOGISTICS INC.", STREET_NUM: "10", STREET_NAME: "Industry", STREET_TYPE: "St" };
    const item = mapToronto(app, ctx, "res", { applications: true });
    expect(item).toMatchObject({ row: { published_at: "2026-10-20", raw_entity_name: "ACME LOGISTICS INC.", title: "Toronto permit application (under review): Interior Alterations at 10 Industry St" } });
    expect("row" in item && item.row.raw).toMatchObject({ stage: "application", applied_at: "2026-10-20", issued_at: null });
    expect(mapToronto({ ...app, STATUS: "Refusal Notice" }, ctx, "res", { applications: true })).toEqual({ skip: "application refused, cancelled or closed" });
    expect(mapToronto({ ...app, ISSUED_DATE: "2026-11-01" }, ctx, "res", { applications: true })).toEqual({ skip: "issued (read in the issued pass)" });
  });
});

describe("drive", () => {
  const row = (id: string): SignalRow => ({
    source_type: "permit_mississauga", source_record_id: id, raw_entity_name: null, entity_key: null, occupier_status: "unresolved",
    signal_strength: "other", title: id, summary: null, url: null, published_at: null, event_at: null, location: null, raw: {},
  });

  it("batches rows, counts skips, and de-duplicates within a batch", async () => {
    const source: IngestSource = {
      source: "permit_mississauga", label: "", description: "",
      async *run() {
        yield { row: row("a") };
        yield { skip: "not industrial" };
        yield { row: row("b") };
        yield { row: row("a") };
        yield { skip: "not industrial" };
      },
    };
    const written: string[][] = [];
    const counts = await drive(source, { ...ctx, fetchImpl: fetch, progress: async () => {} }, async (rows) => {
      written.push(rows.map((r) => r.source_record_id));
      return { inserted: 1, updated: 0 };
    });
    expect(written).toEqual([["a", "b"]]);
    expect(counts).toEqual({ fetched: 5, inserted: 1, updated: 0, unchanged: 1, skipped: 2, skip_reasons: { "not industrial": 2 } });
  });
});
