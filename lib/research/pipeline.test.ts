import { describe, expect, it, vi } from "vitest";
import type { ScrapeResult, SearchResult } from "@/lib/firecrawl/client";
import { FirecrawlError } from "@/lib/firecrawl/client";
import { FOCUS_AFTER, firstMention, focusedExcerpt, isSoftErrorPage, mentionsCompany, runCompanyResearch, runThemeSearch, type CollectedSource, type ResearchStore, type SessionPatch } from "./pipeline";

const TODAY = "2026-11-10";
const body = (s: string) => `${s}\n\nAcme Ltd. ${"Body text about the company's Ontario operations. ".repeat(10)}`;

function memoryStore() {
  const patches: SessionPatch[] = [];
  const sources: CollectedSource[] = [];
  const store: ResearchStore = {
    update: vi.fn(async (_id, patch) => void patches.push(patch)),
    saveSource: vi.fn(async (s) => (sources.push(s), `uuid-${sources.length}`)),
  };
  const last = () => Object.assign({}, ...patches) as SessionPatch;
  return { store, patches, sources, last };
}

type Pages = Record<string, { date?: string; md?: string } | Error>;
function fakeFirecrawl(searches: Record<string, SearchResult[]> | ((q: string) => SearchResult[]), pages: Pages) {
  const usage = { requests: 0, credits: 0 };
  return {
    usage,
    search: vi.fn(async ({ query }: { query: string }) => {
      usage.requests++;
      usage.credits += 2;
      return typeof searches === "function" ? searches(query) : (Object.entries(searches).find(([k]) => query.includes(k))?.[1] ?? []);
    }),
    scrape: vi.fn(async (url: string): Promise<ScrapeResult> => {
      usage.requests++;
      const p = pages[url];
      if (!p) throw new FirecrawlError("not found", 404);
      if (p instanceof Error) throw p;
      usage.credits++;
      return { url, markdown: p.md ?? body("# Page"), rawHtml: null, metadata: p.date ? { "article:published_time": p.date } : {} };
    }),
  };
}

const result = (n: number, host = "news.example.ca") => ({ url: `https://${host}/item-${n}`, title: `Acme Ontario plant item ${n}`, description: "Acme Ltd. Ontario facility" });

