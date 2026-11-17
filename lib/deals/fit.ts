import { COMPANY_TYPES, DEAL_TYPES, REGIONS, extractSizes, regionsIn, type CompanyTypeKey, type DealTypeKey, type RegionKey } from "@/lib/research/filters";
import type { BriefAnalysis } from "@/lib/brief/schema";
import type { PastDealDraft } from "./normalize";

// Past deal fit (added 2026-11-17, no AI). Compares a brief with the team's past
// deals on company type, region, deal type and size. Separate from the signal
// rating: it says "this looks like work we've done", not "this is a stronger lead".

export type FitLevel = "high" | "medium" | "low" | "none";
export const FIT_LABEL: Record<FitLevel, string> = { high: "High", medium: "Medium", low: "Low", none: "None" };

export type FitMatch = { deal: PastDealDraft & { id?: string }; dimensions: string[] };
export type DealFit = { level: FitLevel; reason: string; matches: FitMatch[] };

type BriefFacts = { companyType: CompanyTypeKey | null; regions: RegionKey[]; dealTypes: DealTypeKey[]; sizes: number[] };

// What the brief itself establishes (sizes only from FACT findings, which the
// model wrote from the sources).
export function briefFacts(a: BriefAnalysis): BriefFacts {
  const facts = a.ledger.filter((e) => e.evidenceType === "fact").map((e) => e.finding).join("\n");
  return {
    companyType: a.companyType && a.companyType !== "unknown" ? a.companyType : null,
    regions: regionsIn(a.company.localConnection),
    dealTypes: a.dealIndicators ?? [],
    sizes: extractSizes(facts).map((s) => s.value),
  };
}

const SIZE_RATIO = 1.5; // within ±50% (either way) counts as comparable size

export function compareDeal(f: BriefFacts, d: PastDealDraft): string[] {
  const dims: string[] = [];
  if (f.companyType && d.companyType && f.companyType === d.companyType) dims.push("company type");
  if (d.region && f.regions.includes(d.region)) dims.push("region");
  if (d.dealType && f.dealTypes.includes(d.dealType)) dims.push("deal type");
  if (d.sizeSqft && f.sizes.some((s) => s / d.sizeSqft! <= SIZE_RATIO && d.sizeSqft! / s <= SIZE_RATIO)) dims.push("size");
  return dims;
}

export function dealFit(a: BriefAnalysis, deals: (PastDealDraft & { id?: string })[]): DealFit {
  if (deals.length === 0) return { level: "none", reason: "No past deals uploaded yet.", matches: [] };
  const f = briefFacts(a);
  if (!f.companyType && f.regions.length === 0 && f.dealTypes.length === 0 && f.sizes.length === 0) {
    return { level: "none", reason: "The brief doesn't establish a company type, region, deal type or size to compare.", matches: [] };
  }
  const matches = deals
    .map((deal) => ({ deal, dimensions: compareDeal(f, deal) }))
    .filter((m) => m.dimensions.length > 0)
    .sort((x, y) => y.dimensions.length - x.dimensions.length || (y.deal.dealDate ?? "").localeCompare(x.deal.dealDate ?? ""));
  const best = matches[0]?.dimensions.length ?? 0;
  const level: FitLevel = best >= 3 ? "high" : best === 2 ? "medium" : best === 1 ? "low" : "none";
  const reason =
    level === "none"
      ? `No past deal shares a company type, region, deal type or size with this brief (${deals.length} compared).`
      : `Closest past deal matches on ${matches[0].dimensions.join(", ")}.`;
  return { level, reason, matches: matches.slice(0, 3) };
}

// One-line description of a past deal, e.g. "2024 Food & beverage lease in Peel, 120,000 sq ft".
export function describeDeal(d: PastDealDraft): string {
  const parts = [
    d.dealDate ? d.dealDate.slice(0, 4) : null,
    d.companyType ? COMPANY_TYPES[d.companyType].label : null,
    d.dealType ? DEAL_TYPES[d.dealType].toLowerCase() : "deal",
    d.municipality ? `in ${d.municipality}` : d.region ? `in ${REGIONS[d.region].label}` : null,
  ].filter(Boolean);
  const size = d.sizeSqft ? `, ${Math.round(d.sizeSqft).toLocaleString("en-CA")} sq ft` : "";
  return `${d.occupier}: ${parts.join(" ")}${size}`;
}
