import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { briefAnalysisSchema, type BriefAnalysis, type Origin, type Rating, type Stage } from "@/lib/brief/schema";
import { SAMPLE_BRIEFS, type SampleBrief } from "@/lib/samples";

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
};

export type InvalidBrief = { briefId: string; companyName: string; analyzedAt: string };

const BRIEF_COLUMNS =
  "id, company_id, version, origin, trigger_query, rating, stage, analysis, model, analyzed_at, dismissed, companies(display_name), signals(title)" as const;

function toEntry(
  analysis: BriefAnalysis,
  meta: Omit<FeedEntry, "companyName" | "localConnection" | "whatChanged" | "facilityPressure" | "countercase" | "rating" | "stage">,
  companyName: string,
): FeedEntry {
  return {
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
  for (const row of data) if (!latest.has(row.company_id)) latest.set(row.company_id, row);

  const entries: FeedEntry[] = [];
  const invalid: InvalidBrief[] = [];
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
      ),
    );
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

export type ChronologyItem = {
  date: string;
  dateKind: "event" | "published";
  companyId: string;
  companyName: string;
  briefId: string;
  finding: string;
  relevance: BriefAnalysis["ledger"][number]["relevance"];
  url: string;
  publisher: string;
};

// Dated evidence across saved briefs (all versions), newest first, de-duplicated by
// company + source URL so repeated analyses don't repeat the same evidence.
export async function getChronology(): Promise<ChronologyItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("briefs")
    .select("id, company_id, version, analysis, companies(display_name)")
    .order("version", { ascending: false });
  if (error) throw new Error(`Could not load chronology: ${error.message}`);

  const seen = new Set<string>();
  const items: ChronologyItem[] = [];
  for (const row of data) {
    const parsed = briefAnalysisSchema.safeParse(row.analysis);
    if (!parsed.success) continue;
    for (const e of parsed.data.ledger) {
      const date = e.eventAt ?? e.publishedAt;
      const k = `${row.company_id}|${e.url}`;
      if (!date || seen.has(k)) continue;
      seen.add(k);
      items.push({
        date,
        dateKind: e.eventAt ? "event" : "published",
        companyId: row.company_id,
        companyName: row.companies?.display_name ?? "Unknown company",
        briefId: row.id,
        finding: e.finding,
        relevance: e.relevance,
        url: e.url,
        publisher: e.publisher,
      });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}
