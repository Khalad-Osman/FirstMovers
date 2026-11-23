import { normalizeCompanyName } from "@/lib/research/normalize";
import type { IngestContext, IngestItem, IngestSource, SignalRow } from "./types";

// FedDev Ontario funding announcements (added 2026-11-23). The Government of
// Canada news API lists the agency's releases (checked 2026-11-23: ~48 a year,
// newest first, `dept=economicdevelopmentsouthernontario`); each release names
// the companies funded and what for, often weeks or months before the
// Proactive Disclosure grants data (7 of 8 sampled companies weren't in it).
// Two formats: a backgrounder table (Recipient | Project | Total cost |
// Contribution), or sentences ("X is receiving $1 million to …"). No AI.

export const FEDDEV_API =
  "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=economicdevelopmentsouthernontario&type=newsreleases&sort=publishedDate&orderBy=desc&pick=100&format=json";

export type FeedEntry = { link: string; title: string; teaser?: string; publishedDate: string };
export type Funded = { name: string; purpose: string; contribution: number | null; projectCost: number | null; city: string | null; about: string | null };

const decode = (s: string) =>
  s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#39;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&[lr]dquo;|&#822[01];/g, '"');
const textOf = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const mainOf = (html: string) => html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;

// "$1,000,000", "$6.5 million", "over $650,000" -> dollars
export function dollars(s: string | null | undefined): number | null {
  const m = /\$\s?([\d.,]+)\s*[- ]?(million|billion)?/i.exec(s ?? "");
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (m[2]?.toLowerCase() === "billion" ? 1e9 : m[2] ? 1e6 : 1));
}

// Not occupiers: public bodies, schools, networks, clubs and programmes.
const NOT_COMPANY =
  /\b(?:college|university|city of|town of|region of|county of|municipality|government|feddev|community futures|cfdc|chamber of commerce|association|foundation|council|network|club|league|institute|hub|centre for|center for|accelerator|incubator|board of trade|toronto global|invest|society|fund)\b|^a\.?f\.?c\b|\bhealth cent(?:re|er)\b|^organization for\b|\bmentorship\b|^tbdc\b/i;
// Funding to run a programme for other businesses (entrepreneurship support), not for the recipient's own operations.
const PROGRAMME_DELIVERY = /^(?:to )?deliver\b|\bhelp (?:\w+ ){0,2}entrepreneurs\b|\bentrepreneurship (?:program|ecosystem|support)|\b(?:accelerator|incubator) program/i;

