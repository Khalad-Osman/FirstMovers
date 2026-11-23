import { arcgisQuery } from "./arcgis";
import { resolveOccupier } from "./occupier";
import { strengthFrom } from "./permits";
import { isoFromEpoch, money, type IngestContext, type IngestItem, type IngestSource } from "./types";

// Caledon and Oakville building permits (added 2026-11-23). Both publish
// permits *and applications still in review* (AMANDA permit systems), so an
// application is stored with raw.stage = "application" and its received date;
// when the permit is issued the same record id updates in place.
// Occupiers are resolved from the description text only (CLAUDE.md §5).

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v == null ? "" : String(v));
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Revisions, phased and conditional permits repeat the main permit.
const DUPLICATE_WORK = /^(?:conditional|phase|change of scope|material change|permit revision)\b/i;
const CLOSED_OUT = /cancel|revok|withdrawn|refused|denied/i;

type Stage = "issued" | "application";

function stageOf(issued: string | null, today: string): Stage {
  return issued && issued <= today ? "issued" : "application";
}

function titleFor(city: string, stage: Stage, status: string, work: string, address: string) {
  const what = `${work || "permit"} at ${address || "unknown address"}`;
  return stage === "issued" ? `${city} permit: ${what}` : `${city} permit application (${status.toLowerCase() || "in review"}): ${what}`;
}

// ---------- Caledon ------------------------------------------------------------
// Town of Caledon "AMANDA Building Permits" layer (checked 2026-11-23: current to
// the week, FOLDERTYPE INDU = industrial, ~70 industrial records a year incl.
// applications under review). Published through an ArcGIS utility proxy.
export const CALEDON =
  "https://utility.arcgis.com/usrsvcs/servers/51b993780db441b083808ed0bd59a554/rest/services/AGOL/MiscLayers/MapServer/0";

export function mapCaledon(a: Record<string, unknown>, ctx: Pick<IngestContext, "today" | "cutoff">): IngestItem {
  const id = str(a.CUSTOMFOLDERNUMBER);
  if (!id) return { skip: "no permit number" };
  const status = str(a.STATUSDESC);
  if (CLOSED_OUT.test(status) || a.CANCELDATE || a.REVOKEDATE) return { skip: "cancelled or revoked" };
  const work = str(a.WORKDESC);
  if (DUPLICATE_WORK.test(work) || /permit revision/i.test(str(a.SUBDESC))) return { skip: "revision or phase of another permit" };
  const issued = isoFromEpoch(a.ISSUEDATE);
  const applied = isoFromEpoch(a.INDATE);
  const stage = stageOf(issued, ctx.today);
  const date = stage === "issued" ? issued : applied;
  if (!date) return { skip: "no date" };
  if (date < ctx.cutoff) return { skip: "older than 12 months" };
  if (date > ctx.today) return { skip: "dated in the future" };
  const description = str(a.FOLDERDESCRIPTION);
  const address = str(a.FOLDERNAME) || str(a.FULLADDRESS);
  const occupier = resolveOccupier(description);
  const value = num(a.CONSTVALUE);
  const area = num(a.WORKAREA);
  return {
    row: {
      source_type: "permit_caledon",
      source_record_id: id,
      raw_entity_name: occupier.name,
      entity_key: occupier.entityKey,
      occupier_status: occupier.status,
      signal_strength: strengthFrom(work, description),
      title: titleFor("Caledon", stage, status, work, address),
      summary: [description, str(a.SUBDESC), status && `Status: ${status}`, value ? `Est. value ${money(value)}` : null, area ? `Work area ${area} m²` : null]
        .filter(Boolean)
        .join(". "),
      url: null,
      published_at: date,
      event_at: null,
      location: address ? `${address}, Caledon, Ontario` : "Caledon, Ontario",
      raw: { ...a, stage, applied_at: applied, issued_at: issued },
    },
  };
}

async function* runCaledon(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Querying Caledon permits and applications");
  for await (const a of arcgisQuery(ctx.fetchImpl, CALEDON, {
    where: `FOLDERTYPE = 'INDU' AND (ISSUEDATE >= DATE '${ctx.cutoff}' OR INDATE >= DATE '${ctx.cutoff}')`,
    outFields: ["OBJECTID", "CUSTOMFOLDERNUMBER", "STATUSDESC", "WORKDESC", "FOLDERTYPE", "SUBDESC", "INDATE", "ISSUEDATE", "FOLDERNAME", "FULLADDRESS", "FOLDERDESCRIPTION", "CONSTVALUE", "WORKAREA", "NOSTOREY", "STATCANBUILDINGCODEDESC", "STATCANWORKCODEDESC", "CANCELDATE", "REVOKEDATE"],
    orderBy: "OBJECTID",
    pageSize: 1000,
  })) {
    yield mapCaledon(a, ctx);
  }
}

