import type { BriefAnalysis, BrokerAngle } from "./schema";

// Broker angle helpers (added 2026-11-17). Urgency is never chosen by the model:
// it comes from the dates of the Signal sources the angle cites.

type Ledger = BriefAnalysis["ledger"];
const DAY = 86_400_000;
const ageDays = (date: string, today: string) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY;

// act_now: a cited Signal dated in the last 90 days; follow_up: within 12
// months; watch: older, undated, or nothing to act on.
export function angleUrgency(angle: Pick<BrokerAngle, "type" | "talkingPoints">, ledger: Ledger, analysisDate: string): BrokerAngle["urgency"] {
  if (angle.type === "monitor_only") return "watch";
  const ids = new Set(angle.talkingPoints.flatMap((p) => p.sourceIds));
  const dates = ledger
    .filter((e) => ids.has(e.id) && e.relevance === "signal")
    .map((e) => e.eventAt ?? e.publishedAt)
    .filter((d): d is string => Boolean(d));
  if (dates.length === 0) return "watch";
  const newest = Math.min(...dates.map((d) => ageDays(d, analysisDate)));
  return newest <= 90 ? "act_now" : newest <= 365 ? "follow_up" : "watch";
}

// For briefs saved before angles existed: a conservative angle worked out from
// their existing fields, marked derived.
export function deriveAngle(a: BriefAnalysis, analysisDate: string): BrokerAngle {
  const signals = a.ledger.filter((e) => e.relevance === "signal");
  const ids = signals.map((e) => e.id).slice(0, 3);
  const point = (text: string) => [{ text, sourceIds: ids }];
  let angle: Omit<BrokerAngle, "urgency">;
  const op = a.otherPremises;
  if (op && op.assessment !== "not_indicated" && op.address) {
    angle = {
      type: "vacated_space",
      headline: `New facility committed; ${op.address} may come to market.`,
      talkingPoints: [{ text: op.text, sourceIds: op.sourceIds }],
    };
  } else if (a.rating !== "no_meaningful_signal") {
    angle = { type: "new_requirement", headline: a.ratingReason, talkingPoints: point(a.chain.whatChanged.text) };
  } else if (a.existingFacilityInvestment && signals.length) {
    angle = {
      type: "capacity_conversation",
      headline: "Recent investment at existing premises: a reason to ask about future space needs.",
      talkingPoints: point(a.chain.whatChanged.text),
    };
  } else {
    angle = { type: "monitor_only", headline: "Nothing to act on yet.", talkingPoints: [] };
  }
  return { ...angle, urgency: angleUrgency(angle, a.ledger, analysisDate), derived: true };
}

// The angle to show: the stored one, else a derived one.
export function effectiveAngle(a: BriefAnalysis, analyzedAt: string): BrokerAngle {
  return a.brokerAngle ?? deriveAngle(a, analyzedAt.slice(0, 10));
}

// Feed order: what a broker can act on first.
export const ANGLE_ORDER: BrokerAngle["type"][] = ["new_requirement", "leasing_mandate", "vacated_space", "capacity_conversation", "relationship", "monitor_only"];
export const URGENCY_ORDER: BrokerAngle["urgency"][] = ["act_now", "follow_up", "watch"];
