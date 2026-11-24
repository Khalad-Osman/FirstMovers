import { parseSector, type Sector } from "@/lib/sector";
import { buildCandidates, groupKey, signalWeight, type SignalForCandidate } from "@/lib/discovery/candidates";
import { REGIONS, regionsIn, type RegionKey } from "@/lib/research/filters";
import { toRecordSource, type RecordSignal } from "@/lib/research/records";

// Prospect list (added 2026-11-17, no AI, no credits): every named company in
// the stored signals with recent physical activity, ranked with the discovery
// rule score. Discovery and Live Research are the deep dive; this is the wide view.

export type SignalFamily = "permit" | "grant" | "award" | "news" | "approval" | "licence" | "insolvency";
export const familyOf = (s: { source_type: string }): SignalFamily =>
  s.source_type.startsWith("permit_")
    ? "permit"
    : s.source_type === "federal_grant" || s.source_type === "feddev_news"
      ? "grant"
      : s.source_type === "ontario_news" || s.source_type === "newswire_release"
        ? "news"
        : s.source_type === "ero_approval"
          ? "approval"
          : s.source_type === "agco_cannabis" || s.source_type === "agco_liquor"
            ? "licence"
            : s.source_type === "ccaa_filing"
              ? "insolvency"
              : "award";

// Space-related activity: permits that score 2+ (new building, addition, change
// of use, major fit-out, racking/equipment, small structures) and facility or
// equipment grants (federal disclosure or FedDev announcements). Contract awards
// alone are sales, not space.
export function isPhysical(s: RecordSignal): boolean {
  if (s.source_type.startsWith("permit_")) return signalWeight(s).weight >= 2;
  if (s.source_type === "federal_grant" || s.source_type === "feddev_news") {
    const kind = s.raw && typeof s.raw === "object" ? (s.raw as Record<string, unknown>).grant_kind : null;
    return kind === "facility" || kind === "equipment";
  }
  if (s.source_type === "ontario_news") return true; // a named company's investment or facility
  if (s.source_type === "agco_cannabis" || s.source_type === "agco_liquor") return Boolean(s.published_at);
  if (s.source_type === "newswire_release" || s.source_type === "ccaa_filing") return true; // a facility, store or restructuring // a store opening or closing (undated closures are older)
  if (s.source_type === "ero_approval") {
    // A production change or growth; administrative renewals alone don't count.
    const kind = s.raw && typeof s.raw === "object" ? (s.raw as Record<string, unknown>).kind : null;
    return kind !== "admin";
  }
  return false;
}

