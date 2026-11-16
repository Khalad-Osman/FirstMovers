"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getNotifications } from "@/lib/data/notifications";
import { createClient } from "@/lib/supabase/server";

// Marks every notification currently listed as read for this user (RLS: own rows only).
export async function markAllNotificationsRead() {
  const user = await requireUser();
  const unread = (await getNotifications(user.id)).filter((n) => !n.read);
  if (unread.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_reads")
    .upsert(unread.map((n) => ({ notification_id: n.id, user_id: user.id })), { onConflict: "notification_id,user_id", ignoreDuplicates: true });
  if (error) return { error: `Could not mark notifications as read: ${error.message}` };
  revalidatePath("/", "layout");
}
