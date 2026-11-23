import type { BriefAnalysis, LedgerEntry } from "./schema";
import { CHAIN_STEPS, NEW_SPACE_DEALS, RELEASE_DEALS } from "./schema";

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

  // --- Space likely to be vacated (optional on briefs saved before 2026-11-16)
  const op = brief.otherPremises;
  if (op) {
    op.sourceIds.forEach((id) => {
      if (!byId.has(id)) errors.push(`Other premises: cites ${id}, which is not in the ledger.`);
    });
    if (op.assessment === "not_indicated") {
      if (op.address !== null) errors.push('Other premises: leave address null when vacated space is "not_indicated".');
    } else {
      if (!op.address?.trim()) errors.push(`Other premises: "${op.assessment}" needs the other address as written in the sources.`);
      if (op.sourceIds.length === 0) errors.push(`Other premises: "${op.assessment}" must cite the sources for the other address and the new facility.`);
      if (brief.company.entityStatus !== "verified") errors.push("Other premises: an unverified entity cannot have vacated space.");
    }
    if (op.assessment === "likely") {
      const cited = op.sourceIds.map((id) => byId.get(id));
      if (!cited.some((e) => e?.relevance === "signal" && (e.recencyTier === "recent" || e.recencyTier === "undated"))) {
        errors.push('Other premises: "likely" requires a cited recent Signal source showing the new or fitted-out facility.');
      }
      if (!cited.some((e) => e?.evidenceType === "fact")) {
        errors.push('Other premises: "likely" requires at least one cited FACT.');
      }
    }
  }

  // --- Broker angle (optional on briefs saved before 2026-11-17)
  const angle = brief.brokerAngle;
  if (angle) {
    for (const p of angle.talkingPoints) {
      p.sourceIds.forEach((id) => {
        if (!byId.has(id)) errors.push(`Broker angle: a talking point cites ${id}, which is not in the ledger.`);
      });
    }
    if (angle.type !== "monitor_only") {
      if (angle.talkingPoints.length === 0) errors.push(`Broker angle: "${angle.type}" needs at least one talking point.`);
      if (angle.talkingPoints.some((p) => p.sourceIds.length === 0)) errors.push("Broker angle: every talking point must cite a source.");
      if (!angle.talkingPoints.some((p) => p.sourceIds.some((id) => byId.get(id)?.evidenceType === "fact"))) {
        errors.push("Broker angle: at least one talking point must cite a FACT.");
      }
      if (brief.company.entityStatus !== "verified") errors.push("Broker angle: an unverified entity can only be monitor_only.");
    }
    if (angle.type === "new_requirement" && brief.rating === "no_meaningful_signal") {
      errors.push('Broker angle: "new_requirement" is inconsistent with a No Meaningful Signal rating. Use vacated_space, capacity_conversation, relationship or monitor_only.');
    }
    if (angle.type === "vacated_space" && !(brief.otherPremises && brief.otherPremises.assessment !== "not_indicated")) {
      errors.push('Broker angle: "vacated_space" requires otherPremises to be likely or possible.');
    }
  }

  // --- Deal potential (optional on briefs saved before 2026-11-23)
  const deal = brief.dealPotential;
  if (deal) {
    for (const o of deal.opportunities) {
      const label = `Deal potential (${o.dealType})`;
      if (o.sourceIds.length === 0) errors.push(`${label}: must cite the sources it rests on.`);
      o.sourceIds.forEach((id) => {
        if (!byId.has(id)) errors.push(`${label}: cites ${id}, which is not in the ledger.`);
      });
      if ((NEW_SPACE_DEALS as readonly string[]).includes(o.dealType) && brief.rating === "no_meaningful_signal") {
        errors.push(`${label}: a new-space deal is inconsistent with a No Meaningful Signal rating. Use sublease, disposition, backfill, lease renewal or expansion in place, or leave opportunities empty.`);
      }
      if ((RELEASE_DEALS as readonly string[]).includes(o.dealType) && !(brief.otherPremises && brief.otherPremises.assessment !== "not_indicated")) {
        errors.push(`${label}: requires otherPremises to be likely or possible.`);
      }
    }
    if (deal.opportunities.length > 0 && brief.company.entityStatus !== "verified") {
      errors.push("Deal potential: an unverified entity cannot have deal opportunities.");
    }
  }

  // --- Contacts and premises (optional on briefs saved before 2026-11-23)
  const c = brief.contacts;
  if (c) {
    const items: [string, string[]][] = [
      ...(c.website ? [["website", c.website.sourceIds] as [string, string[]]] : []),
      ...(c.phone ? [["phone", c.phone.sourceIds] as [string, string[]]] : []),
      ...c.people.map((p) => [`person ${p.name}`, p.sourceIds] as [string, string[]]),
      ...c.premises.map((p) => [`premises ${p.address}`, p.sourceIds] as [string, string[]]),
    ];
    for (const [what, ids] of items) {
      if (ids.length === 0) errors.push(`Contacts: ${what} must cite the source that states it.`);
      ids.forEach((id) => {
        if (!byId.has(id)) errors.push(`Contacts: ${what} cites ${id}, which is not in the ledger.`);
      });
    }
  }

  return errors;
}

export function ledgerCounts(brief: BriefAnalysis) {
  const counts = { signal: 0, context: 0, not_relevant: 0 };
  for (const e of brief.ledger) counts[e.relevance] += 1;
  return counts;
}
