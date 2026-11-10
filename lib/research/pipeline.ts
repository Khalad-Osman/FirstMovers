import { createHash } from "node:crypto";
import { recencyTier } from "@/lib/analysis/recency";
import type { Firecrawl, ScrapeResult, SearchResult } from "@/lib/firecrawl/client";
import { FirecrawlError } from "@/lib/firecrawl/client";
import { findPublishedDate, type DateMethod } from "./dates";
import { companyQueries, followUpQuery, sinceMonthsTbs } from "./queries";
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
  theme_results?: { url: string; title: string; description: string; publisher: string }[];
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
};

function usageOf(deps: PipelineDeps) {
  return { firecrawl_requests: deps.firecrawl.usage.requests, firecrawl_credits: deps.firecrawl.usage.credits };
}

function firstString(v: unknown): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

function toSource(page: ScrapeResult, candidate: Candidate, today: string): CollectedSource {
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
    excerpt: page.markdown.slice(0, EXCERPT_STORE_LIMIT),
    contentHash: createHash("sha256").update(page.markdown).digest("hex"),
    query: candidate.query,
  };
}

// Scrape candidates in order until `want` usable sources are collected.
async function scrapeSome(
  candidates: Candidate[],
  want: number,
  seen: Set<string>,
  deps: PipelineDeps,
  out: { source: CollectedSource; id: string }[],
  onProgress: () => Promise<void>,
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
    if (page.markdown.trim().length < MIN_CONTENT || isExcluded(page.url)) continue;
    const source = toSource(page, c, deps.today);
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
    if (results.length === 0) throw new Error(`All searches failed. ${searchErrors[0] ?? ""}`.trim());

    const candidates = rankCandidates(results, companyName);
    if (candidates.length === 0) {
      throw new Error(`No usable sources found for "${companyName}". Check the spelling or try the full legal name.`);
    }

    // 2. Scrape, keeping one slot for a follow-up search when possible
    const seen = new Set<string>();
    const progress = () =>
      store.update(sessionId, { status: "scraping", progress: `Reading sources (${collected.length} of up to ${max})`, usage: usageOf(deps) });
    await progress();
    await scrapeSome(candidates, max > 1 ? max - 1 : max, seen, deps, collected, progress);

    // 3. Follow-up: the main announcement is 12–24 months old and nothing recent was found
    const tiers = collected.map((c) => recencyTier({ publishedAt: c.source.publishedAt, eventAt: null }, today));
    const needsFollowUp = collected.length < max && !tiers.includes("recent") && tiers.includes("context");
    if (needsFollowUp) {
      const anchor = collected[tiers.indexOf("context")].source;
      const query = followUpQuery(companyName, anchor.title);
      await store.update(sessionId, { status: "searching", progress: "Follow-up search for recent developments" });
      try {
        const follow = await firecrawl.search({ query, limit: SEARCH_LIMIT, tbs: sinceMonthsTbs(12, today), excludeDomains: EXCLUDED_DOMAINS });
        await scrapeSome(rankCandidates([{ query, results: follow }], companyName), max - collected.length, seen, deps, collected, progress);
      } catch (e) {
        if (e instanceof FirecrawlError && e.status === 402) throw e;
      }
    }
    // 4. Fill any remaining slot from the original candidates
    if (collected.length < max) await scrapeSome(candidates, max - collected.length, seen, deps, collected, progress);

    if (collected.length === 0) throw new Error("Found search results, but none of the pages could be read.");

    await store.update(sessionId, {
      status: "ready",
      progress: `Collected ${collected.length} source${collected.length === 1 ? "" : "s"}`,
      source_ids: collected.map((c) => c.id),
      usage: usageOf(deps),
      error: null,
    });
  } catch (e) {
    await store.update(sessionId, {
      status: "failed",
      progress: null,
      error: e instanceof Error ? e.message : String(e),
      source_ids: collected.map((c) => c.id),
      usage: usageOf(deps),
    });
  }
}

export async function runThemeSearch(sessionId: string, theme: string, deps: PipelineDeps): Promise<void> {
  const { store, firecrawl, today } = deps;
  try {
    await store.update(sessionId, { status: "searching", progress: "Searching" });
    const results = await firecrawl.search({ query: theme, limit: THEME_LIMIT, tbs: sinceMonthsTbs(24, today), excludeDomains: EXCLUDED_DOMAINS });
    const seen = new Set<string>();
    const theme_results = results
      .filter((r) => !isExcluded(r.url))
      .map((r) => ({ url: canonicalUrl(r.url), title: r.title || r.url, description: r.description, publisher: hostOf(r.url) ?? "" }))
      .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
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
