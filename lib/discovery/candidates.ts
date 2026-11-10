import { normalizeCompanyName } from "@/lib/research/normalize";

// Step 2 of the pipeline (CLAUDE.md §4): group stored signals by entity, merge
// name variants, keep entities with an Ontario connection, and score them with
// transparent rules. No AI.

export type SignalForCandidate = {
  id: string;
  source_type: string;
  raw_entity_name: string | null;
  entity_key: string | null;
  signal_strength: string;
  title: string | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  event_at: string | null;
  location: string | null;
  raw: unknown;
};

export type Candidate = {
  key: string; // grouping key
  displayName: string; // full name as it appears in the sources
  aliases: string[];
  signals: SignalForCandidate[]; // newest first
  score: number;
  scoreParts: string[];
  topSignalId: string; // the signal that best explains why it surfaced
};

const GTA = /\b(toronto|north york|scarborough|etobicoke|york|mississauga|brampton|caledon|bolton|vaughan|concord|woodbridge|maple|markham|richmond hill|aurora|newmarket|stouffville|pickering|ajax|whitby|oshawa|oakville|milton|burlington|halton hills|georgetown|hamilton|peel|durham|halton)\b/i;

// Merge variants such as "Thermo Fisher Scientific (Mississauga) Inc." and
// "Thermo Fisher Scientific Inc.", or "Wesco Aircraft Canada Inc." and "Wesco Aircraft Inc.".
export function groupKey(rawName: string): string {
  const base = normalizeCompanyName(rawName.replace(/\([^)]*\)/g, " "));
  const words = base.split(" ");
  while (words.length > 1 && ["canada", "ontario", "of"].includes(words[words.length - 1])) words.pop();
  return words.join(" ");
}

function awardValue(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const r = raw as Record<string, unknown>;
  return Math.max(Number(r["contractAmount-montantContrat"]) || 0, Number(r["totalContractValue-valeurTotaleContrat"]) || 0);
}

const EQUIPMENT = /\b(racking|mezzanine|production line|equipment|crane|spray booth|dock|loading|conveyor|automation|cold storage|freezer)\b/i;

export function signalWeight(s: SignalForCandidate): { weight: number; label: string } {
  switch (s.signal_strength) {
    case "new_building":
      return { weight: 5, label: "new building permit" };
    case "addition":
      return { weight: 4, label: "addition permit" };
    case "change_of_use":
      return { weight: 4, label: "change-of-use permit" };
    case "award": {
      const v = awardValue(s.raw);
      return v >= 1_000_000 ? { weight: 3, label: "federal award ≥ $1M" } : { weight: 2, label: "federal award" };
    }
    case "alteration":
      return EQUIPMENT.test(`${s.title} ${s.summary}`) ? { weight: 2, label: "alteration with equipment/racking" } : { weight: 1, label: "alteration permit" };
    case "demolition":
      return { weight: 1, label: "demolition permit" };
    default:
      return { weight: 0.5, label: s.signal_strength === "sign" ? "sign permit" : "other permit" };
  }
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function pickDisplayName(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  // Prefer the full legal form (with Inc./Ltd./…), then the most frequent, then the longest.
  return [...counts.entries()].sort((a, b) => {
    const legal = (n: string) => (/\b(inc|ltd|limited|corp|corporation|co|ulc|llc|lp)\.?$/i.test(n) ? 1 : 0);
    return legal(b[0]) - legal(a[0]) || b[1] - a[1] || b[0].length - a[0].length;
  })[0][0];
}

export function buildCandidates(
  signals: SignalForCandidate[],
  opts: { today: string; skipKeys: Set<string> },
): { candidates: Candidate[]; skipped: { key: string; displayName: string; reason: string }[] } {
  const groups = new Map<string, SignalForCandidate[]>();
  for (const s of signals) {
    if (!s.raw_entity_name || !s.entity_key) continue; // address-only permits are not candidates
    const key = groupKey(s.raw_entity_name);
    if (key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const candidates: Candidate[] = [];
  const skipped: { key: string; displayName: string; reason: string }[] = [];
  for (const [key, list] of groups) {
    const names = list.map((s) => s.raw_entity_name!.trim());
    const displayName = pickDisplayName(names);
    if (opts.skipKeys.has(key) || list.some((s) => opts.skipKeys.has(s.entity_key!))) {
      skipped.push({ key, displayName, reason: "analyzed in the skip window" });
      continue;
    }
    // Ontario connection: CanadaBuys signals are Ontario suppliers; permits are in Ontario cities.
    if (!list.some((s) => /ontario/i.test(s.location ?? ""))) {
      skipped.push({ key, displayName, reason: "no Ontario location in signals" });
      continue;
    }

    const sorted = [...list].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    const weighted = sorted.map((s) => ({ s, ...signalWeight(s) })).sort((a, b) => b.weight - a.weight);
    const top = weighted.slice(0, 3);
    let score = top.reduce((sum, w) => sum + w.weight, 0);
    const parts = top.map((w) => `${w.label} (+${w.weight})`);

    const sources = new Set(list.map((s) => s.source_type));
    if (sources.size > 1) {
      score += 1.5 * (sources.size - 1);
      parts.push(`${sources.size} different sources (+${1.5 * (sources.size - 1)})`);
    }
    if (list.length > 3) {
      score += 0.5;
      parts.push(`${list.length} signals (+0.5)`);
    }
    const newest = sorted[0].published_at;
    if (newest && daysBetween(newest, opts.today) <= 90) {
      score += 1;
      parts.push("signal in the last 90 days (+1)");
    }
    if (list.some((s) => GTA.test(s.location ?? ""))) {
      score += 1;
      parts.push("GTA location (+1)");
    }

    candidates.push({
      key,
      displayName,
      aliases: [...new Set(names)].filter((n) => n !== displayName),
      signals: sorted,
      score: Math.round(score * 10) / 10,
      scoreParts: parts,
      topSignalId: weighted[0].s.id,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  return { candidates, skipped };
}
