import { canadabuys } from "./canadabuys";
import { federalGrants } from "./grants";
import { ontarioNews } from "./ontario-news";
import { eroApprovals } from "./ero";
import { bramptonPermits, mississaugaPermits, torontoPermits } from "./permits";
import { caledonPermits, oakvillePermits } from "./permits-halton-peel";
import { feddevNews } from "./feddev";
import { agcoCannabis } from "./agco";
import { agcoLiquor } from "./agco-liquor";
import { ccaaFilings } from "./ccaa";
import { newswireReleases } from "./newswire";
import { hamiltonDevApps, oakvilleDevApps } from "./devapps";
import { barriePermits, kingstonPermits, kitchenerPermits, ottawaPermits, waterlooPermits } from "./permits-ontario";
import type { IngestSource, SourceType } from "./types";

// Order = build order in CLAUDE.md §11 Phase 4. Job Bank is deferred: its open
// data has no employer name (checked 2026-11-10).
export const INGEST_SOURCES: IngestSource[] = [
  canadabuys,
  federalGrants,
  ontarioNews,
  feddevNews,
  eroApprovals,
  mississaugaPermits,
  bramptonPermits,
  torontoPermits,
  caledonPermits,
  oakvillePermits,
  // Outside the GTA (added 2026-11-23)
  kitchenerPermits,
  waterlooPermits,
  kingstonPermits,
  barriePermits,
  ottawaPermits,
  agcoCannabis,
  // Added 2026-11-24
  agcoLiquor,
  ccaaFilings,
  newswireReleases,
  // Added 2026-11-25
  oakvilleDevApps,
  hamiltonDevApps,
];

export function getIngestSource(source: string): IngestSource | undefined {
  return INGEST_SOURCES.find((s) => s.source === (source as SourceType));
}
