import { BRAMPTON, CKAN, MISSISSAUGA, TORONTO_RESOURCES } from "@/lib/ingest/permits";
import { signalWeight, type SignalForCandidate } from "@/lib/discovery/candidates";

// Stored signals (building permits, contract awards) as analysis evidence.
// No AI: each record becomes a source whose excerpt is built from the record's
// own fields and whose URL opens that record at the publisher.

export type RecordSignal = SignalForCandidate & { source_record_id: string };

export const MAX_RECORDS = 3; // on top of up to 5 web sources (decided 2026-11-16)
export const RECORD_MONTHS = 24; // older records would be Historical anyway
const EXCERPT_MAX = 2500;

export type RecordSource = {
  signalId: string;
  url: string;
  publisher: string;
  title: string;
  publishedAt: string | null;
  eventAt: string | null;
  excerpt: string;
};

const PUBLISHER: Record<string, string> = {
  canadabuys_award: "CanadaBuys – Award notice",
  permit_mississauga: "City of Mississauga – Building permits",
  permit_brampton: "City of Brampton – Building permits",
  permit_toronto: "City of Toronto – Building permits",
  federal_grant: "Government of Canada – Grants and contributions",
};

const KIND: Record<string, string> = {
  canadabuys_award: "Federal contract award notice (CanadaBuys open data)",
  federal_grant: "Federal grant or contribution agreement (Proactive Disclosure open data)",
  permit_mississauga: "Issued building permit (City of Mississauga open data)",
  permit_brampton: "Issued building permit (City of Brampton open data)",
  permit_toronto: "Issued building permit (City of Toronto open data)",
};

const STRENGTH_LABEL: Record<string, string> = {
  new_building: "New building",
  addition: "Addition",
  change_of_use: "Change of use",
  alteration: "Alteration",
  demolition: "Demolition",
  sign: "Sign",
  award: "Contract award",
  grant: "Grant or contribution",
  other: "Other",
};

const raw = (s: RecordSignal): Record<string, unknown> =>
  s.raw && typeof s.raw === "object" && !Array.isArray(s.raw) ? (s.raw as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v == null ? "" : String(v));

function permitNumber(s: RecordSignal): string {
  // Toronto ids are "PERMIT_NUM:REVISION_NUM"
  return s.source_type === "permit_toronto" ? s.source_record_id.split(":")[0] : s.source_record_id;
}

// A link that opens this one record at the publisher.
export function recordUrl(s: RecordSignal): string | null {
  const q = (base: string, params: Record<string, string>) => `${base}?${new URLSearchParams(params)}`;
  const id = permitNumber(s);
  switch (s.source_type) {
    case "canadabuys_award":
    case "federal_grant":
      return s.url;
    case "permit_mississauga":
      return q(`${MISSISSAUGA}/query`, { where: `BP_NO='${id.replace(/'/g, "''")}'`, outFields: "*", f: "html" });
    case "permit_brampton": // HTML output is disabled on this server; JSON shows the same record
      return q(`${BRAMPTON}/query`, { where: `PERMITNUMBER='${id.replace(/'/g, "''")}'`, outFields: "*", f: "pjson" });
    case "permit_toronto": {
      const resource = str(raw(s)._resource_id) || TORONTO_RESOURCES[0].id;
      const filters: Record<string, string> = { PERMIT_NUM: id };
      const rev = str(raw(s).REVISION_NUM);
      if (rev) filters.REVISION_NUM = rev;
      return q(CKAN, { resource_id: resource, filters: JSON.stringify(filters) });
    }
    default:
      return null;
  }
}

// Fields never copied into the excerpt: internal ids, and builder/contractor
// names, which are not the occupier (CLAUDE.md §5).
const SKIP_FIELD = /^(objectid|_id|_resource_id|globalid|shape.*|builder.*|contractor.*|x|y|geo_id|ward_grid)$/i;

function fieldValue(key: string, v: unknown): string {
  if (typeof v === "number" && /date/i.test(key) && v > 1e11) return new Date(v).toISOString().slice(0, 10);
  return str(v);
}

// CanadaBuys rows are bilingual; keep the English columns that matter.
const AWARD_FIELDS: [string, string][] = [
  ["Title", "title-titre-eng"],
  ["Reference number", "referenceNumber-numeroReference"],
  ["Contract number", "contractNumber-numeroContrat"],
  ["Supplier", "supplierLegalName-nomLegalFournisseur-eng"],
  ["Supplier city", "supplierAddressCity-fournisseurAdresseVille-eng"],
  ["Award date", "contractAwardDate-dateAttributionContrat"],
  ["Publication date", "publicationDate-datePublication"],
  ["Contract amount", "contractAmount-montantContrat"],
  ["Total contract value", "totalContractValue-valeurTotaleContrat"],
  ["Currency", "contractCurrency-contratMonnaie"],
  ["Goods", "gsinDescription-nibsDescription-eng"],
  ["Procurement category", "procurementCategory-categorieApprovisionnement"],
  ["Buyer", "contractingEntityName-nomEntitContractante-eng"],
  ["Regions of delivery", "regionsOfDelivery-regionsLivraison-eng"],
];

