import Link from "next/link";
import { ORIGIN_LABEL } from "@/lib/brief/schema";
import type { FeedEntry } from "@/lib/data/briefs";
import { formatDate, stripLabel } from "@/lib/format";
import { addToWatchlist, dismissBrief } from "@/app/(app)/actions";
import { ActionButton } from "./action-button";
import { RatingBadge, SampleBadge, StageBadge } from "./badges";

type Props = {
  entry: FeedEntry;
  watched: boolean;
  isAdmin: boolean;
};

export function FeedRow({ entry, watched, isAdmin }: Props) {
  const { companyId, briefId } = entry;
  return (
    <article className="grid gap-3 border-b border-line py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto min-w-0 text-[1.0625rem] font-semibold">
          <Link href={entry.href} className="hover:underline">
            {entry.companyName}
          </Link>
        </h3>
        {entry.isSample && <SampleBadge />}
        <RatingBadge rating={entry.rating} />
        <StageBadge stage={entry.stage} />
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Local connection" value={entry.localConnection} />
        <Field label="What changed" value={entry.whatChanged} />
        <Field label="Facility pressure" value={entry.facilityPressure} />
        <Field label="Countercase" value={entry.countercase} />
      </dl>

      <div className="mono flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-meta">
        <span>Analyzed {formatDate(entry.analyzedAt)}</span>
        <span>{ORIGIN_LABEL[entry.origin]}</span>
        {entry.surfacedBy && <span>Surfaced by: {entry.surfacedBy}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={entry.href} className="btn btn-primary">
          Open brief
        </Link>
        {entry.isSample || !companyId ? null : watched ? (
          <span className="text-sm text-meta">On Watchlist</span>
        ) : (
          <ActionButton
            action={addToWatchlist.bind(null, companyId)}
            label="Add to Watchlist"
            pendingLabel="Adding…"
          />
        )}
        {isAdmin && !entry.isSample && briefId && (
          <ActionButton
            action={dismissBrief.bind(null, briefId)}
            label="Dismiss"
            pendingLabel="Dismissing…"
            confirmLabel="Confirm dismiss"
          />
        )}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="mt-0.5">{stripLabel(value, label)}</dd>
    </div>
  );
}
