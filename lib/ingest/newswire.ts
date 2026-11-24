import { normalizeCompanyName } from "@/lib/research/normalize";
import type { IngestContext, IngestItem, IngestSource, SignalRow } from "./types";

// Newswire.ca (Cision) releases announcing an Ontario facility or store
// (added 2026-11-24). Checked 2026-11-24: category lists page back months at
// /news-releases/{list}/?page=N&pagesize=100 (robots.txt allows them); each card
// has the release link, a date, the title and a teaser (the release's first
// sentence, without the dateline). In a 60-day sample of six lists, about 15
// releases announced a real Ontario facility or store (e.g. GLS Canada's Vaughan
// parcel hub, Food World Plus in Mississauga, Golf Town in Oakville).
//
// Only the list pages are read. Release pages answer automated clients with a
// bot check (Cloudflare "Just a moment…", found 2026-11-24 after a sample run),
// so we never open them: the company comes from the title ("GLS Canada Opens …")
// or the teaser ("Food World Plus, a new …"), and the Ontario place must be in
// the title or teaser. Cision's terms of use should be reviewed before
// commercial use.
export const NEWSWIRE = "https://www.newswire.ca";
export const NEWSWIRE_LISTS: { path: string; sector: "industrial" | "retail" | "either" }[] = [
  { path: "heavy-industry-manufacturing-latest-news/heavy-industry-manufacturing-latest-news-list", sector: "industrial" },
  { path: "automotive-transportation-latest-news/supply-chain-logistics-list", sector: "industrial" },
  { path: "consumer-products-retail-latest-news/retail-list", sector: "retail" },
  { path: "consumer-products-retail-latest-news/restaurants-list", sector: "retail" },
  { path: "consumer-products-retail-latest-news/supermarkets-list", sector: "retail" },
  { path: "all-public-company-news", sector: "either" },
];
// The first run reads 120 days back; later runs 14 days (already stored releases are skipped).
const FIRST_RUN_DAYS = 120;
const DAILY_DAYS = 14;
const MAX_PAGES = 12;
const RUN_BUDGET_MS = 90_000;

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

// Words that make a release a facility or store event.
export const FACILITY_WORDS =
  /\b(?:opens?|opening|now open|grand opening|new (?:facility|plant|factory|warehouse|distribution|fulfil+ment|headquarters|location|store|restaurant|site|campus|hub|production)|expan(?:d|ds|ding|sion)|relocat\w*|breaks? ground|groundbreaking|square[- ]f(?:oo|ee)t|sq\.? ?ft|closes?|closing|closures?|wind(?:s|ing)? down|creditor protection|ccaa|receivership|bankruptcy|is coming to)\b/i;
// Ontario places (ambiguous names need ", ON" or "Ontario").
const ON_PLACE =
  /\b(Ontario|Toronto|Mississauga|Brampton|Vaughan|Markham|Oakville|Burlington|Hamilton|Ottawa|Kitchener|Guelph|Milton|Caledon|Pickering|Ajax|Whitby|Oshawa|Etobicoke|Scarborough|North York|Richmond Hill|Concord|Bolton|Barrie|Niagara(?: Falls)?|St\. Catharines|Brantford|Peterborough|Sudbury|Thunder Bay|Woodstock|Stratford|Belleville|Cornwall|Orillia|Innisfil|Bradford|Newmarket|Aurora|Stoney Creek|Ancaster|Woodbridge|Kanata|Nepean|Tillsonburg|(?:London|Cambridge|Windsor|Kingston|Waterloo),? (?:ON|Ont\.?|Ontario)\b|Cambridge Centre)/;