describe("runCompanyResearch", () => {
  it("collects at most 5 sources, de-duplicated, and records usage", async () => {
    const all = Array.from({ length: 8 }, (_, i) => result(i + 1));
    const fc = fakeFirecrawl(() => all, Object.fromEntries(all.map((r) => [r.url, { date: "2026-10-01" }])));
    const m = memoryStore();
    await runCompanyResearch("s1", "Acme Ltd.", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5 });

    const final = m.last();
    expect(final.status).toBe("ready");
    expect(final.source_ids).toHaveLength(5);
    expect(new Set(m.sources.map((s) => s.url)).size).toBe(5);
    expect(fc.search).toHaveBeenCalledTimes(3); // no follow-up: sources are recent
    expect(final.usage).toEqual({ firecrawl_requests: 8, firecrawl_credits: 11 });
    expect(m.sources[0]).toMatchObject({ publishedAt: "2026-10-01", dateMethod: "metadata", publisher: "news.example.ca" });
  });

  it("respects a lower sources-per-candidate setting", async () => {
    const all = Array.from({ length: 6 }, (_, i) => result(i + 1));
    const fc = fakeFirecrawl(() => all, Object.fromEntries(all.map((r) => [r.url, { date: "2026-10-01" }])));
    const m = memoryStore();
    await runCompanyResearch("s1", "Acme Ltd.", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 2 });
    expect(m.last().source_ids).toHaveLength(2);
  });

  it("skips unreadable and too-short pages and keeps going", async () => {
    const all = Array.from({ length: 4 }, (_, i) => result(i + 1));
    const fc = fakeFirecrawl(() => all, {
      [all[0].url]: new FirecrawlError("blocked", 403),
      [all[1].url]: { md: "tiny" },
      [all[2].url]: { date: "2026-09-01" },
      [all[3].url]: { date: "2026-08-01" },
    });
    const m = memoryStore();
    await runCompanyResearch("s1", "Acme Ltd.", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5 });
    expect(m.last().status).toBe("ready");
    expect(m.sources.map((s) => s.url)).toEqual([all[2].url, all[3].url]);
  });

  it("runs one follow-up search when the main announcement is 12–24 months old", async () => {
    const old = result(1);
    const fresh = result(9, "follow.example.ca");
    const fc = fakeFirecrawl(
      (q) => (q.includes("site OR hiring") ? [fresh] : [old]),
      { [old.url]: { date: "2025-06-01", md: body("# Acme announces Hamilton plant") }, [fresh.url]: { date: "2026-10-15" } },
    );
    const m = memoryStore();
    await runCompanyResearch("s1", "Acme Ltd.", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5 });
    expect(fc.search).toHaveBeenCalledTimes(4);
    expect(m.sources.map((s) => s.url)).toEqual([old.url, fresh.url]);
    expect(m.patches.some((p) => p.progress?.startsWith("Follow-up"))).toBe(true);
  });

  it("fails clearly when nothing is found", async () => {
    const m = memoryStore();
    await runCompanyResearch("s1", "Nobody Inc.", { firecrawl: fakeFirecrawl(() => [], {}), store: m.store, today: TODAY, maxSources: 5 });
    expect(m.last()).toMatchObject({ status: "failed" });
    expect(m.last().error).toMatch(/No usable sources found for "Nobody Inc\."/);
  });

  it("fails immediately when Firecrawl credits are used up", async () => {
    const fc = fakeFirecrawl(() => [], {});
    fc.search.mockRejectedValueOnce(new FirecrawlError("Firecrawl credits are used up for this month.", 402));
    const m = memoryStore();
    await runCompanyResearch("s1", "Acme Ltd.", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5 });
    expect(m.last().error).toMatch(/credits are used up/);
    expect(fc.search).toHaveBeenCalledTimes(1);
  });

  it("puts public records first and still collects up to 5 web sources", async () => {
    const all = Array.from({ length: 6 }, (_, i) => result(i + 1));
    const fc = fakeFirecrawl(() => all, Object.fromEntries(all.map((r) => [r.url, { date: "2026-10-01" }])));
    const m = memoryStore();
    await runCompanyResearch("s1", "Acme Ltd.", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5, recordSourceIds: ["rec-1", "rec-2", "rec-3"] });
    const final = m.last();
    expect(final.status).toBe("ready");
    expect(final.source_ids).toEqual(["rec-1", "rec-2", "rec-3", "uuid-1", "uuid-2", "uuid-3", "uuid-4", "uuid-5"]);
    expect(final.progress).toBe("Collected 3 public records and 5 web sources");
  });

  it("is ready with public records alone when the web finds nothing", async () => {
    const m = memoryStore();
    await runCompanyResearch("s1", "Quiet Fabrication Inc.", { firecrawl: fakeFirecrawl(() => [], {}), store: m.store, today: TODAY, maxSources: 5, recordSourceIds: ["rec-1"] });
    expect(m.last()).toMatchObject({ status: "ready", source_ids: ["rec-1"], error: null, progress: "Collected 1 public record" });
  });

  it("still stops on used-up credits when public records exist", async () => {
    const fc = fakeFirecrawl(() => [], {});
    fc.search.mockRejectedValueOnce(new FirecrawlError("Firecrawl credits are used up for this month.", 402));
    const m = memoryStore();
    await runCompanyResearch("s1", "Acme Ltd.", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5, recordSourceIds: ["rec-1"] });
    expect(m.last()).toMatchObject({ status: "failed", source_ids: ["rec-1"] });
    expect(m.last().error).toMatch(/credits are used up/);
  });
});

describe("runThemeSearch", () => {
  it("lists de-duplicated results without scraping", async () => {
    const fc = fakeFirecrawl(() => [result(1), { ...result(1), url: result(1).url + "?utm_source=x" }, result(2, "linkedin.com")], {});
    const m = memoryStore();
    await runThemeSearch("s1", "switchgear manufacturing Ontario", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5 });
    expect(m.last().status).toBe("ready");
    expect(m.last().theme_results).toHaveLength(1);
    expect(fc.scrape).not.toHaveBeenCalled();
  });

  it("adds filter terms to the theme search and lists matching results first", async () => {
    const results = [
      { url: "https://a.ca/1", title: "Cold storage boom in Ohio", description: "US market" },
      { url: "https://a.ca/2", title: "Brampton dairy plant expands", description: "Food processor adds space" },
    ];
    const fc = fakeFirecrawl(() => results, {});
    const m = memoryStore();
    await runThemeSearch("s1", "cold storage", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5 }, { regions: ["peel"], companyTypes: ["food_beverage"], dealTypes: [] });
    expect(fc.search.mock.calls[0][0]).toMatchObject({ query: "cold storage (Peel OR Mississauga OR Brampton) (food OR beverage)" });
    const listed = m.last().theme_results!;
    expect(listed.map((r) => r.url)).toEqual(["https://a.ca/2", "https://a.ca/1"]);
    expect(listed[0].matches).toEqual(["Peel", "Food & beverage"]);
    expect(fc.usage.credits).toBe(2); // still one search
  });
});

