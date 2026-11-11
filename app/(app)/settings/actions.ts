"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseSettingsForm } from "@/lib/settings";

export type SettingsState = { error?: string; saved?: boolean } | undefined;

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();
  const parsed = parseSettingsForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // User session: RLS ("settings: admin update") enforces admin as well.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .update({ ...parsed.data, updated_by: admin.id })
    .eq("id", true)
    .select("id");
  if (error) return { error: `Could not save settings: ${error.message}` };
  if (!data?.length) return { error: "Settings were not saved (admin role required)." };
  revalidatePath("/", "layout");
  return { saved: true };
}
