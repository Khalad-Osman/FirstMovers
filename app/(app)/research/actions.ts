"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getProvider, resolveModel } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { runResearchJob, todayInToronto } from "@/lib/research/run";
import { analyzeSession, saveSessionToFeed } from "@/lib/research/session";
import { hasFilters, parseFiltersForm } from "@/lib/research/filters";
import type { Json } from "@/lib/supabase/database.types";

export type StartState = { error?: string } | undefined;

const startSchema = z.object({
  mode: z.enum(["company", "theme"]),
  sector: z.enum(["industrial", "retail"]).default("industrial"),
  query: z.string().trim().min(2, "Enter at least 2 characters.").max(200, "Keep it under 200 characters."),
  companyId: z.uuid().optional(),
});

// Starts a research job and returns immediately; the work continues on the
// server (after()) and progress is read from research_sessions.
export async function startResearch(_prev: StartState, formData: FormData): Promise<StartState> {
  const user = await requireUser();
  const parsed = startSchema.safeParse({
    mode: formData.get("mode"),
    sector: formData.get("sector") || undefined,
    query: formData.get("query"),
    companyId: formData.get("companyId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const filters = parseFiltersForm(formData);
  if (!filters.success) return { error: filters.error.issues[0].message };
  if (!process.env.FIRECRAWL_API_KEY?.trim()) {
    return { error: "Live Research isn't configured yet: FIRECRAWL_API_KEY is missing on the server." };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("research_sessions")
    .insert({
      mode: parsed.data.mode,
      query: parsed.data.query,
      company_id: parsed.data.mode === "company" ? (parsed.data.companyId ?? null) : null,
      created_by: user.id,
      status: "searching",
      progress: "Starting",
      filters: hasFilters(filters.data) ? (JSON.parse(JSON.stringify(filters.data)) as Json) : null,
      sector: parsed.data.sector,
    })
    .select("id")
    .single();
  if (error) return { error: `Could not start research: ${error.message}` };

  after(() => runResearchJob(data.id));
  redirect(`/research/${data.id}`);
}

const idSchema = z.uuid();

export async function analyzeSources(sessionId: string) {
  await requireUser();
  const id = idSchema.parse(sessionId);
  const db = createAdminClient();
  const { data: session, error } = await db.from("research_sessions").select("status, source_ids").eq("id", id).single();
  if (error) return { error: `Could not load research: ${error.message}` };
  if (session.status !== "ready" || session.source_ids.length === 0) return { error: "There are no collected sources to analyze." };

  // Fail fast on missing configuration, before marking the session busy.
  const { data: settings } = await db.from("settings").select("analysis_model").maybeSingle();
  let model: string;
  let provider: ReturnType<typeof getProvider>;
  try {
    model = resolveModel("analysis", settings);
    provider = getProvider();
  } catch (e) {
    return { error: `Analysis isn't configured yet: ${e instanceof Error ? e.message : String(e)}` };
  }

  await db
    .from("research_sessions")
    .update({ status: "analyzing", progress: "Analyzing sources", error: null, analysis_errors: null })
    .eq("id", id);
  after(() => analyzeSession(id, { provider, model, today: todayInToronto() }));
  revalidatePath(`/research/${id}`);
}

export async function addToFeed(sessionId: string) {
  const user = await requireUser();
  const result = await saveSessionToFeed(idSchema.parse(sessionId), user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`/briefs/${result.briefId}`);
}
