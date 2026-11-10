import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrief, getWatchlist } from "@/lib/data/briefs";
import { formatDate } from "@/lib/format";
import { BriefView } from "@/components/brief-view";
import { ActionButton } from "@/components/action-button";
import { addToWatchlist, dismissBrief } from "../../actions";

export async function generateMetadata({ params }: PageProps<"/briefs/[id]">): Promise<Metadata> {
  const brief = await getBrief((await params).id);
  return { title: `${brief?.companyName ?? "Brief"} · First Movers` };
}

export default async function BriefPage({ params }: PageProps<"/briefs/[id]">) {
  const { id } = await params;
  const [brief, user, watchlist] = await Promise.all([getBrief(id), getCurrentUser(), getWatchlist()]);
  if (!brief) notFound();

  const latest = brief.versions[0];
  const isLatest = latest?.id === brief.id;
  const watched = watchlist.some((w) => w.companyId === brief.companyId);

  if (!brief.analysis) {
    return (
      <div role="alert" className="border-l-4 border-[var(--error-fg)] bg-[var(--error-bg)] px-4 py-3">
        <p className="font-semibold">This brief can&apos;t be shown.</p>
        <p className="mt-1">
          The stored analysis for {brief.companyName} (version {brief.version}) failed validation, so it is hidden.
          Re-run the analysis to create a new version.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Link href="/" className="link w-fit text-[0.875rem]">
        ← Opportunity Feed
      </Link>
      <BriefView
        analysis={brief.analysis}
        companyName={brief.companyName}
        isSample={false}
        analyzedAt={brief.analyzedAt}
        origin={brief.origin}
        surfacedBy={brief.surfacedBy}
        version={brief.version}
        actions={
          <>
            {watched ? (
              <span className="self-center text-sm text-meta">On Watchlist</span>
            ) : (
              <ActionButton
                action={addToWatchlist.bind(null, brief.companyId)}
                label="Add to Watchlist"
                pendingLabel="Adding…"
              />
            )}
            {user?.role === "admin" && !brief.dismissed && (
              <ActionButton
                action={dismissBrief.bind(null, brief.id)}
                label="Dismiss"
                pendingLabel="Dismissing…"
                confirmLabel="Confirm dismiss"
              />
            )}
          </>
        }
        aside={
          <>
            {brief.dismissed && (
              <p className="border-l-4 border-[#475569] bg-panel px-4 py-2 text-[0.9375rem]">
                This brief was dismissed and no longer appears in the feed.
              </p>
            )}
            {!isLatest && latest && (
              <p className="border-l-4 border-[#b45309] bg-[#fffbeb] px-4 py-2 text-[0.9375rem]">
                You are viewing version {brief.version}. A newer version from {formatDate(latest.analyzedAt)} exists:{" "}
                <Link href={`/briefs/${latest.id}`} className="link">
                  open version {latest.version}
                </Link>
                .
              </p>
            )}
            {brief.versions.length > 1 && (
              <div className="text-[0.875rem]">
                <span className="label">All versions</span>
                <ul className="mono mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {brief.versions.map((v) => (
                    <li key={v.id}>
                      {v.id === brief.id ? (
                        <span className="font-semibold">
                          v{v.version} · {formatDate(v.analyzedAt)} (viewing)
                        </span>
                      ) : (
                        <Link href={`/briefs/${v.id}`} className="link">
                          v{v.version} · {formatDate(v.analyzedAt)}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        }
      />
    </div>
  );
}
