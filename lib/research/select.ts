import type { SearchResult } from "@/lib/firecrawl/client";

// Never scraped (CLAUDE.md §5: LinkedIn and large job boards restrict scraping),
// plus social and video sites that don't yield citable text.
export const EXCLUDED_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "indeed.ca",
  "glassdoor.com",
  "glassdoor.ca",
  "ziprecruiter.com",
  "monster.ca",
  "monster.com",
  "workopolis.com",
  "simplyhired.com",
  "simplyhired.ca",
  "talent.com",
  "eluta.ca",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "reddit.com",
];

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isExcluded(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  return EXCLUDED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Normalized URL for de-duplication: no fragment, no tracking params, no trailing slash.
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export type Candidate = SearchResult & { query: string; score: number };

// Simple, explainable ranking: mentions of the company, Ontario/Canada and
// facility words in the snippet, a bonus for government and news-release
// sites, and earlier search position.
export function rankCandidates(
  results: { query: string; results: SearchResult[] }[],
  companyName: string,
): Candidate[] {
  const nameTokens = companyName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["inc", "ltd", "corp", "the", "limited", "corporation", "company"].includes(t));

  const byUrl = new Map<string, Candidate>();
  for (const { query, results: list } of results) {
    list.forEach((r, position) => {
      if (isExcluded(r.url)) return;
      const key = canonicalUrl(r.url);
      const text = `${r.title} ${r.description}`.toLowerCase();
      let score = 10 - Math.min(position, 9);
      const nameHits = nameTokens.filter((t) => text.includes(t)).length;
      score += nameTokens.length ? (nameHits / nameTokens.length) * 10 : 0;
      if (/ontario|toronto|mississauga|brampton|vaughan|hamilton|gta|peel|york|durham|halton|canada/.test(text)) score += 4;
      if (/plant|facility|warehouse|distribution|manufactur|expan|contract|hiring|construction|capacity|investment/.test(text)) score += 3;
      const host = hostOf(r.url) ?? "";
      if (/(\.gc\.ca|\.ontario\.ca|^ontario\.ca|newswire\.ca|globenewswire|businesswire|prnewswire)/.test(host)) score += 2;

      const existing = byUrl.get(key);
      if (!existing || existing.score < score) byUrl.set(key, { ...r, url: key, query, score });
    });
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}
