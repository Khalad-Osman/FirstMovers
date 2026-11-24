import { arcgisQuery } from "./arcgis";
import { resolveOccupier } from "./occupier";
import { strengthFrom } from "./permits";
import { excelDate, readXlsx } from "./xlsx";
import { RETAIL_USE } from "@/lib/sector";
import { isoFromEpoch, money, type IngestContext, type IngestItem, type IngestSource, type SignalRow, type SourceType } from "./types";

// Building permits from Ontario cities outside the GTA (added 2026-11-23, for
// the team's call list): Kitchener, Waterloo, Kingston, Barrie and Ottawa.
// Same rules as the GTA permit sources: industrial permits are kept (named or
// address-only); retail permits only when the text names the business.
// Occupiers come from the description only (CLAUDE.md §5), using the wording
// these offices write (OUTSIDE_GTA_PATTERNS in occupier.ts).

type Ctx = Pick<IngestContext, "today" | "cutoff">;
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v == null ? "" : String(v));
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
// Some layers store "no date" as 0 (1970-01-01).
const epochDate = (v: unknown) => {
  const d = isoFromEpoch(v);
  return d && d > "1980-01-01" ? d : null;
};
const CLOSED_OUT = /cancel|revok|withdrawn|refused|denied/i;

type Parts = {
  source: SourceType;
  city: string;
  id: string;
  status: string;
  work: string;
  description: string;
  use: string;
  address: string;
  issued: string | null;
  applied: string | null;
  value: number | null;
  area: number | null;
  industrial: boolean;
  url: string | null;
  raw: Record<string, unknown>;
};

// Shared mapping once a city's fields are read.
export function permitRow(p: Parts, ctx: Ctx): IngestItem {
  if (!p.id) return { skip: "no permit number" };
  if (CLOSED_OUT.test(p.status) || /^cancelled:/i.test(p.description)) return { skip: "cancelled or revoked" };
  // Tent sales and seasonal garden centres are not a space signal.
  if (/\btemporary\b|\btents?\b/i.test(`${p.work} ${p.description}`)) return { skip: "temporary structure" };
  const stage = p.issued && p.issued <= ctx.today ? "issued" : "application";
  const date = stage === "issued" ? p.issued : p.applied;
  if (!date) return { skip: "no date" };
  if (date < ctx.cutoff) return { skip: "older than 12 months" };
  if (date > ctx.today) return { skip: "dated in the future" };
  const occupier = resolveOccupier(p.description, { outsideGta: true });
  if (!p.industrial && !occupier.name) return { skip: "retail: no business named" };
  const what = `${p.work || "permit"} at ${p.address || "unknown address"}`;
  const row: SignalRow = {
    source_type: p.source,
    source_record_id: p.id,
    raw_entity_name: occupier.name,
    entity_key: occupier.entityKey,
    occupier_status: occupier.status,
    signal_strength: strengthFrom(p.work, p.description),
    title: stage === "issued" ? `${p.city} permit: ${what}` : `${p.city} permit application (${p.status.toLowerCase() || "in review"}): ${what}`,
    summary: [p.description, p.use, p.status && `Status: ${p.status}`, p.value ? `Est. value ${money(p.value)}` : null, p.area ? `Area ${p.area} m²` : null]
      .filter(Boolean)
      .join(". "),
    url: p.url,
    published_at: date,
    event_at: null,
    location: p.address ? `${p.address}, ${p.city}, Ontario` : `${p.city}, Ontario`,
    // est_value / area_m2 feed the small-works rule in discovery.
    raw: { ...p.raw, stage, applied_at: p.applied, issued_at: p.issued, est_value: p.value, area_m2: p.area },
    sector: p.industrial ? "industrial" : "retail",
  };
  return { row };
}

