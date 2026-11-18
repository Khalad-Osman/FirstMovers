import Link from "next/link";
import { ANGLE_LABEL, ORIGIN_LABEL, URGENCY_LABEL, VACANCY_LABEL } from "@/lib/brief/schema";
import { URGENCY_CLASS } from "./brief-view";
import type { FeedEntry } from "@/lib/data/briefs";
import { formatDate, stripLabel } from "@/lib/format";
import { addToWatchlist, dismissBrief } from "@/app/(app)/actions";
import { ActionButton } from "./action-button";
import { RatingBadge, SampleBadge, StageBadge } from "./badges";
import { FIT_CLASS } from "./brief-view";
import { FIT_LABEL } from "@/lib/deals/fit";

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
        {entry.vacancy && <span className="badge badge-inferred">{VACANCY_LABEL[entry.vacancy.assessment]}</span>}
        {entry.fit && entry.fit !== "none" && <span className={`badge ${FIT_CLASS[entry.fit]}`}>Past deal fit: {FIT_LABEL[entry.fit]}</span>}
      </div>

      {entry.angle.type !== "monitor_only" && (
        <p className="flex flex-wrap items-baseline gap-2 border-l-4 border-[var(--accent)] bg-panel px-3 py-2">
          <span className="text-[0.8125rem] font-semibold tracking-[0.04em] text-meta uppercase">{ANGLE_LABEL[entry.angle.type]}</span>
          <span className={`badge ${URGENCY_CLASS[entry.angle.urgency]}`}>{URGENCY_LABEL[entry.angle.urgency]}</span>
          <span className="min-w-0 basis-full sm:basis-auto">{entry.angle.headline}</span>
          {entry.angle.derived && <span className="text-[0.8125rem] text-meta">(worked out from an older brief)</span>}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Local connection" value={entry.localConnection} />
        <Field label="What changed" value={entry.whatChanged} />
        <Field label="Facility pressure" value={entry.facilityPressure} />
        <Field label="Countercase" value={entry.countercase} />
        {entry.vacancy && <Field label="Other premises" value={entry.vacancy.address} />}
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
