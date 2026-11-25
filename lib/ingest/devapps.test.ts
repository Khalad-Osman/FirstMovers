import { describe, expect, it } from "vitest";
import { classify, mapHamiltonDev, mapOakvilleDev, oakvilleName, parseOakvillePage, storeNameIn } from "./devapps";
import { signalWeight, type SignalForCandidate } from "@/lib/discovery/candidates";
import { familyOf, isPhysical } from "@/lib/prospects";
import { recordExcerpt, recordUrl } from "@/lib/research/records";
import { getIngestSource } from "./sources";
import type { IngestItem, SignalRow } from "./types";

const ctx = { today: "2026-11-25" };
const ms = (d: string) => Date.parse(`${d}T05:00:00Z`);
const rowOf = (i: IngestItem): SignalRow => {
  if (!("row" in i)) throw new Error(`skipped: ${i.skip}`);
  return i.row;
};
const asSignal = (r: SignalRow) => ({ ...r, id: "x" }) as unknown as SignalForCandidate;

describe("classifying development applications", () => {
  it("separates named stores, new space, redevelopment and industrial", () => {
    expect(classify("Proposed one storey retail building (Shoppers Drug Mart).", "", "Shoppers Drug Mart", 1385)).toBe("named_store");
    expect(classify("215 residential units and 1167 m2 of retail/service commercial space.", "", "Mattamy Graydon Banning", 1167)).toBe("new_commercial_space");
    expect(classify("To develop a 1-storey commercial plaza with retail units and one medical clinic unit", "Commercial", null, null)).toBe("new_commercial_space");
    expect(classify("To add 11 storeys of residential units atop the existing one-storey commercial plaza", "Mixed Use", null, null)).toBe("displacement");
    expect(classify("FROM an Automobile Service Station (SS1) Zone TO a Residential R9 Special Provision Zone", "", null, null)).toBe("displacement");
    expect(classify("To construct a single-storey, 2,837 m2 industrial warehouse building", "Industrial", null, null)).toBe("industrial_space");
  });
  it("leaves out public buildings and zone names that only mention commercial", () => {
    expect(classify("New four-storey building for the Halton Region Paramedic Services Headquarters", "", null, 12505)).toBeNull();
    expect(classify("To amend the Community Commercial (C3) Zone to permit an Educational Establishment", "Institutional", null, null)).toBeNull();
    expect(classify("To construct 94 townhouses", "Residential", null, null)).toBeNull();
  });
  it("reads a store named in the description, never a generic word", () => {
    expect(storeNameIn("To construct a one storey Food Basics grocery store with a proposed GFA of 3720 m2")).toBe("Food Basics");
    expect(storeNameIn("To construct a new Medical clinic")).toBeNull();
    expect(storeNameIn("To construct a 3716.1 square metre grocery store")).toBeNull();
  });
});

