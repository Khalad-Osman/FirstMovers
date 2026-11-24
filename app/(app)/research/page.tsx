import { parseSector } from "@/lib/sector";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ResearchForm } from "./research-form";
import { ResearchStatusBadge } from "./status";

export const metadata: Metadata = { title: "Live Research · First Movers" };
export const maxDuration = 300; // research continues in after() after the redirect

export default async function ResearchPage({ searchParams }: PageProps<"/research">) {
  const params = await searchParams;
  const company = typeof params.company === "string" ? params.company : "";
  const companyId = typeof params.companyId === "string" ? params.companyId : undefined;
  const sector = parseSector(params.sector);

  const supabase = await createClient();
  const { data: sessions, error } = await supabase
    .from("research_sessions")
    .select("id, mode, query, status, created_at, brief_id, profiles:created_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Could not load research sessions: ${error.message}`);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Live Research"
        description="Research a company or theme on demand. Sources are collected first; analysis runs only when you click Analyze sources."
      />

      {companyId && (
        <p className="border-l-4 border-accent bg-panel px-4 py-2 text-[0.9375rem]">
          Re-analysis of <strong>{company}</strong>. Saving creates a new dated version; earlier versions are kept.
        </p>
      )}
      <ResearchForm initialQuery={company} companyId={companyId} initialSector={sector} />

      <section className="grid gap-2">
        <h2 className="label border-b border-line pb-1.5">Recent research</h2>
        {sessions.length === 0 ? (
          <p className="text-meta">No research yet. Start one above.</p>
        ) : (
          <ul>
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2.5">
                <Link href={`/research/${s.id}`} className="min-w-0 font-semibold hover:underline">
                  {s.query}
                </Link>
                <span className="text-[0.8125rem] text-meta">{s.mode === "theme" ? "Theme" : "Company"}</span>
                <ResearchStatusBadge status={s.status} />
                <span className="mono ml-auto text-[0.8125rem] text-meta">
                  {formatDate(s.created_at)}
                  {s.profiles?.full_name ? ` · ${s.profiles.full_name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
