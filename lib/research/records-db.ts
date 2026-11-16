import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCompanyName } from "./normalize";
import { selectRecords, toRecordSource, type RecordSignal } from "./records";

type Db = ReturnType<typeof createAdminClient>;

export type RecordLookup = {
  names: string[]; // company name and aliases; matched exactly on the normalized key
  companyId?: string | null;
  mustInclude?: string | null; // signal id that surfaced the company (discovery)
  today: string;
};

// Find a company's stored signals, pick up to MAX_RECORDS, and save each as a
// source (date_method 'public_record', linked by signal_id). Returns source ids
// in the order they should be analyzed.
export async function attachRecords(db: Db, lookup: RecordLookup): Promise<string[]> {
  const keys = [...new Set(lookup.names.map((n) => normalizeCompanyName(n)).filter(Boolean))];
  const filters = [
    keys.length ? `entity_key.in.(${keys.map((k) => `"${k}"`).join(",")})` : null, // keys are [a-z0-9 ] only
    lookup.companyId ? `company_id.eq.${lookup.companyId}` : null,
    lookup.mustInclude ? `id.eq.${lookup.mustInclude}` : null,
  ].filter(Boolean);
  if (filters.length === 0) return [];

  const { data, error } = await db
    .from("signals")
    .select("id, source_type, source_record_id, raw_entity_name, entity_key, signal_strength, title, summary, url, published_at, event_at, location, raw")
    .or(filters.join(","))
    .limit(200);
  if (error) throw new Error(`Could not load public records: ${error.message}`);

  const picked = selectRecords(data as RecordSignal[], { today: lookup.today, mustInclude: lookup.mustInclude });
  const ids: string[] = [];
  for (const s of picked) {
    const r = toRecordSource(s);
    if (!r) continue;
    const row = {
      url: r.url,
      publisher: r.publisher,
      title: r.title,
      published_at: r.publishedAt,
      event_at: r.eventAt,
      excerpt: r.excerpt,
      content_hash: createHash("sha256").update(r.excerpt).digest("hex"),
      date_method: "public_record" as const,
      signal_id: r.signalId,
      first_seen_query: "public record",
      fetched_at: new Date().toISOString(),
    };
    // One source per signal: update the existing one, else upsert by URL.
    const { data: existing } = await db.from("sources").select("id").eq("signal_id", r.signalId).maybeSingle();
    const saved = existing
      ? await db.from("sources").update(row).eq("id", existing.id).select("id").single()
      : await db.from("sources").upsert(row, { onConflict: "url" }).select("id").single();
    if (saved.error) throw new Error(`Could not save public record: ${saved.error.message}`);
    ids.push(saved.data.id);
  }
  return ids;
}
