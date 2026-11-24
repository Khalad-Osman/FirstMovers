import { arcgisQuery } from "./arcgis";
import { normalizeCompanyName } from "@/lib/research/normalize";
import type { IngestContext, IngestItem, IngestSource, SignalRow } from "./types";

// AGCO cannabis retail store authorizations (added 2026-11-23, retail).
// The AGCO's public store map (agco.ca "Status of current cannabis retail store
// applications") is backed by four ArcGIS layers, refreshed daily (checked
// 2026-11-23): applications in progress (72), in public notice (10), authorized
// to open (1,916) and cancelled authorizations (682). Fields: PremisesName,
// Address, City, ApplicationStatus, PublicNoticeDate ("From Nov 14, 2026 to
// Nov 28, 2026", else "To be Determined" or "."), Website.
//
// The layers are a snapshot with no application, authorization or cancellation
// dates. So:
// - A new store (in progress or public notice) is dated by its public notice
//   start, else by the day this app first saw it in the list (raw.date_basis says
//   which). A store already tracked that becomes "authorized to open" is updated.
// - A cancelled authorization (a store closing: vacated space) is dated by the
//   day this app first saw it cancelled. Stores already cancelled on the first
//   run have no date (we can't tell when they closed) and never look recent.
export const AGCO_LAYERS = {
  notice: "https://services9.arcgis.com/8LLh665FxwX7bxLB/arcgis/rest/services/Public_Notice_20250620/FeatureServer/0",
  progress: "https://services9.arcgis.com/8LLh665FxwX7bxLB/arcgis/rest/services/Application_in_progress_20250620/FeatureServer/0",
  authorized: "https://services9.arcgis.com/8LLh665FxwX7bxLB/arcgis/rest/services/Authorized_to_open_20250620/FeatureServer/0",
  cancelled: "https://services9.arcgis.com/8LLh665FxwX7bxLB/arcgis/rest/services/Cancelled_Authorizations_20250620/FeatureServer/0",
} as const;
export type AgcoLayer = keyof typeof AGCO_LAYERS;
const STATUS_PAGE = "https://www.agco.ca/en/cannabis/status-current-cannabis-retail-store-applications";

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v == null ? "" : String(v));
const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

// "From Nov 14, 2026 to Nov 28, 2026" -> { start: "2026-11-14", end: "2026-11-28" }
export function noticeDates(text: string): { start: string; end: string | null } | null {
  const dates = [...text.matchAll(/\b([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})/g)].map((m) => {
    const mm = MONTHS[m[1].toLowerCase()];
    return mm ? `${m[3]}-${mm}-${m[2].padStart(2, "0")}` : null;
  });
  return dates[0] ? { start: dates[0], end: dates[1] ?? null } : null;
}

// One store = premises name + address (the same store keeps its id as its
// application moves from in progress to public notice to authorized).
export function storeKey(a: Record<string, unknown>): string {
  const addr = str(a.Address).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${normalizeCompanyName(str(a.PremisesName))}|${addr}`;
}

type Stored = Map<string, string | null>; // source_record_id -> published_at

export function mapAgco(a: Record<string, unknown>, layer: AgcoLayer, ctx: Pick<IngestContext, "today"> & { stored: Stored }): IngestItem {
  const name = str(a.PremisesName);
  const address = str(a.Address).replace(/\s*,\s*/g, ", ");
  if (!name || !address) return { skip: "no store name or address" };
  const entityKey = normalizeCompanyName(name);
  if (entityKey.length < 3) return { skip: "no store name or address" };
  const key = storeKey(a);
  const status = str(a.ApplicationStatus) || layer;
  const notice = noticeDates(str(a.PublicNoticeDate));
  const firstRun = ctx.stored.size === 0;

  let id: string;
  let date: string | null;
  let basis: string;
  let kind: "opening" | "closing";
  if (layer === "cancelled") {
    id = `closed:${key}`;
    kind = "closing";
    if (ctx.stored.has(id)) date = ctx.stored.get(id) ?? null;
    else date = firstRun ? null : ctx.today;
    basis = date ? "first seen cancelled in the AGCO list" : "already cancelled when tracking began; cancellation date not published";
  } else {
    id = `open:${key}`;
    kind = "opening";
    // Authorized stores are only updated when we already track the application.
    if (layer === "authorized" && !ctx.stored.has(id)) return { skip: "authorized before tracking began" };
    if (notice) {
      date = notice.start;
      basis = "public notice start";
    } else if (ctx.stored.get(id)) {
      date = ctx.stored.get(id)!;
      basis = "first seen in the AGCO list";
    } else {
      date = ctx.today;
      basis = "first seen in the AGCO list";
    }
  }
  if (date && date > ctx.today) date = ctx.today;
  const city = str(a.City);
  const what =
    kind === "closing"
      ? "Cannabis store authorization cancelled"
      : layer === "authorized"
        ? "Cannabis store authorized to open"
        : layer === "notice"
          ? `Cannabis store application in public notice (${str(a.PublicNoticeDate)})`
          : "Cannabis store application in progress";
  const row: SignalRow = {
    source_type: "agco_cannabis",
    source_record_id: id,
    raw_entity_name: name,
    entity_key: entityKey,
    occupier_status: "named",
    signal_strength: "store_licence",
    title: `AGCO: ${what}: ${name}, ${address}`,
    summary: [
      `${what}.`,
      `Store: ${name}. Address: ${address}.`,
      `AGCO status: ${status}.`,
      str(a.Website) && `Website: ${str(a.Website)}.`,
      date ? `Date: ${date} (${basis}).` : `No date: ${basis}.`,
      kind === "closing" ? "A cancelled authorization means the store at this address may no longer operate there." : null,
    ]
      .filter(Boolean)
      .join(" "),
    url: STATUS_PAGE,
    published_at: date,
    event_at: null,
    location: address.replace(/, ON,/, ", Ontario,").replace(/, ON$/, ", Ontario") || (city ? `${city}, Ontario` : null),
    raw: { ...a, kind, layer, date_basis: basis, notice_start: notice?.start ?? null, notice_end: notice?.end ?? null },
    sector: "retail",
  };
  return { row };
}

async function* runAgco(ctx: IngestContext): AsyncGenerator<IngestItem> {
  const stored: Stored = ctx.stored ?? new Map();
  for (const layer of ["notice", "progress", "authorized", "cancelled"] as AgcoLayer[]) {
    await ctx.progress(`Reading AGCO stores: ${layer}`);
    for await (const a of arcgisQuery(ctx.fetchImpl, AGCO_LAYERS[layer], {
      where: "1=1",
      outFields: ["OBJECTID", "ApplicationStatus", "PremisesName", "StreetAddress", "City", "PostalCode", "Address", "PublicNoticeDate", "Website"],
      orderBy: "OBJECTID",
      pageSize: 1000,
    })) {
      yield mapAgco(a, layer, { today: ctx.today, stored });
    }
  }
}

export const agcoCannabis: IngestSource = {
  source: "agco_cannabis",
  label: "AGCO cannabis store authorizations",
  description: "New cannabis store applications (in progress or public notice) and cancelled store authorizations (closing stores), from the AGCO's daily store map. Retail.",
  snapshot: true,
  run: runAgco,
};
