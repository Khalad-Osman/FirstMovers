import { describe, expect, it } from "vitest";
import { checkFilters, extractClearHeights, extractSizes, hasFilters, parseFiltersForm, regionsIn, themeMatches, themeQuery, type ResearchFilters } from "./filters";

const filters = (over: Partial<ResearchFilters> = {}): ResearchFilters => ({ regions: [], companyTypes: [], dealTypes: [], ...over });

describe("parseFiltersForm", () => {
  const form = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return parseFiltersForm(f);
  };
  it("reads chips and numbers (commas allowed)", () => {
    const r = form([["filter_region", "peel"], ["filter_region", "york"], ["filter_region", "peel"], ["filter_company_type", "food_beverage"], ["filter_deal_type", "lease"], ["filter_min_sqft", "50,000"], ["filter_max_sqft", ""], ["filter_min_clear_height", "32"]]);
    expect(r.success && r.data).toEqual({ regions: ["peel", "york"], companyTypes: ["food_beverage"], dealTypes: ["lease"], minSqft: 50000, maxSqft: undefined, minClearHeightFt: 32 });
  });
  it("rejects unknown values and min above max", () => {
    expect(form([["filter_region", "mars"]]).success).toBe(false);
    const r = form([["filter_min_sqft", "200000"], ["filter_max_sqft", "100000"]]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/Minimum sq ft is larger/);
  });
  it("knows when nothing is set", () => {
    const r = form([]);
    expect(r.success && hasFilters(r.data)).toBe(false);
  });
});

describe("theme search", () => {
  it("adds place and type terms to the query", () => {
    expect(themeQuery("cold storage expansion", filters({ regions: ["peel"], companyTypes: ["food_beverage"] }))).toBe(
      "cold storage expansion (Peel OR Mississauga OR Brampton) (food OR beverage)",
    );
    expect(themeQuery("cold storage", filters())).toBe("cold storage");
    expect(themeQuery("cold storage", filters({ regions: ["wider_ontario"] }))).toBe("cold storage");
  });
  it("tags results that match the filters", () => {
    expect(themeMatches("New Brampton dairy plant opens", filters({ regions: ["peel", "york"], companyTypes: ["food_beverage"] }))).toEqual(["Peel", "Food & beverage"]);
    expect(themeMatches("Maple Leaf Foods results", filters({ regions: ["york"] }))).toEqual([]);
  });
});

describe("regionsIn", () => {
  it("maps places to regions", () => {
    expect(regionsIn("Permit at 6670 CAMPOBELLO RD, Mississauga; directory lists Vaughan")).toEqual(["peel", "york"]);
    expect(regionsIn("Operates in Lindsay, Ontario")).toEqual(["wider_ontario"]);
    expect(regionsIn("Headquartered in Ohio")).toEqual([]);
  });
});

describe("property statements", () => {
  it("finds sizes in several notations, converting m²", () => {
    const text = "a 122,320-square-foot building; a 450,000 sq. ft. plant; 1.2 million square feet in total; 4,015 m² addition; 230K sq ft DC";
    expect(extractSizes(text).map((s) => s.value).sort((a, b) => a - b)).toEqual([43217, 122320, 230000, 450000, 1200000]);
  });
  it("ignores numbers that aren't sizes", () => {
    expect(extractSizes("Founded in 1998 with 150 employees and $14 million")).toEqual([]);
  });
  it("finds clear heights in feet and metres", () => {
    expect(extractClearHeights("36' clear height; clear height of 40 feet; 10 m clear").map((s) => s.value)).toEqual([36, 40, 32.8]);
  });
});

describe("checkFilters", () => {
  const sources = [
    { id: "S1", text: "The company leases a 122,320-square-foot building at 6900 Maritz Dr, Mississauga, with 36' clear height." },
    { id: "S2", text: "Press release about hiring." },
  ];
  it("checks every filter against the brief and the sources", () => {
    const rows = checkFilters({
      filters: filters({ regions: ["peel"], companyTypes: ["logistics_3pl"], dealTypes: ["lease", "new_build"], minSqft: 100000, minClearHeightFt: 32 }),
      brief: { localConnection: "Fit-out at 6900 MARITZ DR, Mississauga", companyType: "logistics_3pl", dealIndicators: ["lease"] },
      sources,
    });
    expect(rows.map((r) => [r.filter, r.status])).toEqual([
      ["Region", "match"],
      ["Company type", "match"],
      ["Deal type", "match"],
      ["Size", "match"],
      ["Clear height", "match"],
    ]);
    expect(rows[3].evidence?.[0]).toMatchObject({ sourceId: "S1" });
    expect(rows[3].evidence?.[0].quote).toContain("122,320-square-foot");
  });
  it("says 'not stated' rather than guessing", () => {
    const rows = checkFilters({
      filters: filters({ companyTypes: ["manufacturer"], minSqft: 50000, minClearHeightFt: 30 }),
      brief: { localConnection: "Toronto", companyType: "unknown", dealIndicators: [] },
      sources: [{ id: "S1", text: "No numbers here." }],
    });
    expect(rows.map((r) => r.status)).toEqual(["not_stated", "not_stated", "not_stated"]);
  });
  it("reports a mismatch", () => {
    const rows = checkFilters({ filters: filters({ maxSqft: 50000, regions: ["durham"] }), brief: { localConnection: "Brampton, Ontario" }, sources });
    expect(rows.map((r) => r.status)).toEqual(["no_match", "no_match"]);
  });
  it("waits for the analysis for brief-based filters", () => {
    expect(checkFilters({ filters: filters({ regions: ["peel"] }), brief: null, sources }).at(0)).toMatchObject({ status: "not_stated", detail: expect.stringMatching(/after analysis/) });
  });
});
