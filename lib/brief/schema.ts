import { z } from "zod";

// DRAFT brief schema (Phase 1). Phase 2 refines it for LLM output.
// Enum values mirror the Postgres enums in supabase/migrations.

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

const isoDate = z.iso.date(); // YYYY-MM-DD

export const ledgerEntrySchema = z.object({
  id: z.string().min(1), // stable within a brief, e.g. "S1"
  url: z.url(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  publishedAt: isoDate.nullable(),
  eventAt: isoDate.nullable(), // only when it differs from publication date
  evidenceType: evidenceTypeSchema,
  relevance: relevanceSchema,
  finding: z.string().min(1), // one line
  repeatCoverageOf: z.string().nullable(), // id of the primary entry for the same event
});

export const chainStepSchema = z.object({
  status: chainStatusSchema,
  text: z.string().min(1),
  sourceIds: z.array(z.string()),
});

export const briefAnalysisSchema = z.object({
  company: z.object({
    name: z.string().min(1), // full name as it appears in sources
    entityNotes: z.string().nullable(), // parent/subsidiary/operating entity
    localConnection: z.string().min(1),
  }),
  chain: z.object({
    whatChanged: chainStepSchema,
    operationalConsequence: chainStepSchema,
    facilityPressure: chainStepSchema,
    forcingEvent: chainStepSchema,
    realEstateDecision: chainStepSchema,
  }),
  ledger: z.array(ledgerEntrySchema),
  countercase: z.array(z.string().min(1)).min(1),
  workingHypothesis: z.string().nullable(),
  unknowns: z.array(z.string().min(1)),
  commercialValue: z.string().nullable(),
  nextStep: z.object({
    action: z.enum(["validate", "monitor", "investigate", "discard"]),
    text: z.string().min(1),
    validatingQuestion: z.string().nullable(),
  }),
  rating: ratingSchema,
  ratingReason: z.string().min(1),
  stage: stageSchema,
});

export type Rating = z.infer<typeof ratingSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type Relevance = z.infer<typeof relevanceSchema>;
export type ChainStatus = z.infer<typeof chainStatusSchema>;
export type Origin = z.infer<typeof originSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type ChainStep = z.infer<typeof chainStepSchema>;
export type BriefAnalysis = z.infer<typeof briefAnalysisSchema>;

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
