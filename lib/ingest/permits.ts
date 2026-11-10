import { arcgisQuery } from "./arcgis";
import { resolveOccupier } from "./occupier";
import { isoFromEpoch, money, type IngestContext, type IngestItem, type IngestSource, type SignalStrength } from "./types";

// Building permits: Mississauga (ArcGIS), Brampton (ArcGIS), Toronto (CKAN).
// None of them names the occupier; the shared resolveOccupier() looks for a
// business named in the permit text. Builder / contractor fields are kept in
// `raw` only and never treated as the occupier (CLAUDE.md §5).

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v == null ? "" : String(v));

export function strengthFrom(text: string): SignalStrength {
  const t = text.toLowerCase();
  if (/change of use/.test(t)) return "change_of_use";
  if (/\bsign|billboard/.test(t)) return "sign";
  if (/demoli/.test(t)) return "demolition";
  if (/addition/.test(t)) return "addition";
  if (/new (?:complete |shell )?building|^new$|new construction|new bldg/.test(t)) return "new_building";
  if (/alteration|renovation|interior|unit finish|fit[- ]?out|tenant/.test(t)) return "alteration";
  return "other";
}

// ---------- Mississauga --------------------------------------------------------
// services6.arcgis.com …/Issued_Building_Permits/FeatureServer/0 (checked 2026-11-10:
// 35,390 permits, latest issued 2026-10-30). FILE_TYPE = 'INDUSTRIAL' selects
// industrial buildings (single- and multi-tenant).
const MISSISSAUGA =
  "https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Issued_Building_Permits/FeatureServer/0";

export function mapMississauga(a: Record<string, unknown>, ctx: Pick<IngestContext, "today">): IngestItem {
  const permit = str(a.BP_NO);
  const issued = isoFromEpoch(a.ISSUE_DATE);
  if (!permit) return { skip: "no permit number" };
  if (issued && issued > ctx.today) return { skip: "issue date in the future" };
  const scope = str(a.SCOPE);
  const description = str(a.DESCRIPTION);
  const address = [str(a.ADDRESS), str(a.UNIT_NO) && `Unit ${str(a.UNIT_NO)}`].filter(Boolean).join(", ");
  const occupier = resolveOccupier(description);
  const value = Number(a.EST_CON_VALUE) || 0;
  return {
    row: {
      source_type: "permit_mississauga",
      source_record_id: permit,
      raw_entity_name: occupier.name,
      entity_key: occupier.entityKey,
      occupier_status: occupier.status,
      signal_strength: strengthFrom(`${scope} ${description}`),
      title: `Mississauga permit: ${scope || "permit"} at ${address || "unknown address"}`,
      summary: [description, str(a.BLDG_TYPE), value ? `Est. value ${money(value)}` : null, a.APPL_AREA ? `Area ${a.APPL_AREA} m²` : null]
        .filter(Boolean)
        .join(". "),
      url: null,
      published_at: issued,
      event_at: null,
      location: address ? `${address}, Mississauga, Ontario` : "Mississauga, Ontario",
      raw: a,
    },
  };
}

async function* runMississauga(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Querying Mississauga permits");
  let n = 0;
  for await (const a of arcgisQuery(ctx.fetchImpl, MISSISSAUGA, {
    where: `FILE_TYPE = 'INDUSTRIAL' AND ISSUE_DATE >= DATE '${ctx.cutoff}'`,
    outFields: ["BP_NO", "STATUS", "ADDRESS", "UNIT_NO", "DESCRIPTION", "SCOPE", "FILE_TYPE", "BLDG_TYPE", "APP_DETAIL", "APPL_AREA", "STOREYS", "EST_CON_VALUE", "POSTAL_CODE", "WARD", "APPLICATION_DATE", "ISSUE_DATE", "COMPLETE_DATE"],
    orderBy: "OBJECTID",
    pageSize: 2000,
  })) {
    if (++n % 500 === 0) await ctx.progress(`Read ${n} Mississauga permits`);
    yield mapMississauga(a, ctx);
  }
}

