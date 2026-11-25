import { z } from "zod";
import { parseDelimited } from "@/lib/ingest/csv";
import { COMPANY_TYPE_KEYS, DEAL_TYPE_KEYS, REGION_KEYS, regionsIn, type CompanyTypeKey, type DealTypeKey, type RegionKey } from "@/lib/research/filters";

// Past deals (added 2026-11-17). Spreadsheet rows are mapped to these fields in
// the browser, without AI; anything that can't be read stays blank.

export const pastDealSchema = z.object({
  occupier: z.string().trim().min(1, "Occupier is required.").max(200),
  companyType: z.enum(COMPANY_TYPE_KEYS as [CompanyTypeKey, ...CompanyTypeKey[]]).nullable(),
  region: z.enum(REGION_KEYS as [RegionKey, ...RegionKey[]]).nullable(),
  municipality: z.string().trim().max(120).nullable(),
  dealType: z.enum(DEAL_TYPE_KEYS as [DealTypeKey, ...DealTypeKey[]]).nullable(),
  sizeSqft: z.number().positive().max(50_000_000).nullable(),
  clearHeightFt: z.number().positive().max(200).nullable(),
  dealDate: z.iso.date().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});
export type PastDealDraft = z.infer<typeof pastDealSchema>;

export const MAX_DEALS_PER_UPLOAD = 500;

// Column names we recognise (lower-cased, punctuation stripped).
const COLUMNS: Record<keyof PastDealDraft, RegExp> = {
  occupier: /^(occupier|tenant|company|client|customer|buyer|purchaser|lessee|occupant|end user|user|name|company name)$/,
  companyType: /^(company type|type|sector|industry|business type|vertical|use type)$/,
  region: /^(region|market|submarket|area)$/,
  municipality: /^(municipality|city|town|location|address|property|property address|site)$/,
  dealType: /^(deal type|transaction|transaction type|deal|type of deal|lease or sale)$/,
  sizeSqft: /^(size|size sf|size sq ft|sf|sq ft|sqft|square feet|area sf|gla|rentable area|building size|area)$/,
  clearHeightFt: /^(clear height|clear|ceiling height|clear ht|clearance)$/,
  dealDate: /^(date|deal date|closed|close date|closing date|signed|date signed|commencement|year)$/,
  notes: /^(notes|comments|comment|description|details|remarks)$/,
};

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Which header feeds which field (first match wins; "type" goes to companyType
// only when no "deal type" style column exists).
export function mapColumns(headers: string[]): Partial<Record<keyof PastDealDraft, string>> {
  const out: Partial<Record<keyof PastDealDraft, string>> = {};
  const fields = Object.keys(COLUMNS) as (keyof PastDealDraft)[];
  for (const field of ["dealType", ...fields.filter((f) => f !== "dealType")] as (keyof PastDealDraft)[]) {
    const h = headers.find((x) => COLUMNS[field].test(key(x)) && !Object.values(out).includes(x));
    if (h) out[field] = h;
  }
  return out;
}

export function companyTypeFrom(v: string): CompanyTypeKey | null {
  const t = v.toLowerCase();
  if (!t.trim()) return null;
  if (/developer|landlord|property owner|realty|reit|real estate/.test(t)) return "developer_landlord";
  if (/food|beverage|dairy|meat|bakery|brew|grocery|produce|confection/.test(t)) return "food_beverage";
  if (/logistic|3pl|distribut|warehous|fulfil|freight|courier|transport|cold storage/.test(t)) return "logistics_3pl";
  if (/nuclear|energy|power|utility|smr|solar|battery/.test(t)) return "energy_nuclear";
  if (/data cent|datacent|semiconductor|electronic|hardware|server/.test(t)) return "data_centre_tech";
  if (/manufactur|fabricat|plant|factory|industrial|production|machin|metal|plastic|chemical|automotive|aerospace/.test(t)) return "manufacturer";
  return "other";
}

export function dealTypeFrom(v: string): DealTypeKey | null {
  const t = v.toLowerCase();
  if (/build[- ]to[- ]suit|new build|design[- ]build|construction|development|bts/.test(t)) return "new_build";
  if (/expan|addition|in place|extension/.test(t)) return "expansion_in_place";
  if (/sale|purchase|acqui|bought|sold|buy|investment/.test(t)) return "sale_purchase";
  if (/lease|renew|sublease|sublet|rent|tenan/.test(t)) return "lease";
  return null;
}

export function regionFrom(v: string): RegionKey | null {
  const t = v.trim();
  if (!t) return null;
  const direct = REGION_KEYS.find((k) => k.replace("_", " ") === t.toLowerCase() || t.toLowerCase() === k);
  if (direct) return direct;
  const found = regionsIn(t);
  return found[0] ?? null;
}

export function numberFrom(v: string, unit: "sqft" | "ft"): number | null {
  const t = v.toLowerCase().replace(/,/g, "").trim();
  const m = /(\d+(?:\.\d+)?)\s*(k|m|million)?/.exec(t);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2] === "k") n *= 1000;
  if (m[2] === "million" || (m[2] === "m" && unit === "sqft" && n < 100)) n *= 1_000_000;
  if (unit === "sqft" && /m²|m2|sq ?m|square met/.test(t)) n *= 10.7639;
  if (unit === "ft" && /\b(m|metres?|meters?)\b/.test(t) && !/ft|feet|'/.test(t)) n *= 3.28084;
  return n > 0 ? Math.round(n * 10) / 10 : null;
}

