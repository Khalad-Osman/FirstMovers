import type { BriefAnalysis, Origin } from "@/lib/brief/schema";

// Fictional sample briefs. They live in code only, never in the database, and
// are always shown with a "Sample" label. Company names were checked against
// web search (2026-11-10) and do not match real businesses.

export type SampleBrief = {
  slug: string;
  isSample: true;
  origin: Origin;
  surfacedBy: string;
  analyzedAt: string; // ISO date
  analysis: BriefAnalysis;
};

const norvale: SampleBrief = {
  slug: "norvale-precision-castings",
  isSample: true,
  origin: "discovered",
  surfacedBy: "Federal contract award notice (sample)",
  analyzedAt: "2026-11-04",
  analysis: {
    company: {
      name: "Norvale Precision Castings Ltd.",
      entityNotes: "Privately held operating company. No parent identified in the sources.",
      localConnection: "Operates a steel foundry and finishing plant in Brampton, Ontario.",
      entityStatus: "verified",
    },
    chain: {
      whatChanged: {
        status: "supported",
        text: "Awarded a five-year federal supply contract for cast steel components in September 2026, with first deliveries scheduled for Q3 2027.",
        sourceIds: ["S1", "S2"],
      },
      operationalConsequence: {
        status: "inferred",
        text: "Hiring for a new production cell and a second-shift supervisor points to higher casting and finishing volume at the Brampton plant.",
        sourceIds: ["S1", "S3"],
      },
      facilityPressure: {
        status: "inferred",
        text: "A new production cell at a plant described in 2025 as having no on-site expansion land suggests machining or finished-goods space may become constrained.",
        sourceIds: ["S3", "S4"],
      },
      forcingEvent: {
        status: "inferred",
        text: "The Q3 2027 first-delivery date means added capacity has to be working by mid-2027.",
        sourceIds: ["S1"],
      },
      realEstateDecision: {
        status: "unknown",
        text: "Not established. Options range from reconfiguring the existing plant to adding nearby machining or storage space.",
        sourceIds: [],
      },
    },
    ledger: [
      {
        id: "S1",
        url: "https://example.com/sample/federal-award-notice",
        publisher: "Federal award notice (sample record)",
        title: "Contract award: cast steel components, five-year standing offer",
        publishedAt: "2026-09-18",
        eventAt: "2026-09-12",
        recencyTier: "recent",
        evidenceType: "fact",
        relevance: "signal",
        finding: "Five-year supply contract awarded to the company, first deliveries scheduled for Q3 2027.",
        repeatCoverageOf: null,
      },
      {
        id: "S2",
        url: "https://example.com/sample/norvale-press-release",
        publisher: "Norvale Precision Castings Ltd. (sample)",
        title: "Norvale wins federal casting contract",
        publishedAt: "2026-09-20",
        eventAt: "2026-09-12",
        recencyTier: "recent",
        evidenceType: "fact",
        relevance: "signal",
        finding: "Company announcement of the same award. Repeat coverage, not independent corroboration.",
        repeatCoverageOf: "S1",
      },
      {
        id: "S3",
        url: "https://example.com/sample/norvale-careers",
        publisher: "Norvale careers page (sample)",
        title: "Current openings, Brampton",
        publishedAt: "2026-10-22",
        eventAt: null,
        recencyTier: "recent",
        evidenceType: "fact",
        relevance: "signal",
        finding: "Fourteen openings for moulders, CNC machinists and a second-shift supervisor for a new production cell.",
        repeatCoverageOf: null,
      },
      {
        id: "S4",
        url: "https://example.com/sample/trade-profile-2025",
        publisher: "Industry trade publication (sample)",
        title: "Plant profile: Norvale's Brampton foundry",
        publishedAt: "2025-06-10",
        eventAt: null,
        recencyTier: "context",
        evidenceType: "fact",
        relevance: "context",
        finding: "Profile states the plant runs two shifts and has no expansion land on site. 17 months old.",
        repeatCoverageOf: null,
      },
    ],
    countercase: [
      "A fully staffed second shift could absorb the contract volume without more space.",
      "The new production cell may fit inside the existing building after a layout change.",
      "Finished-goods storage could move to a third-party logistics provider instead of new space.",
      "The no-expansion-land statement is 17 months old and may be out of date.",
    ],
    alternativesAssessment: "alternatives_possible",
    existingFacilityInvestment: false,
    brokerAngle: {
      type: "new_requirement",
      headline: "A five-year supply contract and a new production cell at a plant with no expansion land: ask whether Brampton can absorb the new volume.",
      talkingPoints: [
        { text: "Five-year supply contract awarded, with first deliveries scheduled.", sourceIds: ["S1"] },
        { text: "Hiring moulders, machinists and a second-shift supervisor for a new production cell.", sourceIds: ["S3"] },
      ],
      urgency: "act_now",
    },
    workingHypothesis:
      "Norvale may need additional machining or storage space near Brampton before Q3 2027 deliveries begin.",
    unknowns: [
      "Size and current utilization of the Brampton plant.",
      "Whether the new production cell is planned inside the existing building.",
      "Whether the Brampton site is leased or owned, and on what term.",
    ],
    commercialValue:
      "Helping management time a space decision against a fixed delivery date, comparing in-place reconfiguration with nearby options.",
    nextStep: {
      action: "validate",
      text: "Contact the plant or operations lead to confirm how the new cell will be housed.",
      validatingQuestion:
        "Does the new production cell fit inside the current Brampton plant, or are you looking at space for machining or finished goods before deliveries start in 2027?",
    },
    rating: "strong_signal",
    ratingReason:
      "Recent Ontario contract award with a dated delivery start, plus new-cell hiring at a site with no stated expansion land. Alternatives exist but none is confirmed.",
    stage: "pre_shop",
  },
};

