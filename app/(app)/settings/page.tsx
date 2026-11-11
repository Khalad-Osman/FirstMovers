import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings · First Movers" };

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: s, error } = await supabase.from("settings").select("*, profiles:updated_by(full_name)").maybeSingle();
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  if (!s) throw new Error("The settings row is missing. Re-run the database migrations.");

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Caps, models and schedules for discovery and ingestion. Changes apply to the next run." />
      <p className="mono text-[0.8125rem] text-meta">
        Last changed {formatTime(s.updated_at)}
        {s.profiles?.full_name ? ` by ${s.profiles.full_name}` : ""}
      </p>
      <SettingsForm
        canEdit={user?.role === "admin"}
        envModels={{ screening: process.env.LLM_SCREENING_MODEL || null, analysis: process.env.LLM_ANALYSIS_MODEL || null }}
        values={{
          discovery_cap: s.discovery_cap,
          sources_per_candidate: s.sources_per_candidate,
          skip_window_days: s.skip_window_days,
          canadabuys_min_value: Number(s.canadabuys_min_value),
          screening_model: s.screening_model,
          analysis_model: s.analysis_model,
          schedule_ingestion_enabled: s.schedule_ingestion_enabled,
          schedule_discovery_enabled: s.schedule_discovery_enabled,
          discovery_weekday: s.discovery_weekday,
          firecrawl_monthly_budget: s.firecrawl_monthly_budget,
        }}
      />
      <p className="text-[0.8125rem] text-meta">
        Schedules run from the daily job at about 9–10 am Toronto time, only once the app is deployed (Vercel Cron). Model names are sent to the LLM provider as written; check them against the provider&apos;s model list.
      </p>
    </div>
  );
}