// ---------- Kitchener ----------------------------------------------------------
// City of Kitchener "Building Permits" FeatureServer (checked 2026-11-23: current;
// PERMIT_TYPE_CODE ICI = industrial/commercial/institutional; SUB_WORK_TYPE is the
// building use; PERMIT_DESCRIPTION often names the business; APPLICANT is usually
// the architect, so it is never used).
export const KITCHENER = "https://services1.arcgis.com/qAo1OsXi67t7XgmS/arcgis/rest/services/Building_Permits/FeatureServer/0";
const KIT_INDUSTRIAL = /warehouse|manufactur|industrial/i;
const KIT_RETAIL = /retail|restaurant|medical clinic|personal services|service station|car wash|dry cleaner|grocery|motor vehicle/i;

export function mapKitchener(a: Record<string, unknown>, ctx: Ctx): IngestItem {
  const use = str(a.SUB_WORK_TYPE);
  const industrial = KIT_INDUSTRIAL.test(use) || /^industrial building/i.test(str(a.PERMIT_TYPE));
  if (!industrial && !KIT_RETAIL.test(use)) return { skip: "not industrial or retail" };
  return permitRow(
    {
      source: "permit_kitchener",
      city: "Kitchener",
      id: str(a.PERMITNO),
      status: str(a.PERMIT_STATUS),
      work: str(a.WORK_TYPE),
      description: str(a.PERMIT_DESCRIPTION).replace(/^permit is (?:for|to)\s+/i, ""),
      use,
      address: str(a.FOLDERNAME),
      issued: epochDate(a.ISSUE_DATE),
      applied: epochDate(a.APPLICATION_DATE),
      value: num(a.CONSTRUCTION_VALUE),
      area: num(a.TOTAL_GFA_M2) ?? num(a.PROPOSED_GFA),
      industrial,
      url: null,
      raw: a,
    },
    ctx,
  );
}

async function* runKitchener(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Querying Kitchener permits");
  for await (const a of arcgisQuery(ctx.fetchImpl, KITCHENER, {
    where: `(ISSUE_DATE >= DATE '${ctx.cutoff}' OR APPLICATION_DATE >= DATE '${ctx.cutoff}') AND PERMIT_TYPE_CODE <> 'RES'`,
    outFields: ["OBJECTID", "PERMITNO", "PERMIT_TYPE", "PERMIT_TYPE_CODE", "FOLDERNAME", "PERMIT_STATUS", "APPLICATION_DATE", "ISSUE_DATE", "SUB_WORK_TYPE", "WORK_TYPE", "PERMIT_DESCRIPTION", "CONSTRUCTION_VALUE", "TOTAL_GFA_M2", "PROPOSED_GFA"],
    orderBy: "OBJECTID",
    pageSize: 1000,
  })) {
    yield mapKitchener(a, ctx);
  }
}

// ---------- Waterloo -----------------------------------------------------------
// City of Waterloo "Building Permits" FeatureServer (checked 2026-11-23: issued
// permits, current; SUBDESC is the building-code group, e.g. "Industrial (Group F)",
// "Mercantile (Group E)"; DESCRIPTN is free text).
export const WATERLOO = "https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/City_of_Waterloo_Building_Permits/FeatureServer/0";

export function mapWaterloo(a: Record<string, unknown>, ctx: Ctx): IngestItem {
  const use = str(a.SUBDESC);
  const description = str(a.DESCRIPTN);
  const industrial = /group f\b|industrial/i.test(use);
  const retail = /group e\b|mercantile/i.test(use) || (/group [ad]\b/i.test(use) && RETAIL_USE.test(description));
  if (!industrial && !retail) return { skip: "not industrial or retail" };
  return permitRow(
    {
      source: "permit_waterloo",
      city: "Waterloo",
      id: str(a.PERMIT_NUM),
      status: str(a.STATUS),
      // "NewShellOnly" -> "New Shell Only"
      work: str(a.WORKDESC).replace(/([a-z])([A-Z])/g, "$1 $2"),
      description,
      use,
      address: str(a.ADDRESS),
      issued: epochDate(a.ISSUEDATE),
      applied: null,
      value: num(a.CONTRVALUE),
      area: num(a.PROPAREA),
      industrial,
      url: null,
      raw: a,
    },
    ctx,
  );
}