// ---------- Oakville -----------------------------------------------------------
// Town of Oakville "Building Permits" FeatureServer (checked 2026-11-23: updated
// daily, ~5,600 permits and applications a year, all building types). There is
// no clean industrial field (FOLDERTYPE / Subtype are mostly blank or residential),
// so industrial work is recognised from the description and subtype text.
export const OAKVILLE = "https://services5.arcgis.com/QJebCdoMf4PF8fJP/arcgis/rest/services/Building_Permits/FeatureServer/0";

const OAK_INDUSTRIAL = /industr|warehous|manufactur|factory|distribution (?:cent|facility)|logistic|\bF[23]\b|group[- ]f\b|production facility/i;
const OAK_NOT = /dwelling|\bhouse\b|town ?house|apartment|restaurant|school|daycare|medical|dental|hospital|retirement|retail|stores?\b|supermarket|gymnas|fitness|community hall|beauty|barber|physio/i;
const OAK_NOT_TEXT = /wastewater|water treatment|garden cent|nursery stock/i;

export function isOakvilleIndustrial(a: Record<string, unknown>): boolean {
  const subtype = str(a.Subtype);
  const text = `${subtype} ${str(a.FOLDERDESCRIPTION)}`;
  return OAK_INDUSTRIAL.test(text) && !OAK_NOT.test(subtype) && !OAK_NOT_TEXT.test(text);
}

export function mapOakville(a: Record<string, unknown>, ctx: Pick<IngestContext, "today" | "cutoff">): IngestItem {
  const id = str(a.CUSTOMFOLDERNUMBER);
  if (!id) return { skip: "no permit number" };
  if (!isOakvilleIndustrial(a)) return { skip: "not industrial" };
  const status = str(a.Status);
  if (CLOSED_OUT.test(status)) return { skip: "cancelled or revoked" };
  const work = str(a.Worktype) || str(a.AdjustedWorktype);
  if (DUPLICATE_WORK.test(work)) return { skip: "revision or phase of another permit" };
  const issued = isoFromEpoch(a.ISSUEDATE);
  const applied = isoFromEpoch(a.INDATE);
  const stage = stageOf(issued, ctx.today);
  const date = stage === "issued" ? issued : applied;
  if (!date) return { skip: "no date" };
  if (date < ctx.cutoff) return { skip: "older than 12 months" };
  if (date > ctx.today) return { skip: "dated in the future" };
  const description = str(a.FOLDERDESCRIPTION).replace(/&ndash;/g, "–").replace(/&[lr]dquo;/g, '"');
  const address = str(a.FOLDERNAME);
  const occupier = resolveOccupier(description);
  const value = num(a.Construction_Value);
  const gfa = num(a.GFA);
  return {
    row: {
      source_type: "permit_oakville",
      source_record_id: id,
      raw_entity_name: occupier.name,
      entity_key: occupier.entityKey,
      occupier_status: occupier.status,
      signal_strength: strengthFrom(work, description),
      title: titleFor("Oakville", stage, status, work, address),
      summary: [description, str(a.Subtype), status && `Status: ${status}`, value ? `Est. value ${money(value)}` : null, gfa ? `GFA ${gfa} m²` : null]
        .filter(Boolean)
        .join(". "),
      url: null,
      published_at: date,
      event_at: null,
      location: address ? `${address}, Oakville, Ontario` : "Oakville, Ontario",
      raw: { ...a, FOLDERDESCRIPTION: description, stage, applied_at: applied, issued_at: issued },
    },
  };
}

async function* runOakville(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Querying Oakville permits and applications");
  let n = 0;
  for await (const a of arcgisQuery(ctx.fetchImpl, OAKVILLE, {
    where: `ISSUEDATE >= DATE '${ctx.cutoff}' OR INDATE >= DATE '${ctx.cutoff}'`,
    outFields: ["OBJECTID_1", "CUSTOMFOLDERNUMBER", "FOLDERDESCRIPTION", "FOLDERNAME", "FOLDERTYPE", "Subtype", "Worktype", "AdjustedWorktype", "INDATE", "ISSUEDATE", "Status", "StatusGroup", "Construction_Value", "GFA", "Number_of_Storeys"],
    orderBy: "OBJECTID_1",
    pageSize: 1000,
  })) {
    if (++n % 1000 === 0) await ctx.progress(`Read ${n} Oakville records`);
    yield mapOakville(a, ctx);
  }
}

export const caledonPermits: IngestSource = {
  source: "permit_caledon",
  label: "Caledon building permits",
  description: "Industrial permits issued, and applications received, in the last 12 months (applications are an earlier stage).",
  run: runCaledon,
};
export const oakvillePermits: IngestSource = {
  source: "permit_oakville",
  label: "Oakville building permits",
  description: "Industrial permits issued, and applications received, in the last 12 months, recognised from the permit description.",
  run: runOakville,
};
