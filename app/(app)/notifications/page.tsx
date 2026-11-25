import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getNotifications } from "@/lib/data/notifications";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { formatTime } from "../discovery/ui";
import { markAllNotificationsRead } from "./actions";
import { getEmailPreferences, getRecentEmails } from "@/lib/data/email";
import { emailStatus } from "@/lib/email/sender";
import { EmailSettings } from "./email-settings";

export const metadata: Metadata = { title: "Notifications · First Movers" };

const KIND_LABEL: Record<string, string> = {
  discovery_completed: "Discovery",
  discovery_failed: "Discovery failed",
  discovery_paused: "Discovery paused",
};

const EMAIL_STATUS_LABEL: Record<string, string> = { sent: "Sent", failed: "Failed", queued: "Sending", not_configured: "Not sent: email not connected" };
const EMAIL_STATUS_CLASS: Record<string, string> = { sent: "badge-strong", failed: "badge-failed", queued: "badge-context", not_configured: "badge-stage" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const [items, prefs, recent] = await Promise.all([getNotifications(user.id), getEmailPreferences(user.id), getRecentEmails()]);
  const connected = emailStatus().configured;
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="grid gap-6">
      <PageHeader title="Notifications" description="Team updates in the app, and the emails you choose to receive. Read status is yours only.">
        {unread > 0 && <ActionButton action={markAllNotificationsRead} label={`Mark all as read (${unread})`} pendingLabel="Marking…" />}
      </PageHeader>

      <EmailSettings prefs={prefs} email={user.email} connected={connected} />

      <h2 className="label -mb-3 border-b border-line pb-1.5">In the app</h2>
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

      {recent.length > 0 && (
        <section aria-labelledby="recent-emails" className="grid gap-2">
          <h2 id="recent-emails" className="label border-b border-line pb-1.5">
            Recent emails{user.role === "admin" ? " (team)" : ""}
          </h2>
          <ul>
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 text-[0.9375rem]">
                <span className={`badge ${EMAIL_STATUS_CLASS[e.status] ?? "badge-stage"}`}>{EMAIL_STATUS_LABEL[e.status] ?? e.status}</span>
                <span className="min-w-0 font-semibold">{e.subject}</span>
                <span className="mono text-[0.8125rem] text-meta">
                  {formatTime(e.createdAt)}
                  {user.role === "admin" ? ` · ${e.toAddress}` : ""}
                </span>
                {e.error && <span className="w-full text-[0.8125rem] text-[var(--error-fg)]">{e.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
