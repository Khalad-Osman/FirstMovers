import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PastDealDraft } from "@/lib/deals/normalize";
import type { BriefAnalysis } from "@/lib/brief/schema";
import { dealFit, describeDeal, type FitLevel } from "@/lib/deals/fit";

export type PastDeal = PastDealDraft & { id: string; source: string; sourceFile: string | null; createdAt: string };

// Read with the secret key so fit labels can be computed for every viewer.
// Callers must only show deal details to admins (lib/auth.ts); members see the
// fit level alone.
export const getPastDealsForFit = cache(async (): Promise<PastDeal[]> => {
  const db = createAdminClient();
  const { data, error } = await db
    .from("past_deals")
    .select("id, occupier, company_type, region, municipality, deal_type, size_sqft, clear_height_ft, deal_date, notes, source, source_file, created_at")
    .order("deal_date", { ascending: false, nullsFirst: false })
    .limit(2000);
  if (error) throw new Error(`Could not load past deals: ${error.message}`);
  return data.map((d) => ({
    id: d.id,
    occupier: d.occupier,
    companyType: d.company_type as PastDeal["companyType"],
    region: d.region as PastDeal["region"],
    municipality: d.municipality,
    dealType: d.deal_type as PastDeal["dealType"],
    sizeSqft: d.size_sqft === null ? null : Number(d.size_sqft),
    clearHeightFt: d.clear_height_ft === null ? null : Number(d.clear_height_ft),
    dealDate: d.deal_date,
    notes: d.notes,
    source: d.source,
    sourceFile: d.source_file,
    createdAt: d.created_at,
  }));
});

// The fit shown on a brief. Null when no deals are uploaded (nothing to compare).
// Deal descriptions are included for admins only.
export async function fitForBrief(analysis: BriefAnalysis, isAdmin: boolean): Promise<{ level: FitLevel; reason: string; matches?: string[] } | null> {
  const deals = await getPastDealsForFit();
  if (deals.length === 0) return null;
  const fit = dealFit(analysis, deals);
  return isAdmin
    ? { level: fit.level, reason: fit.reason, matches: fit.matches.map((m) => `${describeDeal(m.deal)} (${m.dimensions.join(", ")})`) }
    : { level: fit.level, reason: fit.level === "none" ? "No close match among the team's past deals." : `Matches past deals on ${fit.matches[0].dimensions.join(", ")}.` };
}
