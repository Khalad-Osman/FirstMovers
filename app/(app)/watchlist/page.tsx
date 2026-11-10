import type { Metadata } from "next";
import Link from "next/link";
import { getWatchlist } from "@/lib/data/briefs";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { RatingBadge } from "@/components/badges";
import { ActionButton } from "@/components/action-button";
import { removeFromWatchlist } from "../actions";

export const metadata: Metadata = { title: "Watchlist · First Movers" };

export default async function WatchlistPage() {
  const items = await getWatchlist();

  return (
    <div className="grid gap-6">
      <PageHeader title="Watchlist" description="Companies the team is tracking, with each one's latest brief." />

      {items.length === 0 ? (
        <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
          <p className="font-semibold">No companies on the Watchlist.</p>
          <p className="mt-1 text-meta">Use Add to Watchlist on a brief in the Opportunity Feed to track a company here.</p>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.companyId} className="grid gap-2 border-b border-line py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto min-w-0 text-[1.0625rem] font-semibold">{item.companyName}</h2>
                {item.latest && <RatingBadge rating={item.latest.rating} />}
              </div>
              {item.latest ? (
                <>
                  {item.latest.whatChanged && <p>{item.latest.whatChanged}</p>}
                  <p className="mono text-[0.8125rem] text-meta">Analyzed {formatDate(item.latest.analyzedAt)}</p>
                </>
              ) : (
                <p className="text-meta">No brief yet.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {item.latest && (
                  <Link href={`/briefs/${item.latest.briefId}`} className="btn btn-primary">
                    Open latest brief
                  </Link>
                )}
                <ActionButton
                  action={removeFromWatchlist.bind(null, item.companyId)}
                  label="Remove"
                  pendingLabel="Removing…"
                  confirmLabel="Confirm remove"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
