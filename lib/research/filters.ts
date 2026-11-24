import { z } from "zod";

// Live Research filters (added 2026-11-17). No AI: regions and company types
// shape theme searches; every filter is checked against the brief and the
// collected sources in code. Property criteria are never searched for and never
// assumed: only sizes and heights stated in a source count.

export const REGIONS = {
  peel: { label: "Peel", places: ["Peel", "Mississauga", "Brampton", "Caledon", "Bolton"] },
  york: { label: "York", places: ["York Region", "Vaughan", "Markham", "Richmond Hill", "Newmarket", "Aurora", "Concord", "Woodbridge", "Stouffville", "King City", "East Gwillimbury", "Georgina"] },
  halton: { label: "Halton", places: ["Halton", "Oakville", "Milton", "Burlington", "Halton Hills", "Georgetown", "Acton"] },
  durham: { label: "Durham", places: ["Durham", "Pickering", "Ajax", "Whitby", "Oshawa", "Clarington", "Bowmanville", "Uxbridge", "Scugog"] },
  toronto: { label: "Toronto", places: ["Toronto", "Etobicoke", "Scarborough", "North York", "East York"] },
  hamilton_niagara: { label: "Hamilton/Niagara", places: ["Hamilton", "Stoney Creek", "Ancaster", "Grimsby", "Niagara", "St. Catharines", "Welland", "Thorold", "Fort Erie"] },
  waterloo: { label: "Waterloo", places: ["Waterloo", "Kitchener", "Cambridge"] },
  wider_ontario: { label: "Wider Ontario", places: [] as string[] },
} as const;
export type RegionKey = keyof typeof REGIONS;
export const REGION_KEYS = Object.keys(REGIONS) as RegionKey[];

export const COMPANY_TYPES = {
  manufacturer: { label: "Manufacturer", terms: ["manufacturer", "manufacturing", "plant", "factory"], sector: "industrial" },
  logistics_3pl: { label: "Logistics/3PL", terms: ["logistics", "3PL", "distribution centre", "distribution center", "warehouse", "fulfillment"], sector: "industrial" },
  food_beverage: { label: "Food & beverage", terms: ["food", "beverage", "dairy", "meat", "bakery", "processing"], sector: "industrial" },
  energy_nuclear: { label: "Energy/nuclear supply chain", terms: ["nuclear", "energy", "SMR", "utility", "power"], sector: "industrial" },
  data_centre_tech: { label: "Data-centre/tech hardware", terms: ["data centre", "data center", "semiconductor", "electronics", "hardware"], sector: "industrial" },
  // Retail (added 2026-11-23)
  retailer: { label: "Retailer", terms: ["retailer", "store", "stores", "retail"], sector: "retail" },
  restaurant_food_service: { label: "Restaurant/food service", terms: ["restaurant", "quick service", "cafe", "franchise restaurant"], sector: "retail" },
  grocery: { label: "Grocery", terms: ["grocery", "supermarket", "food store"], sector: "retail" },
  franchise: { label: "Franchise", terms: ["franchise", "franchisee", "franchisor"], sector: "retail" },
  cannabis_retail: { label: "Cannabis retail", terms: ["cannabis store", "cannabis retail"], sector: "retail" },
  auto_dealership: { label: "Car dealership", terms: ["dealership", "car dealer"], sector: "retail" },
  fitness_personal_services: { label: "Gym/personal services", terms: ["gym", "fitness", "salon", "spa"], sector: "retail" },
  medical_clinic: { label: "Medical/dental clinic", terms: ["clinic", "medical clinic", "dental"], sector: "retail" },
  other: { label: "Other", terms: [] as string[], sector: "both" },
} as const;
export type CompanyTypeKey = keyof typeof COMPANY_TYPES;
export const COMPANY_TYPE_KEYS = Object.keys(COMPANY_TYPES) as CompanyTypeKey[];

