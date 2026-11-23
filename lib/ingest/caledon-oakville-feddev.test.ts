import { describe, expect, it } from "vitest";
import { signalWeight, type SignalForCandidate } from "@/lib/discovery/candidates";
import { buildTimeline } from "@/lib/brief/timeline";
import { familyOf, isPhysical } from "@/lib/prospects";
import { recordExcerpt, recordUrl, toRecordSource, type RecordSignal } from "@/lib/research/records";
import { datelineCity, dollars, fundedKind, mapRelease, nameBefore, parseBackgrounder, parseReleaseSentences, type FeedEntry } from "./feddev";
import { resolveOccupier } from "./occupier";
import { isOakvilleIndustrial, mapCaledon, mapOakville } from "./permits-halton-peel";
import type { IngestItem, SignalRow } from "./types";

const ctx = { today: "2026-11-23", cutoff: "2025-11-23" };
const rowOf = (items: IngestItem | IngestItem[]): SignalRow[] => (Array.isArray(items) ? items : [items]).filter((i): i is { row: SignalRow } => "row" in i).map((i) => i.row);
const ms = (d: string) => Date.parse(`${d}T05:00:00Z`);
const asSignal = (r: SignalRow, id = "s1") => ({ id, ...r }) as unknown as RecordSignal;

describe("occupier names in Caledon and Oakville wording", () => {
  it.each([
    ["Alter Industrial (Tenant Fit-Out - TD SYNNEX Office's) - Alternative solution (Fire)", "TD SYNNEX"],
    ["Alter Industrial (Work Platform to Support Conveyor and Work Stations) - NLS, (Building H)", "NLS"],
    ["New construction of a one storey industrial building for Concast manufacturing facility.", "Concast"],
    ["Tenant fit-out to existing warehouse unit to construct office area for North Keg-Unit D1. No new GFA added.", "North Keg"],
    ["Tenant fit-up to existing warehouse unit to construct accessory office with demising wall for Sir Corp. – Unit D2.", "Sir Corp."],
    ["INTERIOR ALTERATION (TENANT FIT-OUT) - TELUS", "TELUS"],
  ])("%s -> %s", (text, name) => {
    expect(resolveOccupier(text).name).toBe(name);
  });
  it.each([
    "Alter Industrial (Tenant Fit-Out for Bakery Product Manufacturing)",
    "Construct Industrial (SHELL BLDG-Warehouse & Offices - , Broccolini Real Estate Group)",
    "Interior alteration to the existing warehouse building (vacant shell space) for landlord work for future tenant.",
    "Alter Industrial (Spray Booth) * Do not put under review until updated owners information is on the application form. SK",
    "Construct Industrial Warehouse (Shell)",
    "INTERIOR ALTERATIONS (TENANT IMPROVEMENTS) - LANDLORDS WORK",
  ])("finds no business in %s", (text) => {
    expect(resolveOccupier(text).name).toBeNull();
  });
});

const caledon = (over: Record<string, unknown> = {}) => ({
  CUSTOMFOLDERNUMBER: "2026 107700 000 00 INDU",
  STATUSDESC: "Under Review",
  WORKDESC: "Alteration/Renovation",
  FOLDERTYPE: "INDU",
  SUBDESC: "Warehouses",
  INDATE: ms("2026-08-18"),
  ISSUEDATE: null,
  FOLDERNAME: "12173 DIXIE ROAD",
  FOLDERDESCRIPTION: "Alter Industrial (Tenant Fit-Out - TD SYNNEX Office's) - Alternative solution (Fire)",
  CONSTVALUE: "8479744.71",
  WORKAREA: 6061.29,
  ...over,
});