const kestrel: SampleBrief = {
  slug: "kestrel-bay-cold-chain",
  isSample: true,
  origin: "live_research",
  surfacedBy: "Live Research: “frozen food distribution Mississauga”",
  analyzedAt: "2026-10-29",
  analysis: {
    company: {
      name: "Kestrel Bay Cold Chain Inc.",
      entityNotes: null,
      localConnection: "Operates a refrigerated warehouse in Mississauga, Ontario.",
      entityStatus: "verified",
    },
    chain: {
      whatChanged: {
        status: "supported",
        text: "Signed a multi-year frozen distribution agreement with a national grocery customer in Ontario, starting in 2027.",
        sourceIds: ["S1"],
      },
      operationalConsequence: {
        status: "inferred",
        text: "More frozen pallets moving through the Mississauga operation from 2027.",
        sourceIds: ["S1"],
      },
      facilityPressure: {
        status: "inferred",
        text: "A permit for new refrigeration equipment points to adding capacity inside the existing building, which argues against an immediate move.",
        sourceIds: ["S2"],
      },
      forcingEvent: {
        status: "unknown",
        text: "No dated milestone beyond the 2027 contract start.",
        sourceIds: [],
      },
      realEstateDecision: {
        status: "unknown",
        text: "No external requirement indicated.",
        sourceIds: [],
      },
    },
    ledger: [
      {
        id: "S1",
        url: "https://example.com/sample/kestrel-grocery-agreement",
        publisher: "Regional business news (sample)",
        title: "Kestrel Bay lands frozen distribution deal",
        publishedAt: "2026-08-14",
        eventAt: null,
        recencyTier: "recent",
        evidenceType: "fact",
        relevance: "signal",
        finding: "Multi-year agreement to handle frozen distribution for a national grocery customer in Ontario, starting 2027.",
        repeatCoverageOf: null,
      },
      {
        id: "S2",
        url: "https://example.com/sample/mississauga-permit",
        publisher: "Municipal building permit record (sample)",
        title: "Interior alteration and refrigeration equipment permit",
        publishedAt: "2026-10-02",
        eventAt: null,
        recencyTier: "recent",
        evidenceType: "fact",
        relevance: "signal",
        finding: "Permit issued for interior alterations and refrigeration equipment at the company's existing Mississauga warehouse.",
        repeatCoverageOf: null,
      },
      {
        id: "S3",
        url: "https://example.com/sample/kestrel-2024-opening",
        publisher: "Kestrel Bay blog (sample)",
        title: "We've opened our Mississauga facility",
        publishedAt: "2024-05-08",
        eventAt: null,
        recencyTier: "historical",
        evidenceType: "fact",
        relevance: "not_relevant",
        finding: "Describes the 2024 opening of the current facility. Historical (30 months old), excluded from the chain.",
        repeatCoverageOf: null,
      },
    ],
    countercase: [
      "The refrigeration permit is investment in the existing facility, which is evidence against an external move.",
      "Part of the new volume may be handled by other carriers or the customer's own network.",
    ],
    alternativesAssessment: "alternatives_likely",
    existingFacilityInvestment: true,
    brokerAngle: {
      type: "capacity_conversation",
      headline: "A new frozen-distribution contract and a refrigeration fit-out at the Mississauga warehouse: ask how much more volume the building can take.",
      talkingPoints: [
        { text: "Multi-year frozen distribution agreement with a national grocery customer.", sourceIds: ["S1"] },
        { text: "Permit for refrigeration equipment at the existing warehouse: investment in place.", sourceIds: ["S2"] },
      ],
      urgency: "act_now",
    },
    workingHypothesis:
      "If the upgraded building cannot absorb the grocery volume, Kestrel Bay may look for overflow freezer space in Peel Region.",
    unknowns: [
      "How much capacity the refrigeration upgrade adds.",
      "Expected pallet volume under the new agreement.",
    ],
    commercialValue: null,
    nextStep: {
      action: "monitor",
      text: "Watch for further permits, cold-storage hiring, or mention of a second Ontario site over the next six months.",
      validatingQuestion:
        "Will the upgraded Mississauga building handle the new grocery volume, or will overflow need another freezer site?",
    },
    rating: "worth_monitoring",
    ratingReason:
      "New business is real, but the company is investing in its existing building, so an external requirement is not indicated yet.",
    stage: "undetermined",
  },
};

