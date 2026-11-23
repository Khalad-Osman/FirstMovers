import type { BriefAnalysis, ModelOutput } from "@/lib/brief/schema";
import { recencyTier } from "./recency";
import { angleUrgency } from "@/lib/brief/angle";
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
  const grounding = groundingErrors(output, sources);
  if (grounding.length) return { ok: false, errors: grounding };

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

  const { ledger: _modelLedger, brokerAngle: modelAngle, ...rest } = output;
  void _modelLedger;
  // Urgency is computed here from the cited sources' dates, never by the model.
  const brokerAngle = modelAngle ? { ...modelAngle, urgency: angleUrgency(modelAngle, ledger, analysisDate) } : undefined;
  return { ok: true, brief: { ...rest, ledger, ...(brokerAngle ? { brokerAngle } : {}) } };
}

// Values a broker would act on (sizes, names, phone numbers, websites,
// addresses) must be stated in a cited source: checked against the source text
// we collected, so the model can't invent them (CLAUDE.md §7).
const flat = (s: string) => s.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ");
const noCommas = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, "$1");
const digits = (s: string) => s.replace(/\D/g, "");
const host = (u: string) => u.toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];

export function groundingErrors(output: ModelOutput, sources: SourceRecord[]): string[] {
  const records = new Map(sources.map((s) => [s.id, s]));
  const textOf = (ids: string[]) => ids.map((id) => records.get(id)).filter(Boolean).map((s) => flat(`${s!.title} ${s!.excerpt}`)).join(" \n ");
  const errors: string[] = [];

  for (const o of output.dealPotential.opportunities) {
    if (!o.statedSize) continue;
    const text = noCommas(textOf(o.sourceIds));
    const numbers = noCommas(o.statedSize).match(/\d+(?:\.\d+)?/g) ?? [];
    if (numbers.length === 0 || numbers.some((n) => !text.includes(n))) {
      errors.push(`Deal potential (${o.dealType}): statedSize "${o.statedSize}" is not stated in the cited sources. Use a size only as a cited source states it, or null.`);
    }
  }

  const c = output.contacts;
  for (const p of c.people) {
    if (!textOf(p.sourceIds).includes(flat(p.name))) errors.push(`Contacts: "${p.name}" does not appear in the cited sources. List only people a cited source names.`);
  }
  if (c.phone) {
    const d = digits(c.phone.number).slice(-10);
    if (d.length < 7 || !digits(textOf(c.phone.sourceIds)).includes(d)) errors.push(`Contacts: phone "${c.phone.number}" is not in the cited sources.`);
  }
  if (c.website) {
    const h = host(c.website.url);
    const cited = c.website.sourceIds.map((id) => records.get(id)).filter(Boolean);
    if (!h || !(textOf(c.website.sourceIds).includes(h) || cited.some((s) => host(s!.url) === h))) {
      errors.push(`Contacts: website "${c.website.url}" is not in the cited sources.`);
    }
  }
  for (const p of c.premises) {
    const text = textOf(p.sourceIds);
    const [num, street] = flat(p.address).match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
    if (!num || !text.includes(num) || (street && !text.includes(street))) {
      errors.push(`Contacts: address "${p.address}" is not in the cited sources. Give addresses as a cited source writes them.`);
    }
  }
  return errors;
}
