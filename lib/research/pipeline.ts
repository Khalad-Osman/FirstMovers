import { createHash } from "node:crypto";
import { recencyTier } from "@/lib/analysis/recency";
import type { Firecrawl, ScrapeResult, SearchResult } from "@/lib/firecrawl/client";
import { FirecrawlError } from "@/lib/firecrawl/client";
import { findPublishedDate, type DateMethod } from "./dates";
import { companyQueries, followUpQuery, sinceMonthsTbs } from "./queries";
import { groupKey } from "@/lib/discovery/candidates";
import { normalizeCompanyName } from "./normalize";
import { themeMatches, themeQuery, type ResearchFilters } from "./filters";
import { canonicalUrl, EXCLUDED_DOMAINS, hostOf, isExcluded, rankCandidates, type Candidate } from "./select";

export const SEARCH_LIMIT = 5; // results per company search (2 credits each)
export const THEME_LIMIT = 10; // results for a theme search (2 credits)
export const EXCERPT_STORE_LIMIT = 20_000; // characters kept per source
const MIN_CONTENT = 200; // characters; shorter pages are not useful sources

export type SessionPatch = {
  status?: "searching" | "scraping" | "ready" | "failed";
  progress?: string | null;
  error?: string | null;
  source_ids?: string[];
  theme_results?: { url: string; title: string; description: string; publisher: string; matches?: string[] }[];
  usage?: Record<string, number>;
};

export type CollectedSource = {
  url: string;
  publisher: string;
  title: string;
  publishedAt: string | null;
  dateMethod: DateMethod;
  excerpt: string;
  contentHash: string;
  query: string;
};

export interface ResearchStore {
  update(sessionId: string, patch: SessionPatch): Promise<void>;
  saveSource(source: CollectedSource): Promise<string>; // returns sources.id
}

export type PipelineDeps = {
  firecrawl: Pick<Firecrawl, "search" | "scrape" | "usage">;
  store: ResearchStore;
  today: string; // YYYY-MM-DD
  maxSources: number; // ≤ 5 (CLAUDE.md §8)
  seedUrls?: string[]; // scraped first
  // Already-saved public record sources (permits, awards; lib/research/records.ts).
  // They go first in the session and don't count toward maxSources (web pages).
  recordSourceIds?: string[];
};

function usageOf(deps: PipelineDeps) {
  return { firecrawl_requests: deps.firecrawl.usage.requests, firecrawl_credits: deps.firecrawl.usage.credits };
}

function firstString(v: unknown): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

