"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTestEmail } from "@/lib/email/dispatch";
import { emailStatus } from "@/lib/email/sender";

export type EmailPrefsState = { error?: string; saved?: boolean } | undefined;
export type TestEmailState = { error?: string; message?: string } | undefined;

const FIELDS = ["enabled", "discovery_runs", "watchlist_briefs", "strong_signals", "weekly_digest"] as const;

// Each user saves only their own choices (RLS: own row).
export async function saveEmailPreferences(_prev: EmailPrefsState, formData: FormData): Promise<EmailPrefsState> {
  const user = await requireUser();
  const row = Object.fromEntries(FIELDS.map((f) => [f, formData.get(f) === "on"])) as Record<(typeof FIELDS)[number], boolean>;
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_preferences")
    .upsert({ user_id: user.id, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { error: `Could not save your email choices: ${error.message}` };
  revalidatePath("/notifications");
  return { saved: true };
}

// Form-action signature (previous state, form data); neither is needed.
export async function sendTestEmailAction(): Promise<TestEmailState> {
  const user = await requireUser();
  if (!user.email) return { error: "Your account has no email address." };
  const status = emailStatus();
  if (!status.configured) return { error: "Email sending isn't connected yet." };
  const r = await sendTestEmail(createAdminClient(), { id: user.id, email: user.email });
  revalidatePath("/notifications");
  return r.sent ? { message: `Sent to ${user.email}.` } : { error: "The test email could not be sent. See Recent emails below." };
}