describe("Caledon permits", () => {
  it("keeps an application under review as an earlier stage, dated when received", () => {
    const [r] = rowOf(mapCaledon(caledon(), ctx));
    expect(r).toMatchObject({
      source_type: "permit_caledon",
      source_record_id: "2026 107700 000 00 INDU",
      raw_entity_name: "TD SYNNEX",
      signal_strength: "alteration",
      published_at: "2026-08-18",
      location: "12173 DIXIE ROAD, Caledon, Ontario",
      title: "Caledon permit application (under review): Alteration/Renovation at 12173 DIXIE ROAD",
    });
    expect(r.raw).toMatchObject({ stage: "application", applied_at: "2026-08-18", issued_at: null });
    const s = asSignal(r) as unknown as SignalForCandidate;
    expect(signalWeight(s)).toEqual({ weight: 4, label: "major fit-out" }); // $8.5M, 6,061 m²
    expect(isPhysical(asSignal(r))).toBe(true);
    expect(familyOf(r)).toBe("permit");
  });
  it("dates an issued permit by its issue date", () => {
    const [r] = rowOf(mapCaledon(caledon({ STATUSDESC: "Issued", ISSUEDATE: ms("2026-10-01") }), ctx));
    expect(r).toMatchObject({ published_at: "2026-10-01", title: "Caledon permit: Alteration/Renovation at 12173 DIXIE ROAD" });
    expect(r.raw).toMatchObject({ stage: "issued" });
  });
  it.each([
    [{ WORKDESC: "Conditional" }, "revision or phase of another permit"],
    [{ WORKDESC: "Change of Scope" }, "revision or phase of another permit"],
    [{ STATUSDESC: "Cancelled" }, "cancelled or revoked"],
    [{ INDATE: ms("2025-01-05") }, "older than 12 months"],
    [{ CUSTOMFOLDERNUMBER: "" }, "no permit number"],
  ])("skips %o", (over, reason) => {
    expect(mapCaledon(caledon(over), ctx)).toEqual({ skip: reason });
  });
  it("links to the one record and labels the application in the excerpt", () => {
    const s = asSignal(rowOf(mapCaledon(caledon(), ctx))[0]);
    expect(recordUrl(s)).toContain("MiscLayers/MapServer/0/query?where=CUSTOMFOLDERNUMBER%3D%272026+107700+000+00+INDU%27");
    expect(toRecordSource(s)?.publisher).toBe("Town of Caledon – Building permits");
    expect(recordExcerpt(s)).toContain("Application received: 2026-08-18 (in review, not issued yet");
    const [item] = buildTimeline({ briefs: [], records: [s] });
    expect(item.dateKind).toBe("applied");
  });
});

const oak = (over: Record<string, unknown> = {}) => ({
  CUSTOMFOLDERNUMBER: "2024 221871 000 00 DN",
  FOLDERDESCRIPTION: "New construction of a one storey industrial building for Concast manufacturing facility.",
  FOLDERNAME: "3300 Superior Crt",
  Subtype: "Bldg over 5000 sqft F2",
  Worktype: "New Const.",
  Status: "Closed",
  INDATE: ms("2024-11-12"),
  ISSUEDATE: ms("2025-11-26"),
  Construction_Value: 9700000,
  GFA: 9047.58,
  ...over,
});

describe("Oakville permits", () => {
  it("keeps an industrial new building and names the business from the description", () => {
    const [r] = rowOf(mapOakville(oak(), ctx));
    expect(r).toMatchObject({
      source_type: "permit_oakville",
      raw_entity_name: "Concast",
      signal_strength: "new_building",
      published_at: "2025-11-26",
      location: "3300 Superior Crt, Oakville, Ontario",
    });
    expect(signalWeight(asSignal(r) as unknown as SignalForCandidate).weight).toBe(5);
  });
  it.each([
    [{ Subtype: "House - Part 9 - Detached House", FOLDERDESCRIPTION: "New detached dwelling with attached garage." }, false],
    [{ Subtype: "Restaurants", FOLDERDESCRIPTION: "Interior alterations in existing Ford Assembly Plant building for tenant fit-out of Tim Hortons." }, false],
    [{ Subtype: null, FOLDERDESCRIPTION: "Maintenance upgrades to existing wastewater treatment plant buildings." }, false],
    [{ Subtype: null, FOLDERDESCRIPTION: "Installation of free-standing storage racking system (non-walkable) in existing warehouse building." }, true],
    [{ Subtype: "Offices (Business)", FOLDERDESCRIPTION: "Interior alteration to create more offices and reduce warehouse space." }, true],
  ])("recognises industrial work: %o", (over, expected) => {
    expect(isOakvilleIndustrial(oak(over))).toBe(expected);
  });
  it("decodes HTML entities in the description", () => {
    const [r] = rowOf(mapOakville(oak({ FOLDERDESCRIPTION: "Tenant fit-out in an existing two storey F2 industrial building &ndash; unit B103." }), ctx));
    expect(r.summary).toContain("building – unit B103");
  });
});

describe("FedDev Ontario: amounts, kinds, places", () => {
  it.each([
    ["$1,000,000", 1_000_000],
    ["over $6.5 million", 6_500_000],
    ["a $14-million project", 14_000_000],
    ["nothing", null],
  ])("dollars(%s)", (s, n) => expect(dollars(s)).toBe(n));
  it.each([
    ["To expand production capacity and launch new building automation solutions", "facility"],
    ["construct a new 10,000-square foot cleanroom facility at its London site", "facility"],
    ["expand its facility and adopt new advanced automated processing", "facility"],
    ["To implement equipment and automation upgrades to expand production capabilities", "equipment"],
    ["To scale production capabilities through the adoption of new equipment.", "equipment"],
    ["support facility upgrades, including modernizing its equipment", "equipment"],
    ["commercialize and scale its AI-driven solutions", "other"],
  ])("%s -> %s", (purpose, kind) => expect(fundedKind(purpose)).toBe(kind));
  it("reads the dateline city", () => {
    expect(datelineCity("News release August 27, 2026 – Etobicoke, Ontario FedDev Ontario provides")).toBe("Etobicoke");
  });
  it("finds the company name before the verb", () => {
    expect(nameBefore("Concord-based aerospace precision machining and assembly company Letar Inc.")).toBe("Letar Inc.");
    expect(nameBefore("As part of this announcement, SWTCH Energy")).toBe("SWTCH Energy");
    expect(nameBefore("Today, the Government")).toBeNull();
  });
});

