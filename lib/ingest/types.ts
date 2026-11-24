import type { Database } from "@/lib/supabase/database.types";

export type SourceType = Database["public"]["Enums"]["signal_source_type"];
export type SignalStrength = Database["public"]["Enums"]["signal_strength"];
export type OccupierStatus = Database["public"]["Enums"]["occupier_status"];

// One row for public.upsert_signals.
export type SignalRow = {
  source_type: SourceType;
  source_record_id: string;
  raw_entity_name: string | null;
  entity_key: string | null;
  occupier_status: OccupierStatus;
  signal_strength: SignalStrength;
  title: string;
  summary: string | null;
  url: string | null;
  published_at: string | null; // YYYY-MM-DD
  event_at: string | null;
  location: string | null;
  raw: Record<string, unknown>;
  sector?: "industrial" | "retail"; // default industrial (lib/sector.ts)
};

export type IngestItem = { row: SignalRow } | { skip: string };

export type IngestContext = {
  today: string; // YYYY-MM-DD (Toronto)
  cutoff: string; // YYYY-MM-DD, 12 months before today
  canadabuysMinValue: number;
  grantsMinValue: number;
  // Range of record ids already stored for this source (sources that scan sequential ids).
  known?: { newestId: string | null; oldestId: string | null; oldestDate: string | null };
  // Stop starting new work after this time (epoch ms); unset when run from the CLI.
  deadline?: number;
  fetchImpl: typeof fetch;
  progress: (message: string) => Promise<void>;
};

export type IngestSource = {
  source: SourceType;
  label: string;
  description: string;
  run: (ctx: IngestContext) => AsyncGenerator<IngestItem>;
};

export function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function isoFromEpoch(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}