// Facility or capacity growth vs equipment in place vs other (markets, AI, R&D).
const FACILITY =
  /\bexpand\w*\s+(?:(?:its|their|the company's|domestic|current)\s+)?(?:(?:facility|facilities|plant|operations|capacity|footprint|space)\b|(?:production|manufacturing)\b(?!\s+capabilit))|\b(?:construct|build)\w*\s+(?:a\s+)?new\b|\bnew [\d,]+[- ]square[- ]f(?:oo|ee)t|\bnew (?:facility|plant|site|location|production line)|\b(?:increase|expand|scale)\w*\s+(?:its\s+|their\s+)?(?:production|manufacturing|fabrication|processing)?\s*capacity|\bproduction capacity|\bscale (?:up )?(?:its |their )?(?:production|manufacturing)\b(?!\s+capabilit)|\bbring more production|\breshor\w+|\brelocat\w+|\bestablish\w*\b(?:\s+\S+){0,6}?\s+(?:facility|plant|centre|center|production (?:line|facility)|manufacturing (?:facility|plant|line))\b/i;
const EQUIPMENT = /\bequipment|automat\w+|machin\w+|robot\w*|production line|facility upgrades?|modernize|modernizing|retool\w*|processing technolog/i;

export function fundedKind(purpose: string): "facility" | "equipment" | "other" {
  if (FACILITY.test(purpose)) return "facility";
  if (EQUIPMENT.test(purpose)) return "equipment";
  return "other";
}

// The dateline city: "August 27, 2026 – Etobicoke, Ontario"
export function datelineCity(text: string): string | null {
  return /\b[A-Z][a-z]+ \d{1,2}, \d{4}\s*[–—-]\s*([A-Z][A-Za-z .'-]{2,40}?), Ontario\b/.exec(text)?.[1].trim() ?? null;
}
const basedCity = (s: string) => {
  const c = /\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)?)-based\b/.exec(s)?.[1]?.replace(/^(?:The|Ontario|Canada)\s+/, "") ?? null;
  return c && !/^(?:Ontario|Canada|Canadian|Ontario's)$/i.test(c) ? c : null;
};

// ---------- Backgrounder table --------------------------------------------------
export function parseBackgrounder(html: string): Funded[] {
  const out: Funded[] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => textOf(m[1]));
    if (cells.length < 3 || /recipient/i.test(cells[0])) continue;
    const name = cells[0].replace(/\s*\(.*\)$/, "").trim();
    const project = cells[1];
    const [purpose, ...rest] = project.split(/(?<=\.)\s+(?=(?:Founded|Incorporated|Established|Based|Since|Headquartered|A |An |The )\b)/);
    const about = rest.join(" ") || null;
    // A fuller legal name often appears in the description ("All Wood Fine Interiors Ltd. specializes …").
    const legal = about ? new RegExp(String.raw`\b(${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s+(?:Inc|Ltd|Limited|Corp|Corporation|Co|ULC|LLC)\.?)`, "i").exec(about)?.[1] : null;
    out.push({
      name: legal ?? name,
      purpose: purpose.trim(),
      projectCost: dollars(cells[2]),
      contribution: dollars(cells[3] ?? cells[2]),
      city: basedCity(project),
      about,
    });
  }
  return out;
}

// ---------- Release sentences ---------------------------------------------------
const VERB = /\s(?:is receiving|will receive|receives|is undertaking|will use|is getting)\s/;
const CAP_WORD = /^(?:[A-Z0-9][\w.&'’-]*|\([^)]*\)|of|and|&|de|du)$/;

// The company name just before the verb: "Concord-based aerospace … company Letar Inc."
// -> "Letar Inc."; "As part of this announcement, SWTCH Energy" -> "SWTCH Energy".
export function nameBefore(segment: string): string | null {
  const parts = segment.split(/,\s*/);
  const tries = [parts[parts.length - 1], parts[0]];
  for (const t of tries) {
    const words = t.trim().split(/\s+/);
    const run: string[] = [];
    for (let i = words.length - 1; i >= 0 && CAP_WORD.test(words[i]); i--) run.unshift(words[i]);
    while (run.length && /^(?:of|and|&|de|du|\(.*\))$/i.test(run[0])) run.shift();
    const name = run.join(" ").replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (name.length >= 3 && run.length <= 7 && !/^(?:The|Today|This|These|Through|As|With|FedDev|Government|Canada|Ontario|Minister|January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(name)) return name.replace(/^[A-Z][\w.'-]*-based\s+/, "");
  }
  return null;
}

const DATELINE = /\b[A-Z][a-z]+ \d{1,2}, \d{4}\s*[–—-]\s*[A-Z][A-Za-z .'-]{2,40}?, Ontario\b\s*/g;

export function parseReleaseSentences(text: string): Funded[] {
  const out: Funded[] = [];
  for (const sentence of text.replace(DATELINE, ". ").split(/(?<!\b(?:Co|Inc|Ltd|Corp|St|Mr|Ms|Dr|No|Intl)\.)(?<=[.!?])\s+(?=[A-Z])/)) {
    const m = VERB.exec(sentence);
    if (!m) continue;
    let before = sentence.slice(0, m.index);
    // "Melnik Resources in Mount Brydges is receiving" -> name + place
    const inPlace = /,?\s+in\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})\s*,?\s*$/.exec(before);
    if (inPlace) before = before.slice(0, inPlace.index);
    const after = sentence.slice(m.index + m[0].length);
    const name = nameBefore(before);
    if (!name) continue;
    const purpose = /\bto ((?:support|expand|scale|increase|adopt|modernize|establish|build|grow|develop|commercialize|strengthen|enhance|improve|accelerate|integrate|launch|bring|diversify|automate|upgrade|implement|purchase|acquire|enter|boost)\b[^.]*)/i.exec(after)?.[1] ?? after;
    const amounts = [...after.matchAll(/\$\s?[\d.,]+\s*[- ]?(?:million|billion)?(?:[- ]project)?/gi)].map((x) => x[0]);
    const projectAmt = amounts.find((a) => /project/i.test(a)) ?? (/\btowards? an? (?:over |more than |almost |nearly )?(\$[^ ]+(?: million)?)/i.exec(after)?.[1] ?? null);
    const contribution = /is undertaking/.test(m[0]) ? amounts.find((a) => !/project/i.test(a)) ?? null : amounts[0] ?? null;
    out.push({
      name,
      purpose: purpose.replace(/\s+/g, " ").trim(),
      contribution: dollars(contribution),
      projectCost: dollars(projectAmt),
      city: basedCity(before) ?? inPlace?.[1] ?? null,
      about: null,
    });
  }
  return out;
}

// One release (plus its backgrounder when linked) -> one row per funded company.
export function mapRelease(
  entry: FeedEntry,
  pages: { release: string; backgrounder?: string | null; backgrounderUrl?: string | null },
  ctx: Pick<IngestContext, "today" | "cutoff">,
): IngestItem[] {
  const date = entry.publishedDate.slice(0, 10);
  if (date < ctx.cutoff) return [{ skip: "older than 12 months" }];
  if (date > ctx.today) return [{ skip: "dated in the future" }];
  const text = textOf(mainOf(pages.release));
  const city = datelineCity(text);
  const table = pages.backgrounder ? parseBackgrounder(mainOf(pages.backgrounder)) : [];
  const funded = table.length ? table : parseReleaseSentences(text);
  const seen = new Set<string>();
  const out: IngestItem[] = [];
  for (const f of funded) {
    if (/^(?:inc|ltd|limited|corp|corporation|co|ulc|llc)\.?$/i.test(f.name.trim())) continue;
    if (NOT_COMPANY.test(f.name) || PROGRAMME_DELIVERY.test(f.purpose)) {
      out.push({ skip: "not a company (public body, school, network or programme)" });
      continue;
    }
    const key = normalizeCompanyName(f.name);
    if (key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    const place = f.city ?? city;
    const kind = fundedKind(f.purpose);
    const slug = entry.link.replace(/\.html?$/, "").split("/").pop() ?? entry.link;
    const row: SignalRow = {
      source_type: "feddev_news",
      // Date first, so the newest stored id gives the newest release read.
      source_record_id: `${date}:${slug}:${key}`.slice(0, 250),
      raw_entity_name: f.name,
      entity_key: key,
      occupier_status: "not_applicable",
      signal_strength: "grant",
      title: `FedDev Ontario funding: ${f.name}`,
      summary: [
        f.purpose && `Purpose: ${f.purpose}`,
        f.contribution ? `FedDev Ontario contribution: $${f.contribution.toLocaleString("en-CA")}` : null,
        f.projectCost ? `Project cost: $${f.projectCost.toLocaleString("en-CA")}` : null,
        f.about,
      ]
        .filter(Boolean)
        .join(". "),
      url: (table.length ? pages.backgrounderUrl : null) ?? entry.link,
      published_at: date,
      event_at: null,
      location: place ? `${place}, Ontario` : "Ontario",
      raw: {
        release_title: entry.title,
        release_url: entry.link,
        backgrounder_url: table.length ? pages.backgrounderUrl ?? null : null,
        company: f.name,
        purpose: f.purpose,
        about: f.about,
        contribution: f.contribution,
        project_cost: f.projectCost,
        city: place,
        grant_kind: kind,
      },
    };
    out.push({ row });
  }
  if (!out.length) out.push({ skip: "no company named" });
  return out;
}

const PAUSE_MS = 300;
const RECHECK_DAYS = 21; // releases are rarely edited; re-read the last three weeks

async function* runFeddev(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Reading FedDev Ontario releases");
  const res = await ctx.fetchImpl(FEDDEV_API, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`FedDev news API failed (${res.status})`);
  const entries = (((await res.json()) as { feed?: { entry?: FeedEntry[] } }).feed?.entry ?? []).filter((e) => e.link && e.publishedDate);
  const newest = ctx.known?.newestId?.slice(0, 10) ?? null;
  const from = newest ? new Date(Date.parse(`${newest}T00:00:00Z`) - RECHECK_DAYS * 86_400_000).toISOString().slice(0, 10) : ctx.cutoff;
  // Oldest first, so a run stopped by the time limit continues from where it got to.
  const todo = entries.filter((e) => e.publishedDate.slice(0, 10) >= (from > ctx.cutoff ? from : ctx.cutoff)).reverse();
  let n = 0;
  for (const e of todo) {
    if (ctx.deadline && Date.now() > ctx.deadline) {
      await ctx.progress(`Stopped for the time limit after ${n} releases; the next run continues`);
      return;
    }
    const page = await ctx.fetchImpl(e.link, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "FirstMovers-OpenDataIngest/1.0" } });
    if (!page.ok) {
      yield { skip: `release page error (HTTP ${page.status})` };
      continue;
    }
    const html = await page.text();
    const bgHref = /href="([^"]+)"[^>]*>[^<]*backgrounder[^<]*</i.exec(html)?.[1] ?? null;
    let backgrounder: string | null = null;
    let backgrounderUrl: string | null = null;
    if (bgHref) {
      backgrounderUrl = new URL(bgHref, e.link).href;
      await new Promise((r) => setTimeout(r, PAUSE_MS));
      const bg = await ctx.fetchImpl(backgrounderUrl, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "FirstMovers-OpenDataIngest/1.0" } });
      backgrounder = bg.ok ? await bg.text() : null;
    }
    for (const item of mapRelease(e, { release: html, backgrounder, backgrounderUrl }, ctx)) yield item;
    if (++n % 10 === 0) await ctx.progress(`Read ${n} of ${todo.length} FedDev Ontario releases`);
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
}

export const feddevNews: IngestSource = {
  source: "feddev_news",
  label: "FedDev Ontario funding announcements",
  description: "Federal funding announcements for southern Ontario companies in the last 12 months: who was funded, for what, and how much.",
  run: runFeddev,
};
