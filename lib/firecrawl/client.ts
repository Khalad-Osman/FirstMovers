import "server-only";

// Firecrawl v2 client using plain fetch (no SDK). Server-only.
// Free plan: 2 concurrent requests, low rate limits. All requests from this
// process go through one queue capped at 2 in flight, with backoff on 429/5xx.
// Costs (docs.firecrawl.dev/billing): search = 2 credits per 10 results,
// scrape = 1 credit per page, failed requests = 0.

const BASE = "https://api.firecrawl.dev/v2";
const MAX_CONCURRENT = 2;
const MAX_ATTEMPTS = 4;

export type SearchResult = { url: string; title: string; description: string };
export type ScrapeResult = {
  url: string; // final URL after redirects
  markdown: string;
  rawHtml: string | null;
  metadata: Record<string, unknown>;
};
export type FirecrawlUsage = { requests: number; credits: number };

export class FirecrawlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FirecrawlError";
  }
}

// ---- process-wide concurrency gate -------------------------------------------
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

type Options = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createFirecrawl({ apiKey, fetchImpl = fetch, sleep = defaultSleep }: Options) {
  const usage: FirecrawlUsage = { requests: 0, credits: 0 };

  async function post(path: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
    let last: FirecrawlError | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await withSlot(async () => {
        usage.requests++;
        try {
          return await fetchImpl(`${BASE}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (e) {
          return e instanceof Error ? e : new Error(String(e));
        }
      });

      if (res instanceof Error) {
        last = new FirecrawlError(`Firecrawl request failed: ${res.message}`);
      } else if (res.status === 429 || res.status === 408 || res.status >= 500) {
        last = new FirecrawlError(`Firecrawl returned ${res.status}`, res.status);
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : Math.min(2000 * 2 ** attempt, 30_000));
        continue;
      } else {
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (res.status === 402) throw new FirecrawlError("Firecrawl credits are used up for this month.", 402);
        if (!res.ok || !json || json.success === false) {
          const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
          throw new FirecrawlError(`Firecrawl error: ${msg}`, res.status);
        }
        return json;
      }
      await sleep(Math.min(2000 * 2 ** attempt, 30_000));
    }
    throw last ?? new FirecrawlError("Firecrawl request failed");
  }

  return {
    usage,

    async search(params: { query: string; limit: number; tbs?: string; excludeDomains?: string[] }): Promise<SearchResult[]> {
      const json = await post(
        "/search",
        {
          query: params.query,
          limit: params.limit,
          sources: [{ type: "web" }],
          country: "CA",
          location: "Ontario,Canada",
          ...(params.tbs ? { tbs: params.tbs } : {}),
          ...(params.excludeDomains?.length ? { excludeDomains: params.excludeDomains } : {}),
        },
        60_000,
      );
      const credits = typeof json.creditsUsed === "number" ? json.creditsUsed : Math.ceil(params.limit / 10) * 2;
      usage.credits += credits;
      const web = ((json.data as { web?: unknown[] } | undefined)?.web ?? []) as Record<string, unknown>[];
      return web
        .filter((r) => typeof r.url === "string")
        .map((r) => ({
          url: r.url as string,
          title: typeof r.title === "string" ? r.title : "",
          description: typeof r.description === "string" ? r.description : "",
        }));
    },

    async scrape(url: string): Promise<ScrapeResult> {
      const json = await post(
        "/scrape",
        { url, formats: [{ type: "markdown" }, { type: "rawHtml" }], onlyMainContent: true, timeout: 60_000 },
        90_000,
      );
      usage.credits += 1;
      const data = (json.data ?? {}) as Record<string, unknown>;
      const metadata = (data.metadata ?? {}) as Record<string, unknown>;
      const status = typeof metadata.statusCode === "number" ? metadata.statusCode : 200;
      if (status >= 400) throw new FirecrawlError(`Page returned HTTP ${status}`, status);
      return {
        url: typeof metadata.url === "string" ? metadata.url : url,
        markdown: typeof data.markdown === "string" ? data.markdown : "",
        rawHtml: typeof data.rawHtml === "string" ? data.rawHtml : null,
        metadata,
      };
    },
  };
}

export type Firecrawl = ReturnType<typeof createFirecrawl>;

export function getFirecrawl(env: NodeJS.ProcessEnv = process.env): Firecrawl {
  const apiKey = env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new FirecrawlError("FIRECRAWL_API_KEY is not set (.env.local or Vercel env).");
  return createFirecrawl({ apiKey });
}
