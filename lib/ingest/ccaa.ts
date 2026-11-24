import { normalizeCompanyName } from "@/lib/research/normalize";
import { RETAIL_USE } from "@/lib/sector";
import { excelDate, readXlsx } from "./xlsx";
import type { IngestContext, IngestItem, IngestSource, SignalRow } from "./types";

// CCAA creditor protection filings (added 2026-11-24). The Office of the
// Superintendent of Bankruptcy publishes every company granted protection under
// the Companies' Creditors Arrangement Act since 2009 as open data
// (open.canada.ca dataset 92697343-d36d-4427-a1a8-ebac6b2725cc): one Excel file,
// replaced quarterly (checked 2026-11-24: latest filing 2026-09-30, ~66 filings
// a year in Canada, ~25 in Ontario courts). Columns include Court & Judicial
// District, OSB File Number, Date of Initial Order, Monitor's Web Page, Company
// Name (often several entities), Other names, Head Office (blank in recent
// rows), No of Canadian Employees, Court-Appointed Monitor.
//
// A filing can close plants and stores: space may be released (vacated space).
// Filings from every province are kept (a national chain can file in Alberta
// and close Ontario stores); the location is the court's province, so only
// companies with an Ontario record elsewhere become candidates.
export const CCAA_DATASET = "92697343-d36d-4427-a1a8-ebac6b2725cc";
const DATASET_PAGE = `https://open.canada.ca/data/en/dataset/${CCAA_DATASET}`;

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v == null ? "" : String(v));

const PROVINCES: [RegExp, string][] = [
  [/ontario/i, "Ontario"],
  [/british columbia|vancouver/i, "British Columbia"],
  [/alberta|calgary|edmonton/i, "Alberta"],
  [/saskatchewan|saskatoon|regina/i, "Saskatchewan"],
  [/manitoba|winnipeg/i, "Manitoba"],
  [/nova scotia|halifax/i, "Nova Scotia"],
  [/new brunswick|saint john|moncton|edmundston/i, "New Brunswick"],
  [/newfoundland/i, "Newfoundland and Labrador"],
  [/prince edward/i, "Prince Edward Island"],
  // Quebec courts: "Superior Court, District of Longueuil", "Cour Supérieure (Chambre Commerciale) District de …"
  [/qu[eé]bec|montr[eé]al|cour sup[eé]rieure|superior court, district|district de|courthouse, district/i, "Quebec"],
];
export function provinceOf(court: string, office = ""): string | null {
  if (/ontario/i.test(office)) return "Ontario";
  for (const [re, p] of PROVINCES) if (re.test(court)) return p;
  return null;
}

// "S. GUMPERT CO. OF CANADA LTD., GUMPERT REALCO INC., AND GUMPERT HOLDING INC." -> "S. GUMPERT CO. OF CANADA LTD."
export function firstCompany(name: string): string {
  const s = str(name);
  const parts = s.split(/\s*;\s*|\s+\/\s+|\s+et\.? al\.?|,?\s+and\s+(?=[A-Z0-9])|,\s+(?=\S)/i);
  const legal = /\b(?:inc|ltd|ltée|ltee|limited|corp|corporation|co|company|lp|ulc|llc|partnership)\.?$/i;
  // Join pieces until the first ends with a legal suffix ("Toys "R" Us (Canada) Ltd.").
  let out = "";
  for (const p of parts) {
    out = out ? `${out}, ${p}` : p;
    if (legal.test(out.trim())) break;
  }
  return out.replace(/[,\s]+$/, "").trim();
}

// Real-estate projects and property owners are not occupiers.
const PROPERTY = /\b(?:developments?|realco|realty|homes|properties|real estate|mall holdings|land(?:s)? inc|apartments?)\b|\b\d+\s+[a-z].*\b(?:avenue|street|road|drive) inc\b/i;
const RETAIL_NAME = /\b(?:clothing|apparel|fashion|toys?|stores?|retail|restaurants?|foods? market|grocery|furniture|pharmacy|cannabis|dispensar|brands)\b/i;

