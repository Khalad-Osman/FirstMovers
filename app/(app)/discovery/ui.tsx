import type { Database } from "@/lib/supabase/database.types";

type RunStatus = Database["public"]["Enums"]["run_status"];
const CLASS: Record<RunStatus, string> = { queued: "badge-stage", running: "badge-context", completed: "badge-supported", failed: "badge-failed" };
const LABEL: Record<RunStatus, string> = { queued: "Queued", running: "Running", completed: "Completed", failed: "Failed" };

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <span className={`badge ${CLASS[status]}`}>{LABEL[status]}</span>;
}

export function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
