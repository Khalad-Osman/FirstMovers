import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { realDiscoveryDeps, secretMatches, SECRET_HEADER, triggerStep } from "@/lib/discovery/job";
import { failRun, pauseRun, stepDiscovery } from "@/lib/discovery/run";
import { createAdminClient } from "@/lib/supabase/admin";

// Internal: runs ONE discovery step, then chains the next in a new invocation.
// Not behind the sign-in check (see proxy.ts); protected by DISCOVERY_JOB_SECRET.
export const maxDuration = 300;

const body = z.object({ runId: z.uuid() });

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get(SECRET_HEADER))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { runId } = parsed.data;
  const db = createAdminClient();
  const { data: run } = await db.from("discovery_runs").select("status").eq("id", runId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.status !== "queued" && run.status !== "running") {
    return NextResponse.json({ done: true, status: run.status }, { status: 200 });
  }

  const origin = request.nextUrl.origin;
  after(async () => {
    let done = true;
    try {
      const deps = await realDiscoveryDeps();
      ({ done } = await stepDiscovery(runId, deps));
    } catch (e) {
      // Only an active run can fail here; never overwrite a finished run.
      await failRun(db, runId, e instanceof Error ? e.message : String(e));
      return;
    }
    if (done) return;
    try {
      await triggerStep(origin, runId);
    } catch (e) {
      // The work so far is saved. Leave the run active so an admin can resume it.
      const msg = e instanceof Error ? e.message : String(e);
      await pauseRun(db, runId, msg);
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
