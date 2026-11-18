import { normalizeCompanyName } from "@/lib/research/normalize";
import { money, type IngestContext, type IngestItem, type IngestSource } from "./types";
import { REGIONS } from "@/lib/research/filters";

// Government of Ontario newsroom (checked 2026-11-18). JSON API
// https://api.news.ontario.ca/api/v1/releases?limit=100&page=N, newest first,
// full history (43k releases). Fields include content_title, content_lead,
// content_body, release_date_time, language, ministry_acronym. Release page:
// https://news.ontario.ca/en/release/{id}. About 1,500 English releases a year;
// the few that announce a named company's investment or new facility are kept.

export const NEWS_API = "https://api.news.ontario.ca/api/v1/releases";
const PAGE = 100;
const MAX_PAGES = 40;

const strip = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#039;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();

// A company with a legal suffix, e.g. "Concast Pipe Inc." (capitalised words before the suffix).
const COMPANY = /\b((?:[A-Z0-9][A-Za-z0-9&'.\-]*\s){0,6}?[A-Z0-9][A-Za-z0-9&'.\-]*\s(?:Inc|Ltd|Limited|Corp|Corporation|ULC|LLC|Co|Canada Inc|Canada Ltd)\.?)(?=[\s,;:)]|$)/g;
// Public bodies and programmes that carry legal suffixes but aren't occupiers.
const NOT_OCCUPIER = /^(?:the\s)?(?:ontario|government|invest ontario|hydro one|metrolinx|infrastructure ontario|ontario power generation|ontario lottery|olg|toronto hydro|alectra|enbridge gas|university|college)\b|\b(?:lottery and gaming|power generation|development corporation|housing corporation|financing authority|heritage fund)\b/i;

const INVESTMENT = /\$\s?[\d.,]+\s?(?:million|billion)?\s+investment|invest(?:ing|s|ment)?\s+(?:more than |over |nearly |about )?\$\s?[\d.,]+\s?(?:million|billion)?/i;
// "a new, state-of-the-art manufacturing facility" (commas and adjectives allowed)
const FACILITY = /\b(?:new|expand(?:ed|ing|s)?|expansion of),?\s+(?:its\s+|their\s+|a\s+|an\s+)?(?:(?:state-of-the-art|advanced|high-tech|modern|larger),?\s+)*(?:manufacturing|production|processing|distribution|research|assembly|headquarters|facility|plant|factory|warehouse|operations?|campus|site)\b|\bexpan(?:d|ds|ding|sion)\b|\bbreak(?:s|ing)? ground\b|\bgroundbreaking\b/i;
const PROGRAMME = /\b(?:skills development fund|training stream|community grants|civil remedies|scholarship|apprentice|bursar)/i;
// Public construction (hospitals, schools, transit): the company named is a contractor, not an occupier.
const PUBLIC_PROJECT = /\b(?:hospital|school|long-term care|transit|subway|highway|courthouse|library)\b/i;

// A municipality named in the text, for releases without a dateline.
const PLACES = [
  ...Object.values(REGIONS)
    .flatMap((r) => [...r.places])
    .filter((p) => !/^(?:peel|york region|halton|durham|niagara)$/i.test(p)),
  "Ottawa", "London", "Windsor", "Guelph", "Barrie", "Sudbury", "Thunder Bay", "Kingston", "Peterborough", "Belleville", "Sarnia", "Brantford", "Woodstock", "Stratford", "Orillia", "Collingwood", "North Bay", "Sault Ste. Marie", "Timmins", "Cornwall",
];
const PLACE_RE = new RegExp(`\\b(${PLACES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`);
export function placeIn(text: string): string | null {
  return PLACE_RE.exec(text)?.[1] ?? null;
}

export function moneyFrom(text: string): number | null {
  const m = /\$\s?([\d.,]+)\s?(million|billion)?/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (m[2]?.toLowerCase() === "billion" ? 1e9 : m[2] ? 1e6 : 1));
}

