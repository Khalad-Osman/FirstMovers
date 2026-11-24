// Address matching for permits that name no business (added 2026-11-23). No AI.
// A permit or application with no business named is linked to a company when
// another stored record of the same sector names that company at the same
// street address and unit (or neither gives a unit), and no other company is
// named there. The linked copy says how it was linked; the permit itself is
// never changed.

export type AddressKey = { key: string; street: string; unit: string | null };

const STREET_TYPES: [RegExp, string][] = [
  [/\bstreet\b/g, "st"],
  [/\broad\b/g, "rd"],
  [/\bavenue\b/g, "ave"],
  [/\bdrive\b/g, "dr"],
  [/\bboulevard\b/g, "blvd"],
  [/\bcrescent\b/g, "cres"],
  [/\bcourt\b/g, "crt"],
  [/\bct\b/g, "crt"],
  [/\bparkway\b/g, "pkwy"],
  [/\bplace\b/g, "pl"],
  [/\bcircle\b/g, "cir"],
  [/\bterrace\b/g, "terr"],
  [/\bhighway\b/g, "hwy"],
  [/\bsquare\b/g, "sq"],
  [/\blane\b/g, "ln"],
  [/\btrail\b/g, "trl"],
  [/\bgate\b/g, "gt"],
  [/\beast\b/g, "e"],
  [/\bwest\b/g, "w"],
  [/\bnorth\b/g, "n"],
  [/\bsouth\b/g, "s"],
];

// "1500 BIRCHMOUNT RD, Unit 4, Toronto, Ontario M1P 2G5" -> key "toronto|1500 birchmount rd", unit "4"
export function addressKey(location: string | null | undefined): AddressKey | null {
  if (!location) return null;
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  const ontario = parts.findIndex((p) => /^(?:ontario|on)\b/i.test(p));
  if (ontario < 2) return null; // needs at least "street, city, Ontario"
  const city = parts[ontario - 1].toLowerCase().replace(/[^a-z ]/g, "").trim();
  let text = parts.slice(0, ontario - 1).join(" ").toLowerCase();
  let unit: string | null = null;
  const u = /(?:\bunit|\bsuite|\bste|#)\s*([a-z0-9-]+)/.exec(text);
  if (u) {
    unit = u[1].replace(/^0+/, "");
    text = text.replace(u[0], " ");
  }
  text = text.replace(/[.']/g, "").replace(/[^a-z0-9 ]/g, " ");
  for (const [re, short] of STREET_TYPES) text = text.replace(re, short);
  const street = text.replace(/\s+/g, " ").trim();
  if (!/^\d+[a-z]?\s+[a-z]/.test(street) || !city) return null; // a street number and name
  return { key: `${city}|${street}`, street, unit };
}

type Sig = {
  id: string;
  raw_entity_name: string | null;
  entity_key: string | null;
  location: string | null;
  title: string | null;
  raw: unknown;
  source_type: string;
  published_at?: string | null;
};

export type AddressMatch = { name: string; entityKey: string; viaSignalId: string };

// Copies of the unnamed signals that match exactly one named company at their address.
export function attachByAddress<T extends Sig>(signals: T[], groupOf: (name: string) => string): T[] {
  const named = new Map<string, { group: string; unit: string | null; s: T }[]>();
  for (const s of signals) {
    if (!s.entity_key || !s.raw_entity_name) continue;
    const a = addressKey(s.location);
    if (!a) continue;
    const list = named.get(a.key) ?? [];
    list.push({ group: groupOf(s.raw_entity_name), unit: a.unit, s });
    named.set(a.key, list);
  }
  const out: T[] = [];
  for (const s of signals) {
    if (s.entity_key || !s.source_type.startsWith("permit_")) continue;
    const a = addressKey(s.location);
    // Malls and multi-tenant buildings: the unit must match exactly.
    const here = a ? (named.get(a.key) ?? []).filter((n) => n.unit === a.unit) : [];
    const groups = new Set(here.map((n) => n.group));
    if (groups.size !== 1) continue;
    const best = [...here].sort((x, y) => (y.s.published_at ?? "").localeCompare(x.s.published_at ?? ""))[0];
    const match: AddressMatch = { name: best.s.raw_entity_name!, entityKey: best.s.entity_key!, viaSignalId: best.s.id };
    const raw = s.raw && typeof s.raw === "object" && !Array.isArray(s.raw) ? (s.raw as Record<string, unknown>) : {};
    out.push({
      ...s,
      raw_entity_name: match.name,
      entity_key: match.entityKey,
      title: `${s.title ?? "Permit"} (names no business; same address as a record naming ${match.name})`,
      raw: { ...raw, address_match: match },
    });
  }
  return out;
}

export function addressMatchOf(raw: unknown): AddressMatch | null {
  const m = raw && typeof raw === "object" ? (raw as Record<string, unknown>).address_match : null;
  return m && typeof m === "object" && "name" in m ? (m as AddressMatch) : null;
}
