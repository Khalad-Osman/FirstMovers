import type { BriefAnalysis, ModelOutput } from "@/lib/brief/schema";
import { recencyTier } from "./recency";
import type { SourceRecord } from "./types";

export type BuildResult = { ok: true; brief: BriefAnalysis } | { ok: false; errors: string[] };

// Join the model's ledger (source ids + labels) with our own source records.
// URLs, publishers, titles and dates always come from the records, never from
// the model, so every FACT links to a collected source with matching dates.
export function buildBrief(output: ModelOutput, sources: SourceRecord[], analysisDate: string): BuildResult {
  const errors: string[] = [];
  const records = new Map(sources.map((s) => [s.id, s]));
  const seen = new Set<string>();

  for (const e of output.ledger) {
    if (!records.has(e.sourceId)) errors.push(`Ledger: ${e.sourceId} is not one of the supplied sources.`);
    if (seen.has(e.sourceId)) errors.push(`Ledger: ${e.sourceId} appears more than once; give one entry per source.`);
    seen.add(e.sourceId);
  }
  for (const s of sources) {
    if (!seen.has(s.id)) errors.push(`Ledger: supplied source ${s.id} is missing; every source needs one entry.`);
  }
  if (errors.length) return { ok: false, errors };

  const ledger = output.ledger.map((e) => {
    const s = records.get(e.sourceId)!;
    return {
      id: s.id,
      url: s.url,
      publisher: s.publisher,
      title: s.title,
      publishedAt: s.publishedAt,
      eventAt: s.eventAt && s.eventAt !== s.publishedAt ? s.eventAt : null,
      recencyTier: recencyTier(s, analysisDate),
      evidenceType: e.evidenceType,
      relevance: e.relevance,
      finding: e.finding,
      repeatCoverageOf: e.repeatCoverageOf,
    };
  });

  const { ledger: _modelLedger, ...rest } = output;
  void _modelLedger;
  return { ok: true, brief: { ...rest, ledger } };
}