async function* runWaterloo(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Querying Waterloo permits");
  for await (const a of arcgisQuery(ctx.fetchImpl, WATERLOO, {
    where: `ISSUEDATE >= DATE '${ctx.cutoff}'`,
    outFields: ["OBJECTID", "PERMIT_NUM", "ADDRESS", "STATUS", "PERMITDESC", "SUBDESC", "WORKDESC", "DESCRIPTN", "ISSUEDATE", "CONTRVALUE", "PROPAREA"],
    orderBy: "OBJECTID",
    pageSize: 1000,
  })) {
    yield mapWaterloo(a, ctx);
  }
}

// ---------- Kingston -----------------------------------------------------------
// City of Kingston BuildingPermits MapServer (checked 2026-11-23: current,
// includes applications under review; USE_TYPE is the building use;
// PROJECTDESCRIPTION is short and often names the business on signs and fit-ups).
export const KINGSTON = "https://api.cityofkingston.ca/gis_unfed/rest/services/Planning/BuildingPermits_FGDB/MapServer/0";
const KGN_INDUSTRIAL = /storage building|warehouse|plant for manufactur|laboratory\/research/i;
const KGN_RETAIL = /retail|restaurant|motor vehicle showroom|car dealer|barber|beauty|clinic|repair garage|service station/i;

export function mapKingston(a: Record<string, unknown>, ctx: Ctx): IngestItem {
  const use = str(a.USE_TYPE);
  const description = str(a.PROJECTDESCRIPTION);
  const industrial = KGN_INDUSTRIAL.test(use);
  // Medical/dental offices share a use type with banks and offices.
  const retail = KGN_RETAIL.test(use) || (/office building, medical/i.test(use) && RETAIL_USE.test(description));
  if (!industrial && !retail) return { skip: "not industrial or retail" };
  if (/^permit case$/i.test(str(a.TYPE_OF_WORK))) return { skip: "case record (the permits are listed separately)" };
  return permitRow(
    {
      source: "permit_kingston",
      city: "Kingston",
      id: str(a.PERMIT_NUMBER),
      status: str(a.STATUS),
      work: str(a.TYPE_OF_WORK),
      description,
      use,
      address: str(a.ADDRESS),
      issued: epochDate(a.DATE_ISSUE),
      applied: epochDate(a.DATE_APPLICATION),
      value: num(a.TOTALVALUATION),
      area: null,
      industrial,
      url: null,
      raw: a,
    },
    ctx,
  );
}

async function* runKingston(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Querying Kingston permits");
  for await (const a of arcgisQuery(ctx.fetchImpl, KINGSTON, {
    where: `DATE_ISSUE >= DATE '${ctx.cutoff}' OR DATE_APPLICATION >= DATE '${ctx.cutoff}'`,
    outFields: ["OBJECTID", "PERMIT_NUMBER", "STATUS", "PROJECTDESCRIPTION", "USE_TYPE", "TYPE_OF_WORK", "TOTALVALUATION", "DATE_APPLICATION", "DATE_ISSUE", "ADDRESS"],
    orderBy: "OBJECTID",
    pageSize: 1000,
  })) {
    yield mapKingston(a, ctx);
  }
}

// ---------- Barrie -------------------------------------------------------------
// City of Barrie "Issued Building Permits 2018 - Present" MapServer layer
// (checked 2026-11-23: current to the week). Only RECORD_ID, address, Sub_Type,
// Description ("Industrial - New Shell", "Commercial - Interior Alterations")
// and a status date ("YYYY.MM.DD", the issue date for issued permits). Names are rare.
export const BARRIE = "https://gispublic.barrie.ca/arcgis/rest/services/Open_Data/APLI/MapServer/1";

