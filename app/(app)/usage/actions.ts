"use server";

import { requireAdmin } from "@/lib/auth";

export type BalanceResult =
  | { ok: true; remaining: number; plan: number; periodStart: string | null; periodEnd: string | null; checkedAt: string }
  | { ok: false; error: string };

// Explicit click only (nothing external runs on page load). Reads the account's
// actual remaining Firecrawl credits: GET /v2/team/credit-usage.
export async function checkFirecrawlBalance(): Promise<BalanceResult> {
  await requireAdmin();
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { ok: false, error: "FIRECRAWL_API_KEY is not set on the server." };
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: Record<string, unknown>; error?: string } | null;
    if (!res.ok || !json?.success || !json.data) return { ok: false, error: `Firecrawl returned ${res.status}${json?.error ? `: ${json.error}` : ""}` };
    const d = json.data;
    return {
      ok: true,
      remaining: Number(d.remainingCredits ?? 0),
      plan: Number(d.planCredits ?? 0),
      periodStart: typeof d.billingPeriodStart === "string" ? d.billingPeriodStart : null,
      periodEnd: typeof d.billingPeriodEnd === "string" ? d.billingPeriodEnd : null,
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
