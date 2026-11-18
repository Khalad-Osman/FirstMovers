import { canadabuys } from "./canadabuys";
import { federalGrants } from "./grants";
import { ontarioNews } from "./ontario-news";
import { eroApprovals } from "./ero";
import { bramptonPermits, mississaugaPermits, torontoPermits } from "./permits";
import type { IngestSource, SourceType } from "./types";

// Order = build order in CLAUDE.md §11 Phase 4. Job Bank is deferred: its open
// data has no employer name (checked 2026-11-10).
export const INGEST_SOURCES: IngestSource[] = [canadabuys, federalGrants, ontarioNews, eroApprovals, mississaugaPermits, bramptonPermits, torontoPermits];

export function getIngestSource(source: string): IngestSource | undefined {
  return INGEST_SOURCES.find((s) => s.source === (source as SourceType));
}
