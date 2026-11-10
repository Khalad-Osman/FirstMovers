import { describe, expect, it } from "vitest";
import { findPublishedDate, parseDate } from "./dates";
import { normalizeCompanyName } from "./normalize";
import { companyQueries, followUpQuery, sinceMonthsTbs } from "./queries";
import { canonicalUrl, isExcluded, rankCandidates } from "./select";

const TODAY = "2026-11-10";
const page = (over: Partial<Parameters<typeof findPublishedDate>[0]>) => ({
  url: "https://example.com/news/item",
  metadata: {},
  rawHtml: null,
  markdown: "",
  ...over,
});

describe("parseDate", () => {
  it.each([
    ["2026-09-14T10:00:00-04:00", "2026-09-14"],
    ["2026/9/4", "2026-09-04"],
    ["20260914", "2026-09-14"],
    ["September 14, 2026", "2026-09-14"],
    ["Sept. 4 2026", "2026-09-04"],
    ["14 September 2026", "2026-09-14"],
    ["1er octobre 2026", "2026-10-01"],
    ["February 31, 2026", null],
    ["last Tuesday", null],
  ])("%s -> %s", (raw, expected) => expect(parseDate(raw)).toBe(expected));
});

describe("findPublishedDate", () => {
  it("prefers page metadata", () => {
    const r = findPublishedDate(page({ metadata: { "article:published_time": "2026-08-01T12:00:00Z" }, url: "https://x.ca/2025/01/02/a" }), TODAY);
    expect(r).toEqual({ publishedAt: "2026-08-01", method: "metadata" });
  });

  it("handles array metadata and case differences", () => {
    expect(findPublishedDate(page({ metadata: { PublishedTime: ["2026-07-07"] } }), TODAY).publishedAt).toBe("2026-07-07");
  });

  it("falls back to JSON-LD datePublished", () => {
    const html = `<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-06-30T09:00:00Z"}</script>`;
    expect(findPublishedDate(page({ rawHtml: html }), TODAY)).toEqual({ publishedAt: "2026-06-30", method: "structured_data" });
  });

  it("falls back to a date in the URL", () => {
    expect(findPublishedDate(page({ url: "https://news.ca/2026/05/21/plant-opens" }), TODAY)).toEqual({ publishedAt: "2026-05-21", method: "url" });
  });

  it("falls back to a Published line in the text", () => {
    const md = "# Title\n\nPublished: October 3, 2026\n\nBody";
    expect(findPublishedDate(page({ markdown: md }), TODAY)).toEqual({ publishedAt: "2026-10-03", method: "text" });
  });

  it("rejects future dates and reports none when nothing works", () => {
    expect(findPublishedDate(page({ metadata: { publishedTime: "2027-01-01" } }), TODAY)).toEqual({ publishedAt: null, method: "none" });
  });
});

describe("source selection", () => {
  it("excludes LinkedIn, job boards and social sites", () => {
    expect(isExcluded("https://ca.linkedin.com/company/x")).toBe(true);
    expect(isExcluded("https://ca.indeed.com/job")).toBe(true);
    expect(isExcluded("https://www.youtube.com/watch")).toBe(true);
    expect(isExcluded("https://news.ontario.ca/en/release/1")).toBe(false);
  });

  it("canonicalizes URLs for de-duplication", () => {
    expect(canonicalUrl("https://WWW.Example.com/a/?utm_source=x&id=2#top")).toBe("https://example.com/a/?id=2");
    expect(canonicalUrl("https://example.com/a/")).toBe("https://example.com/a");
  });

  it("merges duplicates across queries and ranks relevant Ontario results first", () => {
    const ranked = rankCandidates(
      [
        { query: "q1", results: [
          { url: "https://blog.example.com/generic", title: "Industry trends", description: "Global outlook" },
          { url: "https://news.example.ca/halloway?utm_source=x", title: "Halloway Switchgear expands Vaughan plant", description: "Ontario manufacturing expansion" },
        ] },
        { query: "q2", results: [
          { url: "https://news.example.ca/halloway", title: "Halloway Switchgear expands Vaughan plant", description: "Ontario" },
          { url: "https://linkedin.com/x", title: "Halloway", description: "" },
        ] },
      ],
      "Halloway Switchgear Enclosures Inc.",
    );
    expect(ranked.map((c) => c.url)).toEqual(["https://news.example.ca/halloway", "https://blog.example.com/generic"]);
  });
});

describe("queries", () => {
  it("quotes the company name and strips embedded quotes", () => {
    const qs = companyQueries('Acme "Best" Ltd.');
    expect(qs).toHaveLength(3);
    for (const q of qs) expect(q.startsWith('"Acme Best Ltd."')).toBe(true);
  });

  it("builds a follow-up query from the announcement title", () => {
    expect(followUpQuery("Acme Ltd.", "Acme announces new Hamilton foundry – 2025")).toMatch(/^"Acme Ltd\." Acme announces Hamilton foundry .*hiring/);
  });

  it("builds a custom date range", () => {
    expect(sinceMonthsTbs(24, TODAY)).toBe("cdr:1,cd_min:11/10/2024");
  });
});

describe("normalizeCompanyName", () => {
  it.each([
    ["Halloway Switchgear Enclosures Inc.", "halloway switchgear enclosures"],
    ["HALLOWAY SWITCHGEAR ENCLOSURES INC", "halloway switchgear enclosures"],
    ["Pemberton Fine Foods Ltd.", "pemberton fine foods"],
    ["Magna International Inc.", "magna international"],
    ["Société Générale Ltée", "societe generale"],
    ["A&B Holdings Corp.", "a and b holdings"],
    ["Inc.", "inc"],
  ])("%s -> %s", (raw, key) => expect(normalizeCompanyName(raw)).toBe(key));
});