export const DEAL_TYPES = {
  lease: "Lease",
  sale_purchase: "Sale/purchase",
  expansion_in_place: "Expansion in place",
  new_build: "New build",
} as const;
export type DealTypeKey = keyof typeof DEAL_TYPES;
export const DEAL_TYPE_KEYS = Object.keys(DEAL_TYPES) as DealTypeKey[];

const optionalNumber = (max: number, label: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(0, `${label} can't be negative.`).max(max, `${label} is too large.`).optional(),
  );

export const researchFiltersSchema = z
  .object({
    regions: z.array(z.enum(REGION_KEYS as [RegionKey, ...RegionKey[]])).default([]),
    companyTypes: z.array(z.enum(COMPANY_TYPE_KEYS as [CompanyTypeKey, ...CompanyTypeKey[]])).default([]),
    dealTypes: z.array(z.enum(DEAL_TYPE_KEYS as [DealTypeKey, ...DealTypeKey[]])).default([]),
    minSqft: optionalNumber(50_000_000, "Minimum sq ft"),
    maxSqft: optionalNumber(50_000_000, "Maximum sq ft"),
    minClearHeightFt: optionalNumber(200, "Minimum clear height"),
  })
  .refine((f) => f.minSqft === undefined || f.maxSqft === undefined || f.minSqft <= f.maxSqft, {
    message: "Minimum sq ft is larger than maximum sq ft.",
    path: ["maxSqft"],
  });
export type ResearchFilters = z.output<typeof researchFiltersSchema>;

export function parseFiltersForm(formData: FormData) {
  const all = (k: string) => [...new Set(formData.getAll(k).filter((v): v is string => typeof v === "string"))];
  const one = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.replace(/[,\s]/g, "") : undefined;
  };
  return researchFiltersSchema.safeParse({
    regions: all("filter_region"),
    companyTypes: all("filter_company_type"),
    dealTypes: all("filter_deal_type"),
    minSqft: one("filter_min_sqft"),
    maxSqft: one("filter_max_sqft"),
    minClearHeightFt: one("filter_min_clear_height"),
  });
}

export function hasFilters(f: ResearchFilters | null | undefined): f is ResearchFilters {
  return Boolean(f && (f.regions.length || f.companyTypes.length || f.dealTypes.length || f.minSqft !== undefined || f.maxSqft !== undefined || f.minClearHeightFt !== undefined));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (terms: readonly string[]) => (terms.length ? new RegExp(`\\b(?:${terms.map(esc).join("|")})\\b`, "i") : null);

// Theme search: add up to a few place and type terms so results lean toward the filters.
export function themeQuery(theme: string, f: ResearchFilters | null | undefined): string {
  if (!f) return theme;
  const or = (terms: string[]) => (terms.length ? `(${terms.map((t) => (t.includes(" ") ? `"${t}"` : t)).join(" OR ")})` : "");
  const places = f.regions.filter((r) => r !== "wider_ontario").flatMap((r) => REGIONS[r].places.slice(0, 3)).slice(0, 8);
  const types = f.companyTypes.flatMap((t) => COMPANY_TYPES[t].terms.slice(0, 2)).slice(0, 6);
  const extra = [or(places), or(types)].filter(Boolean).join(" ");
  const q = extra ? `${theme} ${extra}` : theme;
  return q.length > 400 ? theme : q;
}

// Which filter labels a theme result's title/description matches (for ranking and a tag).
export function themeMatches(text: string, f: ResearchFilters | null | undefined): string[] {
  if (!f) return [];
  const out: string[] = [];
  for (const r of f.regions) {
    const re = wordRe(REGIONS[r].places);
    if (re?.test(text)) out.push(REGIONS[r].label);
  }
  for (const t of f.companyTypes) {
    const re = wordRe(COMPANY_TYPES[t].terms);
    if (re?.test(text)) out.push(COMPANY_TYPES[t].label);
  }
  return out;
}

// Regions named in a piece of text (e.g. the brief's local connection).
export function regionsIn(text: string): RegionKey[] {
  const found = REGION_KEYS.filter((r) => r !== "wider_ontario" && wordRe(REGIONS[r].places)!.test(text));
  if (found.length === 0 && /\bontario\b/i.test(text)) return ["wider_ontario"];
  return found;
}

// ---- Property statements in source text (no AI) ----------------------------------

export type Statement = { value: number; quote: string };
const SQFT_PER_M2 = 10.7639;
const FT_PER_M = 3.28084;

function quoteAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + length + 70);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}
const num = (s: string) => Number(s.replace(/,/g, ""));