const GRANT_FIELDS: [string, string][] = [
  ["Recipient legal name", "recipient_legal_name"],
  ["Recipient city", "recipient_city"],
  ["Program", "prog_name_en"],
  ["Program purpose", "prog_purpose_en"],
  ["Agreement title", "agreement_title_en"],
  ["Agreement value", "agreement_value"],
  ["Agreement start date", "agreement_start_date"],
  ["Agreement end date", "agreement_end_date"],
  ["Project description", "description_en"],
  ["Expected results", "expected_results_en"],
  ["Industry (NAICS)", "naics_identifier"],
  ["Department", "owner_org_title"],
  ["Reference number", "ref_number"],
  ["Amendment number", "amendment_number"],
];

// The excerpt: labelled fields copied from the record, no interpretation.
export function recordExcerpt(s: RecordSignal): string {
  const r = raw(s);
  const head = [
    `Record type: ${KIND[s.source_type] ?? s.source_type}`,
    `Record number: ${permitNumber(s)}`,
    s.published_at
      ? s.source_type === "federal_grant"
        ? `Agreement start: ${s.published_at} (the disclosure data has no separate publication date)`
        : `${s.source_type === "canadabuys_award" ? "Published" : "Issued"}: ${s.published_at}`
      : null,
    s.event_at ? `Awarded: ${s.event_at}` : null,
    s.location ? `Location: ${s.location}` : null,
    `Work or record class: ${STRENGTH_LABEL[s.signal_strength] ?? s.signal_strength}`,
    s.raw_entity_name ? `Business named in the record: ${s.raw_entity_name}` : null,
    s.summary ? `Summary: ${s.summary}` : null,
  ].filter(Boolean);

  const fields =
    s.source_type === "canadabuys_award"
      ? AWARD_FIELDS.map(([label, key]) => [label, str(r[key]).replace(/\*/g, "")] as const)
      : s.source_type === "federal_grant"
        ? GRANT_FIELDS.map(([label, key]) => [label, str(r[key]).replace(/\s*\|\s*/g, " / ")] as const)
        : Object.entries(r)
          .filter(([k]) => !SKIP_FIELD.test(k))
          .map(([k, v]) => [k, fieldValue(k, v)] as const);
  const lines = fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);

  const text = [...head, "", "Record fields:", ...lines].join("\n");
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX)}\n[record truncated]` : text;
}

export function toRecordSource(s: RecordSignal): RecordSource | null {
  const url = recordUrl(s);
  if (!url) return null;
  return {
    signalId: s.id,
    url,
    publisher: PUBLISHER[s.source_type] ?? s.source_type,
    title: s.title || `${PUBLISHER[s.source_type] ?? "Record"} ${permitNumber(s)}`,
    publishedAt: s.published_at,
    eventAt: s.event_at && s.event_at !== s.published_at ? s.event_at : null,
    excerpt: recordExcerpt(s),
  };
}

function monthsBefore(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

const dateOf = (s: RecordSignal) => s.event_at ?? s.published_at ?? "";
const REVISION_OF = /revision to (?:bp\s*)?([0-9]{2}-[0-9]+)/i;

// Pick the records to analyze: recent, strongest first, one per permit.
// `mustInclude` (the signal that surfaced a company in discovery) always goes first.
export function selectRecords(
  signals: (RecordSignal)[],
  opts: { today: string; max?: number; mustInclude?: string | null },
): (RecordSignal)[] {
  const cutoff = monthsBefore(opts.today, RECORD_MONTHS);
  const max = opts.max ?? MAX_RECORDS;

  // Toronto: keep the highest revision of each permit.
  const latest = new Map<string, RecordSignal>();
  for (const s of signals) {
    if (s.id !== opts.mustInclude && (!dateOf(s) || dateOf(s) < cutoff || dateOf(s) > opts.today)) continue;
    const key = `${s.source_type}:${permitNumber(s)}`;
    const prev = latest.get(key);
    const rev = (x: RecordSignal) => Number(x.source_record_id.split(":")[1] ?? 0) || 0;
    if (!prev || rev(s) > rev(prev)) latest.set(key, s);
  }
  let pool = [...latest.values()];

  // Mississauga: a "REVISION TO BP 25-11208" permit repeats its original when both are present.
  const numbers = new Set(pool.map((s) => s.source_record_id.match(/([0-9]{2}-[0-9]+)$/)?.[1]).filter(Boolean));
  pool = pool.filter((s) => {
    const ref = (s.summary ?? "").match(REVISION_OF)?.[1];
    return s.id === opts.mustInclude || !ref || !numbers.has(ref);
  });

  pool.sort((a, b) => {
    if (a.id === opts.mustInclude) return -1;
    if (b.id === opts.mustInclude) return 1;
    return signalWeight(b).weight - signalWeight(a).weight || dateOf(b).localeCompare(dateOf(a));
  });
  return pool.slice(0, max);
}