describe("FedDev Ontario: releases and backgrounders", () => {
  const entry: FeedEntry = {
    link: "https://www.canada.ca/en/economic-development-southern-ontario/news/2025/12/three-york-region-companies.html",
    title: "Government of Canada supports the growth of three York region companies",
    publishedDate: "2025-12-18T10:00:00-05:00",
  };
  const release = `<main><p>December 18, 2025 - Vaughan, Ontario</p><p>Vaughan-based Sky Acoustics Inc. is receiving up to $1 million to accelerate growth through the adoption of new automated equipment. Concord-based aerospace precision machining and assembly company Letar Inc. is receiving $1.5 million to expand its capacity for complex aerospace and defence components. Future Transfer Co. Inc., in Tillsonburg, is receiving $2.5 million to build a fully integrated facility. The City of Vaughan is receiving $500,000 to deliver an accelerator program for entrepreneurs.</p></main>`;

  it("makes one grant-like signal per company, with purpose, amount and city", () => {
    const rows = rowOf(mapRelease(entry, { release }, ctx));
    expect(rows.map((r) => [r.raw_entity_name, r.location, (r.raw as { grant_kind: string }).grant_kind, (r.raw as { contribution: number }).contribution])).toEqual([
      ["Sky Acoustics Inc.", "Vaughan, Ontario", "equipment", 1_000_000],
      ["Letar Inc.", "Concord, Ontario", "facility", 1_500_000],
      ["Future Transfer Co. Inc.", "Tillsonburg, Ontario", "other", 2_500_000],
    ]);
    expect(rows[0]).toMatchObject({ source_type: "feddev_news", signal_strength: "grant", published_at: "2025-12-18", url: entry.link });
    expect(rows[0].source_record_id.startsWith("2025-12-18:three-york-region-companies:")).toBe(true);
    const s = asSignal(rows[1]) as unknown as SignalForCandidate;
    expect(signalWeight(s)).toEqual({ weight: 4, label: "federal grant: facility or capacity" });
    expect(familyOf(rows[1])).toBe("grant");
    expect(isPhysical(asSignal(rows[2]))).toBe(false);
    expect(recordExcerpt(asSignal(rows[1]))).toContain("Purpose of funding: expand its capacity");
  });

  it("prefers the backgrounder table, with the legal name from the description", () => {
    const bg = `<main><table><tr><th>Recipient Name</th><th>Project</th><th>Total Project Cost</th><th>Funding Contribution</th></tr>
      <tr><td>All Wood Fine Interiors</td><td>To modernize operations through the adoption of advanced manufacturing equipment and facility upgrades. Founded in 1998, All Wood Fine Interiors Ltd. specializes in custom millwork.</td><td>$2,792,279</td><td>$1,000,000</td></tr>
      <tr><td>A.F.C. Toronto</td><td>To strengthen professional sports infrastructure.</td><td>$2,350,000</td><td>$1,175,000</td></tr></table></main>`;
    expect(parseBackgrounder(bg)[0]).toMatchObject({ name: "All Wood Fine Interiors Ltd.", contribution: 1_000_000, projectCost: 2_792_279 });
    const items = mapRelease(entry, { release, backgrounder: bg, backgrounderUrl: "https://example.ca/bg.html" }, ctx);
    const rows = rowOf(items);
    expect(rows.map((r) => r.raw_entity_name)).toEqual(["All Wood Fine Interiors Ltd."]);
    expect(rows[0].url).toBe("https://example.ca/bg.html");
    expect(items).toContainEqual({ skip: "not a company (public body, school, network or programme)" });
  });

  it("skips releases without a named company, and old releases", () => {
    expect(mapRelease(entry, { release: "<main><p>Applications are now open.</p></main>" }, ctx)).toEqual([{ skip: "no company named" }]);
    expect(mapRelease({ ...entry, publishedDate: "2025-01-01T10:00:00-05:00" }, { release }, ctx)).toEqual([{ skip: "older than 12 months" }]);
  });

  it("parses sentences on their own", () => {
    expect(parseReleaseSentences("Melnik Resources in Mount Brydges is receiving more than $530,000 to modernize its facility.")[0]).toMatchObject({
      name: "Melnik Resources",
      city: "Mount Brydges",
      contribution: 530_000,
    });
  });
});