// ---------- Brampton -----------------------------------------------------------
// maps1.brampton.ca …/BuildingPermit/Building_Permits/MapServer/0 (checked
// 2026-11-10: 224k permits, current despite the old portal date). Industrial
// permits use Ontario Building Code group F (F1/F2/F3) in SUBDESC. No free-text
// description, so occupiers stay unresolved.
const BRAMPTON = "https://maps1.brampton.ca/arcgis/rest/services/BuildingPermit/Building_Permits/MapServer/0";

export function mapBrampton(a: Record<string, unknown>, ctx: Pick<IngestContext, "today">): IngestItem {
  const permit = str(a.PERMITNUMBER);
  const issued = isoFromEpoch(a.ISSUEDATE);
  if (!permit) return { skip: "no permit number" };
  if (issued && issued > ctx.today) return { skip: "issue date in the future" };
  const work = str(a.WORKDESC);
  const use = str(a.SUBDESC);
  const address = str(a.ADDRESS);
  return {
    row: {
      source_type: "permit_brampton",
      source_record_id: permit,
      raw_entity_name: null,
      entity_key: null,
      occupier_status: "unresolved",
      signal_strength: strengthFrom(work),
      title: `Brampton permit: ${work || "permit"} at ${address || "unknown address"}`,
      summary: [use, str(a.STATUSDESC) && `Status: ${str(a.STATUSDESC)}`, str(a.GFA) && `GFA ${str(a.GFA)}`].filter(Boolean).join(". "),
      url: null,
      published_at: issued,
      event_at: null,
      location: address ? `${address}, Brampton, Ontario` : "Brampton, Ontario",
      raw: a,
    },
  };
}

async function* runBrampton(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Querying Brampton permits");
  const seen = new Set<string>();
  for await (const a of arcgisQuery(ctx.fetchImpl, BRAMPTON, {
    where: `ISSUEDATE >= DATE '${ctx.cutoff}' AND (SUBDESC LIKE 'F1%' OR SUBDESC LIKE 'F2%' OR SUBDESC LIKE 'F3%')`,
    outFields: ["OBJECTID", "ADDRESS", "PERMITNUMBER", "SUBDESC", "WORKDESC", "ISSUEDATE", "INDATE", "STATUSDESC", "BUILDER", "CONTRACTOR", "GFA", "STOREYS"],
    orderBy: "OBJECTID",
    pageSize: 1000,
  })) {
    const id = str(a.PERMITNUMBER);
    if (id && seen.has(id)) {
      yield { skip: "duplicate permit row" };
      continue;
    }
    seen.add(id);
    yield mapBrampton(a, ctx);
  }
}

// ---------- Toronto ------------------------------------------------------------
// CKAN (checked 2026-11-10): "Building Permits - Active Permits" and "Cleared
// Permits since 2017", both refreshed daily. SQL is disabled, so we page the
// datastore newest-first by ISSUED_DATE and stop at the 12-month cutoff.
const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search";
const TORONTO_RESOURCES = [
  { id: "6d0229af-bc54-46de-9c2b-26759b01dd05", name: "active" },
  { id: "a96c0ba4-3026-402b-b09d-5b1268b8f810", name: "cleared" },
];
const INDUSTRIAL_USE = /industr|warehouse|manufactur|factory|distribution|logistic|plant\b|storage/i;

export function isTorontoIndustrial(r: Record<string, unknown>): boolean {
  if (Number(r.INDUSTRIAL) > 0) return true;
  return INDUSTRIAL_USE.test(`${str(r.CURRENT_USE)} ${str(r.PROPOSED_USE)} ${str(r.STRUCTURE_TYPE)}`);
}

