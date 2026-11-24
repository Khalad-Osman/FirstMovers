"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { briefAnalysisSchema } from "@/lib/brief/schema";
import { getProvider, resolveModel } from "@/lib/llm";
import { analyzeSession } from "@/lib/research/session";
import { todayInToronto } from "@/lib/research/run";

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

// Re-runs only the analysis on the sources a brief already used (no Firecrawl
// credits; one analysis-model call). Opens the research page, where "Add to
// feed" saves the result as a new version. Admins only.
export async function reanalyzeFromStoredSources(briefId: string) {
  const admin = await requireAdmin();
  const id = uuid.parse(briefId);
  const db = createAdminClient();
  const { data: brief } = await db.from("briefs").select("company_id, analysis, sector, companies(display_name)").eq("id", id).maybeSingle();
  if (!brief) return { error: "Brief not found." };
  const parsed = briefAnalysisSchema.safeParse(brief.analysis);
  if (!parsed.success) return { error: "This brief's stored analysis is invalid, so its sources can't be reused. Use Re-analyze instead." };
  const urls = parsed.data.ledger.map((e) => e.url);
  const { data: rows } = await db.from("sources").select("id, url").in("url", urls);
  const byUrl = new Map((rows ?? []).map((r) => [r.url, r.id]));
  const sourceIds = urls.map((u) => byUrl.get(u)).filter((x): x is string => Boolean(x));
  if (sourceIds.length === 0) return { error: "None of this brief's sources are stored any more. Use Re-analyze instead." };

  let provider, model;
  try {
    const { data: settings } = await db.from("settings").select("analysis_model").maybeSingle();
    model = resolveModel("analysis", settings);
    provider = getProvider();
  } catch (e) {
    return { error: `Analysis isn't configured yet: ${e instanceof Error ? e.message : String(e)}` };
  }
  const { data: session, error } = await db
    .from("research_sessions")
    .insert({
      mode: "company",
      query: brief.companies?.display_name ?? parsed.data.company.name,
      company_id: brief.company_id,
      created_by: admin.id,
      status: "analyzing",
      progress: "Re-analyzing stored sources",
      source_ids: sourceIds,
      sector: brief.sector,
    })
    .select("id")
    .single();
  if (error) return { error: `Could not start: ${error.message}` };
  after(() => analyzeSession(session.id, { provider, model, today: todayInToronto() }));
  redirect(`/research/${session.id}`);
}