describe("mentionsCompany", () => {
  it("matches the company name with or without suffixes and qualifiers", () => {
    expect(mentionsCompany("Crown Distributors Ltd. opened a new site", "CROWN DISTRIBUTORS LTD.")).toBe(true);
    expect(mentionsCompany("CROWN DISTRIBUTORS — Mississauga", "Crown Distributors Ltd.")).toBe(true);
    expect(mentionsCompany("Thermo Fisher Scientific expands", "Thermo Fisher Scientific (Mississauga) Inc.")).toBe(true);
    expect(mentionsCompany("East Electrical Supply Inc.", "EAST ELECTRICAL SUPPLY INC.")).toBe(true);
    expect(mentionsCompany("Johnson & Johnson Inc. plant", "Johnson and Johnson Inc.")).toBe(true);
  });
  it("rejects pages that never name the company", () => {
    // Crown's run-2 web results: importer list, accounting blog, another company's shipments, a login page
    expect(mentionsCompany("Canadian Importers Database: ACME IMPORTS, BETA TRADING", "CROWN DISTRIBUTORS LTD.")).toBe(false);
    expect(mentionsCompany("Shipment record for 1363794 B.C. Ltd", "CROWN DISTRIBUTORS LTD.")).toBe(false);
    expect(mentionsCompany("Crown Royal distributors in Ontario", "CROWN DISTRIBUTORS LTD.")).toBe(false);
  });
  it("drops scraped pages that don't name the company", async () => {
    const all = [result(1), result(2)];
    const fc = fakeFirecrawl(() => all, { [all[0].url]: { md: `# Importers list\n\n${"Unrelated importer names. ".repeat(20)}` }, [all[1].url]: { date: "2026-10-01" } });
    const m = memoryStore();
    await runCompanyResearch("s1", "Acme Ltd.", { firecrawl: fc, store: m.store, today: TODAY, maxSources: 5 });
    expect(m.sources.map((s) => s.url)).toEqual([all[1].url]);
  });
});

describe("focusedExcerpt", () => {
  const filler = (n: number) => "Unrelated importer row. ".repeat(Math.ceil(n / 24)).slice(0, n);

  it("finds the first mention despite punctuation, case and '&'", () => {
    expect(firstMention("… CROWN-DISTRIBUTORS LTD. …", "Crown Distributors Ltd.")).toBe(2);
    expect(firstMention("see Johnson & Johnson Inc.", "Johnson and Johnson Inc.")).toBe(4);
    expect(firstMention("Crown Royal distributors", "Crown Distributors Ltd.")).toBe(-1);
  });

  it("keeps the page start when the company is named early", () => {
    const md = `Crown Distributors Ltd. opens a site. ${filler(30_000)}`;
    expect(focusedExcerpt(md, "Crown Distributors Ltd.").startsWith("Crown Distributors")).toBe(true);
  });

  it("starts near the first mention when it is further down, so the model sees it", () => {
    // Crown's 2026-11-16 importer-list page: the name appeared only past the stored 20,000 characters.
    const md = `${filler(25_000)}
| CROWN DISTRIBUTORS LTD. | Mississauga, ON |
${filler(5_000)}`;
    const ex = focusedExcerpt(md, "Crown Distributors Ltd.");
    expect(ex.startsWith("[Excerpt starts shortly before the first mention of the company")).toBe(true);
    const at = ex.indexOf("CROWN DISTRIBUTORS");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(FOCUS_AFTER); // well inside the 6,000 characters the model reads
    expect(ex.length).toBeLessThanOrEqual(20_000);
  });
});

describe("isSoftErrorPage", () => {
  const page = (url: string, title?: string) => ({ url, metadata: title ? { title } : {} });
  it("flags error redirects and not-found pages", () => {
    expect(isSoftErrorPage(page("https://jobs.jobvite.com/careers/stelumar-advanced-manufacturing/jobs?error=404"))).toBe(true);
    expect(isSoftErrorPage(page("https://example.ca/page-not-found"))).toBe(true);
    expect(isSoftErrorPage(page("https://example.ca/404.html"))).toBe(true);
    expect(isSoftErrorPage(page("https://example.ca/news/item", "Page not found | Example"))).toBe(true);
    expect(isSoftErrorPage(page("https://example.ca/careers/1", "This job is no longer available"))).toBe(true);
    expect(isSoftErrorPage(page("https://example.ca/x", "404"))).toBe(true);
  });
  it("keeps real pages, including Highway 404 news", () => {
    expect(isSoftErrorPage(page("https://jobs.jobvite.com/stelumar-advanced-manufacturing/job/oP2RAfw2", "Shipping & Receiving Supervisor"))).toBe(false);
    expect(isSoftErrorPage(page("https://example.ca/news/warehouse-near-highway-404", "New warehouse planned near Highway 404 in Markham"))).toBe(false);
    expect(isSoftErrorPage(page("https://example.ca/search?status=active"))).toBe(false);
  });
});
