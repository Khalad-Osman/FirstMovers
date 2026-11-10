import type { BriefAnalysis, LedgerEntry } from "./schema";
import { CHAIN_STEPS } from "./schema";

// Code-level enforcement of CLAUDE.md §7 on a stored brief. Each message names
// the rule so it can be fed back to the model on retry.
export function checkBriefIntegrity(brief: BriefAnalysis): string[] {
  const errors: string[] = [];
  const byId = new Map(brief.ledger.map((e) => [e.id, e]));

  if (byId.size !== brief.ledger.length) errors.push("Ledger: each source id may appear only once.");

  // --- Ledger entries
  for (const e of brief.ledger) {
    if (e.repeatCoverageOf !== null) {
      const primary = byId.get(e.repeatCoverageOf);
      if (!primary) errors.push(`${e.id}: repeatCoverageOf points to missing entry ${e.repeatCoverageOf}.`);
      else if (primary.id === e.id) errors.push(`${e.id}: repeatCoverageOf cannot point to itself.`);
      else if (primary.repeatCoverageOf !== null)
        errors.push(`${e.id}: repeatCoverageOf must point to the primary entry, not another repeat.`);
    }
    if (e.relevance === "signal" && (e.recencyTier === "context" || e.recencyTier === "historical")) {
      errors.push(
        `${e.id}: sources older than 12 months cannot be Signal (12–24 months are Context; over 24 months are Historical).`,
      );
    }
  }

  // --- Chain
  const isDatedSupport = (e: LedgerEntry | undefined) =>
    e?.relevance === "signal" && (e.recencyTier === "recent" || e.recencyTier === "undated");

  for (const [key, label] of CHAIN_STEPS) {
    const step = brief.chain[key];
    const cited = step.sourceIds.map((id) => byId.get(id));
    step.sourceIds.forEach((id, i) => {
      if (!cited[i]) errors.push(`${label}: cites ${id}, which is not in the ledger.`);
    });
    if (step.status === "supported") {
      if (!cited.some(isDatedSupport)) {
        errors.push(
          `${label}: "Supported" requires at least one cited Signal source that is not Context or Historical.`,
        );
      }
    }
  }

  const wc = brief.chain.whatChanged;
  if (wc.status === "supported") {
    const recentSignal = wc.sourceIds.map((id) => byId.get(id)).some((e) => e?.relevance === "signal" && e.recencyTier === "recent");
    if (!recentSignal) errors.push('What changed: "Supported" requires a dated Signal source from the last 12 months.');
  }

  // --- Rating consistency
  const signals = brief.ledger.filter((e) => e.relevance === "signal");
  if (brief.rating !== "no_meaningful_signal") {
    if (signals.length === 0) errors.push("Rating: anything above No Meaningful Signal needs at least one Signal source.");
    if (brief.company.entityStatus !== "verified")
      errors.push("Rating: an unverified entity must be rated No Meaningful Signal.");
  }

  if (brief.rating === "strong_signal") {
    if (wc.status !== "supported") errors.push('Strong Signal: "What changed" must be Supported.');
    if (brief.chain.facilityPressure.status === "unknown")
      errors.push("Strong Signal: facility pressure cannot be Unknown.");
    if (brief.chain.forcingEvent.status === "unknown")
      errors.push("Strong Signal: requires a plausible forcing event (not Unknown).");
    if (brief.alternativesAssessment === "alternatives_likely")
      errors.push("Strong Signal: inconsistent with a countercase that says alternatives are likely.");
    if (brief.nextStep.action === "discard") errors.push("Strong Signal: next step cannot be Discard.");
  }

  if (brief.existingFacilityInvestment && brief.alternativesAssessment === "no_alternatives_identified") {
    errors.push(
      "Countercase: investment in existing facilities is evidence against an external move; the alternatives assessment cannot be 'no_alternatives_identified'.",
    );
  }

  // --- No Meaningful Signal stays short
  if (brief.rating === "no_meaningful_signal") {
    if (brief.commercialValue !== null) errors.push("No Meaningful Signal: leave commercialValue null.");
    if (brief.countercase.length > 3) errors.push("No Meaningful Signal: keep the countercase to at most 3 points.");
    if (brief.unknowns.length > 3) errors.push("No Meaningful Signal: keep unknowns to at most 3 points.");
  }

  return errors;
}

export function ledgerCounts(brief: BriefAnalysis) {
  const counts = { signal: 0, context: 0, not_relevant: 0 };
  for (const e of brief.ledger) counts[e.relevance] += 1;
  return counts;
}
