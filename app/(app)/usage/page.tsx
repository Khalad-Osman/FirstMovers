import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aggregateUsage, type UsageBucket, type UsageNumbers } from "@/lib/schedule/usage";
import { loadUsageRows } from "@/lib/schedule/usage-db";
import { torontoParts } from "@/lib/schedule/plan";
import { PageHeader } from "@/components/page-header";
import { FirecrawlBalance } from "./balance";

export const metadata: Metadata = { title: "Usage · First Movers" };

const BUCKET_LABEL: Record<UsageBucket, string> = {
  live_research: "Live Research",
  discovery_manual: "Discovery (manual)",
  discovery_scheduled: "Discovery (scheduled)",
};

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1)));
}

export default async function UsagePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [{ sessions, runs }, { data: settings }] = await Promise.all([
    loadUsageRows(supabase),
    supabase.from("settings").select("firecrawl_monthly_budget").maybeSingle(),
  ]);
  const months = aggregateUsage(sessions, runs);
  const now = torontoParts(new Date()).month;
  const current = months.find((m) => m.month === now);
  const budget = settings?.firecrawl_monthly_budget ?? 800;
  const used = current?.total.firecrawlCredits ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Usage"
        description="Firecrawl and LLM usage recorded by Live Research and discovery. Firecrawl credits are our own estimate (searches as reported, 1 per scrape); check the actual balance below."
      />

      <section className="grid gap-3 border border-line p-4">
        <h2 className="label">This month · {monthLabel(now)}</h2>
        <div className="grid gap-1">
          <div className="mono flex flex-wrap justify-between gap-2 text-[0.875rem]">
            <span>Firecrawl: ~{used.toLocaleString("en-CA")} of {budget.toLocaleString("en-CA")} budget credits</span>
            <span>{pct}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-sm bg-panel" role="img" aria-label={`${pct}% of the monthly Firecrawl budget used`}>
            <div className={`h-full ${pct >= 90 ? "bg-[var(--error-fg)]" : "bg-accent"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        {user?.role === "admin" && <FirecrawlBalance />}
        <Link href="/settings" className="link w-fit text-[0.875rem]">
          Change budget or caps
        </Link>
      </section>

      {months.length === 0 ? (
        <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
          <p className="font-semibold">No usage recorded yet.</p>
          <p className="mt-1 text-meta">Usage appears after Live Research or a discovery run.</p>
        </div>
      ) : (
        months.map((m) => (
          <section key={m.month} className="grid gap-2">
            <h2 className="label border-b border-line pb-1.5">{monthLabel(m.month)}</h2>
            <div className="overflow-x-auto">
              <table className="mono w-full min-w-[720px] text-left text-[0.875rem]">
                <thead>
                  <tr className="text-meta">
                    <th className="py-1 pr-3 font-normal">Activity</th>
                    <th className="py-1 pr-3 font-normal">Runs</th>
                    <th className="py-1 pr-3 font-normal">Briefs</th>
                    <th className="py-1 pr-3 font-normal">Firecrawl credits</th>
                    <th className="py-1 pr-3 font-normal">Firecrawl requests</th>
                    <th className="py-1 pr-3 font-normal">LLM calls (screening)</th>
                    <th className="py-1 pr-3 font-normal">Tokens in / out</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(BUCKET_LABEL) as UsageBucket[]).map((b) => (
                    <Row key={b} label={BUCKET_LABEL[b]} n={m.by[b]} />
                  ))}
                  <Row label="Total" n={m.total} strong />
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Row({ label, n, strong }: { label: string; n: UsageNumbers; strong?: boolean }) {
  return (
    <tr className={`border-t border-line ${strong ? "font-semibold" : ""}`}>
      <td className="py-1.5 pr-3 font-sans">{label}</td>
      <td className="py-1.5 pr-3">{n.runs}</td>
      <td className="py-1.5 pr-3">{n.briefs}</td>
      <td className="py-1.5 pr-3">~{n.firecrawlCredits.toLocaleString("en-CA")}</td>
      <td className="py-1.5 pr-3">{n.firecrawlRequests.toLocaleString("en-CA")}</td>
      <td className="py-1.5 pr-3">
        {n.llmCalls} ({n.screeningCalls})
      </td>
      <td className="py-1.5 pr-3">
        {n.inputTokens.toLocaleString("en-CA")} / {n.outputTokens.toLocaleString("en-CA")}
      </td>
    </tr>
  );
}
