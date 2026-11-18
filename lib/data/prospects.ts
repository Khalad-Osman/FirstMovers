import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { buildProspects, briefKey, type LatestBrief, type Prospect } from "@/lib/prospects";
import type { RecordSignal } from "@/lib/research/records";
import { todayInToronto } from "@/lib/research/run";
import { monthsBefore } from "@/lib/ingest/types";
import { briefAnalysisSchema } from "@/lib/brief/schema";
import { effectiveAngle } from "@/lib/brief/angle";

// All prospects (unfiltered), built from the last 12 months of named signals.
export const getProspects = cache(async (): Promise<Prospect[]> => {
  const supabase = await createClient();
  const today = todayInToronto();
  const signals: RecordSignal[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("signals")
      .select("id, source_type, source_record_id, raw_entity_name, entity_key, signal_strength, title, summary, url, published_at, event_at, location, raw")
      .not("entity_key", "is", null)
      .gte("published_at", monthsBefore(today, 12))
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Could not load signals: ${error.message}`);
    signals.push(...(data as RecordSignal[]));
    if (data.length < 1000) break;
  }

  const { data: briefs, error: bErr } = await supabase
    .from("latest_briefs")
    .select("id, rating, analyzed_at, analysis, companies(display_name, normalized_key, aliases)");
  if (bErr) throw new Error(`Could not load briefs: ${bErr.message}`);
  const briefsByKey = new Map<string, LatestBrief>();
  for (const b of briefs ?? []) {
    const c = b.companies;
    if (!c || !b.id) continue;
    const parsed = briefAnalysisSchema.safeParse(b.analysis);
    const angle = parsed.success ? effectiveAngle(parsed.data, b.analyzed_at ?? "").type : null;
    const entry: LatestBrief = { id: b.id, rating: b.rating ?? "unknown", analyzedAt: b.analyzed_at ?? "", angle };
    for (const name of [c.display_name, ...(c.aliases ?? [])]) briefsByKey.set(briefKey(name), entry);
    briefsByKey.set(c.normalized_key, entry);
  }
  return buildProspects(signals, { today, briefsByKey });
});
