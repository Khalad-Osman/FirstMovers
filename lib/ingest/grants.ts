import { normalizeCompanyName } from "@/lib/research/normalize";
import { money, type IngestContext, type IngestItem, type IngestSource } from "./types";

// Government of Canada Proactive Disclosure – Grants and Contributions
// (checked 2026-11-16). The full CSV is ~2.5 GB, so we read the open.canada.ca
// CKAN datastore API instead: server-side filters (province ON, for-profit
// recipients), sorted newest first, 1,000 rows per page (the API caps limit at
// 1,000). The last 12 months is ~7 pages (~25 s). Amendments are separate rows
// sharing owner_org + ref_number; the highest amendment_number is current.
// There is no publication date: agreement_start_date is the only date.

export const GRANTS_API = "https://open.canada.ca/data/api/3/action/datastore_search";
export const GRANTS_RESOURCE = "1d15a62f-5656-49ad-8c88-f40ce689d831";
const PAGE = 1000;
const MAX_PAGES = 40; // safety stop (~40k rows)

// Industrial sectors by NAICS prefix: manufacturing, wholesale, transport and warehousing.
const INDUSTRIAL_NAICS = /^(31|32|33|41|48|49)/;
// Retail (added 2026-11-23): retail trade, food services, fitness, personal
// services, and ambulatory health care (clinics).
const RETAIL_NAICS = /^(44|45|72|7139|812|621)/;

// What the project funds, from its title and description (no AI).
const FACILITY =
  /\b(?:new (?:facility|plant|building|site|production line|manufacturing (?:line|facility|space))|expan\w*|consolidat\w*|capacity|scale[- ]?up|relocat\w*|additional (?:space|facility|line|shift)|greenfield|(?:manufacturing|production|processing|testing) facility)\b/i;
const EQUIPMENT = /\b(?:equipment|machinery|machines?|automat\w*|robot\w*|moderni[sz]\w*|retool\w*|production line|packaging line|processing line|upgrad\w*)\b/i;

export type GrantKind = "facility" | "equipment" | "other";
export function grantKind(text: string): GrantKind {
  if (FACILITY.test(text)) return "facility";
  if (EQUIPMENT.test(text)) return "equipment";
  return "other";
}

const first = (v: unknown) => String(v ?? "").split("|")[0].replace(/\s+/g, " ").trim();
const all = (v: unknown) => [...new Set(String(v ?? "").split("|").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];

export function grantRecordUrl(ownerOrg: string, refNumber: string): string {
  return `https://search.open.canada.ca/grants/record/${encodeURIComponent(`${ownerOrg},${refNumber},current`)}`;
}

// The English fields we keep in `raw` (the French duplicates are dropped).
const KEEP = [
  "ref_number", "amendment_number", "amendment_date", "agreement_type", "recipient_type", "recipient_legal_name",
  "recipient_operating_name", "recipient_city", "recipient_postal_code", "recipient_province", "prog_name_en",
  "prog_purpose_en", "agreement_title_en", "agreement_value", "agreement_start_date", "agreement_end_date",
  "description_en", "expected_results_en", "naics_identifier", "owner_org", "owner_org_title",
] as const;

export function mapGrant(r: Record<string, unknown>, ctx: Pick<IngestContext, "cutoff" | "today" | "grantsMinValue">): IngestItem {
  if (first(r.recipient_province).toUpperCase() !== "ON") return { skip: "recipient not in Ontario" };
  if (first(r.recipient_type).toUpperCase() !== "F") return { skip: "recipient not for-profit" };
  const start = first(r.agreement_start_date).slice(0, 10);
  if (!start) return { skip: "no agreement start date" };
  if (start < ctx.cutoff) return { skip: "older than 12 months" };
  if (start > ctx.today) return { skip: "starts in the future" };
  const naics = first(r.naics_identifier);
  const sector = INDUSTRIAL_NAICS.test(naics) ? "industrial" : RETAIL_NAICS.test(naics) ? "retail" : null;
  if (!sector) return { skip: "not an industrial or retail sector" };
  const value = Number(r.agreement_value) || 0;
  if (value < ctx.grantsMinValue) return { skip: "below minimum grant value" };
  const names = all(r.recipient_legal_name);
  const name = names[0];
  if (!name) return { skip: "no recipient name" };
  const ownerOrg = first(r.owner_org);
  const ref = first(r.ref_number);
  if (!ownerOrg || !ref) return { skip: "no reference number" };

  const title = first(r.agreement_title_en);
  const program = first(r.prog_name_en);
  const description = first(r.description_en);
  const city = first(r.recipient_city);
  const kind = grantKind(`${title} ${description}`);
  const raw = Object.fromEntries(KEEP.map((k) => [k, r[k] ?? null]));
  return {
    row: {
      source_type: "federal_grant",
      source_record_id: `${ownerOrg}:${ref}`,
      raw_entity_name: name,
      entity_key: normalizeCompanyName(name) || null,
      occupier_status: "not_applicable",
      signal_strength: "grant",
      title: `Federal grant: ${program || title || "funding agreement"} (${name})`,
      summary: [`${money(value)} ${kind === "facility" ? "for a facility or capacity project" : kind === "equipment" ? "for equipment or automation" : ""}`.trim(), description].filter(Boolean).join(". "),
      url: grantRecordUrl(ownerOrg, ref),
      published_at: start, // no publication date in the data; the agreement start is the only date
      event_at: null,
      location: [city, "Ontario", first(r.recipient_postal_code)].filter(Boolean).join(", "),
      raw: { ...raw, operating_names: names.slice(1), grant_kind: kind },
      sector,
    },
  };
}

async function* run(ctx: IngestContext): AsyncGenerator<IngestItem> {
  // Keep only the latest amendment of each agreement.
  const latest = new Map<string, Record<string, unknown>>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      resource_id: GRANTS_RESOURCE,
      filters: JSON.stringify({ recipient_province: "ON", recipient_type: "F" }),
      limit: String(PAGE),
      offset: String(page * PAGE),
      sort: "agreement_start_date desc",
    });
    const res = await ctx.fetchImpl(`${GRANTS_API}?${qs}`, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`Grants API request failed (${res.status})`);
    const json = (await res.json()) as { success?: boolean; result?: { records?: Record<string, unknown>[] }; error?: unknown };
    if (!json.success) throw new Error(`Grants API error: ${JSON.stringify(json.error).slice(0, 200)}`);
    const records = json.result?.records ?? [];
    for (const r of records) {
      const key = `${first(r.owner_org)}:${first(r.ref_number)}`;
      const prev = latest.get(key);
      if (!prev || Number(r.amendment_number) >= Number(prev.amendment_number)) {
        if (prev) yield { skip: "superseded amendment" };
        latest.set(key, r);
      } else yield { skip: "superseded amendment" };
    }
    await ctx.progress(`Read ${((page + 1) * PAGE).toLocaleString("en-CA")} grant rows`);
    const oldest = first(records.at(-1)?.agreement_start_date).slice(0, 10);
    // Sorted newest first: stop once a page reaches past the 12-month cutoff.
    if (records.length < PAGE || (oldest && oldest < ctx.cutoff)) break;
  }
  for (const r of latest.values()) yield mapGrant(r, ctx);
}

export const federalGrants: IngestSource = {
  source: "federal_grant",
  label: "Federal grants and contributions",
  description: "Government of Canada grants and contributions to Ontario businesses in industrial sectors (manufacturing, wholesale, transport and warehousing), last 12 months, at or above the minimum value.",
  run,
};