describe("Oakville", () => {
  const page = `<title>Shoppers Drug Mart Development - 3000 Sixth Line - 1316.003/02 | Town of Oakville</title><main><h1>Shoppers Drug Mart Development</h1><h2>Description</h2><p>Proposed one storey retail building (Shoppers Drug Mart).</p><h2>Contact information</h2><h2>Supporting documents</h2><a>Submission 1 - Site Plan - June 2026 (pdf)</a><a>Submission 2 - Site Plan - November 2026 (pdf)</a></main>`;
  const a = { REFNO: "1316.003/02", FOLDERTYPE: "SITE", STATUS: "In Circulation", ADDRESS: "3000 Sixth Line. Oakville", INDATE: ms("2026-06-12"), NONRESGFA: 1385, TOTALUNITS: 0, URL: "https://www.oakville.ca/x/shoppers/" };
  it("parses the Town's page and names the applicant", () => {
    expect(parseOakvillePage(page)).toEqual({ title: "Shoppers Drug Mart Development - 3000 Sixth Line - 1316.003/02 | Town of Oakville", description: "Proposed one storey retail building (Shoppers Drug Mart).", latestSubmission: "2026-11" });
    expect(oakvilleName("Circle K (Mac's Convenience Stores Inc.) - 624 Third Line - SP 1626.021/01", "624 Third Line")).toBe("Circle K");
    expect(oakvilleName("2590 Sheridan Garden Dr - SP 1", "2590 Sheridan Garden Dr")).toBeNull();
  });
  it("maps a named new store before any permit", () => {
    const r = rowOf(mapOakvilleDev(a, parseOakvillePage(page), ctx));
    expect(r).toMatchObject({ source_type: "devapp_oakville", source_record_id: "SITE:1316.003/02", raw_entity_name: "Shoppers Drug Mart", sector: "retail", signal_strength: "development", published_at: "2026-06-12", url: "https://www.oakville.ca/x/shoppers/", location: "3000 Sixth Line, Oakville, Ontario" });
    expect(r.raw).toMatchObject({ kind: "named_store", stage: "application", latest_submission: "2026-11" });
    expect(signalWeight(asSignal(r))).toEqual({ weight: 4, label: "retail: new store in development review" });
    expect(familyOf(r)).toBe("development");
    expect(isPhysical(r as never)).toBe(true);
    expect(recordUrl(r as never)).toBe("https://www.oakville.ca/x/shoppers/");
    expect(recordExcerpt(asSignal(r) as never)).toMatch(/Application received: 2026-06-12 \(under review/);
  });
  it("skips closed files, old files and pages without a description", () => {
    expect(mapOakvilleDev({ ...a, STATUS: "Closed" }, parseOakvillePage(page), ctx)).toEqual({ skip: "closed or withdrawn" });
    expect(mapOakvilleDev({ ...a, INDATE: ms("2024-06-01") }, parseOakvillePage(page), ctx)).toEqual({ skip: "received more than 24 months ago" });
    expect(mapOakvilleDev(a, null, ctx)).toEqual({ skip: "no description" });
  });
});

describe("Hamilton", () => {
  const a = { FILE_NUM: "SPA-26-001", FILE_TYPE: "Formal Consultation", ADDRESS: "919 Upper Paradise Road", DESCRIP: "To add 11 storeys of residential units atop the existing one-storey commercial plaza", DEVSTAT_EX: "In Process", APP_DATE: ms("2026-08-24"), PRPS_USE: "Mixed Use" };
  it("keeps address-level redevelopment and names a store from the description", () => {
    const r = rowOf(mapHamiltonDev(a, ctx));
    expect(r).toMatchObject({ source_type: "devapp_hamilton", raw_entity_name: null, occupier_status: "unresolved", sector: "retail", location: "919 Upper Paradise Road, Hamilton, Ontario" });
    expect(r.raw).toMatchObject({ kind: "displacement" });
    expect(r.summary).toMatch(/pre-application stage/);
    expect(recordUrl(r as never)).toContain("FILE_NUM%3D%27SPA-26-001%27");
    const store = rowOf(mapHamiltonDev({ ...a, FILE_TYPE: "Site Plan", DESCRIP: "To construct a one storey Food Basics grocery store with 186 surface parking spaces.", PRPS_USE: "Commercial" }, ctx));
    expect(store).toMatchObject({ raw_entity_name: "Food Basics", entity_key: "food basics", occupier_status: "named" });
  });
  it("skips residential and withdrawn files", () => {
    expect(mapHamiltonDev({ ...a, DESCRIP: "To construct 94 townhouses", PRPS_USE: "Residential" }, ctx)).toEqual({ skip: "not commercial or industrial" });
    expect(mapHamiltonDev({ ...a, DEVSTAT_EX: "Withdrawn" }, ctx)).toEqual({ skip: "closed or withdrawn" });
  });
  it("is registered", () => {
    expect(getIngestSource("devapp_oakville")).toBeDefined();
    expect(getIngestSource("devapp_hamilton")).toBeDefined();
  });
});