export function extractSizes(text: string): Statement[] {
  const out: Statement[] = [];
  const add = (value: number, m: RegExpExecArray) => {
    if (value >= 100 && value <= 50_000_000) out.push({ value: Math.round(value), quote: quoteAround(text, m.index, m[0].length) });
  };
  const patterns: [RegExp, (m: RegExpExecArray) => number][] = [
    [/(\d+(?:\.\d+)?)\s*million\s*(?:square[- ]f(?:ee|oo)t|sq\.?\s?ft\.?|sf\b)/gi, (m) => num(m[1]) * 1_000_000],
    [/(\d+(?:\.\d+)?)\s?[kK]\s*(?:square[- ]f(?:ee|oo)t|sq\.?\s?ft\.?|sf\b)/g, (m) => num(m[1]) * 1000],
    [/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)[\s-]*(?:square[- ]f(?:ee|oo)t|sq\.?\s?ft\.?|sf\b|ft²|ft2\b)/gi, (m) => num(m[1])],
    [/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)[\s-]*(?:m²|m2\b|square[- ]met(?:re|er)s?|sq\.?\s?m\b)/gi, (m) => num(m[1]) * SQFT_PER_M2],
  ];
  const seen = new Set<number>();
  for (const [re, toSqft] of patterns) {
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (seen.has(m.index)) continue; // "1.2 million square feet" also matches the plain pattern
      for (let i = m.index; i < m.index + m[0].length; i++) seen.add(i);
      add(toSqft(m), m);
    }
  }
  return out;
}

