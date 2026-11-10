import type { BriefAnalysis } from "./schema";
import { CHAIN_STEPS } from "./schema";

// Code-level checks beyond the schema (CLAUDE.md §7). Phase 2 adds checks
// against collected source records (dates, recency tiers).
export function checkBriefIntegrity(brief: BriefAnalysis): string[] {
  const errors: string[] = [];
  const byId = new Map(brief.ledger.map((e) => [e.id, e]));

  if (byId.size !== brief.ledger.length) errors.push("Ledger ids must be unique");

  for (const entry of brief.ledger) {
    if (entry.repeatCoverageOf && !byId.has(entry.repeatCoverageOf)) {
      errors.push(`${entry.id}: repeatCoverageOf points to missing entry ${entry.repeatCoverageOf}`);
    }
    if (entry.evidenceType === "fact" && !entry.url) {
      errors.push(`${entry.id}: FACT entries must link to a source`);
    }
  }

  for (const [key, label] of CHAIN_STEPS) {
    const step = brief.chain[key];
    for (const id of step.sourceIds) {
      if (!byId.has(id)) errors.push(`${label}: cites missing ledger entry ${id}`);
    }
    if (step.status === "supported") {
      const drivers = step.sourceIds.map((id) => byId.get(id)).filter((e) => e?.relevance === "signal");
      if (drivers.length === 0) {
        errors.push(`${label}: "Supported" requires at least one Signal source`);
      }
    }
  }

  // Only Signal entries drive the rating.
  const signals = brief.ledger.filter((e) => e.relevance === "signal");
  if (brief.rating !== "no_meaningful_signal" && signals.length === 0) {
    errors.push("A rating above No Meaningful Signal needs at least one Signal source");
  }
  if (brief.rating === "strong_signal" && brief.chain.whatChanged.status !== "supported") {
    errors.push('Strong Signal requires a "Supported" What changed step');
  }

  return errors;
}

export function ledgerCounts(brief: BriefAnalysis) {
  const counts = { signal: 0, context: 0, not_relevant: 0 };
  for (const e of brief.ledger) counts[e.relevance] += 1;
  return counts;
}
