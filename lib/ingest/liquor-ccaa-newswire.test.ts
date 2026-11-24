import { describe, expect, it } from "vitest";
import { liquorDate, mapLiquor, parseCsvLine } from "./agco-liquor";
import { firstCompany, mapCcaa, provinceOf } from "./ccaa";
import { companyFrom, mapCard, parseList } from "./newswire";
import { signalWeight, type SignalForCandidate } from "@/lib/discovery/candidates";
import { familyOf, isPhysical } from "@/lib/prospects";
import { recordExcerpt } from "@/lib/research/records";
import { getIngestSource } from "./sources";
import type { IngestItem, SignalRow } from "./types";

const rowOf = (i: IngestItem): SignalRow => {
  if (!("row" in i)) throw new Error(`skipped: ${i.skip}`);
  return i.row;
};
const asSignal = (r: SignalRow) => ({ ...r, id: "x" }) as unknown as SignalForCandidate;

describe("AGCO liquor licence applications", () => {
  const base = { city: "MISSISSAUGA", address: "3221 DERRY RD W, UNIT 21, MISSISSAUGA , ON, L5N7L7", deadline_objections_submissions: "16-DEC-26", file_number: "3901", application_type_en: "New Application", licence_type_en: "Liquor Sales Licence", areas: "Indoor Area" };
  const ctx = { today: "2026-11-24", stored: new Map<string, string | null>() };
  it("parses quoted CSV and dates", () => {
    expect(parseCsvLine('"A","1 MAIN ST, TORONTO, ON","x ""y"""')).toEqual(["A", "1 MAIN ST, TORONTO, ON", 'x "y"']);
    expect(liquorDate("04-DEC-26")).toBe("2026-12-04");
  });
  it("maps a new application, dated the day first seen", () => {
    const r = rowOf(mapLiquor({ ...base, premises_name: "TANDOORI BOYS" }, ctx));
    expect(r).toMatchObject({ source_type: "agco_liquor", source_record_id: "liquor:3901", sector: "retail", raw_entity_name: "TANDOORI BOYS", published_at: "2026-11-24", raw: { kind: "liquor_new", deadline: "2026-12-16" } });
    expect(r.location).toMatch(/MISSISSAUGA, Ontario, L5N7L7$/);
    const again = rowOf(mapLiquor({ ...base, premises_name: "TANDOORI BOYS" }, { ...ctx, stored: new Map([["liquor:3901", "2026-11-20"]]) }));
    expect(again.published_at).toBe("2026-11-20");
  });
  it("reads renames and added areas", () => {
    expect(rowOf(mapLiquor({ ...base, premises_name: "Flavours Sports Bar & Grill (tbka: La Luna Restaurante)" }, ctx))).toMatchObject({ raw_entity_name: "La Luna Restaurante", raw: { kind: "liquor_rebrand" } });
    expect(rowOf(mapLiquor({ ...base, premises_name: "MAHARAJA INDIAN RESTAURANT T.B.K.A Aura Lounge" }, ctx)).raw_entity_name).toBe("Aura Lounge");
    const area = rowOf(mapLiquor({ ...base, premises_name: "FILM CAFE", application_type_en: "Change Application - Changes and/or Additions to Existing Licensed Areas" }, ctx));
    expect(signalWeight(asSignal(area))).toEqual({ weight: 2, label: "retail: licensed area added (expansion in place)" });
    expect(familyOf(area)).toBe("licence");
    expect(recordExcerpt(asSignal(area) as never)).toMatch(/first seen in the AGCO public notice list/);
  });
});