export function mapCcaa(r: (string | number | null)[], ctx: Pick<IngestContext, "cutoff" | "today">): IngestItem {
  const file = str(r[2]) || str(r[0]);
  const date = excelDate(r[3]);
  const fullName = str(r[5]);
  if (!file || !fullName) return { skip: "no file number or company" };
  if (!date) return { skip: "no date" };
  if (date < ctx.cutoff) return { skip: "older than 12 months" };
  if (date > ctx.today) return { skip: "dated in the future" };
  if (PROPERTY.test(fullName)) return { skip: "real-estate project or property owner" };
  const name = firstCompany(fullName);
  const key = normalizeCompanyName(name);
  if (key.length < 3) return { skip: "no company name" };
  const court = str(r[1]);
  const office = str(r[7]);
  const province = provinceOf(court, office);
  const others = str(r[6]).replace(/^n\/a$/i, "");
  const employees = str(r[16]).split("*")[0].trim();
  const monitor = str(r[10]);
  const page = str(r[4]);
  const url = /^https?:\/\//i.test(page) ? page : /^www\./i.test(page) ? `https://${page}` : DATASET_PAGE;
  const retail = RETAIL_NAME.test(`${fullName} ${others}`) || RETAIL_USE.test(others);
  const row: SignalRow = {
    source_type: "ccaa_filing",
    source_record_id: file,
    raw_entity_name: name,
    entity_key: key,
    occupier_status: "named",
    signal_strength: "insolvency",
    title: `Creditor protection (CCAA) granted: ${fullName.slice(0, 160)}`,
    summary: [
      `Initial order under the Companies' Creditors Arrangement Act on ${date}.`,
      `Companies: ${fullName}.`,
      others && `Also operating as: ${others}.`,
      `Court: ${court}.`,
      office && `Head office: ${office}.`,
      employees && `Canadian employees at filing: ${employees}.`,
      monitor && `Monitor: ${monitor}.`,
      "A restructuring can close or sell plants and stores; the record does not say which, if any.",
    ]
      .filter(Boolean)
      .join(" "),
    url,
    published_at: date,
    event_at: null,
    location: office || (province ? province : null),
    raw: { court, file, companies: fullName, other_names: others, head_office: office, employees, monitor, monitor_page: page, province },
    sector: retail ? "retail" : "industrial",
  };
  return { row };
}

async function* runCcaa(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Finding the current CCAA records file");
  const meta = await ctx.fetchImpl(`https://open.canada.ca/data/api/3/action/package_show?id=${CCAA_DATASET}`, { signal: AbortSignal.timeout(60_000) });
  if (!meta.ok) throw new Error(`CCAA dataset lookup failed (${meta.status})`);
  const resources = ((await meta.json()) as { result?: { resources?: { url: string; name?: string; created?: string; last_modified?: string | null }[] } }).result?.resources ?? [];
  // The newest file holds every filing since 2009.
  const latest = [...resources]
    .filter((r) => /\.xlsx?$/i.test(r.url.replace(/\/\$file\/.*$/, "")) || /\.xlsx/i.test(r.url))
    .sort((a, b) => (b.last_modified ?? b.created ?? "").localeCompare(a.last_modified ?? a.created ?? ""))[0];
  if (!latest) throw new Error("No CCAA records file found.");
  await ctx.progress(`Reading ${latest.name ?? "CCAA records"}`);
  const file = await ctx.fetchImpl(latest.url, { signal: AbortSignal.timeout(120_000) });
  if (!file.ok) throw new Error(`CCAA file download failed (${file.status})`);
  for (const sheet of readXlsx(Buffer.from(await file.arrayBuffer()))) {
    const h = sheet.rows.findIndex((row) => row.some((c) => /date of initial order/i.test(str(c))));
    if (h < 0) continue;
    for (const r of sheet.rows.slice(h + 1)) yield mapCcaa(r, ctx);
  }
}

export const ccaaFilings: IngestSource = {
  source: "ccaa_filing",
  label: "CCAA creditor protection filings",
  description: "Companies granted creditor protection in the last 12 months (Office of the Superintendent of Bankruptcy, updated quarterly). Restructurings can release plants and stores.",
  run: runCcaa,
};
