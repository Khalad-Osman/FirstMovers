import { normalizeCompanyName } from "@/lib/research/normalize";
import type { IngestContext, IngestItem, IngestSource } from "./types";
import { placeIn } from "./ontario-news";

// Environmental Registry of Ontario (checked 2026-11-18). No API: each notice is
// a public page https://ero.ontario.ca/notice/{YYY-NNNN} (robots.txt allows
// /notice/, disallows /search/). Numbers are sequential within a year
// (026-0001…), with gaps. About 120 notices a month; ~16 are Environmental
// Compliance Approvals for air or multiple media, ~4 of them in the GTA. They
// name the proponent and site address and describe the change, usually at the
// proposal stage, before equipment is installed.

export const ERO_BASE = "https://ero.ontario.ca/notice/";
const PAUSE_MS = 300; // polite pace
const MISS_LIMIT = 15; // consecutive missing numbers that end a forward scan
const OLD_LIMIT = 30; // consecutive notices older than the cutoff that end a backfill

export const eroId = (year: number, n: number) => `${String(year % 1000).padStart(3, "0")}-${String(n).padStart(4, "0")}`;
export const parseEroId = (id: string) => {
  const m = /^(\d{3})-(\d{4})$/.exec(id);
  return m ? { year: 2000 + Number(m[1]), n: Number(m[2]) } : null;
};