const CLOSING = /\b(?:closes?|closing|closures?|wind(?:s|ing)? down|creditor protection|ccaa|receivership|bankruptcy|liquidat)/i;
const ACQUISITION = /\b(?:acquir\w*|acquisition)\b/i;
const NEW_FACILITY = /\b(?:new (?:facility|plant|factory|warehouse|distribution|fulfil+ment|headquarters|production|campus|hub)|breaks? ground|groundbreaking)\b/i;
const INDUSTRIAL_WORDS = /\b(?:plant|factory|manufactur\w*|warehouse|distribution cent(?:re|er)|fulfil+ment|logistics|production|parcel|hub)\b/i;
const RETAIL_WORDS = /\b(?:store|stores|restaurant|location|boutique|shop|grocery|supermarket|café|cafe|outlet|flagship)\b/i;
// Not occupier news: fund distributions, offices, roundups, events.
const NOT_FACILITY = /\b(?:distribution (?:payment|details|rate)|monthly distribution|cash distribution|office in|webinar|conference|award|press releases|stories you need|new homes|rental apartment|multifamily|vendor of record|affordable housing)\b/i;

// The company leading the title: "GLS Canada Opens …", "Golf Town Unveils …", "Giant Tiger is Coming to …"
const TITLE_NAME =
  /^(?:[A-Z ]+:\s+)?(.{2,60}?)\s+(?:opens|opening|unveils|announces|expands|celebrates|debuts|launches|breaks ground|to open|brings|continues|accelerates|enters|acquires|closes|is coming|arrives|marks|completes|invests|relocates|moves|adds)\b/i;