export function mapToronto(r: Record<string, unknown>, ctx: Pick<IngestContext, "today" | "cutoff">): IngestItem {
  const permit = str(r.PERMIT_NUM);
  const issued = str(r.ISSUED_DATE).slice(0, 10) || null;
  if (!permit) return { skip: "no permit number" };
  if (!issued) return { skip: "not issued" };
  if (issued < ctx.cutoff) return { skip: "older than 12 months" };
  if (issued > ctx.today) return { skip: "issue date in the future" };
  if (!isTorontoIndustrial(r)) return { skip: "not industrial" };
  const work = str(r.WORK);
  const description = str(r.DESCRIPTION);
  const address = [str(r.STREET_NUM), str(r.STREET_NAME), str(r.STREET_TYPE), str(r.STREET_DIRECTION)].filter(Boolean).join(" ");
  const occupier = resolveOccupier(description);
  const cost = Number(str(r.EST_CONST_COST).replace(/[^0-9.]/g, "")) || 0;
  const uses = [str(r.CURRENT_USE) && `Current use: ${str(r.CURRENT_USE)}`, str(r.PROPOSED_USE) && `Proposed use: ${str(r.PROPOSED_USE)}`];
  return {
    row: {
      source_type: "permit_toronto",
      source_record_id: `${permit}:${str(r.REVISION_NUM) || "00"}`,
      raw_entity_name: occupier.name,
      entity_key: occupier.entityKey,
      occupier_status: occupier.status,
      signal_strength: strengthFrom(`${work} ${description}`),
      title: `Toronto permit: ${work || str(r.PERMIT_TYPE) || "permit"} at ${address || "unknown address"}`,
      summary: [description, ...uses, cost ? `Est. cost ${money(cost)}` : null].filter(Boolean).join(". "),
      url: null,
      published_at: issued,
      event_at: null,
      location: `${address ? `${address}, ` : ""}Toronto, Ontario${str(r.POSTAL) ? ` ${str(r.POSTAL)}` : ""}`,
      raw: r,
    },
  };
}

async function* runToronto(ctx: IngestContext): AsyncGenerator<IngestItem> {
  const PAGE = 5000;
  for (const res of TORONTO_RESOURCES) {
    await ctx.progress(`Reading Toronto ${res.name} permits`);
    for (let offset = 0; ; offset += PAGE) {
      const qs = new URLSearchParams({ resource_id: res.id, limit: String(PAGE), offset: String(offset), sort: "ISSUED_DATE desc nulls last" });
      const r = await ctx.fetchImpl(`${CKAN}?${qs}`, { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`Toronto CKAN request failed (${r.status})`);
      const json = (await r.json()) as { success?: boolean; result?: { records?: Record<string, unknown>[] }; error?: unknown };
      if (!json.success) throw new Error(`Toronto CKAN error: ${JSON.stringify(json.error).slice(0, 200)}`);
      const records = json.result?.records ?? [];
      let older = 0;
      for (const rec of records) {
        const issued = str(rec.ISSUED_DATE).slice(0, 10);
        if (issued && issued < ctx.cutoff) older++;
        yield mapToronto(rec, ctx);
      }
      await ctx.progress(`Read ${(offset + records.length).toLocaleString("en-CA")} Toronto ${res.name} permits`);
      // Sorted newest first: once a whole page is older than the cutoff, stop.
      if (records.length < PAGE || older === records.length) break;
    }
  }
}

export const mississaugaPermits: IngestSource = {
  source: "permit_mississauga",
  label: "Mississauga building permits",
  description: "Industrial building permits issued in the last 12 months.",
  run: runMississauga,
};
export const bramptonPermits: IngestSource = {
  source: "permit_brampton",
  label: "Brampton building permits",
  description: "Industrial (building code group F) permits issued in the last 12 months. No description text, so occupiers stay unresolved.",
  run: runBrampton,
};
export const torontoPermits: IngestSource = {
  source: "permit_toronto",
  label: "Toronto building permits",
  description: "Active and cleared permits issued in the last 12 months with industrial area or an industrial/warehouse use.",
  run: runToronto,
};
