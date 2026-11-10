import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CollectedSource, ResearchStore, SessionPatch } from "./pipeline";

// Database-backed store. Uses the secret-key client: callers must have checked
// the user (lib/auth.ts) before starting a research job.
export function createDbStore(): ResearchStore {
  const db = createAdminClient();
  return {
    async update(sessionId: string, patch: SessionPatch) {
      const { error } = await db
        .from("research_sessions")
        .update(patch)
        .eq("id", sessionId);
      if (error) throw new Error(`Could not update research session: ${error.message}`);
    },
    async saveSource(s: CollectedSource) {
      const { data, error } = await db
        .from("sources")
        .upsert(
          {
            url: s.url,
            publisher: s.publisher,
            title: s.title,
            published_at: s.publishedAt,
            event_at: null,
            excerpt: s.excerpt,
            content_hash: s.contentHash,
            date_method: s.dateMethod,
            first_seen_query: s.query,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "url" },
        )
        .select("id")
        .single();
      if (error) throw new Error(`Could not save source: ${error.message}`);
      return data.id;
    },
  };
}
