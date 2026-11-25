import { arcgisQuery } from "./arcgis";
import { normalizeCompanyName } from "@/lib/research/normalize";
import { isoFromEpoch, type IngestContext, type IngestItem, type IngestSource, type SignalRow } from "./types";

// Development applications (added 2026-11-25, for retail brokers in Oakville
// and around Hamilton). These come before permits and licences: new commercial
// space a developer will need to lease, existing plazas being redeveloped (their
// tenants will have to move), named new stores, and new industrial buildings.
//
// Oakville (checked 2026-11-25): "Active Site Plans" and "Active Development
// Applications" layers at maps.oakville.ca/oakgis/rest/services/SBS/… give the
// file, type, status, received date (INDATE) and non-residential GFA; each
// record links to an oakville.ca page whose title names the applicant or
// project ("Shoppers Drug Mart Development - 3000 Sixth Line - 1316.003/02")
// and which carries a plain description and dated plan submissions.
//
// Hamilton (checked 2026-11-25): spatialsolutions.hamilton.ca …/General/
// Development/MapServer/1 gives FILE_NUM, FILE_TYPE (incl. "Formal
// Consultation", the pre-application stage), ADDRESS, DESCRIP, PRPS_USE,
// DEVSTAT_EX and APP_DATE. No applicant name, so records stay address-level
// (they can still join a company by address).
//
// Applications move slowly, so active files received in the last 24 months
// are kept; the received date is the signal date and the stage is always
// "application" (nothing is approved or built yet unless the status says so).

export const OAKVILLE_SITE_PLANS = "https://maps.oakville.ca/oakgis/rest/services/SBS/Active_Site_Plans/MapServer/0";
export const OAKVILLE_DEV_APPS = "https://maps.oakville.ca/oakgis/rest/services/SBS/Active_Development_Applications/MapServer/1";
export const HAMILTON_DEV_APPS = "https://spatialsolutions.hamilton.ca/webgis/rest/services/General/Development/MapServer/1";

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v == null ? "" : String(v));
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
export const monthsAgo = (today: string, months: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

export type DevKind = "named_store" | "new_commercial_space" | "displacement" | "industrial_space";

// Existing commercial uses being replaced: their tenants will have to move.
const DISPLACE =
  /\b(?:atop|above|on top of) (?:the |an )?existing (?:one[- ]storey |1[- ]storey )?(?:commercial|retail|plaza)|redevelop\w* (?:of )?(?:the |an )?existing (?:commercial|retail|plaza|motor vehicle dealership|dealership|gas station|service station|restaurant|shopping)|demoli\w+ (?:of )?(?:the |an )?existing (?:commercial|retail|plaza|gas|service station|restaurant|shopping)|from an? (?:automobile service station|[a-z ]*commercial)[a-z ()0-9-]* zone to an? [a-z ]*residential/i;
const INDUSTRIAL = /\b(?:industrial|warehouse|manufactur\w*|distribution (?:centre|center|facility)|logistics|self[- ]storage|freezer|loading dock|research manufacturing|employment)\b/i;
const COMMERCIAL =
  /\b(?:commercial|retail|plaza|restaurant|store|shop|grocery|supermarket|gas (?:station|bar)|service station|convenience|drive[- ]?thr(?:ough|u)|car wash|dealership|medical clinic|clinic|pharmacy|personal service|service commercial)\b/i;
const NOT_RELEVANT =
  /\b(?:school|educational establishment|library|long[- ]term care|hospital|church|place of worship|cemetery|park\b|water(?:main)?|sewage|pumping station|transit|fire station|paramedic|police|emergency operations|transitional housing|shelter)\b/i;
// Zone names mention "Commercial" without proposing any ("Community Commercial (C3) Zone").
const ZONE_NAME = /\b(?:[A-Z][a-z]+ )*Commercial(?: Special Provision)? \([^)]*\) Zone\b/g;
// Applicant names that are developers or projects, not a store.
const DEVELOPER =
  /\b(?:developments?|development corp(?:oration)?|homes|residences|suites|properties|holdings|investments?|capital|management|realty|construction|builders?|group|corp(?:oration)?|inc|ltd|limited|lp|partnership|municipality|region(?:al)?|town of|city of|board|association)\b\.?|^\d{6,}/i;