export function dateFrom(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{4})$/.exec(t); // a year alone
  if (m) return iso(+m[1], 1, 1);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); // M/D/YYYY (North American)
  if (m) return iso(+m[3], +m[1], +m[2]);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function iso(y: number, mo: number, d: number): string | null {
  if (y < 1950 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const str = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

export function rowToDraft(row: Record<string, string>, cols: Partial<Record<keyof PastDealDraft, string>>): PastDealDraft | null {
  const get = (f: keyof PastDealDraft) => (cols[f] ? str(row[cols[f]!]) : "");
  const occupier = get("occupier");
  if (!occupier) return null;
  const municipality = get("municipality") || null;
  return {
    occupier: occupier.slice(0, 200),
    companyType: companyTypeFrom(get("companyType")),
    region: regionFrom(get("region")) ?? (municipality ? regionFrom(municipality) : null),
    municipality: municipality?.slice(0, 120) ?? null,
    dealType: dealTypeFrom(get("dealType")),
    sizeSqft: numberFrom(get("sizeSqft"), "sqft"),
    clearHeightFt: numberFrom(get("clearHeightFt"), "ft"),
    dealDate: dateFrom(get("dealDate")),
    notes: get("notes").slice(0, 2000) || null,
  };
}

export async function parseDealsCsv(text: string): Promise<{ drafts: PastDealDraft[]; columns: Partial<Record<keyof PastDealDraft, string>>; skipped: number; error?: string }> {
  const rows: Record<string, string>[] = [];
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  async function* one() {
    yield text;
  }
  for await (const r of parseDelimited(one(), delimiter)) rows.push(r);
  if (rows.length === 0) return { drafts: [], columns: {}, skipped: 0, error: "The file has no rows under a header row." };
  const columns = mapColumns(Object.keys(rows[0]));
  if (!columns.occupier) return { drafts: [], columns, skipped: rows.length, error: "No occupier column found. Name one column Occupier, Tenant, Company or Client." };
  const drafts: PastDealDraft[] = [];
  let skipped = 0;
  for (const r of rows.slice(0, MAX_DEALS_PER_UPLOAD)) {
    const d = rowToDraft(r, columns);
    if (d) drafts.push(d);
    else skipped++;
  }
  skipped += Math.max(0, rows.length - MAX_DEALS_PER_UPLOAD);
  return { drafts, columns, skipped };
}
