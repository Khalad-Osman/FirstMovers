import "server-only";
import { getFirecrawl } from "@/lib/firecrawl/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCompanyResearch, runThemeSearch } from "./pipeline";
import { attachRecords } from "./records-db";
import { createDbStore } from "./store";

export function todayInToronto(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

// Background job body (called from after()). Never throws: failures are written
// to the session so the page can show them.
export async function runResearchJob(sessionId: string): Promise<void> {
  const db = createAdminClient();
  const store = createDbStore();
  const { data: session } = await db
    .from("research_sessions")
    .select("mode, query, company_id")
    .eq("id", sessionId)
    .single();
  if (!session) return;

  let firecrawl;
  try {
    firecrawl = getFirecrawl();
  } catch (e) {
    await store.update(sessionId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    return;
  }

  const { data: settings } = await db.from("settings").select("sources_per_candidate").maybeSingle();
  const deps = { firecrawl, store, today: todayInToronto(), maxSources: settings?.sources_per_candidate ?? 5 };

  let name = session.query;
  if (session.company_id) {
    const { data: company } = await db.from("companies").select("display_name").eq("id", session.company_id).maybeSingle();
    name = company?.display_name ?? name;
  }

  if (session.mode === "theme") {
    await runThemeSearch(sessionId, session.query, deps);
    return;
  }

  // Public records (permits, awards) already stored for this company: free, read first.
  let recordSourceIds: string[] = [];
  try {
    await store.update(sessionId, { status: "searching", progress: "Checking stored public records" });
    recordSourceIds = await attachRecords(db, { names: [name, session.query], companyId: session.company_id, today: deps.today });
    if (recordSourceIds.length) {
      await store.update(sessionId, { progress: `Found ${recordSourceIds.length} public record${recordSourceIds.length === 1 ? "" : "s"}` });
    }
  } catch (e) {
    // Records are a bonus; web research still runs without them.
    console.error("attachRecords failed", e instanceof Error ? e.message : e);
  }
  await runCompanyResearch(sessionId, name, { ...deps, recordSourceIds });
}
