// Email content (pure, no I/O). Plain text plus a simple inline-styled HTML
// version, since mail clients ignore stylesheets.

import { ANGLE_LABEL, RATING_LABEL, type Rating } from "@/lib/brief/schema";
import { SECTOR_LABEL, type Sector } from "@/lib/sector";

export type EmailKind = "discovery_run" | "watchlist_brief" | "strong_signal" | "weekly_digest" | "test";
export type EmailContent = { subject: string; text: string; html: string };

// What an email needs to know about a brief.
export type BriefDigestItem = {
  id: string;
  companyName: string;
  sector: Sector;
  rating: Rating;
  angleType?: keyof typeof ANGLE_LABEL;
  headline?: string; // broker angle: the reason to call
  summary?: string; // deal potential, else what changed
  analyzedAt: string; // YYYY-MM-DD
};

const FOOTER = "You get this because email notifications are on in First Movers. Change them on the Notifications page.";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Inline source ids such as "(S1, S3)" mean nothing outside the app.
export const stripCitations = (s: string) => s.replace(/\s*\((?:S\d+[,;\s]*)+\)/g, "").trim();

function layout(title: string, inner: string, base: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb">
<tr><td style="background:#0f172a;color:#ffffff;padding:14px 20px;font-size:14px;font-weight:bold;letter-spacing:.02em">First Movers</td></tr>
<tr><td style="padding:20px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
${inner}
</td></tr>
<tr><td style="padding:14px 20px;border-top:1px solid #e5e7eb;font-size:12px;color:#4b5563">${escapeHtml(FOOTER)} <a href="${base}/notifications" style="color:#1d4ed8">Notification settings</a></td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:16px 0 0"><a href="${href}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 16px;font-weight:bold;font-size:14px">${escapeHtml(label)}</a></p>`;

function briefBlock(b: BriefDigestItem, base: string): { text: string; html: string } {
  const meta = [RATING_LABEL[b.rating], b.angleType ? ANGLE_LABEL[b.angleType] : null, SECTOR_LABEL[b.sector], b.analyzedAt].filter(Boolean).join(" · ");
  const headline = b.headline ? stripCitations(b.headline) : "";
  const summary = b.summary ? stripCitations(b.summary) : "";
  const url = `${base}/briefs/${b.id}`;
  return {
    text: [b.companyName, meta, headline, summary, url].filter(Boolean).join("\n"),
    html: `<div style="padding:12px 0;border-top:1px solid #e5e7eb">
<p style="margin:0;font-weight:bold;font-size:16px"><a href="${url}" style="color:#111827;text-decoration:none">${escapeHtml(b.companyName)}</a></p>
<p style="margin:4px 0 0;font-size:12px;color:#4b5563;font-family:Consolas,Menlo,monospace">${escapeHtml(meta)}</p>
${headline ? `<p style="margin:8px 0 0;font-size:14px">${escapeHtml(headline)}</p>` : ""}
${summary ? `<p style="margin:6px 0 0;font-size:14px;color:#374151">${escapeHtml(summary)}</p>` : ""}
<p style="margin:6px 0 0;font-size:14px"><a href="${url}" style="color:#1d4ed8">Open brief</a></p>
</div>`,
  };
}

export function discoveryRunEmail(n: { title: string; body: string | null; link: string | null }, base: string): EmailContent {
  const url = n.link ? `${base}${n.link}` : `${base}/discovery`;
  return {
    subject: n.title,
    text: [n.title, n.body, `Open the run: ${url}`, "", FOOTER].filter((l) => l !== null).join("\n"),
    html: layout(n.title, `${n.body ? `<p style="margin:0;font-size:14px">${escapeHtml(n.body)}</p>` : ""}${button(url, "Open run")}`, base),
  };
}

export function newBriefEmail(kind: "watchlist_brief" | "strong_signal", b: BriefDigestItem, base: string): EmailContent {
  const title = kind === "strong_signal" ? `Strong Signal: ${b.companyName}` : `New brief for ${b.companyName} (Watchlist)`;
  const block = briefBlock(b, base);
  return {
    subject: title,
    text: [title, "", block.text, "", FOOTER].join("\n"),
    html: layout(title, block.html, base),
  };
}

export function weeklyDigestEmail(items: BriefDigestItem[], weekOf: string, base: string): EmailContent | null {
  if (items.length === 0) return null; // nothing new: no email
  const title = `First Movers weekly: ${items.length} new brief${items.length === 1 ? "" : "s"}`;
  const order: Rating[] = ["strong_signal", "worth_monitoring", "no_meaningful_signal"];
  const sorted = [...items].sort((a, b) => order.indexOf(a.rating) - order.indexOf(b.rating) || b.analyzedAt.localeCompare(a.analyzedAt));
  const blocks = sorted.map((b) => briefBlock(b, base));
  return {
    subject: `${title} (week of ${weekOf})`,
    text: [`${title}, week of ${weekOf}`, "", ...blocks.map((b) => `${b.text}\n`), `Open the feed: ${base}/`, "", FOOTER].join("\n"),
    html: layout(`${title}`, `<p style="margin:0 0 4px;font-size:13px;color:#4b5563">Week of ${escapeHtml(weekOf)}</p>${blocks.map((b) => b.html).join("")}${button(`${base}/`, "Open the feed")}`, base),
  };
}

export function testEmail(base: string): EmailContent {
  const title = "First Movers test email";
  return {
    subject: title,
    text: [title, "Email notifications are working.", base, "", FOOTER].join("\n"),
    html: layout(title, `<p style="margin:0;font-size:14px">Email notifications are working.</p>${button(`${base}/`, "Open First Movers")}`, base),
  };
}
