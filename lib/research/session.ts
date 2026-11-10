import "server-only";
import { analyzeCompany } from "@/lib/analysis/analyze";
import type { SourceRecord } from "@/lib/analysis/types";
import { briefAnalysisSchema, type BriefAnalysis } from "@/lib/brief/schema";
import { checkBriefIntegrity } from "@/lib/brief/integrity";
import type { LLMProvider } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { normalizeCompanyName } from "./normalize";

type Db = ReturnType<typeof createAdminClient>;
type JsonObject = { [key: string]: Json | undefined };

export async function loadSessionSources(db: Db, sourceIds: string[]) {
  if (sourceIds.length === 0) return [];
  const { data, error } = await db
    .from("sources")
    .select("id, url, publisher, title, published_at, event_at, excerpt, date_method")
    .in("id", sourceIds);
  if (error) throw new Error(`Could not load sources: ${error.message}`);
  const byId = new Map(data.map((s) => [s.id, s]));
  return sourceIds.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
}

// Ordered DB sources -> analysis input (S1, S2…).
export function toSourceRecords(rows: Awaited<ReturnType<typeof loadSessionSources>>): SourceRecord[] {
  return rows.map((s, i) => ({
    id: `S${i + 1}`,
    url: s.url,
    publisher: s.publisher || new URL(s.url).hostname,
    title: s.title || s.url,
    publishedAt: s.published_at,
    eventAt: s.event_at,
    excerpt: s.excerpt ?? "",
  }));
}

async function companyNameFor(db: Db, session: { query: string; company_id: string | null }) {
  if (!session.company_id) return session.query;
  const { data } = await db.from("companies").select("display_name").eq("id", session.company_id).maybeSingle();
  return data?.display_name ?? session.query;
}

function addUsage(usage: Json, extra: Record<string, number>): Record<string, number> {
  const base = (usage && typeof usage === "object" && !Array.isArray(usage) ? usage : {}) as Record<string, number>;
  const out: Record<string, number> = { ...base };
  for (const [k, v] of Object.entries(extra)) out[k] = (out[k] ?? 0) + v;
  return out;
}

// "Analyze sources": runs the analysis engine on the collected sources and
// stores either a validated brief or the validation errors on the session.
export async function analyzeSession(sessionId: string, deps: { provider: LLMProvider; model: string; today: string }) {
  const db = createAdminClient();
  const { data: session, error } = await db.from("research_sessions").select("*").eq("id", sessionId).single();
  if (error) throw new Error(`Could not load research session: ${error.message}`);

  try {
    const sources = toSourceRecords(await loadSessionSources(db, session.source_ids));
    const result = await analyzeCompany(
      {
        company: { name: await companyNameFor(db, session), knownAliases: [], ontarioConnectionNotes: null },
        trigger: `Live Research: ${session.query}`,
        analysisDate: deps.today,
        sources,
      },
      { provider: deps.provider, model: deps.model },
    );
    const usage = addUsage(session.usage, {
      llm_calls: result.usage.llmCalls,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    });
    await db
      .from("research_sessions")
      .update(
        result.ok
          ? { status: "analyzed", progress: null, analysis: result.brief as unknown as JsonObject, analysis_errors: null, analysis_model: result.model, usage, error: null }
          : { status: "ready", progress: null, analysis: null, analysis_errors: result.errors, analysis_model: result.model, usage, error: "Analysis did not pass validation. No brief was produced." },
      )
      .eq("id", sessionId);
  } catch (e) {
    await db
      .from("research_sessions")
      .update({ status: "ready", progress: null, error: `Analysis failed: ${e instanceof Error ? e.message : String(e)}` })
      .eq("id", sessionId);
  }
}

// Before saving: the stored brief must still validate, pass every rule check,
// and every ledger entry must match its source record (URL and dates).
export function verifyAgainstSources(brief: BriefAnalysis, records: SourceRecord[]): string[] {
  const errors = [...checkBriefIntegrity(brief)];
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const e of brief.ledger) {
    const r = byId.get(e.id);
    if (!r) {
      errors.push(`${e.id}: no collected source with this id.`);
      continue;
    }
    if (r.url !== e.url) errors.push(`${e.id}: URL does not match the source record.`);
    if (r.publishedAt !== e.publishedAt) errors.push(`${e.id}: publication date does not match the source record.`);
    const recordEvent = r.eventAt && r.eventAt !== r.publishedAt ? r.eventAt : null;
    if (recordEvent !== e.eventAt) errors.push(`${e.id}: event date does not match the source record.`);
  }
  return errors;
}