export function extractClearHeights(text: string): Statement[] {
  const out: Statement[] = [];
  const patterns: [RegExp, number][] = [
    [/(\d{1,2}(?:\.\d+)?)\s*(?:'|’|ft\.?|feet|foot|-foot)\s*(?:of\s*)?clear\b/gi, 1],
    [/clear(?:\s*height)?(?:\s*of)?\s*(\d{1,2}(?:\.\d+)?)\s*(?:'|’|ft\.?|feet|foot)/gi, 1],
    [/(\d{1,2}(?:\.\d+)?)\s*(?:m|metres?|meters?)\s*(?:of\s*)?clear\b/gi, FT_PER_M],
    [/clear(?:\s*height)?(?:\s*of)?\s*(\d{1,2}(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/gi, FT_PER_M],
  ];
  for (const [re, factor] of patterns) {
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const ft = Math.round(num(m[1]) * factor * 10) / 10;
      if (ft >= 8 && ft <= 150) out.push({ value: ft, quote: quoteAround(text, m.index, m[0].length) });
    }
  }
  return out;
}

// ---- The "fits your filters?" check -----------------------------------------------

export type CheckStatus = "match" | "no_match" | "not_stated";
export type CheckRow = { filter: string; wanted: string; status: CheckStatus; detail: string; evidence?: { sourceId: string; quote: string }[] };

export function checkFilters(input: {
  filters: ResearchFilters;
  brief?: { localConnection: string; companyType?: CompanyTypeKey | "unknown"; dealIndicators?: DealTypeKey[] } | null;
  sources: { id: string; text: string }[];
}): CheckRow[] {
  const { filters: f, brief, sources } = input;
  const rows: CheckRow[] = [];
  const list = (keys: string[], label: (k: string) => string) => keys.map(label).join(", ");

  if (f.regions.length) {
    const wanted = list(f.regions, (r) => REGIONS[r as RegionKey].label);
    if (!brief) rows.push({ filter: "Region", wanted, status: "not_stated", detail: "Checked after analysis, from the brief's local connection." });
    else {
      const found = regionsIn(brief.localConnection);
      const hit = found.filter((r) => f.regions.includes(r));
      rows.push({
        filter: "Region",
        wanted,
        status: found.length === 0 ? "not_stated" : hit.length ? "match" : "no_match",
        detail: found.length ? `Local connection names ${list(found, (r) => REGIONS[r as RegionKey].label)}.` : "The local connection names no region.",
      });
    }
  }
  if (f.companyTypes.length) {
    const wanted = list(f.companyTypes, (t) => COMPANY_TYPES[t as CompanyTypeKey].label);
    const t = brief?.companyType;
    rows.push(
      !brief || !t || t === "unknown"
        ? { filter: "Company type", wanted, status: "not_stated", detail: brief ? "The sources don't establish the company type." : "Checked after analysis." }
        : { filter: "Company type", wanted, status: f.companyTypes.includes(t) ? "match" : "no_match", detail: `Sources indicate: ${COMPANY_TYPES[t].label}.` },
    );
  }
  if (f.dealTypes.length) {
    const wanted = list(f.dealTypes, (d) => DEAL_TYPES[d as DealTypeKey]);
    const got = brief?.dealIndicators ?? [];
    const hit = got.filter((d) => f.dealTypes.includes(d));
    rows.push(
      !brief || got.length === 0
        ? { filter: "Deal type", wanted, status: "not_stated", detail: brief ? "The sources don't indicate a deal type." : "Checked after analysis." }
        : { filter: "Deal type", wanted, status: hit.length ? "match" : "no_match", detail: `Sources indicate: ${list(got, (d) => DEAL_TYPES[d as DealTypeKey])}.` },
    );
  }

  const fmt = (n: number) => n.toLocaleString("en-CA");
  if (f.minSqft !== undefined || f.maxSqft !== undefined) {
    const wanted = f.minSqft !== undefined && f.maxSqft !== undefined ? `${fmt(f.minSqft)}–${fmt(f.maxSqft)} sq ft` : f.minSqft !== undefined ? `at least ${fmt(f.minSqft)} sq ft` : `at most ${fmt(f.maxSqft!)} sq ft`;
    const stated = sources.flatMap((s) => extractSizes(s.text).map((st) => ({ ...st, sourceId: s.id })));
    const fits = (v: number) => (f.minSqft === undefined || v >= f.minSqft) && (f.maxSqft === undefined || v <= f.maxSqft);
    rows.push(
      stated.length === 0
        ? { filter: "Size", wanted, status: "not_stated", detail: "No size is stated in the collected sources." }
        : {
            filter: "Size",
            wanted,
            status: stated.some((s) => fits(s.value)) ? "match" : "no_match",
            detail: `Sizes stated in the sources: ${[...new Set(stated.map((s) => fmt(s.value)))].slice(0, 5).join(", ")} sq ft. Check which building each refers to.`,
            evidence: stated.slice(0, 5).map((s) => ({ sourceId: s.sourceId, quote: s.quote })),
          },
    );
  }
  if (f.minClearHeightFt !== undefined) {
    const wanted = `at least ${f.minClearHeightFt} ft clear`;
    const stated = sources.flatMap((s) => extractClearHeights(s.text).map((st) => ({ ...st, sourceId: s.id })));
    rows.push(
      stated.length === 0
        ? { filter: "Clear height", wanted, status: "not_stated", detail: "No clear height is stated in the collected sources." }
        : {
            filter: "Clear height",
            wanted,
            status: stated.some((s) => s.value >= f.minClearHeightFt!) ? "match" : "no_match",
            detail: `Clear heights stated: ${[...new Set(stated.map((s) => `${s.value} ft`))].slice(0, 5).join(", ")}.`,
            evidence: stated.slice(0, 5).map((s) => ({ sourceId: s.sourceId, quote: s.quote })),
          },
    );
  }
  return rows;
}