export function classify(description: string, use: string, name: string | null, commercialGfa: number | null, units: number | null = null): DevKind | null {
  const desc = description.replace(ZONE_NAME, " ");
  const text = `${desc} ${use}`;
  if (/cancel+ed|withdrawn/i.test(description)) return null;
  if (NOT_RELEVANT.test(desc)) return null;
  if (DISPLACE.test(text) || DISPLACE.test(description)) return "displacement";
  if (INDUSTRIAL.test(text) && !/mixed[- ]use|residential/i.test(use) && !/\brestaurant\b/i.test(desc)) return "industrial_space";
  const commercial = COMMERCIAL.test(text) || (commercialGfa ?? 0) > 0 || /^commercial$/i.test(use);
  if (!commercial) return null;
  // A store-type name, a described commercial use and no homes: a named new store.
  const homes = (units ?? 0) > 0 || /\b\d+ (?:residential |dwelling )?(?:units|dwellings)\b/i.test(desc);
  if (name && !DEVELOPER.test(name) && COMMERCIAL.test(desc) && !homes) return "named_store";
  return "new_commercial_space";
}

const KIND_LABEL: Record<DevKind, string> = {
  named_store: "New store planned",
  new_commercial_space: "New commercial space planned",
  displacement: "Existing commercial site being redeveloped",
  industrial_space: "New industrial space planned",
};
export const DEV_KIND_LABEL = KIND_LABEL;

// ---------- Oakville ------------------------------------------------------------

export type OakvillePage = { title: string; description: string; latestSubmission: string | null };

const MONTHS: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };

export function parseOakvillePage(html: string): OakvillePage {
  const title = str(/<title>([^<]+)/.exec(html)?.[1] ?? "").replace(/&#39;|&rsquo;/g, "'").replace(/&amp;/g, "&");
  const main = html.slice(Math.max(0, html.indexOf("<main")));
  const text = main
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");
  const description = str(/\bDescription\s+(.*?)\s+(?:Contact information|Supporting documents|We love feedback)/.exec(text)?.[1] ?? "");
  const months = [...text.matchAll(/Submission \d+ - [^-]+ - ([A-Z][a-z]+) (\d{4})/g)]
    .map((m) => (MONTHS[m[1].toLowerCase()] ? `${m[2]}-${MONTHS[m[1].toLowerCase()]}` : null))
    .filter((m): m is string => Boolean(m))
    .sort();
  return { title, description, latestSubmission: months.at(-1) ?? null };
}

// "Circle K (Mac's Convenience Stores Inc.) - 624 Third Line - SP 1626.021/01" -> "Circle K"
// "Shoppers Drug Mart Development - 3000 Sixth Line - …" -> "Shoppers Drug Mart"
export function oakvilleName(title: string, address: string): string | null {
  const first = str(title.split(/\s+-\s+/)[0] ?? "");
  const name = first
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+(?:development|site plan|sp)$/i, "")
    .trim();
  if (!name || /^\d/.test(name) || normalizeCompanyName(name) === normalizeCompanyName(address)) return null;
  if (/^(?:block|part of lot|lot|plan|the regional municipality|regional municipality|town of)\b/i.test(name)) return null;
  return name.length >= 3 ? name : null;
}

