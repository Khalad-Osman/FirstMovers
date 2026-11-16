import { z } from "zod";

// Brief schemas. Enum values mirror the Postgres enums in supabase/migrations.
//
// Two shapes:
// - modelOutputSchema: what the LLM returns. It cites sources only by the ids we
//   supplied (S1, S2…) and never writes URLs, publishers or dates.
// - briefAnalysisSchema: the stored brief. Code builds it from the model output
//   plus our own source records (lib/analysis/build.ts), so every FACT links to a
//   collected source and every date matches the source record by construction.

export const ratingSchema = z.enum(["strong_signal", "worth_monitoring", "no_meaningful_signal"]);
export const stageSchema = z.enum([
  "pre_shop",
  "active_search",
  "site_controlled",
  "construction_fit_out",
  "open",
  "undetermined",
]);
export const evidenceTypeSchema = z.enum(["fact", "inference", "hypothesis", "unknown"]);
export const relevanceSchema = z.enum(["signal", "context", "not_relevant"]);
export const chainStatusSchema = z.enum(["supported", "inferred", "unknown"]);
export const originSchema = z.enum(["discovered", "live_research"]);
export const recencyTierSchema = z.enum(["recent", "context", "historical", "undated"]);
export const entityStatusSchema = z.enum(["verified", "not_verified"]);
export const alternativesSchema = z.enum([
  "alternatives_likely",
  "alternatives_possible",
  "no_alternatives_identified",
]);
export const nextActionSchema = z.enum(["validate", "monitor", "investigate", "discard"]);

const isoDate = z.iso.date(); // YYYY-MM-DD

export const chainStepSchema = z.object({
  status: chainStatusSchema,
  text: z.string().min(1),
  sourceIds: z.array(z.string()),
});

const chainSchema = z.object({
  whatChanged: chainStepSchema,
  operationalConsequence: chainStepSchema,
  facilityPressure: chainStepSchema,
  forcingEvent: chainStepSchema,
  realEstateDecision: chainStepSchema,
});

// Space likely to be vacated (added 2026-11-16): when a company commits to a
// new or fitted-out facility and the sources also place it at another Ontario
// address, that other address may become sublease, backfill or sale space.
// Reported separately from the rating, which is about a new requirement.
export const vacancyAssessmentSchema = z.enum(["likely", "possible", "not_indicated"]);
export const otherPremisesSchema = z.object({
  assessment: vacancyAssessmentSchema,
  address: z.string().nullable(), // the other address as written in the sources
  text: z.string().min(1),
  sourceIds: z.array(z.string()),
});

// Fields shared by the model output and the stored brief.
const sharedFields = {
  chain: chainSchema,
  countercase: z.array(z.string().min(1)).min(1),
  alternativesAssessment: alternativesSchema,
  existingFacilityInvestment: z.boolean(), // investment in existing facilities = evidence against a move
  workingHypothesis: z.string().nullable(),
  unknowns: z.array(z.string().min(1)),
  commercialValue: z.string().nullable(),
  nextStep: z.object({
    action: nextActionSchema,
    text: z.string().min(1),
    validatingQuestion: z.string().nullable(),
  }),
  rating: ratingSchema,
  ratingReason: z.string().min(1),
  stage: stageSchema,
};

const companySchema = z.object({
  name: z.string().min(1), // full name as it appears in the sources
  entityNotes: z.string().nullable(), // parent / subsidiary / operating entity
  localConnection: z.string().min(1),
  entityStatus: entityStatusSchema, // not_verified => run summary only, never the feed
});

// ---------- Model output ----------

export const modelLedgerEntrySchema = z.object({
  sourceId: z.string().min(1),
  evidenceType: evidenceTypeSchema,
  relevance: relevanceSchema,
  finding: z.string().min(1),
  repeatCoverageOf: z.string().nullable(),
});

export const modelOutputSchema = z.object({
  company: companySchema,
  ledger: z.array(modelLedgerEntrySchema),
  ...sharedFields,
  otherPremises: otherPremisesSchema,
});

// ---------- Stored brief ----------

export const ledgerEntrySchema = z.object({
  id: z.string().min(1), // the source id cited in the chain, e.g. "S1"
  url: z.url(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  publishedAt: isoDate.nullable(),
  eventAt: isoDate.nullable(), // only when it differs from publication date
  recencyTier: recencyTierSchema,
  evidenceType: evidenceTypeSchema,
  relevance: relevanceSchema,
  finding: z.string().min(1),
  repeatCoverageOf: z.string().nullable(),
});

export const briefAnalysisSchema = z.object({
  company: companySchema,
  ledger: z.array(ledgerEntrySchema),
  ...sharedFields,
  otherPremises: otherPremisesSchema.optional(), // absent on briefs saved before 2026-11-16
});

export const VACANCY_LABEL: Record<z.infer<typeof vacancyAssessmentSchema>, string> = {
  likely: "Vacated space likely",
  possible: "Possible vacated space",
  not_indicated: "Not indicated",
};

export type Rating = z.infer<typeof ratingSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type Relevance = z.infer<typeof relevanceSchema>;
export type ChainStatus = z.infer<typeof chainStatusSchema>;
export type Origin = z.infer<typeof originSchema>;
export type RecencyTier = z.infer<typeof recencyTierSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type ChainStep = z.infer<typeof chainStepSchema>;
export type BriefAnalysis = z.infer<typeof briefAnalysisSchema>;
export type ModelOutput = z.infer<typeof modelOutputSchema>;

export const CHAIN_STEPS = [
  ["whatChanged", "What changed"],
  ["operationalConsequence", "Operational consequence"],
  ["facilityPressure", "Facility pressure"],
  ["forcingEvent", "Forcing event"],
  ["realEstateDecision", "Real-estate decision"],
] as const satisfies ReadonlyArray<readonly [keyof BriefAnalysis["chain"], string]>;

export const RATING_LABEL: Record<Rating, string> = {
  strong_signal: "Strong Signal",
  worth_monitoring: "Worth Monitoring",
  no_meaningful_signal: "No Meaningful Signal",
};
export const STAGE_LABEL: Record<Stage, string> = {
  pre_shop: "Pre-shop",
  active_search: "Active search",
  site_controlled: "Site controlled",
  construction_fit_out: "Construction / fit-out",
  open: "Open",
  undetermined: "Stage undetermined",
};
export const ORIGIN_LABEL: Record<Origin, string> = {
  discovered: "Discovered",
  live_research: "Added from Live Research",
};
export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  fact: "FACT",
  inference: "INFERENCE",
  hypothesis: "HYPOTHESIS",
  unknown: "UNKNOWN",
};
export const RELEVANCE_LABEL: Record<Relevance, string> = {
  signal: "Signal",
  context: "Context",
  not_relevant: "Not relevant",
};
export const CHAIN_STATUS_LABEL: Record<ChainStatus, string> = {
  supported: "Supported",
  inferred: "Inferred",
  unknown: "Unknown",
};
export const RECENCY_LABEL: Record<RecencyTier, string> = {
  recent: "Last 12 months",
  context: "12–24 months",
  historical: "Over 24 months",
  undated: "Undated",
};
