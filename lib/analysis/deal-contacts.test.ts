import { describe, expect, it } from "vitest";
import { checkBriefIntegrity } from "@/lib/brief/integrity";
import type { BriefAnalysis, ModelOutput } from "@/lib/brief/schema";
import { SAMPLE_BRIEFS } from "@/lib/samples";
import { groundingErrors } from "./build";
import type { SourceRecord } from "./types";

const sources: SourceRecord[] = [
  { id: "S1", url: "https://news.ontario.ca/en/release/1", publisher: "Government of Ontario – Newsroom", title: "Acme to build plant", publishedAt: "2026-11-10", eventAt: null, excerpt: "Acme Fabrication Ltd. will build a 100,000-square-foot plant at 3300 Superior Court, Oakville. CEO Jane Smith said the plant opens in 2027. Call 905-555-0142 or visit acmefab.ca." },
  { id: "S2", url: "https://acmefab.ca/about", publisher: "acmefab.ca", title: "About Acme", publishedAt: null, eventAt: null, excerpt: "Head office: 25 Main Street, Mississauga." },
];
const out = (over: Partial<ModelOutput>): ModelOutput =>
  ({
    dealPotential: { summary: "x", opportunities: [] },
    contacts: { website: null, phone: null, people: [], premises: [] },
    ...over,
  }) as ModelOutput;

describe("grounding: values must be stated in the cited sources", () => {
  it("accepts sizes, names, phones, websites and addresses the sources state", () => {
    expect(
      groundingErrors(
        out({
          dealPotential: { summary: "x", opportunities: [{ dealType: "backfill", description: "x", statedSize: "100,000 square feet", location: "Oakville", sourceIds: ["S1"] }] },
          contacts: {
            website: { url: "https://www.acmefab.ca", sourceIds: ["S2"] },
            phone: { number: "(905) 555-0142", sourceIds: ["S1"] },
            people: [{ name: "Jane Smith", role: "CEO", sourceIds: ["S1"] }],
            premises: [{ address: "25 Main Street, Mississauga", use: "head office", sourceIds: ["S2"] }],
          },
        }),
        sources,
      ),
    ).toEqual([]);
  });
  it("rejects invented values and values cited to the wrong source", () => {
    const errors = groundingErrors(
      out({
        dealPotential: { summary: "x", opportunities: [{ dealType: "backfill", description: "x", statedSize: "250,000 sq ft", location: null, sourceIds: ["S1"] }] },
        contacts: {
          website: { url: "acme.com", sourceIds: ["S1"] },
          phone: { number: "416-555-9999", sourceIds: ["S1"] },
          people: [{ name: "John Doe", role: "VP Real Estate", sourceIds: ["S1"] }],
          premises: [{ address: "25 Main Street", use: null, sourceIds: ["S1"] }],
        },
      }),
      sources,
    );
    expect(errors).toHaveLength(5);
    expect(errors.join("\n")).toMatch(/250,000 sq ft[\s\S]*John Doe[\s\S]*416-555-9999[\s\S]*acme\.com[\s\S]*25 Main Street/);
  });
});

describe("integrity: deal potential and contacts", () => {
  const nms = SAMPLE_BRIEFS.find((s) => s.analysis.rating === "no_meaningful_signal")!.analysis;
  const base = (over: Partial<BriefAnalysis>): BriefAnalysis => ({ ...nms, otherPremises: { assessment: "not_indicated", address: null, text: "x", sourceIds: [] }, ...over });
  const id = nms.ledger[0].id;
  it("rejects a new-space deal on a No Meaningful Signal brief, and a release deal without vacated space", () => {
    const errors = checkBriefIntegrity(
      base({
        dealPotential: {
          summary: "x",
          opportunities: [
            { dealType: "site_search", description: "x", statedSize: null, location: null, sourceIds: [id] },
            { dealType: "sublease", description: "x", statedSize: null, location: null, sourceIds: [id] },
          ],
        },
      }),
    );
    expect(errors.join("\n")).toMatch(/site_search.*No Meaningful Signal/);
    expect(errors.join("\n")).toMatch(/sublease.*otherPremises/);
  });
  it("needs a ledger source for every contact", () => {
    const errors = checkBriefIntegrity(base({ contacts: { website: null, phone: null, people: [{ name: "Jane Smith", role: null, sourceIds: [] }], premises: [{ address: "1 Main St", use: null, sourceIds: ["S99"] }] } }));
    expect(errors).toContain("Contacts: person Jane Smith must cite the source that states it.");
    expect(errors).toContain("Contacts: premises 1 Main St cites S99, which is not in the ledger.");
  });
  it("accepts an empty deal potential and no contacts", () => {
    expect(checkBriefIntegrity(base({ dealPotential: { summary: "Nothing points to a transaction yet.", opportunities: [] }, contacts: { website: null, phone: null, people: [], premises: [] } }))).toEqual(checkBriefIntegrity(base({})));
  });
});
