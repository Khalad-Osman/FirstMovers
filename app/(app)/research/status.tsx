import type { Database } from "@/lib/supabase/database.types";

export type ResearchStatus = Database["public"]["Enums"]["research_status"];

const LABEL: Record<ResearchStatus, string> = {
  searching: "Searching",
  scraping: "Reading sources",
  ready: "Sources ready",
  analyzing: "Analyzing",
  analyzed: "Analyzed",
  saved: "Added to feed",
  failed: "Failed",
};

const CLASS: Record<ResearchStatus, string> = {
  searching: "badge-context",
  scraping: "badge-context",
  ready: "badge-stage",
  analyzing: "badge-context",
  analyzed: "badge-signal",
  saved: "badge-supported",
  failed: "badge-failed",
};

export const RUNNING: ResearchStatus[] = ["searching", "scraping", "analyzing"];

export function ResearchStatusBadge({ status }: { status: ResearchStatus }) {
  return <span className={`badge ${CLASS[status]}`}>{LABEL[status]}</span>;
}
