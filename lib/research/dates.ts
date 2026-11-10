// Find a source's publication date without AI. Tried in order; the method is
// recorded so users can judge how reliable the date is.
//   1. metadata         page meta tags returned by Firecrawl (article:published_time…)
//   2. structured_data  JSON-LD datePublished in the raw HTML
//   3. url              /2026/09/14/ or 2026-09-14 in the URL
//   4. text             a "Published …" / "Posted …" line near the top of the page
// If none works the source is undated. Dates in the future are rejected.

export type DateMethod = "metadata" | "structured_data" | "url" | "text" | "none";
export type FoundDate = { publishedAt: string | null; method: DateMethod };

const META_KEYS = [
  "article:published_time",
  "publishedTime",
  "published_time",
  "og:article:published_time",
  "datePublished",
  "date_published",
  "pubdate",
  "publishdate",
  "publish-date",
  "publish_date",
  "parsely-pub-date",
  "sailthru.date",
  "dcterms.created",
  "dcterms.date",
  "dcterms.issued",
  "DC.date.issued",
  "DC.date",
  "dc.date",
  "citation_publication_date",
  "date",
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
  // French (Government of Canada / Ontario bilingual pages)
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8,
  septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // e.g. Feb 31
  return date.toISOString().slice(0, 10);
}

// Parse one date-like string into YYYY-MM-DD, or null.
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); // ISO / ISO datetime
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  // "September 14, 2026" / "Sep. 14 2026"
  m = /([A-Za-zéû]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  // "14 September 2026" / "14 septembre 2026"
  m = /(\d{1,2})(?:er)?\s+([A-Za-zéû]+)\.?,?\s+(\d{4})/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

function notFuture(date: string | null, today: string): string | null {
  return date && date <= today ? date : null;
}

function fromMetadata(metadata: Record<string, unknown>, today: string): string | null {
  const lower = new Map(Object.entries(metadata).map(([k, v]) => [k.toLowerCase(), v]));
  for (const key of META_KEYS) {
    const value = lower.get(key.toLowerCase());
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") {
      const d = notFuture(parseDate(first), today);
      if (d) return d;
    }
  }
  return null;
}

function fromJsonLd(rawHtml: string | null, today: string): string | null {
  if (!rawHtml) return null;
  const scripts = rawHtml.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of scripts) {
    const m = /"datePublished"\s*:\s*"([^"]+)"/.exec(body);
    if (m) {
      const d = notFuture(parseDate(m[1]), today);
      if (d) return d;
    }
  }
  const time = /<time[^>]+datetime="([^"]+)"[^>]*>/i.exec(rawHtml);
  if (time) return notFuture(parseDate(time[1]), today);
  return null;
}

function fromUrl(url: string, today: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = /(?:^|\/)(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\/|-|$|\D)/.exec(path);
  return m ? notFuture(iso(+m[1], +m[2], +m[3]), today) : null;
}

function fromText(markdown: string, today: string): string | null {
  const head = markdown.slice(0, 3000);
  const m =
    /(?:published|posted|updated|released|date|news release)[^\n]{0,20}?[:\s]\s*([A-Za-zéû]+\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}\s+[A-Za-zéû]+\.?,?\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(
      head,
    );
  return m ? notFuture(parseDate(m[1]), today) : null;
}

export function findPublishedDate(
  page: { url: string; metadata: Record<string, unknown>; rawHtml: string | null; markdown: string },
  today: string,
): FoundDate {
  const steps: [DateMethod, () => string | null][] = [
    ["metadata", () => fromMetadata(page.metadata, today)],
    ["structured_data", () => fromJsonLd(page.rawHtml, today)],
    ["url", () => fromUrl(page.url, today)],
    ["text", () => fromText(page.markdown, today)],
  ];
  for (const [method, run] of steps) {
    const d = run();
    if (d) return { publishedAt: d, method };
  }
  return { publishedAt: null, method: "none" };
}