export type SaveResult = { ok: true; briefId: string } | { ok: false; error: string };

// "Add to feed": saves the brief as a new version (never overwrites).
export async function saveSessionToFeed(sessionId: string, userId: string): Promise<SaveResult> {
  const db = createAdminClient();
  const { data: session, error } = await db.from("research_sessions").select("*").eq("id", sessionId).single();
  if (error) return { ok: false, error: `Could not load research session: ${error.message}` };
  if (session.brief_id) return { ok: true, briefId: session.brief_id }; // already saved
  if (session.status !== "analyzed" || !session.analysis) return { ok: false, error: "Analyze the sources before adding to the feed." };

  const parsed = briefAnalysisSchema.safeParse(session.analysis);
  if (!parsed.success) return { ok: false, error: "The stored analysis no longer validates. Analyze again." };
  const brief = parsed.data;
  if (brief.company.entityStatus !== "verified") {
    return { ok: false, error: "Entity not verified: the sources don't confirm an operating business with Ontario operations, so it can't go in the feed." };
  }

  const rows = await loadSessionSources(db, session.source_ids);
  const records = toSourceRecords(rows);
  const problems = verifyAgainstSources(brief, records);
  if (problems.length) return { ok: false, error: `Brief failed the pre-save check: ${problems.join(" ")}` };

  // Company: re-analysis keeps its company; otherwise match by normalized name.
  let companyId = session.company_id;
  if (!companyId) {
    const key = normalizeCompanyName(brief.company.name);
    const { data: existing } = await db.from("companies").select("id").eq("normalized_key", key).maybeSingle();
    if (existing) companyId = existing.id;
    else {
      const { data: created, error: cErr } = await db
        .from("companies")
        .insert({
          display_name: brief.company.name,
          normalized_key: key,
          aliases: session.query !== brief.company.name ? [session.query] : [],
          ontario_connection: brief.company.localConnection,
          entity_verified: true,
        })
        .select("id")
        .single();
      if (cErr) return { ok: false, error: `Could not save company: ${cErr.message}` };
      companyId = created.id;
    }
  }

  const { data: saved, error: bErr } = await db
    .from("briefs")
    .insert({
      company_id: companyId,
      origin: "live_research",
      trigger_query: session.query,
      rating: brief.rating,
      stage: brief.stage,
      analysis: brief as unknown as JsonObject,
      model: session.analysis_model ?? "unknown",
      created_by: userId,
      // version is assigned by the briefs_assign_version trigger (next per company)
    } as Omit<TablesInsert<"briefs">, "version"> as TablesInsert<"briefs">)
    .select("id")
    .single();
  if (bErr) return { ok: false, error: `Could not save brief: ${bErr.message}` };

  const idByLabel = new Map(records.map((r, i) => [r.id, rows[i].id]));
  const ledgerRows = brief.ledger.map((e) => ({
    brief_id: saved.id,
    source_id: idByLabel.get(e.id)!,
    evidence_type: e.evidenceType,
    relevance: e.relevance,
    finding: e.finding,
  }));
  const { data: insertedLedger, error: lErr } = await db.from("brief_sources").insert(ledgerRows).select("id");
  if (lErr) return { ok: false, error: `Saved the brief, but could not link its sources: ${lErr.message}` };

  // Repeat-coverage links between ledger rows
  const rowIdByLabel = new Map(brief.ledger.map((e, i) => [e.id, insertedLedger[i]?.id]));
  for (const e of brief.ledger) {
    if (!e.repeatCoverageOf) continue;
    await db
      .from("brief_sources")
      .update({ is_repeat_coverage_of: rowIdByLabel.get(e.repeatCoverageOf) ?? null })
      .eq("id", rowIdByLabel.get(e.id)!);
  }

  await db.from("research_sessions").update({ status: "saved", brief_id: saved.id, company_id: companyId }).eq("id", sessionId);
  return { ok: true, briefId: saved.id };
}