export function mapBarrie(a: Record<string, unknown>, ctx: Ctx): IngestItem {
  const description = str(a.Description);
  const use = str(a.Sub_Type);
  const industrial = /^industrial\b/i.test(description) || /^industrial\b/i.test(use);
  const retail = !industrial && (/^commercial\b/i.test(description) || /^commercial\b|^sign permit/i.test(use));
  if (!industrial && !retail) return { skip: "not industrial or retail" };
  // "Industrial - Alteration - New Sprinkler System": the second part is the work.
  const parts = description.split(/\s+-\s+/);
  return permitRow(
    {
      source: "permit_barrie",
      city: "Barrie",
      id: str(a.RECORD_ID),
      status: str(a.RECORD_STATUS),
      work: parts[1] ?? use,
      description,
      use,
      address: str(a.Full_Address),
      issued: excelDate(str(a.Date_Status)),
      applied: null,
      value: null,
      area: null,
      industrial,
      url: null,
      raw: a,
    },
    ctx,
  );
}

async function* runBarrie(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Querying Barrie permits");
  for await (const a of arcgisQuery(ctx.fetchImpl, BARRIE, {
    where: `Date_Status >= '${ctx.cutoff.replace(/-/g, ".")}'`,
    outFields: ["OBJECTID", "RECORD_ID", "Full_Address", "Sub_Type", "PARENT_RECORD_ID", "Description", "RECORD_STATUS", "Date_Status"],
    orderBy: "OBJECTID",
    pageSize: 1000,
  })) {
    yield mapBarrie(a, ctx);
  }
}

// ---------- Ottawa -------------------------------------------------------------
// City of Ottawa "Construction, Demolition, and Pool Permits" monthly Excel files
// (checked 2026-11-23: one file per year on ArcGIS Online, a sheet per month,
// updated on the 20th; the previous year sits in a "2024 to 2025" file). Issued
// permits only; one row per address, so a permit can repeat. BUILDING TYPE is
// Industrial / Retail / Commercial / Office …; the business is sometimes named in
// brackets at the end of the description. No per-permit page: the url is the file.
const OTTAWA_ORG = "G6F8XLCl5KtAlZ2G";
const itemPage = (id: string) => `https://www.arcgis.com/home/item.html?id=${id}`;

export function ottawaWork(description: string): string {
  const d = description.toLowerCase();
  if (/change of use/.test(d)) return "change of use";
  if (/\baddition\b/.test(d)) return "addition";
  if (/^(?:partial permit:\s*)?construct\b/.test(d)) return "new building";
  if (/^demolish/.test(d)) return "demolition";
  if (/\bsigns?\b/.test(d)) return "sign";
  if (/^plumbing only/.test(d)) return "plumbing";
  return "alteration";
}

type OttawaRow = Record<string, string | number | null>;

export function mapOttawa(r: OttawaRow, ctx: Ctx, url: string | null): IngestItem {
  const description = str(r["DESCRIPTION"]);
  if (/^revision:/i.test(description)) return { skip: "revision of another permit" };
  if (/^plumbing only/i.test(description)) return { skip: "plumbing only" };
  const type = str(r["BUILDING TYPE"]);
  const industrial = /^industrial/i.test(type) || (/\b(?:industrial|warehouse|manufactur)/i.test(description) && !/^(?:retail|office|apartment|single|rowhouse)/i.test(type));
  const retail = !industrial && /^(?:retail|commercial)/i.test(type);
  if (!industrial && !retail) return { skip: "not industrial or retail" };
  const value = typeof r["VALUE"] === "number" ? r["VALUE"] : num(r["VALUE"]);
  const area = typeof r["SQUARE METRES"] === "number" ? r["SQUARE METRES"] : num(r["SQUARE METRES"]);
  return permitRow(
    {
      source: "permit_ottawa",
      city: "Ottawa",
      id: str(r["PERMIT NUMBER"]),
      status: "Issued",
      work: ottawaWork(description),
      description,
      use: type,
      address: str(r["STREET ADDRESS"]),
      issued: excelDate(r["ISSUED DATE"]),
      applied: null,
      value: value && value > 0 ? value : null,
      area: area && area > 0 ? area : null,
      industrial,
      url,
      raw: { ...r, community: r["COMMUNITY"] },
    },
    ctx,
  );
}