// Dollar value stated in the record (permit estimate, grant or award value).
export function signalValue(s: RecordSignal): number | null {
  const r = (s.raw && typeof s.raw === "object" ? s.raw : {}) as Record<string, unknown>;
  const n = (v: unknown) => {
    const x = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  return (
    n(r.EST_CON_VALUE) ??
    n(r.EST_CONST_COST) ??
    n(r.agreement_value) ??
    n(r.amount) ??
    (() => {
      const a = n(r["contractAmount-montantContrat"]);
      const b = n(r["totalContractValue-valeurTotaleContrat"]);
      return a || b ? Math.max(a ?? 0, b ?? 0) : null;
    })()
  );
}

// "560 SLATE DR, Mississauga, Ontario" -> "Mississauga"; "BRAMPTON, Ontario, L6T 5V8" -> "Brampton".
export function municipalityOf(location: string | null): string | null {
  if (!location) return null;
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  const i = parts.findIndex((p) => /^ontario\b/i.test(p));
  const city = i > 0 ? parts[i - 1] : null;
  if (!city || /\d/.test(city)) return null;
  return city.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ProspectSignal = { id: string; family: SignalFamily; date: string | null; title: string; url: string | null; publisher: string; value: number | null; physical: boolean };

export type LatestBrief = { id: string; rating: string; analyzedAt: string; angle?: string | null };

export type Prospect = {
  key: string;
  name: string;
  municipality: string | null;
  regions: RegionKey[];
  score: number;
  reasons: string[];
  families: SignalFamily[];
  maxValue: number | null;
  latestDate: string | null;
  signals: ProspectSignal[]; // physical first, then newest
  brief: LatestBrief | null;
};

export type ProspectFilters = {
  sector: Sector;
  regions: RegionKey[] | "all";
  families: SignalFamily[]; // empty = any
  neverAnalyzed: boolean;
  minValue: number | null;
};

export const GTA_REGIONS: RegionKey[] = ["peel", "york", "halton", "durham", "toronto"];

export function buildProspects(
  signals: RecordSignal[],
  opts: { today: string; briefsByKey: Map<string, LatestBrief>; sector?: Sector },
): Prospect[] {
  const { candidates } = buildCandidates(signals as SignalForCandidate[], { today: opts.today, skipKeys: new Set(), sector: opts.sector });
  const out: Prospect[] = [];
  for (const c of candidates) {
    const sigs = c.signals as RecordSignal[];
    if (!sigs.some(isPhysical)) continue;
    const rows: ProspectSignal[] = sigs
      .map((s) => {
        const r = toRecordSource(s);
        return {
          id: s.id,
          family: familyOf(s),
          date: s.event_at ?? s.published_at,
          title: s.title ?? r?.title ?? "Record",
          url: r?.url ?? s.url,
          publisher: r?.publisher ?? s.source_type,
          value: signalValue(s),
          physical: isPhysical(s),
        };
      })
      .sort((a, b) => Number(b.physical) - Number(a.physical) || (b.date ?? "").localeCompare(a.date ?? ""));
    const locations = sigs.map((s) => s.location ?? "").join(" ");
    const values = rows.map((r) => r.value).filter((v): v is number => v !== null);
    out.push({
      key: c.key,
      name: c.displayName,
      municipality: sigs.map((s) => municipalityOf(s.location)).find(Boolean) ?? null,
      regions: regionsIn(locations),
      score: c.score,
      reasons: c.scoreParts,
      families: [...new Set(rows.map((r) => r.family))],
      maxValue: values.length ? Math.max(...values) : null,
      latestDate: rows.map((r) => r.date).filter(Boolean).sort().at(-1) ?? null,
      signals: rows,
      brief: opts.briefsByKey.get(c.key) ?? null,
    });
  }
  return out.sort((a, b) => b.score - a.score || (b.latestDate ?? "").localeCompare(a.latestDate ?? "") || a.name.localeCompare(b.name));
}

export function filterProspects(list: Prospect[], f: ProspectFilters): Prospect[] {
  return list.filter(
    (p) =>
      (f.regions === "all" || p.regions.some((r) => f.regions.includes(r))) &&
      (f.families.length === 0 || p.families.some((x) => f.families.includes(x))) &&
      (!f.neverAnalyzed || !p.brief) &&
      (f.minValue === null || (p.maxValue ?? 0) >= f.minValue),
  );
}

export function parseProspectFilters(params: Record<string, string | string[] | undefined>): ProspectFilters {
  const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []);
  const regionParam = list(params.region);
  const regions: RegionKey[] | "all" = regionParam.includes("all")
    ? "all"
    : regionParam.length
      ? (regionParam.filter((r) => r in REGIONS) as RegionKey[])
      : GTA_REGIONS;
  const families = list(params.type).filter((t): t is SignalFamily => ["permit", "grant", "award", "news", "approval", "licence", "insolvency"].includes(t));
  const min = Number(String(params.min ?? "").replace(/[^0-9]/g, ""));
  return { sector: parseSector(params.sector), regions, families, neverAnalyzed: params.new === "1", minValue: min > 0 ? min : null };
}

// Brief lookup key: the same grouping discovery uses.
export const briefKey = (companyName: string) => groupKey(companyName);

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function prospectsCsv(list: Prospect[]): string {
  const header = ["Company", "Municipality", "Regions", "Score", "Score reasons", "Signal types", "Largest value ($)", "Latest signal", "Top signals", "Latest brief rating", "Latest brief date"];
  const rows = list.map((p) => [
    p.name,
    p.municipality,
    p.regions.map((r) => REGIONS[r].label).join("; "),
    p.score,
    p.reasons.join("; "),
    p.families.join("; "),
    p.maxValue === null ? null : Math.round(p.maxValue),
    p.latestDate,
    p.signals.slice(0, 3).map((s) => `${s.date ?? "undated"} ${s.title}${s.url ? ` (${s.url})` : ""}`).join(" | "),
    p.brief?.rating ?? null,
    p.brief?.analyzedAt.slice(0, 10) ?? null,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
