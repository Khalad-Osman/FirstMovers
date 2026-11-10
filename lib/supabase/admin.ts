import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabasePublicEnv } from "./env";

// Privileged client that bypasses RLS. Server-only. Callers MUST check the
// user's role (see lib/auth.ts) before using it. Used by pipeline writes in
// later phases (Live Research "Add to feed", discovery).
export function createAdminClient() {
  const { url } = supabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing SUPABASE_SECRET_KEY");

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