// The rows of one workbook, keyed by the header row that names PERMIT NUMBER.
export function ottawaRows(buf: Buffer): OttawaRow[] {
  const out: OttawaRow[] = [];
  for (const sheet of readXlsx(buf)) {
    const h = sheet.rows.findIndex((row) => row.some((c) => str(c).toUpperCase() === "PERMIT NUMBER"));
    if (h < 0) continue;
    const header = sheet.rows[h].map((c) => str(c).toUpperCase());
    for (const row of sheet.rows.slice(h + 1)) {
      const o: OttawaRow = {};
      header.forEach((k, i) => k && (o[k] = row[i] ?? null));
      if (str(o["PERMIT NUMBER"])) out.push(o);
    }
  }
  return out;
}

// This year's file and the one holding last year.
export function pickOttawaFiles(items: { id: string; title: string; name?: string }[], today: string): { id: string; title: string }[] {
  const year = Number(today.slice(0, 4));
  const covers = (t: string, y: number) => new RegExp(String.raw`\b${y}\b`).test(t);
  const pick = (y: number) => items.find((i) => /permit/i.test(i.title) && /\.xlsx$/i.test(i.name ?? ".xlsx") && covers(i.title, y));
  return [pick(year), pick(year - 1)].filter((i, n, all): i is { id: string; title: string } => Boolean(i) && all.findIndex((x) => x?.id === i!.id) === n);
}

async function* runOttawa(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Finding Ottawa permit files");
  const q = new URLSearchParams({ q: `title:"permits" AND orgid:${OTTAWA_ORG} AND type:"Microsoft Excel"`, f: "json", num: "50" });
  const res = await ctx.fetchImpl(`https://www.arcgis.com/sharing/rest/search?${q}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Ottawa file search failed (${res.status})`);
  const items = ((await res.json()) as { results?: { id: string; title: string; name?: string }[] }).results ?? [];
  const files = pickOttawaFiles(items, ctx.today);
  if (!files.length) throw new Error("No Ottawa permit file found for this year.");
  const seen = new Set<string>();
  for (const f of files) {
    await ctx.progress(`Reading ${f.title}`);
    const data = await ctx.fetchImpl(`https://www.arcgis.com/sharing/rest/content/items/${f.id}/data`, { signal: AbortSignal.timeout(120_000) });
    if (!data.ok) throw new Error(`Ottawa file download failed (${data.status})`);
    for (const r of ottawaRows(Buffer.from(await data.arrayBuffer()))) {
      const id = str(r["PERMIT NUMBER"]);
      if (seen.has(id)) {
        yield { skip: "same permit at another address" };
        continue;
      }
      seen.add(id);
      yield mapOttawa(r, ctx, itemPage(f.id));
    }
  }
}

const src = (source: SourceType, label: string, description: string, run: IngestSource["run"]): IngestSource => ({ source, label, description, run });
export const kitchenerPermits = src("permit_kitchener", "Kitchener building permits", "Industrial permits, and retail permits that name the business, issued or applied for in the last 12 months.", runKitchener);
export const waterlooPermits = src("permit_waterloo", "Waterloo building permits", "Industrial (Group F) permits, and retail permits that name the business, issued in the last 12 months.", runWaterloo);
export const kingstonPermits = src("permit_kingston", "Kingston building permits", "Industrial permits, and retail permits that name the business, issued or applied for in the last 12 months.", runKingston);
export const barriePermits = src("permit_barrie", "Barrie building permits", "Industrial permits, and commercial permits that name the business, issued in the last 12 months.", runBarrie);
export const ottawaPermits = src("permit_ottawa", "Ottawa building permits", "Industrial permits, and retail permits that name the business, from the City's monthly permit files (this year and last).", runOttawa);
