import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getFeed, getSampleEntries, getWatchlist, type FeedEntry } from "@/lib/data/briefs";
import { FeedRow } from "@/components/feed-row";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { scheduleStatus } from "@/lib/schedule/plan";

export const metadata: Metadata = { title: "Opportunity Feed · First Movers" };

function newestFirst(a: FeedEntry, b: FeedEntry) {
  return b.analyzedAt.localeCompare(a.analyzedAt);
}

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const showSamples = (await searchParams).samples === "1";
  const supabase = await createClient();
  const [user, { entries, invalid }, watchlist, { data: schedule }] = await Promise.all([
    getCurrentUser(),
    getFeed(),
    getWatchlist(),
    supabase.from("settings").select("schedule_discovery_enabled, discovery_frequency, discovery_weekdays, discovery_month_day").maybeSingle(),
  ]);
  const isAdmin = user?.role === "admin";
  const watched = new Set(watchlist.map((w) => w.companyId));

  const all = showSamples ? [...entries, ...getSampleEntries()] : entries;
  const strong = all.filter((e) => e.rating === "strong_signal").sort(newestFirst);
  const worth = all.filter((e) => e.rating === "worth_monitoring").sort(newestFirst);
  const noSignal = all.filter((e) => e.rating === "no_meaningful_signal").sort(newestFirst);
  // No new requirement, but space they're likely to leave: shown, not collapsed (rating unchanged).
  const vacated = noSignal.filter((e) => e.vacancy);
  const none = noSignal.filter((e) => !e.vacancy);

  return (
    <div className="grid gap-6">
      <PageHeader title="Opportunity Feed">
        <div className="flex flex-wrap items-center gap-4">
        {isAdmin && (
          <>
            <Link href="/discovery" className="btn btn-primary">
              Run discovery
            </Link>
            <Link href="/settings#schedule" className="btn">
              Schedule: {scheduleStatus(schedule)}
            </Link>
          </>
        )}
        <Link
          href={showSamples ? "/" : "/?samples=1"}
          role="switch"
          aria-checked={showSamples}
          className="inline-flex items-center gap-2 text-[0.9375rem] font-medium"
        >
          <span
            aria-hidden="true"
            className={`relative inline-block h-5 w-9 rounded-full transition-colors ${
              showSamples ? "bg-accent" : "bg-[#9ca3af]"
            }`}
          >
            <span
              className={`absolute top-[3px] h-[14px] w-[14px] rounded-full bg-white transition-[left] ${
                showSamples ? "left-[19px]" : "left-[3px]"
              }`}
            />
          </span>
          Show samples
        </Link>
        </div>
      </PageHeader>

      {invalid.length > 0 && (
        <div role="alert" className="border-l-4 border-[var(--error-fg)] bg-[var(--error-bg)] px-4 py-3 text-[0.9375rem]">
          <strong>{invalid.length} brief{invalid.length === 1 ? "" : "s"} hidden</strong> because the stored analysis failed
          validation: {invalid.map((b) => b.companyName).join(", ")}.
        </div>
      )}

      {entries.length === 0 && (
        <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
          <p className="font-semibold">No briefs yet.</p>
          <p className="mt-1 text-meta">
            Briefs from discovery runs and Live Research will appear here, ranked by signal strength.
            {!showSamples && " Turn on Show samples to see how a brief looks."}
          </p>
        </div>
      )}

      {strong.length > 0 && <Group title="Strong Signal" entries={strong} watched={watched} isAdmin={isAdmin} />}
      {worth.length > 0 && <Group title="Worth Monitoring" entries={worth} watched={watched} isAdmin={isAdmin} />}
      {vacated.length > 0 && (
        <Group
          title="Space likely to be vacated"
          note="No new requirement, but the company has committed to a new facility and the sources place it at another address that may come to market."
          entries={vacated}
          watched={watched}
          isAdmin={isAdmin}
        />
      )}

      {none.length > 0 && (
        <details className="group border-t border-line pt-3">
          <summary className="cursor-pointer list-none">
            <span className="label">
              <span className="inline-block transition-transform group-open:rotate-90">▸</span> Reviewed, no signal ·{" "}
              <span className="mono">{none.length}</span>
            </span>
          </summary>
          <div className="mt-2">
            {none.map((e) => (
              <FeedRow key={e.key} entry={e} watched={e.companyId ? watched.has(e.companyId) : false} isAdmin={isAdmin} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Group({
  title,
  note,
  entries,
  watched,
  isAdmin,
}: {
  title: string;
  note?: string;
  entries: FeedEntry[];
  watched: Set<string>;
  isAdmin: boolean;
}) {
  return (
    <section>
      <h2 className="label border-b border-line pb-1.5">
        {title} · <span className="mono">{entries.length}</span>
      </h2>
      {note && <p className="mt-2 text-[0.875rem] text-meta">{note}</p>}
      {entries.map((e) => (
        <FeedRow key={e.key} entry={e} watched={e.companyId ? watched.has(e.companyId) : false} isAdmin={isAdmin} />
      ))}
    </section>
  );
}