describe("CCAA creditor protection filings", () => {
  const ctx = { today: "2026-11-24", cutoff: "2025-11-24" };
  const row = (over: Record<number, string | number | null>) => {
    const r: (string | number | null)[] = ["CL-26-1", "Ontario Superior Court of Justice (Commercial List), District of Toronto", "0000001-2026-ON", 46056, "www.example.com/case", "Toys \"R\" Us (Canada) Ltd. / Toys \"R\" Us (Canada) Ltee.", null, null, null, null, "A Monitor Inc.", null, null, null, null, null, "654\n*requested sealing order"];
    for (const [i, v] of Object.entries(over)) r[Number(i)] = v;
    return r;
  };
  it("reads the first company, the province and the employees", () => {
    expect(firstCompany("S. GUMPERT CO. OF CANADA LTD., GUMPERT REALCO INC., AND GUMPERT HOLDING INC.")).toBe("S. GUMPERT CO. OF CANADA LTD.");
    expect(firstCompany("Spectra Premium Mobility Solutions Canada Ltd. and Spectra Premium Mobility Solutions USA, LLC")).toBe("Spectra Premium Mobility Solutions Canada Ltd.");
    expect(provinceOf("King's Bench Winnipeg Centre")).toBe("Manitoba");
    expect(provinceOf("Superior Court, District of Longueuil")).toBe("Quebec");
    expect(provinceOf("Ontario Superior Court of Justice (Commercial List)")).toBe("Ontario");
    const r = rowOf(mapCcaa(row({}), ctx));
    expect(r).toMatchObject({ source_type: "ccaa_filing", raw_entity_name: 'Toys "R" Us (Canada) Ltd.', sector: "retail", signal_strength: "insolvency", published_at: "2026-02-03", location: "Ontario", url: "https://www.example.com/case" });
    expect(r.summary).toMatch(/Canadian employees at filing: 654\./);
    expect(signalWeight(asSignal(r)).weight).toBe(3);
    expect(familyOf(r)).toBe("insolvency");
    expect(isPhysical(r as never)).toBe(true);
  });
  it("skips property projects and old filings", () => {
    expect(mapCcaa(row({ 5: "Portwood Development 3 Limited Partnership" }), ctx)).toEqual({ skip: "real-estate project or property owner" });
    expect(mapCcaa(row({ 3: 45000 }), ctx)).toEqual({ skip: "older than 12 months" });
  });
});

describe("newswire releases", () => {
  const list = `<div class="card col-view" role="group"><a class="newsreleaseconsolidatelink" href="/news-releases/food-world-plus-brings-176-000-square-feet-to-mississauga-812300798.html"><h3><small>Oct 29, 2026, 11:50 ET</small> Food World Plus Brings 176,000 Square Feet of Global Flavours to Mississauga </h3><p class="remove-outline">A new multicultural grocery store opens.</p></a></div>`;
  const ctx = { today: "2026-11-24", cutoff: "2025-11-24" };
  it("parses list cards", () => {
    const [card] = parseList(list);
    expect(card).toMatchObject({ date: "2026-10-29", title: "Food World Plus Brings 176,000 Square Feet of Global Flavours to Mississauga", teaser: "A new multicultural grocery store opens." });
  });
  it("reads the company from the title or the teaser", () => {
    expect(companyFrom("GLS Canada Opens Parcel Operations at Vaughan Hub", "")).toBe("GLS Canada");
    expect(companyFrom("Giant Tiger is Coming to Tillsonburg, Ontario", "")).toBe("Giant Tiger");
    expect(companyFrom("A big day in Oakville", "Golf Town, Canada's largest golf retailer, opened its flagship.")).toBe("Golf Town");
    expect(companyFrom("FIRST LOOK: Nintendo's first store", "")).toBeNull();
    expect(companyFrom("Thousands of London, Ontario residents welcomed the store", "")).toBeNull();
  });
  it("keeps an Ontario facility or store", () => {
    const [card] = parseList(list);
    const r = rowOf(mapCard({ ...card, sector: "retail" }, ctx));
    expect(r).toMatchObject({ source_type: "newswire_release", source_record_id: "812300798", raw_entity_name: "Food World Plus", location: "Mississauga, Ontario", sector: "retail", signal_strength: "announcement" });
    expect(signalWeight(asSignal(r)).label).toMatch(/^retail|news release/);
    expect(familyOf(r)).toBe("news");
  });
  it("needs an Ontario place in the title or teaser", () => {
    const [card] = parseList(list.replace(/Mississauga/g, "Jeddah"));
    expect(mapCard({ ...card, sector: "either" }, ctx)).toEqual({ skip: "no Ontario place in the title or teaser" });
  });
  it("is registered with the other sources", () => {
    for (const s of ["agco_liquor", "ccaa_filing", "newswire_release"]) expect(getIngestSource(s)).toBeDefined();
  });
});