// The company leading the teaser: "Food World Plus, a new …", "Kits Eyecare Ltd. (TSX: KITS) …", "Smashbox Cosmetics has …"
const TEASER_NAME = /^(.{2,60}?)(?:\s*\(|,\s+(?:a|an|the|one|Canada's|Ontario's)\b|\s+(?:has|have|is|are|will|today|announced|opened|opens|celebrated)\b)/;
const NOT_A_NAME = /^(?:the|a|an|this|thousands|first look|now open|new|media advisory|today|during|with|ahead|from|in|at|after|as|for)\b/i;

export function companyFrom(title: string, teaser: string): string | null {
  for (const m of [TITLE_NAME.exec(title), TEASER_NAME.exec(teaser)]) {
    const name = m?.[1]?.replace(/['’]s$/, "").trim();
    // A name, not a phrase: every word capitalised (or a joining word); not a government.
    const words = name?.split(/\s+/) ?? [];
    const named = words.every((w) => /^[A-Z0-9&+'"(]/.test(w) || /^(?:of|and|the|de|du|la|by|et)$/i.test(w));
    if (name && named && !NOT_A_NAME.test(name) && !/^(?:canada|ontario|government)\b/i.test(name) && /[A-Za-z]{2}/.test(name) && words.length <= 7) return name;
  }
  return null;
}

export type Card = { href: string; title: string; teaser: string; date: string | null };

export function parseList(html: string): Card[] {
  return html
    .split(/<div class="card col-view/)
    .slice(1)
    .map((c) => {
      const href = /href="(\/news-releases\/[^"]+-\d{6,}\.html)"/.exec(c)?.[1] ?? "";
      const h3 = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(c)?.[1] ?? "";
      const small = decode(/<small[^>]*>([\s\S]*?)<\/small>/.exec(h3)?.[1] ?? "");
      const d = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(small);
      const date = d ? new Date(`${d[1]} ${d[2]}, ${d[3]} 12:00 UTC`).toISOString().slice(0, 10) : null; // null = today ("22:51 ET")
      return { href, title: decode(h3.replace(/<small[\s\S]*?<\/small>/, "")), teaser: decode(/<p class="remove-outline">([\s\S]*?)<\/p>/.exec(c)?.[1] ?? ""), date };
    })
    .filter((c) => c.href);
}

export function mapCard(card: Card & { sector: "industrial" | "retail" | "either" }, ctx: Pick<IngestContext, "today" | "cutoff">): IngestItem {
  const date = card.date ?? ctx.today;
  if (date < ctx.cutoff) return { skip: "older than 12 months" };
  const text = `${card.title}. ${card.teaser}`;
  if (!FACILITY_WORDS.test(text) || NOT_FACILITY.test(card.title)) return { skip: "no facility or store news" };
  const place = ON_PLACE.exec(card.title)?.[1] ?? ON_PLACE.exec(card.teaser)?.[1];
  if (!place) return { skip: "no Ontario place in the title or teaser" };
  const name = companyFrom(card.title, card.teaser);
  const key = name ? normalizeCompanyName(name) : "";
  if (!name || key.length < 3) return { skip: "no company named at the start of the title or teaser" };
  const sector =
    card.sector !== "either" ? card.sector : INDUSTRIAL_WORDS.test(text) ? "industrial" : RETAIL_WORDS.test(text) ? "retail" : null;
  if (!sector) return { skip: "not an industrial or retail facility" };
  // "Closes Acquisition of …" is a completed purchase, not a closing.
  const kind = ACQUISITION.test(card.title) ? "acquisition" : CLOSING.test(card.title) ? "closing" : NEW_FACILITY.test(text) ? "new_facility" : "expansion";
  const city = place.replace(/,? (?:ON|Ont\.?|Ontario)$/, "").replace(/ Centre$/, "");
  const id = /-(\d{6,})\.html$/.exec(card.href)?.[1] ?? card.href;
  const row: SignalRow = {
    source_type: "newswire_release",
    source_record_id: id,
    raw_entity_name: name,
    entity_key: key,
    occupier_status: "named",
    signal_strength: "announcement",
    title: card.title,
    summary: [card.teaser || null, "From the newswire.ca listing (title and first sentence); open the release for the full text."].filter(Boolean).join(" "),
    url: `${NEWSWIRE}${card.href}`,
    published_at: date,
    event_at: null,
    location: city === "Ontario" ? "Ontario" : `${city}, Ontario`,
    raw: { kind, place, list_sector: card.sector, teaser: card.teaser, name_from: TITLE_NAME.test(card.title) ? "title" : "teaser" },
    sector,
  };
  return { row };
}

// Wait between list pages; retry twice on a network error, 429 or 5xx.
async function fetchText(ctx: IngestContext, url: string, headers: Record<string, string>): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((r) => setTimeout(r, attempt ? 3000 * attempt : 1000));
    try {
      const res = await ctx.fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (res.ok) return await res.text();
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      // network error: retry
    }
  }
  return null;
}

async function* runNewswire(ctx: IngestContext): AsyncGenerator<IngestItem> {
  const stored = ctx.stored ?? new Map();
  const days = stored.size ? DAILY_DAYS : FIRST_RUN_DAYS;
  const since = new Date(Date.parse(`${ctx.today}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const headers = { "user-agent": "Mozilla/5.0 (compatible; FirstMovers-OpenDataIngest/1.0)" };
  const seen = new Set<string>();
  // The site throttles repeated requests: this source gets at most 90 s of the daily job.
  const stopAt = Math.min(ctx.deadline ?? Infinity, Date.now() + RUN_BUDGET_MS);
  for (const list of NEWSWIRE_LISTS) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (Date.now() > stopAt) {
        yield { skip: "stopped at the time limit; continues next run" };
        return;
      }
      await ctx.progress(`Newswire: ${list.path.split("/").pop()} page ${page}`);
      const html = await fetchText(ctx, `${NEWSWIRE}/news-releases/${list.path}/?page=${page}&pagesize=100`, headers);
      if (html === null) {
        yield { skip: "list page could not be read (retried); continues next run" };
        break;
      }
      const cards = parseList(html);
      if (!cards.length) break;
      for (const card of cards) {
        const id = /-(\d{6,})\.html$/.exec(card.href)?.[1] ?? card.href;
        if (seen.has(id) || stored.has(id)) continue;
        seen.add(id);
        if (card.date && card.date < since) continue;
        yield mapCard({ ...card, sector: list.sector }, ctx);
      }
      const oldest = cards.map((c) => c.date).filter((d): d is string => Boolean(d)).sort()[0];
      if (oldest && oldest < since) break;
    }
  }
}

export const newswireReleases: IngestSource = {
  source: "newswire_release",
  label: "Newswire releases (newswire.ca)",
  description: "Company news releases announcing an Ontario facility, store, expansion or closing, from six newswire.ca categories (manufacturing, logistics, retail, restaurants, supermarkets, public companies). Listing pages only.",
  snapshot: true,
  run: runNewswire,
};
