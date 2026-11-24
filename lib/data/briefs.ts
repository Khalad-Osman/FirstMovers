import "server-only";
import type { Sector } from "@/lib/sector";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { briefAnalysisSchema, type BriefAnalysis, type Origin, type Rating, type Stage } from "@/lib/brief/schema";
import { SAMPLE_BRIEFS, type SampleBrief } from "@/lib/samples";
import { dealFit, type FitLevel } from "@/lib/deals/fit";
import { getPastDealsForFit } from "./deals";
import { effectiveAngle } from "@/lib/brief/angle";
import type { BrokerAngle } from "@/lib/brief/schema";
import { buildTimeline, type TimelineItem } from "@/lib/brief/timeline";
import type { RecordSignal } from "@/lib/research/records";
import { normalizeCompanyName } from "@/lib/research/normalize";

// One shape for feed rows, whether they come from the database or the samples.
export type FeedEntry = {
  key: string;
  href: string;
  isSample: boolean;
  briefId: string | null;
  companyId: string | null;
  companyName: string;
  localConnection: string;
  whatChanged: string;
  facilityPressure: string;
  countercase: string;
  rating: Rating;
  stage: Stage;
  analyzedAt: string;
  origin: Origin;
  surfacedBy: string | null;
  // Space likely to be vacated (likely/possible only); null otherwise
  vacancy: { assessment: "likely" | "possible"; address: string } | null;
  fit?: FitLevel; // past deal fit; absent when no deals are uploaded
  angle: BrokerAngle; // stored, or derived for briefs saved before angles
  dealSummary: string | null; // deal potential summary (briefs from 2026-11-23)
  sector: Sector;
};

export type InvalidBrief = { briefId: string; companyName: string; analyzedAt: string };

const BRIEF_COLUMNS =
  "id, company_id, version, origin, trigger_query, rating, stage, analysis, model, analyzed_at, dismissed, sector, companies(display_name), signals(title)" as const;

function toEntry(
  analysis: BriefAnalysis,
  meta: Omit<FeedEntry, "companyName" | "localConnection" | "whatChanged" | "facilityPressure" | "countercase" | "rating" | "stage" | "vacancy" | "angle" | "dealSummary" | "sector">,
  companyName: string,
  sector: Sector = "industrial",
): FeedEntry {
  const op = analysis.otherPremises;
  return {
    angle: effectiveAngle(analysis, meta.analyzedAt),
    dealSummary: analysis.dealPotential?.summary ?? null,
    sector,
    vacancy: op && op.assessment !== "not_indicated" && op.address ? { assessment: op.assessment, address: op.address } : null,
    ...meta,
    companyName,
    localConnection: analysis.company.localConnection,
    whatChanged: analysis.chain.whatChanged.text,
    facilityPressure: analysis.chain.facilityPressure.text,
    countercase: analysis.countercase[0],
    rating: analysis.rating,
    stage: analysis.stage,
  };
}

export function sampleToEntry(sample: SampleBrief): FeedEntry {
  return toEntry(
    sample.analysis,
    {
      key: `sample:${sample.slug}`,
      href: `/samples/${sample.slug}`,
      isSample: true,
      briefId: null,
      companyId: null,
      analyzedAt: sample.analyzedAt,
      origin: sample.origin,
      surfacedBy: sample.surfacedBy,
    },
    sample.analysis.company.name,
  );
}

