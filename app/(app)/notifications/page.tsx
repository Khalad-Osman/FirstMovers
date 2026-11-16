import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getNotifications } from "@/lib/data/notifications";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { formatTime } from "../discovery/ui";
import { markAllNotificationsRead } from "./actions";

export const metadata: Metadata = { title: "Notifications · First Movers" };

const KIND_LABEL: Record<string, string> = {
  discovery_completed: "Discovery",
  discovery_failed: "Discovery failed",
  discovery_paused: "Discovery paused",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await getNotifications(user.id);
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="grid gap-6">
      <PageHeader title="Notifications" description="Discovery runs finishing, failing or pausing, for the whole team. Read status is yours only.">
        {unread > 0 && <ActionButton action={markAllNotificationsRead} label={`Mark all as read (${unread})`} pendingLabel="Marking…" />}
      </PageHeader>

      {items.length === 0 ? (
        <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
          <p className="font-semibold">No notifications yet.</p>
          <p className="mt-1 text-meta">You&apos;ll see one here when a discovery run finishes, fails or pauses, whether it was started by hand or by the schedule.</p>
        </div>
      ) : (
        <ul>
          {items.map((n) => (
            <li key={n.id} className={`grid gap-1 border-b border-line py-3 ${n.read ? "" : "border-l-4 border-l-[var(--accent)] pl-3"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-stage">{KIND_LABEL[n.kind] ?? n.kind}</span>
                {!n.read && <span className="badge badge-signal">New</span>}
                <span className="mono text-[0.8125rem] text-meta">{formatTime(n.createdAt)}</span>
              </div>
              <p className="font-semibold">{n.title}</p>
              {n.body && <p className="text-[0.9375rem]">{n.body}</p>}
              {n.link && (
                <Link href={n.link} className="link w-fit text-[0.9375rem]">
                  Open run
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
