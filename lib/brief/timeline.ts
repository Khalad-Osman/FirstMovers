import type { BriefAnalysis } from "@/lib/brief/schema";
import { toRecordSource, type RecordSignal } from "@/lib/research/records";

// One company's dated history (replaces the global Chronology page, 2026-11-17):
// Signal evidence from all of its brief versions plus its stored public records
// (permits, grants, contract awards), oldest first.

export type TimelineItem = {
  date: string; // YYYY-MM-DD
  dateKind: "event" | "published" | "agreement start" | "issued";
  kind: "evidence" | "record";
  text: string; // finding (evidence) or record title
  publisher: string;
  url: string;
  versions: number[]; // brief versions that cited it (empty = not cited yet)
};

const RECORD_DATE_KIND: Record<string, TimelineItem["dateKind"]> = {
  federal_grant: "agreement start",
  canadabuys_award: "published",
};

export function buildTimeline(input: {
  briefs: { version: number; analysis: BriefAnalysis }[];
  records: RecordSignal[];
}): TimelineItem[] {
  const byUrl = new Map<string, TimelineItem>();
  // Newest version first, so each source keeps its most recent finding.
  for (const b of [...input.briefs].sort((x, y) => y.version - x.version)) {
    for (const e of b.analysis.ledger) {
      if (e.relevance !== "signal") continue;
      const date = e.eventAt ?? e.publishedAt;
      if (!date) continue;
      const existing = byUrl.get(e.url);
      if (existing) {
        existing.versions.push(b.version);
        continue;
      }
      byUrl.set(e.url, { date, dateKind: e.eventAt ? "event" : "published", kind: "evidence", text: e.finding, publisher: e.publisher, url: e.url, versions: [b.version] });
    }
  }
  for (const s of input.records) {
    const r = toRecordSource(s);
    if (!r) continue;
    const date = s.event_at ?? s.published_at;
    if (!date || byUrl.has(r.url)) continue; // already in a brief as evidence
    byUrl.set(r.url, {
      date,
      dateKind: s.event_at ? "event" : (RECORD_DATE_KIND[s.source_type] ?? "issued"),
      kind: "record",
      text: s.title ?? r.title,
      publisher: r.publisher,
      url: r.url,
      versions: [],
    });
  }
  for (const item of byUrl.values()) item.versions.sort((a, b) => a - b);
  return [...byUrl.values()].sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text));
}
