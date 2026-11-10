import { describe, expect, it, vi } from "vitest";
import { createFirecrawl, FirecrawlError } from "./client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sleep = vi.fn(async () => {});

describe("Firecrawl client", () => {
  it("searches v2 with Ontario targeting and records credits", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ success: true, data: { web: [{ url: "https://a.ca/x", title: "A", description: "d" }, { title: "no url" }] }, creditsUsed: 2 }),
    );
    const fc = createFirecrawl({ apiKey: "fc-key", fetchImpl, sleep });
    const res = await fc.search({ query: "q", limit: 5, tbs: "qdr:y", excludeDomains: ["linkedin.com"] });
    expect(res).toEqual([{ url: "https://a.ca/x", title: "A", description: "d" }]);
    expect(fc.usage).toEqual({ requests: 1, credits: 2 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.firecrawl.dev/v2/search");
    expect(JSON.parse(init.body as string)).toMatchObject({ query: "q", limit: 5, country: "CA", tbs: "qdr:y", excludeDomains: ["linkedin.com"] });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fc-key");
  });

  it("estimates search credits when the response omits them", async () => {
    const fc = createFirecrawl({ apiKey: "k", fetchImpl: vi.fn(async () => json({ success: true, data: { web: [] } })), sleep });
    await fc.search({ query: "q", limit: 15 });
    expect(fc.usage.credits).toBe(4);
  });

  it("scrapes markdown, raw HTML and metadata; counts 1 credit", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ success: true, data: { markdown: "# Hi", rawHtml: "<html/>", metadata: { url: "https://a.ca/final", statusCode: 200, title: "T" } } }),
    );
    const fc = createFirecrawl({ apiKey: "k", fetchImpl, sleep });
    const page = await fc.scrape("https://a.ca/start");
    expect(page).toMatchObject({ url: "https://a.ca/final", markdown: "# Hi", rawHtml: "<html/>" });
    expect(fc.usage.credits).toBe(1);
  });

  // Firecrawl returned a document (the 404 page), so the credit is likely charged: count it.
  it("treats a 404 page as a failed scrape but still counts the credit", async () => {
    const fc = createFirecrawl({ apiKey: "k", fetchImpl: vi.fn(async () => json({ success: true, data: { markdown: "", metadata: { statusCode: 404 } } })), sleep });
    await expect(fc.scrape("https://a.ca")).rejects.toThrow(/HTTP 404/);
    expect(fc.usage.credits).toBe(1);
  });

  it("retries 429 with Retry-After, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "3" } }))
      .mockResolvedValueOnce(json({ success: true, data: { web: [] }, creditsUsed: 2 }));
    const fc = createFirecrawl({ apiKey: "k", fetchImpl, sleep });
    await fc.search({ query: "q", limit: 5 });
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(fc.usage.requests).toBe(2);
  });

  it("stops immediately on 402 (out of credits)", async () => {
    const fetchImpl = vi.fn(async () => json({ success: false, error: "Payment required" }, 402));
    const fc = createFirecrawl({ apiKey: "k", fetchImpl, sleep });
    const err = await fc.search({ query: "q", limit: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FirecrawlError);
    expect((err as FirecrawlError).status).toBe(402);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never runs more than 2 requests at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return json({ success: true, data: { web: [] }, creditsUsed: 2 });
    });
    const fc = createFirecrawl({ apiKey: "k", fetchImpl, sleep });
    await Promise.all(Array.from({ length: 6 }, () => fc.search({ query: "q", limit: 5 })));
    expect(peak).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
});