const ardent: SampleBrief = {
  slug: "ardent-lumen-packaging",
  isSample: true,
  origin: "discovered",
  surfacedBy: "Company press release (sample)",
  analyzedAt: "2026-10-21",
  analysis: {
    company: {
      name: "Ardent Lumen Packaging Corp.",
      entityNotes: "Canadian subsidiary of a US packaging group.",
      localConnection: "Operates a packaging plant in Toronto, Ontario.",
      entityStatus: "verified",
    },
    chain: {
      whatChanged: { status: "unknown", text: "No dated Ontario change found.", sourceIds: [] },
      operationalConsequence: { status: "unknown", text: "None identified.", sourceIds: [] },
      facilityPressure: { status: "unknown", text: "None identified.", sourceIds: [] },
      forcingEvent: { status: "unknown", text: "None identified.", sourceIds: [] },
      realEstateDecision: { status: "unknown", text: "None identified.", sourceIds: [] },
    },
    ledger: [
      {
        id: "S1",
        url: "https://example.com/sample/ardent-parent-ohio-plant",
        publisher: "Parent company press release (sample)",
        title: "New Ohio plant to serve Midwest customers",
        publishedAt: "2026-07-15",
        eventAt: null,
        recencyTier: "recent",
        evidenceType: "fact",
        relevance: "not_relevant",
        finding: "US parent announced a new plant in Ohio. No Ontario operations mentioned.",
        repeatCoverageOf: null,
      },
      {
        id: "S2",
        url: "https://example.com/sample/ardent-toronto-award",
        publisher: "Packaging industry news (sample)",
        title: "Toronto plant recognized for safety record",
        publishedAt: "2026-09-03",
        eventAt: null,
        recencyTier: "recent",
        evidenceType: "fact",
        relevance: "context",
        finding: "Toronto plant received an industry safety award. No change in operations reported.",
        repeatCoverageOf: null,
      },
    ],
    countercase: ["The only expansion found is in the United States, with no stated link to the Toronto plant."],
    alternativesAssessment: "alternatives_possible",
    existingFacilityInvestment: false,
    brokerAngle: { type: "monitor_only", headline: "Nothing to act on in Ontario yet.", talkingPoints: [], urgency: "watch" },
    workingHypothesis: null,
    unknowns: ["Whether the Ohio plant shifts any volume into or away from Toronto."],
    commercialValue: null,
    nextStep: {
      action: "discard",
      text: "Recheck only if an Ontario-specific signal appears.",
      validatingQuestion: null,
    },
    rating: "no_meaningful_signal",
    ratingReason: "US expansion with no credible Ontario connection; nothing has changed at the Toronto plant.",
    stage: "undetermined",
  },
};

export const SAMPLE_BRIEFS: readonly SampleBrief[] = [norvale, kestrel, ardent];

export function getSample(slug: string): SampleBrief | undefined {
  return SAMPLE_BRIEFS.find((s) => s.slug === slug);
}
