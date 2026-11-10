import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCREEN_TOP_K } from "@/lib/discovery/run";
import { PageHeader } from "@/components/page-header";
import { StartDiscovery } from "./start-form";
import { RunStatusBadge, formatTime } from "./ui";

export const metadata: Metadata = { title: "Discovery · First Movers" };
export const maxDuration = 300;

export default async function DiscoveryPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [{ data: runs, error }, { data: settings }] = await Promise.all([
    supabase.from("discovery_runs").select("id, status, started_at, finished_at, candidates_found, analyzed, usage, profiles:started_by(full_name)").order("started_at", { ascending: false }).limit(30),
    supabase.from("settings").select("discovery_cap, sources_per_candidate, skip_window_days").maybeSingle(),
  ]);
  if (error) throw new Error(`Could not load discovery runs: ${error.message}`);
  const cap = settings?.discovery_cap ?? 3;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Discovery"
        description={`Builds candidates from stored signals, screens them with the cheap model, then researches and analyzes up to ${cap} per run. Companies analyzed in the last ${settings?.skip_window_days ?? 7} days are skipped.`}
      />
      {user?.role === "admin" ? (
        <StartDiscovery cap={cap} sourcesPerCandidate={settings?.sources_per_candidate ?? 5} topK={SCREEN_TOP_K} />
      ) : (
        <p className="text-[0.9375rem] text-meta">Only admins can run discovery. Run summaries are visible to everyone.</p>
      )}

      <section className="grid gap-2">
        <h2 className="label border-b border-line pb-1.5">Runs</h2>
        {runs.length === 0 ? (
          <p className="text-meta">No discovery runs yet.</p>
        ) : (
          <ul>
            {runs.map((r) => {
              const u = (r.usage ?? {}) as Record<string, number>;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2.5">
                  <Link href={`/discovery/${r.id}`} className="mono font-semibold hover:underline">
                    {formatTime(r.started_at)}
                  </Link>
                  <RunStatusBadge status={r.status} />
                  <span className="mono text-[0.8125rem] text-meta">
                    {r.candidates_found} candidates · {r.analyzed} briefs · ~{u.firecrawl_credits ?? 0} Firecrawl credits · {u.llm_calls ?? 0} LLM calls
                  </span>
                  {r.profiles?.full_name && <span className="ml-auto text-[0.8125rem] text-meta">{r.profiles.full_name}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
