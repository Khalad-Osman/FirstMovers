import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type NotificationItem = {
  id: string;
  createdAt: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
};

const LIMIT = 50;

// The latest notifications with this user's read state (RLS: reads are per user).
export const getNotifications = cache(async (userId: string): Promise<NotificationItem[]> => {
  const supabase = await createClient();
  const [{ data: items, error }, { data: reads }] = await Promise.all([
    supabase.from("notifications").select("id, created_at, kind, title, body, link").order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("notification_reads").select("notification_id").eq("user_id", userId),
  ]);
  if (error) throw new Error(`Could not load notifications: ${error.message}`);
  const read = new Set((reads ?? []).map((r) => r.notification_id));
  return (items ?? []).map((n) => ({
    id: n.id,
    createdAt: n.created_at,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    read: read.has(n.id),
  }));
});

export async function getUnreadCount(userId: string): Promise<number> {
  return (await getNotifications(userId)).filter((n) => !n.read).length;
}
