import { describe, expect, it } from "vitest";
import type { BriefAnalysis } from "@/lib/brief/schema";
import { SAMPLE_BRIEFS } from "@/lib/samples";
import { dealFit, describeDeal } from "./fit";
import { companyTypeFrom, dateFrom, dealTypeFrom, mapColumns, numberFrom, parseDealsCsv, regionFrom, type PastDealDraft } from "./normalize";

describe("reading a deals spreadsheet", () => {
  it("maps common column names", () => {
    expect(mapColumns(["Tenant", "Industry", "City", "Transaction Type", "Size (SF)", "Clear Height", "Date Signed", "Comments"])).toEqual({
      occupier: "Tenant",
      companyType: "Industry",
      municipality: "City",
      dealType: "Transaction Type",
      sizeSqft: "Size (SF)",
      clearHeightFt: "Clear Height",
      dealDate: "Date Signed",
      notes: "Comments",
    });
  });

  it("normalizes values and leaves unreadable ones blank", () => {
    expect(companyTypeFrom("Food Processing")).toBe("food_beverage");
    expect(companyTypeFrom("3PL / Distribution")).toBe("logistics_3pl");
    expect(companyTypeFrom("Metal fabrication")).toBe("manufacturer");
    expect(companyTypeFrom("")).toBeNull();
    expect(dealTypeFrom("Lease renewal")).toBe("lease");
    expect(dealTypeFrom("Build-to-suit")).toBe("new_build");
    expect(dealTypeFrom("Acquisition")).toBe("sale_purchase");
    expect(dealTypeFrom("Expansion in place")).toBe("expansion_in_place");
    expect(dealTypeFrom("tbd")).toBeNull();
    expect(regionFrom("Mississauga")).toBe("peel");
    expect(regionFrom("Hamilton/Niagara")).toBe("hamilton_niagara");
    expect(regionFrom("Lindsay, Ontario")).toBe("wider_ontario");
    expect(numberFrom("120,000 SF", "sqft")).toBe(120000);
    expect(numberFrom("1.2M sf", "sqft")).toBe(1200000);
    expect(numberFrom("250k", "sqft")).toBe(250000);
    expect(numberFrom("36'", "ft")).toBe(36);
    expect(numberFrom("n/a", "sqft")).toBeNull();
    expect(dateFrom("2024-06-30")).toBe("2024-06-30");
    expect(dateFrom("6/30/2024")).toBe("2024-06-30");
    expect(dateFrom("2023")).toBe("2023-01-01");
    expect(dateFrom("someday")).toBeNull();
  });

  it("parses a CSV with quotes and skips rows without an occupier", async () => {
    const csv = 'Client,Sector,Location,Deal,SF,Clear,Date,Notes\n"Acme Foods, Inc.",Food,Brampton,Lease,"120,000",32,2024-05-01,"Cold storage, 2 docks"\n,Logistics,Vaughan,Sale,50000,,2023,\nBeta 3PL Ltd.,3PL,Vaughan,Purchase,85000,36,2023,';
    const r = await parseDealsCsv(csv);
    expect(r.error).toBeUndefined();
    expect(r.skipped).toBe(1);
    expect(r.drafts).toEqual([
      { occupier: "Acme Foods, Inc.", companyType: "food_beverage", region: "peel", municipality: "Brampton", dealType: "lease", sizeSqft: 120000, clearHeightFt: 32, dealDate: "2024-05-01", notes: "Cold storage, 2 docks" },
      { occupier: "Beta 3PL Ltd.", companyType: "logistics_3pl", region: "york", municipality: "Vaughan", dealType: "sale_purchase", sizeSqft: 85000, clearHeightFt: 36, dealDate: "2023-01-01", notes: null },
    ]);
  });

  it("explains a missing occupier column", async () => {
    expect((await parseDealsCsv("Size,City\n100,Toronto")).error).toMatch(/No occupier column/);
  });
});

describe("dealFit", () => {
  const deal = (over: Partial<PastDealDraft>): PastDealDraft => ({
    occupier: "Past Co.", companyType: null, region: null, municipality: null, dealType: null, sizeSqft: null, clearHeightFt: null, dealDate: null, notes: null, ...over,
  });
  const brief = (over: Partial<BriefAnalysis> = {}): BriefAnalysis => {
    const base = SAMPLE_BRIEFS[0].analysis;
    return {
      ...base,
      company: { ...base.company, localConnection: "Plant in Brampton, Ontario." },
      companyType: "food_beverage",
      dealIndicators: ["lease"],
      ledger: base.ledger.map((e, i) => (i === 0 ? { ...e, evidenceType: "fact" as const, finding: "Leases a 110,000 square foot facility." } : e)),
      ...over,
    };
  };

  it("rates high when a past deal matches on three or more dimensions", () => {
    const fit = dealFit(brief(), [deal({ occupier: "Acme Foods", companyType: "food_beverage", region: "peel", dealType: "lease", sizeSqft: 120000, dealDate: "2024-05-01", municipality: "Brampton" })]);
    expect(fit.level).toBe("high");
    expect(fit.matches[0].dimensions).toEqual(["company type", "region", "deal type", "size"]);
    expect(fit.reason).toBe("Closest past deal matches on company type, region, deal type, size.");
  });

  it("rates medium, low and none by the best match", () => {
    expect(dealFit(brief(), [deal({ companyType: "food_beverage", region: "peel" })]).level).toBe("medium");
    expect(dealFit(brief(), [deal({ region: "peel", sizeSqft: 400000 })]).level).toBe("low"); // size too different
    expect(dealFit(brief(), [deal({ companyType: "manufacturer", region: "durham" })]).level).toBe("none");
    expect(dealFit(brief(), []).reason).toMatch(/No past deals uploaded/);
  });

  it("says when the brief has nothing to compare", () => {
    const b = brief({ companyType: "unknown", dealIndicators: [], company: { ...brief().company, localConnection: "Unclear" }, ledger: brief().ledger.map((e) => ({ ...e, finding: "No numbers." })) });
    expect(dealFit(b, [deal({ region: "peel" })]).reason).toMatch(/doesn't establish/);
  });

  it("describes a deal in one line", () => {
    expect(describeDeal(deal({ occupier: "Acme Foods", companyType: "food_beverage", dealType: "lease", municipality: "Brampton", sizeSqft: 120000, dealDate: "2024-05-01" }))).toBe(
      "Acme Foods: 2024 Food & beverage lease in Brampton, 120,000 sq ft",
    );
  });
});
