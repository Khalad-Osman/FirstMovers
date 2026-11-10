import {
  CHAIN_STATUS_LABEL,
  EVIDENCE_LABEL,
  RATING_LABEL,
  RELEVANCE_LABEL,
  STAGE_LABEL,
  type ChainStatus,
  type EvidenceType,
  type Rating,
  type Relevance,
  type Stage,
} from "@/lib/brief/schema";

const RATING_CLASS: Record<Rating, string> = {
  strong_signal: "badge-strong",
  worth_monitoring: "badge-worth",
  no_meaningful_signal: "badge-none",
};
const CHAIN_CLASS: Record<ChainStatus, string> = {
  supported: "badge-supported",
  inferred: "badge-inferred",
  unknown: "badge-unknown",
};
const EVIDENCE_CLASS: Record<EvidenceType, string> = {
  fact: "badge-fact",
  inference: "badge-inference",
  hypothesis: "badge-hypothesis",
  unknown: "badge-evidence-unknown",
};
const RELEVANCE_CLASS: Record<Relevance, string> = {
  signal: "badge-signal",
  context: "badge-context",
  not_relevant: "badge-not-relevant",
};

export function RatingBadge({ rating }: { rating: Rating }) {
  return <span className={`badge ${RATING_CLASS[rating]}`}>{RATING_LABEL[rating]}</span>;
}
export function StageBadge({ stage }: { stage: Stage }) {
  return <span className="badge badge-stage">{STAGE_LABEL[stage]}</span>;
}
export function SampleBadge() {
  return <span className="badge badge-sample">Sample</span>;
}
export function ChainStatusBadge({ status }: { status: ChainStatus }) {
  return <span className={`badge ${CHAIN_CLASS[status]}`}>{CHAIN_STATUS_LABEL[status]}</span>;
}
export function EvidenceBadge({ type }: { type: EvidenceType }) {
  return <span className={`badge ${EVIDENCE_CLASS[type]}`}>{EVIDENCE_LABEL[type]}</span>;
}
export function RelevanceBadge({ relevance }: { relevance: Relevance }) {
  return <span className={`badge ${RELEVANCE_CLASS[relevance]}`}>{RELEVANCE_LABEL[relevance]}</span>;
}
