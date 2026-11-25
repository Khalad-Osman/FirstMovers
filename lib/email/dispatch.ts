import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, getEmailSender, type EmailSender } from "./sender";
import {
  discoveryRunEmail,
  newBriefEmail,
  testEmail,
  weeklyDigestEmail,
  type BriefDigestItem,
  type EmailContent,
  type EmailKind,
} from "./templates";

// Email delivery (added 2026-11-25). Every email is written to email_outbox
// first, one per user and event (dedupe_key), so a resumed run or a re-run job
// never repeats it. With no provider configured the row stays 'not_configured':
// the outbox then shows exactly what would have been sent. Nothing here throws
// into the job that calls it.

type Db = ReturnType<typeof createAdminClient>;
type PrefColumn = "discovery_runs" | "watchlist_briefs" | "strong_signals" | "weekly_digest";
type Recipient = { userId: string; email: string };
export type DeliverySummary = { recipients: number; sent: number; failed: number; notConfigured: number; skipped: number };

const empty = (): DeliverySummary => ({ recipients: 0, sent: 0, failed: 0, notConfigured: 0, skipped: 0 });

// Users who turned email on and chose this kind, with their sign-in address.
async function recipientsFor(db: Db, pref: PrefColumn): Promise<Recipient[]> {
  const { data: prefs, error } = await db.from("email_preferences").select("user_id").eq("enabled", true).eq(pref, true);
  if (error || !prefs?.length) return [];
  const wanted = new Set(prefs.map((p) => p.user_id));
  const out: Recipient[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error: uErr } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (uErr) break;
    for (const u of data.users) if (wanted.has(u.id) && u.email) out.push({ userId: u.id, email: u.email });
    if (data.users.length < 200) break;
  }
  return out;
}

async function deliver(
  db: Db,
  sender: EmailSender | null,
  recipients: Recipient[],
  kind: EmailKind,
  dedupeKey: string,
  content: EmailContent,
): Promise<DeliverySummary> {
  const summary = empty();
  summary.recipients = recipients.length;
  for (const r of recipients) {
    const { data: row, error } = await db
      .from("email_outbox")
      .upsert(
        {
          user_id: r.userId,
          to_address: r.email,
          kind,
          subject: content.subject,
          body_text: content.text,
          body_html: content.html,
          status: sender ? "queued" : "not_configured",
          dedupe_key: dedupeKey,
        },
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("email outbox insert failed", error.message);
      summary.failed++;
      continue;
    }
    if (!row) {
      summary.skipped++; // already sent (or recorded) for this event
      continue;
    }
    if (!sender) {
      summary.notConfigured++;
      continue;
    }
    const res = await sender.send({ to: r.email, ...content });
    await db
      .from("email_outbox")
      .update(res.ok ? { status: "sent", sent_at: new Date().toISOString(), provider_message_id: res.id } : { status: "failed", error: res.error.slice(0, 500) })
      .eq("id", row.id);
    if (res.ok) summary.sent++;
    else summary.failed++;
  }
  return summary;
}

async function safely(label: string, fn: () => Promise<DeliverySummary>): Promise<DeliverySummary> {
  try {
    return await fn();
  } catch (e) {
    console.error(`${label} email failed`, e instanceof Error ? e.message : e);
    return empty();
  }
}

// A discovery run finished, failed or paused (called after the in-app notification).
export function emailDiscoveryRun(
  db: Db,
  n: { runId: string; kind: string; title: string; body: string | null; link: string | null },
): Promise<DeliverySummary> {
  return safely("discovery run", async () =>
    deliver(db, getEmailSender(), await recipientsFor(db, "discovery_runs"), "discovery_run", `run:${n.runId}:${n.kind}`, discoveryRunEmail(n, appUrl())),
  );
}

type BriefRow = {
  id: string;
  rating: BriefDigestItem["rating"];
  sector: BriefDigestItem["sector"] | null;
  analyzed_at: string;
  company_id: string;
  analysis: unknown;
  companies: { display_name: string } | null;
};

const BRIEF_SELECT = "id, rating, sector, analyzed_at, company_id, analysis, companies(display_name)";

function digestItem(b: BriefRow): BriefDigestItem {
  const a = (b.analysis ?? {}) as {
    company?: { name?: string };
    brokerAngle?: { type?: BriefDigestItem["angleType"]; headline?: string };
    dealPotential?: { summary?: string };
    chain?: { whatChanged?: { text?: string } };
  };
  return {
    id: b.id,
    companyName: b.companies?.display_name ?? a.company?.name ?? "Company",
    sector: b.sector ?? "industrial",
    rating: b.rating,
    angleType: a.brokerAngle?.type,
    headline: a.brokerAngle?.headline,
    summary: a.dealPotential?.summary ?? a.chain?.whatChanged?.text,
    analyzedAt: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(b.analyzed_at)),
  };
}

// A brief was saved: email Watchlist followers, and Strong Signal subscribers.
// A user who qualifies for both gets one email (shared dedupe key).
export function emailNewBrief(db: Db, briefId: string): Promise<DeliverySummary> {
  return safely("new brief", async () => {
    const { data } = await db.from("briefs").select(BRIEF_SELECT).eq("id", briefId).maybeSingle();
    if (!data) return empty();
    const brief = data as unknown as BriefRow;
    const item = digestItem(brief);
    const base = appUrl();
    const sender = getEmailSender();
    const total = empty();
    const add = (s: DeliverySummary) => (Object.keys(total) as (keyof DeliverySummary)[]).forEach((k) => (total[k] += s[k]));

    const { data: watched } = await db.from("watchlist").select("company_id").eq("company_id", brief.company_id).limit(1);
    if (watched?.length) add(await deliver(db, sender, await recipientsFor(db, "watchlist_briefs"), "watchlist_brief", `brief:${briefId}`, newBriefEmail("watchlist_brief", item, base)));
    if (brief.rating === "strong_signal") add(await deliver(db, sender, await recipientsFor(db, "strong_signals"), "strong_signal", `brief:${briefId}`, newBriefEmail("strong_signal", item, base)));
    return total;
  });
}

// Monday summary of the last 7 days' briefs (dismissed ones left out). No email when there are none.
export function sendWeeklyDigest(db: Db, now = new Date()): Promise<DeliverySummary> {
  return safely("weekly digest", async () => {
    const weekOf = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(now);
    const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const { data } = await db.from("briefs").select(BRIEF_SELECT).eq("dismissed", false).gte("analyzed_at", since).order("analyzed_at", { ascending: false }).limit(50);
    const content = weeklyDigestEmail(((data ?? []) as unknown as BriefRow[]).map(digestItem), weekOf, appUrl());
    if (!content) return empty();
    return deliver(db, getEmailSender(), await recipientsFor(db, "weekly_digest"), "weekly_digest", `digest:${weekOf}`, content);
  });
}

// "Send test email" on the Notifications page; each click is its own event.
export function sendTestEmail(db: Db, user: { id: string; email: string }): Promise<DeliverySummary> {
  return safely("test", async () =>
    deliver(db, getEmailSender(), [{ userId: user.id, email: user.email }], "test", `test:${Date.now()}`, testEmail(appUrl())),
  );
}