// Latest version per company, excluding dismissed briefs. Briefs whose stored
// analysis fails validation are returned separately and never rendered as content.
export async function getFeed(): Promise<{ entries: FeedEntry[]; invalid: InvalidBrief[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("briefs")
    .select(BRIEF_COLUMNS)
    .order("version", { ascending: false });
  if (error) throw new Error(`Could not load briefs: ${error.message}`);

  const latest = new Map<string, (typeof data)[number]>();
  // Latest per company and sector (a company can be researched for both).
  for (const row of data) if (!latest.has(`${row.company_id}:${row.sector}`)) latest.set(`${row.company_id}:${row.sector}`, row);

  const entries: FeedEntry[] = [];
  const invalid: InvalidBrief[] = [];
  const deals = await getPastDealsForFit();
  for (const row of latest.values()) {
    if (row.dismissed) continue;
    const companyName = row.companies?.display_name ?? "Unknown company";
    const parsed = briefAnalysisSchema.safeParse(row.analysis);
    if (!parsed.success) {
      invalid.push({ briefId: row.id, companyName, analyzedAt: row.analyzed_at });
      continue;
    }
    entries.push(
      toEntry(
        parsed.data,
        {
          key: row.id,
          href: `/briefs/${row.id}`,
          isSample: false,
          briefId: row.id,
          companyId: row.company_id,
          analyzedAt: row.analyzed_at,
          origin: row.origin,
          surfacedBy: row.signals?.title ?? row.trigger_query,
        },
        companyName,
        row.sector,
      ),
    );
    if (deals.length) entries[entries.length - 1].fit = dealFit(parsed.data, deals).level;
  }
  return { entries, invalid };
}

export function getSampleEntries(): FeedEntry[] {
  return SAMPLE_BRIEFS.map(sampleToEntry);
}

export type BriefRecord = {
  id: string;
  companyId: string;
  companyName: string;
  version: number;
  origin: Origin;
  surfacedBy: string | null;
  model: string;
  analyzedAt: string;
  dismissed: boolean;
  analysis: BriefAnalysis | null; // null = failed validation
  versions: { id: string; version: number; analyzedAt: string }[];
  sector: Sector;
};

export async function getBrief(id: string): Promise<BriefRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("briefs").select(BRIEF_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load brief: ${error.message}`);
  if (!row) return null;

  const { data: versions, error: vErr } = await supabase
    .from("briefs")
    .select("id, version, analyzed_at")
    .eq("company_id", row.company_id)
    .eq("sector", row.sector)
    .order("version", { ascending: false });
  if (vErr) throw new Error(`Could not load versions: ${vErr.message}`);

  const parsed = briefAnalysisSchema.safeParse(row.analysis);
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.companies?.display_name ?? "Unknown company",
    version: row.version,
    origin: row.origin,
    surfacedBy: row.signals?.title ?? row.trigger_query,
    model: row.model,
    analyzedAt: row.analyzed_at,
    dismissed: row.dismissed,
    analysis: parsed.success ? parsed.data : null,
    versions: versions.map((v) => ({ id: v.id, version: v.version, analyzedAt: v.analyzed_at })),
    sector: row.sector,
  };
}

export type WatchlistItem = {
  companyId: string;
  companyName: string;
  addedAt: string;
  latest: { briefId: string; rating: Rating; whatChanged: string | null; analyzedAt: string } | null;
};

// Shared by the sidebar count and the Watchlist page (same data, same request).
export const getWatchlist = cache(async (): Promise<WatchlistItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watchlist")
    .select("company_id, added_at, companies(display_name, briefs(id, version, rating, analysis, analyzed_at))")
    .order("added_at", { ascending: false });
  if (error) throw new Error(`Could not load watchlist: ${error.message}`);

  return data.map((row) => {
    const briefs = [...(row.companies?.briefs ?? [])].sort((a, b) => b.version - a.version);
    const b = briefs[0];
    const parsed = b ? briefAnalysisSchema.safeParse(b.analysis) : null;
    return {
      companyId: row.company_id,
      companyName: row.companies?.display_name ?? "Unknown company",
      addedAt: row.added_at,
      latest: b
        ? {
            briefId: b.id,
            rating: b.rating,
            whatChanged: parsed?.success ? parsed.data.chain.whatChanged.text : null,
            analyzedAt: b.analyzed_at,
          }
        : null,
    };
  });
});


// One company's timeline: Signal evidence from all its brief versions plus its
// stored public records (lib/brief/timeline.ts).
export async function getCompanyTimeline(companyId: string): Promise<TimelineItem[]> {
  const supabase = await createClient();
  const [{ data: company }, { data: briefs, error }] = await Promise.all([
    supabase.from("companies").select("normalized_key, display_name, aliases").eq("id", companyId).maybeSingle(),
    supabase.from("briefs").select("version, analysis").eq("company_id", companyId),
  ]);
  if (error) throw new Error(`Could not load the timeline: ${error.message}`);
  const parsed = (briefs ?? [])
    .map((b) => ({ version: b.version, parsed: briefAnalysisSchema.safeParse(b.analysis) }))
    .filter((b) => b.parsed.success)
    .map((b) => ({ version: b.version, analysis: b.parsed.data! }));

  const keys = company
    ? [...new Set([company.normalized_key, ...[company.display_name, ...(company.aliases ?? [])].map(normalizeCompanyName)].filter(Boolean))]
    : [];
  const filters = [`company_id.eq.${companyId}`, keys.length ? `entity_key.in.(${keys.map((k) => `"${k}"`).join(",")})` : null].filter(Boolean);
  const { data: records } = await supabase
    .from("signals")
    .select("id, source_type, source_record_id, raw_entity_name, entity_key, signal_strength, title, summary, url, published_at, event_at, location, raw")
    .or(filters.join(","))
    .limit(200);
  return buildTimeline({ briefs: parsed, records: (records ?? []) as RecordSignal[] });
}