const decode = (s: string) => s.replace(/&#0?39;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"');
export function pageText(html: string): string {
  return decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function isoFromLong(s: string | undefined): string | null {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(s?.trim() ?? "");
  const mo = m ? MONTHS.indexOf(m[1]) + 1 : 0;
  return m && mo ? `${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

export type EroNotice = {
  id: string;
  title: string;
  instrumentType: string | null;
  stage: string | null;
  posted: string | null; // YYYY-MM-DD (proposal or decision posted)
  proponent: string | null;
  siteAddress: string | null;
  summary: string | null;
  details: string | null;
};

// Reads the labelled fields of a notice page.
export function parseNotice(id: string, html: string): EroNotice {
  const t = pageText(html);
  const field = (re: RegExp) => re.exec(t)?.[1]?.trim() ?? null;
  const title = decode((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return {
    id,
    title,
    instrumentType: field(/Instrument type:\s+(.+?)\s+ERO number/),
    stage: field(/Notice stage\s+(\w+)/),
    posted: isoFromLong(field(/(?:Decision|Proposal) posted\s+([A-Z][a-z]+ \d{1,2}, \d{4})/) ?? undefined),
    proponent: field(/Proponent\(s\)\s+(.{2,150}?)\s+\d{1,6}[A-Za-z]?\s/),
    siteAddress: field(/Site address\s+(.+?)\s+(?:Site location|The location pin|View this location|Proponent)/),
    summary: field(/(?:Proposal|Decision) summary\s+(.+?)\s+On this page/),
    details: field(/(?:Proposal|Decision) details\s+(.+?)\s+(?:Supporting materials|Comments received|Effects of consultation|Connect with us|Original proposal)/),
  };
}

const ECA = /Environmental Compliance Approval \((?:air|multiple media|air (?:&|and) noise)/i;
// Not industrial occupiers (or not about their own premises).
const NOT_OCCUPIER = /\b(?:paving|asphalt|cremat\w*|crematorium|funeral|landfill|aggregate|quarry|pit\b|golf|municipality|city of|town of|township|region of|county of|school board|hospital|university|college|construction (?:ltd|limited|inc))\b/i;
// Growth language: a new approval, new site, more lines or more capacity.
const GROWTH = /\bnew (?:environmental compliance approval|facility|plant|site|production line|line|building)|\b(?:additional|new) (?:production |processing |manufacturing |coating |paint |spray )?(?:lines?|equipment|sources?|booths?|ovens?|kilns?|furnaces?)\b|\bincreas\w* (?:in )?(?:production|capacity|throughput)|\bexpan\w+|\brelocat\w+|\bestablish\w*/i;
// Paperwork, not a change on the ground: renewing operational-flexibility
// conditions, consolidating approvals, corrections, name or owner changes.
const ADMIN = /\brenewal of (?:the |an? )?(?:environmental compliance approval with )?limited operational flexibility|\b(?:an )?(?:amended environmental compliance approval|amendment to environmental compliance approval[^.]*?) with (?:limited )?operational\b(?![^.]*\bto (?:add|install|increase|expand|modify|replace|include)\b)|\breplaces all (?:of )?the (?:current|existing) environmental compliance approvals|\b(?:correct(?:ion|ing)|administrative amendment|transfer of ownership|change of (?:name|owner)|name change|previously known as)\b/i;

// Standard wording in every Limited Operational Flexibility approval ("It permits
// modifications such as process changes, de-bottlenecking or addition of new
// equipment…") describes what the approval allows, not a project. Drop those
// sentences before looking for growth language.
export function stripBoilerplate(text: string): string {
  return text
    .split(/(?<=\.)\s+/)
    .filter((s) => !/\bpermits modifications such as\b|\blimits on operational flexibility\b|\blimited operational flexibility conditions will expire\b|\bapplication for amendment at that time\b/i.test(s))
    .join(" ");
}

export function approvalKind(raw: string): "growth" | "change" | "admin" {
  const text = stripBoilerplate(raw);
  return GROWTH.test(text) ? "growth" : ADMIN.test(text) ? "admin" : "change";
}

// The legal name: drop a French duplicate ("Sofina Foods Inc. Aliments Sofina Inc.")
// and an operating name ("St. Marys Cement Inc. (Canada) operating as CBM Ready Mix").
export function legalName(raw: string): string {
  // "X GP Inc. as general partner for and on behalf of X LP" -> the operating partnership "X LP"
  // (postings include typos such as "on behald of"); with no partnership named
  // ("Suncor Energy Inc. and 1277136 Alberta Ltd. as general partners"), the first partner.
  const partner = /\bas (?:the )?general partners? (?:for and )?(?:on beha\w* of|of)\s+(.+)$/i.exec(raw);
  const partners = /^(.+?),?\s+as (?:the )?general partners?\s*$/i.exec(raw);
  let n = partner ? partner[1] : partners ? partners[1].split(/\s+and\s+(?=[A-Z0-9])/)[0] : raw;
  n = n.replace(/\s+(?:operating as|o\/a|carrying on business as|c\.o\.b\. as)\s+.*$/i, "").trim();
  // "Dana Canada Corporation/Corporation Dana Canada" -> the English half
  if (/\S\s*\/\s*\S/.test(n) && !/\bo\/a\b/i.test(n)) n = n.split(/\s*\/\s*/)[0];
  const firstSuffix = /^(.+?\b(?:Inc|Ltd|Limited|Corp|Corporation|ULC|LLC|Company|Co)\.?(?:\s*\([^)]*\))?)\s+\S.*$/.exec(n);
  if (firstSuffix && /\b(?:Inc|Ltée|Ltee|Limitée|Limitee|Ltd|Limited)\.?$/i.test(n)) n = firstSuffix[1];
  return n.trim();
}

// "2714 Bristol Circle Oakville, ON L6H 6A1 Canada" -> city "Oakville",
// location "2714 Bristol Circle, Oakville, Ontario" (the form other sources use).
export function placeFrom(address: string | null): { city: string | null; location: string | null } {
  if (!address) return { city: null, location: null };
  const beforeOn = address.replace(/,?\s+ON\b[\s\S]*$/, "").trim();
  const city = placeIn(beforeOn) ?? beforeOn.split(/\s+/).at(-1) ?? null;
  const street = city && beforeOn.endsWith(city) ? beforeOn.slice(0, -city.length).trim() : beforeOn;
  return { city, location: [street, city, "Ontario"].filter(Boolean).join(", ") };
}

export function mapNotice(n: EroNotice, ctx: Pick<IngestContext, "cutoff" | "today">): IngestItem {
  if (!ECA.test(`${n.instrumentType ?? ""} ${n.title}`)) return { skip: "not an air or multi-media approval" };
  if (!n.posted) return { skip: "no posted date" };
  if (n.posted < ctx.cutoff) return { skip: "older than 12 months" };
  if (n.posted > ctx.today) return { skip: "dated in the future" };
  const fullName = (n.title.split(/\s+[-–—]\s+Environmental Compliance Approval/i)[0] || n.proponent || "").replace(/^Decision to issue an .*? to /i, "").trim();
  if (!fullName) return { skip: "no proponent" };
  if (NOT_OCCUPIER.test(`${fullName} ${n.details ?? ""}`.slice(0, 400))) return { skip: "not an industrial occupier" };
  const name = legalName(fullName);
  const kind = approvalKind(`${n.summary ?? ""} ${n.details ?? ""}`);
  return {
    row: {
      source_type: "ero_approval",
      source_record_id: n.id,
      raw_entity_name: name,
      entity_key: normalizeCompanyName(name) || null,
      occupier_status: "not_applicable",
      signal_strength: "env_approval",
      title: `Environmental approval (${n.stage?.toLowerCase() ?? "notice"}): ${name}`,
      summary: (n.details ?? n.summary ?? "").slice(0, 700),
      url: `${ERO_BASE}${n.id}`,
      published_at: n.posted,
      event_at: null,
      location: placeFrom(n.siteAddress).location,
      raw: { ero_id: n.id, instrument_type: n.instrumentType, stage: n.stage, site_address: n.siteAddress, city: placeFrom(n.siteAddress).city, proponent: n.proponent, name_as_posted: fullName, summary: n.summary, details: n.details?.slice(0, 3000) ?? null, kind },
    },
  };
}

type Fetched = { status: "ok"; notice: EroNotice } | { status: "missing" } | { status: "error"; code: number };

const ERROR_LIMIT = 8; // consecutive page errors that mean the site is down: stop the run

// One notice page. A server error is retried once; a page that keeps failing
// (some notices return 500 permanently) is reported as an error and skipped.
async function fetchNotice(ctx: IngestContext, id: string, health = { errors: 0 }): Promise<Fetched> {
  for (let attempt = 1; ; attempt++) {
    const res = await ctx.fetchImpl(`${ERO_BASE}${id}`, { signal: AbortSignal.timeout(30_000) });
    // 404 = no such notice; 403 = a number reserved for a notice not published yet (or withdrawn).
    if (res.status === 404 || res.status === 403) {
      health.errors = 0;
      return { status: "missing" };
    }
    if (res.ok) {
      health.errors = 0;
      return { status: "ok", notice: parseNotice(id, await res.text()) };
    }
    if (attempt < 2 && res.status >= 500) {
      await sleep(2000);
      continue;
    }
    if (++health.errors >= ERROR_LIMIT) throw new Error(`Environmental Registry is not responding (HTTP ${res.status} for ${ERROR_LIMIT} notices in a row, last ${id}).`);
    return { status: "error", code: res.status };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timeLeft = (ctx: IngestContext) => ctx.deadline === undefined || Date.now() < ctx.deadline;

// Highest existing notice number this year: probe in steps, then walk forward.
async function newestNumber(ctx: IngestContext, year: number): Promise<number> {
  let n = 1;
  const exists = async (k: number) => {
    for (let j = 0; j < 4; j++) if ((await fetchNotice(ctx, eroId(year, k + j))).status === "ok") return true;
    return false;
  };
  if (!(await exists(1))) return 0;
  while (await exists(n + 100)) n += 100;
  let last = n;
  for (let k = n, misses = 0; misses < MISS_LIMIT; k++) {
    if ((await fetchNotice(ctx, eroId(year, k))).status === "ok") {
      last = k;
      misses = 0;
    } else misses++;
  }
  return last;
}

async function* run(ctx: IngestContext): AsyncGenerator<IngestItem> {
  const health = { errors: 0 };
  const year = Number(ctx.today.slice(0, 4));
  const known = ctx.known;
  const newest = known?.newestId ? parseEroId(known.newestId) : null;

  // 1. Forward: notices posted since the last run (and into a new year).
  if (newest) {
    for (const y of newest.year === year ? [year] : [newest.year, year]) {
      let misses = 0;
      for (let k = y === newest.year ? newest.n + 1 : 1; misses < MISS_LIMIT && timeLeft(ctx); k++) {
        const f = await fetchNotice(ctx, eroId(y, k), health);
        if (f.status === "missing") {
          misses++;
          continue;
        }
        misses = 0;
        if (f.status === "error") {
          yield { skip: `notice page error (HTTP ${f.code})` };
          continue;
        }
        yield mapNotice(f.notice, ctx);
        await sleep(PAUSE_MS);
      }
    }
    await ctx.progress("Read new notices");
  }

  // 2. Backfill: walk back from the oldest stored notice (or the newest
  // existing one) until notices are older than the 12-month cutoff. Skipped
  // when what's stored already reaches back to about the cutoff.
  const nearCutoff = known?.oldestDate && known.oldestDate <= addDays(ctx.cutoff, 30);
  if (nearCutoff) return;
  let start = known?.oldestId ? parseEroId(known.oldestId) : null;
  if (!start) start = { year, n: (await newestNumber(ctx, year)) + 1 };
  let older = 0;
  let read = 0;
  for (let y = start.year; y >= start.year - 1 && older < OLD_LIMIT; y--) {
    const top = y === start.year ? start.n - 1 : await newestNumber(ctx, y);
    for (let k = top; k >= 1 && older < OLD_LIMIT; k--) {
      if (!timeLeft(ctx)) {
        await ctx.progress(`Backfill paused at ${eroId(y, k)}; the next run continues`);
        return;
      }
      const f = await fetchNotice(ctx, eroId(y, k), health);
      if (f.status === "missing") continue;
      if (f.status === "error") {
        yield { skip: `notice page error (HTTP ${f.code})` };
        continue;
      }
      read++;
      older = f.notice.posted && f.notice.posted < ctx.cutoff ? older + 1 : 0;
      yield mapNotice(f.notice, ctx);
      if (read % 50 === 0) await ctx.progress(`Backfill: read ${read} notices (at ${eroId(y, k)})`);
      await sleep(PAUSE_MS);
    }
  }
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const eroApprovals: IngestSource = {
  source: "ero_approval",
  label: "Environmental approvals (Ontario registry)",
  description: "Environmental Compliance Approvals (air, multiple media) posted on the Environmental Registry of Ontario in the last 12 months: named companies changing or adding production, usually before installation.",
  run,
};
