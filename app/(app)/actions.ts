"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();

export async function addToWatchlist(companyId: string) {
  const user = await requireUser();
  const id = uuid.parse(companyId);
  const supabase = await createClient();
  const { error } = await supabase.from("watchlist").upsert(
    { company_id: id, added_by: user.id },
    { onConflict: "company_id", ignoreDuplicates: true },
  );
  if (error) return { error: `Could not add to Watchlist: ${error.message}` };
  revalidatePath("/", "layout");
}

export async function removeFromWatchlist(companyId: string) {
  await requireUser();
  const id = uuid.parse(companyId);
  const supabase = await createClient();
  const { error } = await supabase.from("watchlist").delete().eq("company_id", id);
  if (error) return { error: `Could not remove from Watchlist: ${error.message}` };
  revalidatePath("/", "layout");
}

export async function dismissBrief(briefId: string) {
  const admin = await requireAdmin();
  const id = uuid.parse(briefId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("briefs")
    .update({ dismissed: true, dismissed_by: admin.id, dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: `Could not dismiss brief: ${error.message}` };
  if (!data?.length) return { error: "Brief not found or not permitted" };
  revalidatePath("/", "layout");
}
