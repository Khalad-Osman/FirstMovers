import { describe, expect, it, vi } from "vitest";
import type { ScrapeResult, SearchResult } from "@/lib/firecrawl/client";
import { FirecrawlError } from "@/lib/firecrawl/client";
import { runCompanyResearch, runThemeSearch, type CollectedSource, type ResearchStore, type SessionPatch } from "./pipeline";

const TODAY = "2026-11-10";
const body = (s: string) => `${s}\n\n${"Body text about the company's Ontario operations. ".repeat(10)}`;

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
});