export function mapOakvilleDev(
  a: Record<string, unknown>,
  page: OakvillePage | null,
  ctx: Pick<IngestContext, "today">,
): IngestItem {
  const file = str(a.REFNO) || str(a.FILENAME);
  const received = isoFromEpoch(a.INDATE);
  if (!file || !received) return { skip: "no file number or date" };
  if (received < monthsAgo(ctx.today, 24)) return { skip: "received more than 24 months ago" };
  const status = str(a.STATUS);
  if (/closed|withdrawn|cancel|refused/i.test(status)) return { skip: "closed or withdrawn" };
  const address = str(a.ADDRESS).replace(/\s+Oakville$/i, "").replace(/\.\s*$/, "");
  const description = page?.description ?? "";
  const gfa = num(a.NONRESGFA);
  const units = num(a.TOTALUNITS);
  const name = page ? oakvilleName(page.title, address) : null;
  if (!description) return { skip: "no description" };
  const kind = classify(description, "", name, gfa, units);
  if (!kind) return { skip: "not commercial or industrial" };
  const key = name ? normalizeCompanyName(name) : "";
  const type = str(a.FOLDERTYPE);
  const typeLabel = { SITE: "Site plan", ZBA: "Zoning by-law amendment", OPA: "Official plan amendment", SUBD: "Plan of subdivision", CDM: "Plan of condominium" }[type] ?? type;
  const url = /^https?:\/\//.test(str(a.URL)) ? str(a.URL) : null;
  const row: SignalRow = {
    source_type: "devapp_oakville",
    source_record_id: `${type}:${file}`,
    raw_entity_name: key.length >= 3 ? name : null,
    entity_key: key.length >= 3 ? key : null,
    occupier_status: key.length >= 3 ? "named" : "unresolved",
    signal_strength: "development",
    title: `Oakville ${typeLabel.toLowerCase()} (${status.toLowerCase() || "in review"}): ${KIND_LABEL[kind]} at ${address}${name ? ` (${name})` : ""}`,
    summary: [
      description && `${description}`,
      gfa ? `Non-residential floor area: ${gfa.toLocaleString("en-CA")} m².` : null,
      units ? `Residential units: ${units}.` : null,
      `Status: ${status || "in review"}. Received ${received}.`,
      page?.latestSubmission ? `Latest plan submission: ${page.latestSubmission}.` : null,
      name ? `Applicant or project as the Town lists it: ${name}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    url,
    published_at: received,
    event_at: null,
    location: address ? `${address}, Oakville, Ontario` : "Oakville, Ontario",
    raw: { ...a, kind, stage: "application", description, page_title: page?.title ?? null, latest_submission: page?.latestSubmission ?? null, est_value: null, area_m2: gfa },
    sector: kind === "industrial_space" ? "industrial" : "retail",
  };
  return { row };
}

async function* runOakvilleDev(ctx: IngestContext): AsyncGenerator<IngestItem> {
  const since = monthsAgo(ctx.today, 24);
  const seen = new Set<string>();
  const headers = { "user-agent": "Mozilla/5.0 (compatible; FirstMovers-OpenDataIngest/1.0)" };
  for (const [layer, where] of [
    [OAKVILLE_SITE_PLANS, `INDATE >= DATE '${since}'`],
    // Rezonings and official plan amendments (subdivisions and condominiums are residential lots).
    [OAKVILLE_DEV_APPS, `INDATE >= DATE '${since}' AND FOLDERTYPE IN ('ZBA','OPA')`],
  ] as const) {
    await ctx.progress(`Reading Oakville ${layer.includes("Site_Plans") ? "site plans" : "development applications"}`);
    for await (const a of arcgisQuery(ctx.fetchImpl, layer, { where, outFields: ["*"], orderBy: "INDATE DESC", pageSize: 500 })) {
      const url = str(a.URL);
      const id = `${str(a.FOLDERTYPE)}:${str(a.REFNO) || str(a.FILENAME)}`;
      if (seen.has(id)) continue; // OPA and ZBA of one project share a page; each is its own file
      seen.add(id);
      if (ctx.deadline && Date.now() > ctx.deadline) {
        yield { skip: "stopped at the time limit; continues next run" };
        return;
      }
      let page: OakvillePage | null = null;
      if (/^https?:\/\//.test(url)) {
        try {
          await new Promise((r) => setTimeout(r, 300));
          const res = await ctx.fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
          if (res.ok) page = parseOakvillePage(await res.text());
        } catch {
          // no page: classified from the file name only
        }
      }
      yield mapOakvilleDev(a, page, ctx);
    }
  }
}

// ---------- Hamilton ------------------------------------------------------------

const HAMILTON_USES = /^(?:commercial|mixed use|industrial|warehouse|office)$/i;

// "To construct a one storey Food Basics grocery store …" -> "Food Basics". Only
// capitalised words directly before a store word, never generic ones.
const STORE_WORD = /^(?:grocery store|supermarket|store|restaurant|pharmacy|gas station|gas bar|car wash|dealership|drive[- ]through restaurant)\b/i;
const GENERIC_WORDS = /^(?:New|Proposed|Commercial|Retail|Medical|Mixed|Grocery|Food|Fast|Restaurant|Store|One|Two|Single|Storey|Building|Existing|Gas|Car|Motor|Vehicle|Drive|Through|Convenience|Plaza|Accessory|Standalone|Stand-alone|Large|Small)$/;
export function storeNameIn(description: string): string | null {
  const m = /\b(?:a|an|one|new)\s+(?:(?:one|two|single)[- ]storey\s+)?((?:[A-Z][\w&'’.-]*\s){1,4})(grocery store|supermarket|store|restaurant|pharmacy|gas station|gas bar|car wash|dealership)\b/.exec(description);
  if (!m || !STORE_WORD.test(m[2])) return null;
  const words = m[1].trim().split(/\s+/);
  // "Food Basics grocery store": the brand is every word, unless all are generic.
  if (words.every((w) => GENERIC_WORDS.test(w))) return null;
  // Trim leading descriptors only ("New", "Proposed"), not brand words like "Food".
  while (words.length && /^(?:New|Proposed|One|Two|Single|Storey|Standalone|Stand-alone|Large|Small|Existing)$/.test(words[0])) words.shift();
  const name = words.join(" ");
  return name.length >= 3 ? name : null;
}

export function mapHamiltonDev(a: Record<string, unknown>, ctx: Pick<IngestContext, "today">): IngestItem {
  const file = str(a.FILE_NUM);
  const received = isoFromEpoch(a.APP_DATE);
  if (!file || !received) return { skip: "no file number or date" };
  if (received < monthsAgo(ctx.today, 24)) return { skip: "received more than 24 months ago" };
  if (received > ctx.today) return { skip: "dated in the future" };
  const status = str(a.DEVSTAT_EX);
  if (/withdrawn|cancel|refused/i.test(status)) return { skip: "closed or withdrawn" };
  const use = str(a.PRPS_USE);
  const description = str(a.DESCRIP);
  if (!HAMILTON_USES.test(use) && !COMMERCIAL.test(description)) return { skip: "not commercial or industrial" };
  const store = storeNameIn(description);
  const kind = classify(description, use, store, null, num(a.PRPS_UNITS));
  if (!kind) return { skip: "not commercial or industrial" };
  const type = str(a.FILE_TYPE);
  const address = str(a.ADDRESS);
  const key = store ? normalizeCompanyName(store) : "";
  const named = kind === "named_store" && key.length >= 3;
  const row: SignalRow = {
    source_type: "devapp_hamilton",
    source_record_id: file,
    raw_entity_name: named ? store : null,
    entity_key: named ? key : null,
    occupier_status: named ? "named" : "unresolved",
    signal_strength: "development",
    title: `Hamilton ${type.toLowerCase() || "development application"} (${status.toLowerCase() || "in process"}): ${KIND_LABEL[kind]} at ${address || "unknown address"}${named ? ` (${store})` : ""}`,
    summary: [description, use && `Proposed use: ${use}.`, `Status: ${status || "in process"}. Received ${received}.`, /formal consultation/i.test(type) ? "Formal consultation is the pre-application stage: the proposal can still change." : null]
      .filter(Boolean)
      .join(" "),
    url: null,
    published_at: received,
    event_at: null,
    location: address ? `${address}, Hamilton, Ontario` : "Hamilton, Ontario",
    raw: { ...a, kind, stage: "application", description },
    sector: kind === "industrial_space" ? "industrial" : "retail",
  };
  return { row };
}

async function* runHamiltonDev(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Reading Hamilton development applications");
  for await (const a of arcgisQuery(ctx.fetchImpl, HAMILTON_DEV_APPS, {
    where: `APP_DATE >= DATE '${monthsAgo(ctx.today, 24)}'`,
    outFields: ["OBJECTID", "FILE_NUM", "FILE_TYPE", "ADDRESS", "DESCRIP", "DEVSTAT_EX", "APP_DATE", "STAT_DATE", "PRPS_USE", "PRPS_UNITS"],
    orderBy: "OBJECTID",
    pageSize: 1000,
  })) {
    yield mapHamiltonDev(a, ctx);
  }
}

export const oakvilleDevApps: IngestSource = {
  source: "devapp_oakville",
  label: "Oakville development applications",
  description: "Active site plans, rezonings and official plan amendments (last 24 months) with new commercial or industrial space, existing commercial sites being redeveloped, or a named new store.",
  run: runOakvilleDev,
};
export const hamiltonDevApps: IngestSource = {
  source: "devapp_hamilton",
  label: "Hamilton development applications",
  description: "Development applications and pre-application consultations (last 24 months) with new commercial or industrial space or existing commercial sites being redeveloped. No applicant names.",
  run: runHamiltonDev,
};
