import type { Metadata } from "next";
import { SECTORS, SECTOR_LABEL, parseSectorFilter } from "@/lib/sector";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getFeed, getSampleEntries, getWatchlist, type FeedEntry } from "@/lib/data/briefs";
import { FeedRow } from "@/components/feed-row";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { scheduleStatus } from "@/lib/schedule/plan";
import { ANGLE_ORDER, URGENCY_ORDER } from "@/lib/brief/angle";
import { ANGLE_LABEL } from "@/lib/brief/schema";

export const metadata: Metadata = { title: "Opportunity Feed · First Movers" };

const RATING_ORDER = ["strong_signal", "worth_monitoring", "no_meaningful_signal"];
// Within an angle group: most urgent first, then the stronger rating, then newest.
function byUrgency(a: FeedEntry, b: FeedEntry) {
  return (
    URGENCY_ORDER.indexOf(a.angle.urgency) - URGENCY_ORDER.indexOf(b.angle.urgency) ||
    RATING_ORDER.indexOf(a.rating) - RATING_ORDER.indexOf(b.rating) ||
    b.analyzedAt.localeCompare(a.analyzedAt)
  );
}

const GROUP_NOTE: Partial<Record<FeedEntry["angle"]["type"], string>> = {
  new_requirement: "An external space need the evidence supports (Worth Monitoring or Strong Signal).",
  vacated_space: "The company has committed to a new facility and the sources place it at another address that may come to market.",
  capacity_conversation: "Investment or expansion at premises the company already occupies: a reason to ask about future space needs.",
  relationship: "A funding, ownership, leadership or contract trigger: a reason to reconnect, not a property need.",
};

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const showSamples = params.samples === "1";
  const sector = parseSectorFilter(params.sector);
  const feedHref = (over: { samples?: boolean; sector?: string }) => {
    const q = new URLSearchParams();
    if (over.samples ?? showSamples) q.set("samples", "1");
    const s = over.sector ?? sector;
    if (s !== "all") q.set("sector", s);
    return q.size ? `/?${q}` : "/";
  };
  const supabase = await createClient();
  const [user, { entries, invalid }, watchlist, { data: schedule }] = await Promise.all([
    getCurrentUser(),
    getFeed(),
    getWatchlist(),
    supabase.from("settings").select("schedule_discovery_enabled, discovery_frequency, discovery_weekdays, discovery_month_day").maybeSingle(),
  ]);
  const isAdmin = user?.role === "admin";
  const watched = new Set(watchlist.map((w) => w.companyId));

  const all = (showSamples ? [...entries, ...getSampleEntries()] : entries).filter((e) => sector === "all" || e.sector === sector);
  // Ranked by broker angle (decided 2026-11-17); the rating stays on every row.
  const byAngle = (type: FeedEntry["angle"]["type"]) => all.filter((e) => e.angle.type === type).sort(byUrgency);
  const groups = ANGLE_ORDER.filter((t) => t !== "monitor_only").map((t) => ({ type: t, entries: byAngle(t) }));
  const none = byAngle("monitor_only");

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
          href={feedHref({ samples: !showSamples })}
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

      <nav aria-label="Sector" className="flex flex-wrap gap-2">
        {(["all", ...SECTORS] as const).map((s) => (
          <Link
            key={s}
            href={feedHref({ sector: s })}
            aria-current={sector === s ? "page" : undefined}
            className={`btn ${sector === s ? "btn-primary" : ""}`}
          >
            {s === "all" ? "All sectors" : SECTOR_LABEL[s]} · <span className="mono">{(showSamples ? [...entries, ...getSampleEntries()] : entries).filter((e) => s === "all" || e.sector === s).length}</span>
          </Link>
        ))}
      </nav>

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
            Briefs from discovery runs and Live Research will appear here, ranked by broker angle: the reason to call now.
            {!showSamples && " Turn on Show samples to see how a brief looks."}
          </p>
        </div>
      )}

      {groups.map(
        (g) =>
          g.entries.length > 0 && (
            <Group key={g.type} title={ANGLE_LABEL[g.type]} note={GROUP_NOTE[g.type]} entries={g.entries} watched={watched} isAdmin={isAdmin} />
          ),
      )}

      {none.length > 0 && (
        <details className="group border-t border-line pt-3">
          <summary className="cursor-pointer list-none">
            <span className="label">
              <span className="inline-block transition-transform group-open:rotate-90">▸</span> Reviewed, nothing to act on yet ·{" "}
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
