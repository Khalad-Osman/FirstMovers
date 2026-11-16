import "server-only";
import { RATING_LABEL, type Rating } from "@/lib/brief/schema";
import { createAdminClient } from "@/lib/supabase/admin";

// In-app notifications (shared team workspace; read state per user).
// Written by server code with the secret key; never breaks the job that calls it.

type Db = ReturnType<typeof createAdminClient>;
export type NotificationKind = "discovery_completed" | "discovery_failed" | "discovery_paused";

type RunOutcome = { status: string; rating?: string; briefId?: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Pure: the text of a "run finished" notification.
export function completedMessage(
  outcomes: RunOutcome[],
  opts: { scheduled: boolean; vacated: number },
): { title: string; body: string } {
  const briefs = outcomes.filter((o) => o.status === "brief");
  const byRating = (["strong_signal", "worth_monitoring", "no_meaningful_signal"] as Rating[])
    .map((r) => [r, briefs.filter((b) => b.rating === r).length] as const)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${RATING_LABEL[r]}`);
  const notVerified = outcomes.filter((o) => o.status === "not_verified").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const parts = [
    byRating.join(", "),
    opts.vacated ? `${plural(opts.vacated, "brief")} with possible vacated space` : null,
    notVerified ? `${notVerified} not verified` : null,
    failed ? `${failed} failed` : null,
  ].filter(Boolean);
  return {
    title: `${opts.scheduled ? "Scheduled discovery" : "Discovery"} finished: ${plural(briefs.length, "brief")}`,
    body: parts.length ? parts.join(" · ") : "No companies were recommended for research.",
  };
}

// Creates the notification for a run once per kind. Errors are logged, not thrown.
export async function notifyDiscoveryRun(db: Db, runId: string, kind: NotificationKind, detail?: string): Promise<void> {
  try {
    const { data: run } = await db.from("discovery_runs").select("trigger, outcomes").eq("id", runId).maybeSingle();
    const scheduled = run?.trigger === "scheduled";
    let title: string;
    let body: string | null;
    if (kind === "discovery_completed") {
      const outcomes = (Array.isArray(run?.outcomes) ? run.outcomes : []) as unknown as RunOutcome[];
      const briefIds = outcomes.map((o) => o.briefId).filter((id): id is string => Boolean(id));
      let vacated = 0;
      if (briefIds.length) {
        const { data: briefs } = await db.from("briefs").select("analysis").in("id", briefIds);
        vacated = (briefs ?? []).filter((b) => {
          const a = (b.analysis as { otherPremises?: { assessment?: string } } | null)?.otherPremises?.assessment;
          return a === "likely" || a === "possible";
        }).length;
      }
      ({ title, body } = completedMessage(outcomes, { scheduled, vacated }));
    } else if (kind === "discovery_failed") {
      title = `${scheduled ? "Scheduled discovery" : "Discovery"} run failed`;
      body = detail?.slice(0, 300) ?? null;
    } else {
      title = `${scheduled ? "Scheduled discovery" : "Discovery"} run paused`;
      body = "The server could not start the next step. An admin can resume it from the run page.";
    }
    const { error } = await db
      .from("notifications")
      .upsert({ kind, title, body, link: `/discovery/${runId}`, discovery_run_id: runId }, { onConflict: "discovery_run_id,kind", ignoreDuplicates: true });
    if (error) console.error("notification insert failed", error.message);
  } catch (e) {
    console.error("notification failed", e instanceof Error ? e.message : e);
  }
}