// "Soft 404": the site answered 200 but redirected to an error or listing page
// (e.g. jobs.jobvite.com/…/jobs?error=404), or the page says it wasn't found.
const ERROR_PARAM = /^(error|err|status|code)$/i;
const ERROR_VALUE = /^(404|410|not[-_ ]?found|notfound|gone)$/i;
const ERROR_PATH = /\/(404|410|not[-_]?found|page[-_]not[-_]found|error)(\/|\.html?)?$/i;
// Not a bare "404": Highway 404 is a GTA industrial corridor and shows up in real news titles.
const ERROR_TITLE = /^\s*(?:404|not found)\s*$|\b(?:404 (?:error|not found|page)|error 404|page not found|page (?:does not|doesn't) exist|(?:job|posting|page) (?:is )?no longer available)\b/i;

export function isSoftErrorPage(page: Pick<ScrapeResult, "url" | "metadata">): boolean {
  try {
    const u = new URL(page.url);
    if ([...u.searchParams].some(([k, v]) => ERROR_PARAM.test(k) && ERROR_VALUE.test(v))) return true;
    if (ERROR_PATH.test(u.pathname)) return true;
  } catch {
    return true; // unparseable final URL
  }
  return ERROR_TITLE.test(firstString(page.metadata.title) ?? "");
}

// Where the company is first named in the raw page text (-1 if not found).
// Words of the normalized name may be separated by any punctuation or spacing,
// and "and" also matches "&".
export function firstMention(text: string, companyName: string): number {
  const keys = [...new Set([normalizeCompanyName(companyName), groupKey(companyName)])].filter((k) => k.length >= 4);
  let best = -1;
  for (const k of keys) {
    const words = k.split(" ").map((w) => (w === "and" ? "(?:and|&)" : w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const m = new RegExp(`(?<![a-z0-9])${words.join("[^a-z0-9]+")}(?![a-z0-9])`, "i").exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

// The model reads the first EXCERPT_LIMIT (6,000) characters of a source. When
// the company is first named further down (importer lists, directories, long
// documents), start the stored excerpt shortly before that mention so the part
// about the company is what gets analyzed.
export const FOCUS_AFTER = 3000;
const FOCUS_LEAD = 1000;
export function focusedExcerpt(markdown: string, companyName?: string): string {
  const at = companyName ? firstMention(markdown, companyName) : -1;
  if (at <= FOCUS_AFTER) return markdown.slice(0, EXCERPT_STORE_LIMIT);
  const note = "[Excerpt starts shortly before the first mention of the company; earlier page text omitted.]\n\n";
  return (note + markdown.slice(at - FOCUS_LEAD)).slice(0, EXCERPT_STORE_LIMIT);
}

function toSource(page: ScrapeResult, candidate: Candidate, today: string, companyName?: string): CollectedSource {
  const meta = page.metadata;
  const lower = new Map(Object.entries(meta).map(([k, v]) => [k.toLowerCase(), v]));
  const host = hostOf(page.url) ?? hostOf(candidate.url) ?? "unknown site";
  const { publishedAt, method } = findPublishedDate(page, today);
  return {
    url: canonicalUrl(page.url),
    publisher: firstString(lower.get("og:site_name")) ?? firstString(lower.get("ogsitename")) ?? host,
    title: firstString(meta.title) ?? (candidate.title || host),
    publishedAt,
    dateMethod: method,
    excerpt: focusedExcerpt(page.markdown, companyName),
    contentHash: createHash("sha256").update(page.markdown).digest("hex"),
    query: candidate.query,
  };
}

// Does the page name the company? Compared on normalized text, with and without
// legal suffixes, bracketed qualifiers and a trailing "Canada"/"Ontario"
// ("Thermo Fisher Scientific (Mississauga) Inc." matches "Thermo Fisher Scientific").
// Search results for small private companies often include pages that never
// mention them (importer lists, login pages, other companies' records).
export function mentionsCompany(text: string, companyName: string): boolean {
  const keys = [normalizeCompanyName(companyName), groupKey(companyName)].filter((k) => k.length >= 4);
  if (keys.length === 0) return true; // too short to test reliably
  const haystack = ` ${normalizeCompanyName(text.slice(0, 200_000))} `;
  return keys.some((k) => haystack.includes(` ${k} `));
}

// Scrape candidates in order until `want` usable sources are collected.
async function scrapeSome(
  candidates: Candidate[],
  want: number,
  seen: Set<string>,
  deps: PipelineDeps,
  out: { source: CollectedSource; id: string }[],
  onProgress: () => Promise<void>,
  companyName?: string, // when set, a page that never names the company is not kept
): Promise<void> {
  let attempts = 0;
  const maxAttempts = want + 3; // a few spares for unreadable pages
  for (const c of candidates) {
    if (want <= 0 || attempts >= maxAttempts) return;
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    attempts++;
    let page: ScrapeResult;
    try {
      page = await deps.firecrawl.scrape(c.url);
    } catch (e) {
      if (e instanceof FirecrawlError && e.status === 402) throw e;
      continue; // unreachable or blocked page: try the next candidate
    }
    if (page.markdown.trim().length < MIN_CONTENT || isExcluded(page.url) || isSoftErrorPage(page)) continue;
    if (companyName && !mentionsCompany(`${firstString(page.metadata.title) ?? ""}\n${page.markdown}`, companyName)) continue;
    const source = toSource(page, c, deps.today, companyName);
    if (out.some((o) => o.source.url === source.url)) continue;
    const id = await deps.store.saveSource(source);
    out.push({ source, id });
    seen.add(source.url);
    want--;
    await onProgress();
  }
}

export async function runCompanyResearch(sessionId: string, companyName: string, deps: PipelineDeps): Promise<void> {
  const { store, firecrawl, today } = deps;
  const max = Math.max(1, Math.min(5, deps.maxSources));
  const collected: { source: CollectedSource; id: string }[] = [];
  const records = deps.recordSourceIds ?? [];
  const allIds = () => [...records, ...collected.map((c) => c.id)];
  const done = () => {
    const parts = [
      records.length ? `${records.length} public record${records.length === 1 ? "" : "s"}` : null,
      collected.length || !records.length ? `${collected.length} web source${collected.length === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return `Collected ${parts.join(" and ")}`;
  };
  // With public records in hand, a web search that finds nothing is not a failure.
  class NoWebSources extends Error {}

  try {
    // 1. Search
    const queries = companyQueries(companyName);
    const tbs = sinceMonthsTbs(24, today); // older material is Historical anyway
    const results: { query: string; results: SearchResult[] }[] = [];
    const searchErrors: string[] = [];
    for (const [i, query] of queries.entries()) {
      await store.update(sessionId, { status: "searching", progress: `Searching (${i + 1} of ${queries.length})` });
      try {
        results.push({ query, results: await firecrawl.search({ query, limit: SEARCH_LIMIT, tbs, excludeDomains: EXCLUDED_DOMAINS }) });
      } catch (e) {
        if (e instanceof FirecrawlError && e.status === 402) throw e;
        searchErrors.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (results.length === 0) {
      if (records.length) throw new NoWebSources();
      throw new Error(`All searches failed. ${searchErrors[0] ?? ""}`.trim());
    }

    const candidates = rankCandidates(results, companyName);
    if (candidates.length === 0 && !deps.seedUrls?.length) {
      if (records.length) throw new NoWebSources();
      throw new Error(`No usable sources found for "${companyName}". Check the spelling or try the full legal name.`);
    }

    // 2. Scrape, keeping one slot for a follow-up search when possible
    const seen = new Set<string>();
    const progress = () =>
      store.update(sessionId, { status: "scraping", progress: `Reading sources (${collected.length} of up to ${max})`, usage: usageOf(deps) });
    await progress();
    if (deps.seedUrls?.length) {
      const seeds = deps.seedUrls.map((url) => ({ url: canonicalUrl(url), title: "", description: "", query: "seed", score: 0 }));
      await scrapeSome(seeds, Math.min(seeds.length, max - 1 || 1), seen, deps, collected, progress);
    }
    await scrapeSome(candidates, Math.max(0, (max > 1 ? max - 1 : max) - collected.length), seen, deps, collected, progress, companyName);

    // 3. Follow-up: the main announcement is 12–24 months old and nothing recent was found
    const tiers = collected.map((c) => recencyTier({ publishedAt: c.source.publishedAt, eventAt: null }, today));
    const needsFollowUp = collected.length < max && !tiers.includes("recent") && tiers.includes("context");
    if (needsFollowUp) {
      const anchor = collected[tiers.indexOf("context")].source;
      const query = followUpQuery(companyName, anchor.title);
      await store.update(sessionId, { status: "searching", progress: "Follow-up search for recent developments" });
      try {
        const follow = await firecrawl.search({ query, limit: SEARCH_LIMIT, tbs: sinceMonthsTbs(12, today), excludeDomains: EXCLUDED_DOMAINS });
        await scrapeSome(rankCandidates([{ query, results: follow }], companyName), max - collected.length, seen, deps, collected, progress, companyName);
      } catch (e) {
        if (e instanceof FirecrawlError && e.status === 402) throw e;
      }
    }
    // 4. Fill any remaining slot from the original candidates
    if (collected.length < max) await scrapeSome(candidates, max - collected.length, seen, deps, collected, progress, companyName);

    if (collected.length === 0 && !records.length) throw new Error("Found search results, but none of the pages could be read.");

    await store.update(sessionId, { status: "ready", progress: done(), source_ids: allIds(), usage: usageOf(deps), error: null });
  } catch (e) {
    if (e instanceof NoWebSources) {
      await store.update(sessionId, { status: "ready", progress: done(), source_ids: allIds(), usage: usageOf(deps), error: null });
      return;
    }
    await store.update(sessionId, {
      status: "failed",
      progress: null,
      error: e instanceof Error ? e.message : String(e),
      source_ids: allIds(),
      usage: usageOf(deps),
    });
  }
}

export async function runThemeSearch(sessionId: string, theme: string, deps: PipelineDeps, filters?: ResearchFilters | null): Promise<void> {
  const { store, firecrawl, today } = deps;
  try {
    await store.update(sessionId, { status: "searching", progress: "Searching" });
    // Region and company-type filters add a few terms; same cost (one search).
    const results = await firecrawl.search({ query: themeQuery(theme, filters), limit: THEME_LIMIT, tbs: sinceMonthsTbs(24, today), excludeDomains: EXCLUDED_DOMAINS });
    const seen = new Set<string>();
    const theme_results = results
      .filter((r) => !isExcluded(r.url))
      .map((r) => ({
        url: canonicalUrl(r.url),
        title: r.title || r.url,
        description: r.description,
        publisher: hostOf(r.url) ?? "",
        matches: themeMatches(`${r.title} ${r.description}`, filters),
      }))
      .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
      // Results that match more filters first; otherwise keep the search order.
      .map((r, i) => ({ r, i }))
      .sort((a, b) => b.r.matches.length - a.r.matches.length || a.i - b.i)
      .map(({ r }) => r);
    await store.update(sessionId, {
      status: theme_results.length ? "ready" : "failed",
      progress: `${theme_results.length} result${theme_results.length === 1 ? "" : "s"}`,
      error: theme_results.length ? null : "No results for this theme. Try different or broader words.",
      theme_results,
      usage: usageOf(deps),
    });
  } catch (e) {
    await store.update(sessionId, {
      status: "failed",
      progress: null,
      error: e instanceof Error ? e.message : String(e),
      usage: usageOf(deps),
    });
  }
}
