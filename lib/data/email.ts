import "server-only";
import { createClient } from "@/lib/supabase/server";

export type EmailPreferences = {
  enabled: boolean;
  discovery_runs: boolean;
  watchlist_briefs: boolean;
  strong_signals: boolean;
  weekly_digest: boolean;
};

// Defaults shown before a user has saved anything (email off; sensible choices ticked).
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  enabled: false,
  discovery_runs: true,
  watchlist_briefs: true,
  strong_signals: false,
  weekly_digest: true,
};

export async function getEmailPreferences(userId: string): Promise<EmailPreferences & { saved: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_preferences")
    .select("enabled, discovery_runs, watchlist_briefs, strong_signals, weekly_digest")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { ...data, saved: true } : { ...DEFAULT_EMAIL_PREFERENCES, saved: false };
}

export type OutboxItem = { id: string; createdAt: string; kind: string; subject: string; toAddress: string; status: string; error: string | null };

// Latest emails (admins see the team's; members their own, by RLS).
export async function getRecentEmails(limit = 10): Promise<OutboxItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_outbox")
    .select("id, created_at, kind, subject, to_address, status, error")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({ id: r.id, createdAt: r.created_at, kind: r.kind, subject: r.subject, toAddress: r.to_address, status: r.status, error: r.error }));
}