export function jobsFrom(text: string): number | null {
  const m = /\b(?:creat\w*|support\w*|adding|add)\s+(?:more than |over |nearly |up to |about )?([\d,]+)\s+(?:new\s+)?(?:good-paying\s+|full-time\s+|well-paying\s+)?jobs\b/i.exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

// "OAKVILLE — The Ontario government…" -> "Oakville"
export function datelineCity(lead: string): string | null {
  const m = /^([A-Z][A-Z .'\-]{2,40}?)\s*[—–-]{1,2}\s/.exec(lead.trim());
  return m ? m[1].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim() : null;
}

export function companiesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(COMPANY)) {
    const name = m[1].replace(/\s+/g, " ").trim();
    if (NOT_OCCUPIER.test(name) || out.includes(name)) continue;
    out.push(name);
  }
  return out;
}

export type NewsRelease = { id: number; content_title?: string; content_lead?: string; content_body?: string; release_date_time?: string; language?: string; ministry_acronym?: string; ministry_name?: string };

export function mapRelease(r: NewsRelease, ctx: Pick<IngestContext, "cutoff" | "today">): IngestItem[] {
  if (r.language && r.language !== "en") return [{ skip: "not English" }];
  const date = String(r.release_date_time ?? "").slice(0, 10);
  if (!date || date < ctx.cutoff) return [{ skip: "older than 12 months" }];
  if (date > ctx.today) return [{ skip: "dated in the future" }];
  const title = strip(r.content_title);
  const lead = strip(r.content_lead);
  const body = strip(r.content_body);
  const text = `${title} ${lead} ${body}`;
  if (PROGRAMME.test(text)) return [{ skip: "training or grant programme" }];
  if (PUBLIC_PROJECT.test(title)) return [{ skip: "public construction project" }];
  if (!INVESTMENT.test(text) || !FACILITY.test(text)) return [{ skip: "no company investment or facility" }];
  // The company must appear in the title or lead, where announcements name it.
  const names = companiesIn(`${title} ${lead}`);
  if (names.length === 0) return [{ skip: "no company named in the headline or lead" }];
  const city = datelineCity(lead) ?? placeIn(`${title} ${lead}`);
  const amount = moneyFrom(`${title} ${lead}`);
  const jobs = jobsFrom(text);
  const kind = /\bnew\b[^.]{0,60}\b(?:facility|plant|factory|manufacturing|production|headquarters|warehouse|campus)\b/i.test(text) ? "new_facility" : "expansion";
  return names.slice(0, 3).map((name) => ({
    row: {
      source_type: "ontario_news" as const,
      source_record_id: `${r.id}:${normalizeCompanyName(name)}`,
      raw_entity_name: name,
      entity_key: normalizeCompanyName(name) || null,
      occupier_status: "not_applicable" as const,
      signal_strength: "announcement" as const,
      title: `Ontario announcement: ${title}`,
      summary: [amount ? `${money(amount)} announced` : null, jobs ? `${jobs.toLocaleString("en-CA")} jobs` : null, lead.slice(0, 600)].filter(Boolean).join(". "),
      url: `https://news.ontario.ca/en/release/${r.id}`,
      published_at: date,
      event_at: null,
      location: city ? `${city}, Ontario` : "Ontario",
      raw: { release_id: r.id, title, lead, ministry: r.ministry_name ?? r.ministry_acronym ?? null, amount, jobs, kind, body: body.slice(0, 4000) },
    },
  }));
}

async function* run(ctx: IngestContext): AsyncGenerator<IngestItem> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await ctx.fetchImpl(`${NEWS_API}?limit=${PAGE}&page=${page}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Ontario newsroom API request failed (${res.status})`);
    const json = (await res.json()) as { data?: NewsRelease[] };
    const rows = json.data ?? [];
    let older = 0;
    for (const r of rows) {
      if (String(r.release_date_time ?? "").slice(0, 10) < ctx.cutoff) older++;
      yield* mapRelease(r, ctx);
    }
    await ctx.progress(`Read ${(page * PAGE).toLocaleString("en-CA")} releases`);
    // Newest first: stop once a whole page is older than the cutoff.
    if (rows.length < PAGE || older === rows.length) break;
  }
}

export const ontarioNews: IngestSource = {
  source: "ontario_news",
  label: "Ontario newsroom announcements",
  description: "Government of Ontario news releases announcing a named company's investment, expansion or new facility, last 12 months.",
  run,
};
