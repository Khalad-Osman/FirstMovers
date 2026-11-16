import { describe, expect, it } from "vitest";
import { signalWeight, selectForScreening, candidateFamily, type Candidate, type SignalForCandidate } from "@/lib/discovery/candidates";
import { recordExcerpt, toRecordSource, type RecordSignal } from "@/lib/research/records";
import { federalGrants, grantKind, grantRecordUrl, mapGrant } from "./grants";
import type { IngestContext, SignalRow } from "./types";

const ctx = { today: "2026-11-16", cutoff: "2025-11-16", grantsMinValue: 100000 };

// Shaped like real rows from the open.canada.ca datastore (checked 2026-11-16).
const row = (over: Record<string, unknown> = {}) => ({
  ref_number: "192-2026-2027-Q2-SMPIF-001",
  amendment_number: "0",
  recipient_type: "F",
  recipient_province: "ON",
  recipient_legal_name: "The Produce Counter Ltd.|The Produce Counter Ltd.",
  recipient_city: "BRAMPTON",
  recipient_postal_code: "L6T 5V8",
  prog_name_en: "Supply Management Processing Investment Fund (SMPIF)",
  agreement_title_en: "Consolidation and expansion",
  agreement_value: "4000000.0",
  agreement_start_date: "2025-11-25",
  agreement_end_date: "2027-03-31",
  description_en: "To consolidate fresh-cut produce operations while expanding overall capabilities.",
  naics_identifier: "311420",
  owner_org: "aafc-aac",
  owner_org_title: "Agriculture and Agri-Food Canada | Agriculture et Agroalimentaire Canada",
  prog_name_fr: "Fonds…",
  ...over,
});

const mapped = (over: Record<string, unknown> = {}) => {
  const out = mapGrant(row(over), ctx);
  if (!("row" in out)) throw new Error(`skipped: ${out.skip}`);
  return out.row;
};

describe("mapGrant", () => {
  it("maps an Ontario for-profit industrial grant to a signal", () => {
    const s = mapped();
    expect(s).toMatchObject({
      source_type: "federal_grant",
      source_record_id: "aafc-aac:192-2026-2027-Q2-SMPIF-001",
      raw_entity_name: "The Produce Counter Ltd.",
      entity_key: "the produce counter",
      signal_strength: "grant",
      published_at: "2025-11-25",
      event_at: null,
      location: "BRAMPTON, Ontario, L6T 5V8",
      url: "https://search.open.canada.ca/grants/record/aafc-aac%2C192-2026-2027-Q2-SMPIF-001%2Ccurrent",
    });
    expect(s.summary).toMatch(/^\$4,000,000 for a facility or capacity project\. To consolidate/);
    expect(s.raw).toMatchObject({ grant_kind: "facility", operating_names: [] });
    expect(s.raw).not.toHaveProperty("prog_name_fr"); // French duplicates dropped
  });

  it("keeps the legal name and records other names as operating names", () => {
    expect(mapped({ recipient_legal_name: "618024 Ontario Inc.|CES Transformers" }).raw).toMatchObject({ operating_names: ["CES Transformers"] });
  });

  it.each([
    [{ recipient_province: "QC" }, "recipient not in Ontario"],
    [{ recipient_type: "N" }, "recipient not for-profit"],
    [{ agreement_start_date: "2025-01-01" }, "older than 12 months"],
    [{ agreement_start_date: "2027-01-01" }, "starts in the future"],
    [{ naics_identifier: "54171" }, "not an industrial sector"],
    [{ naics_identifier: null }, "not an industrial sector"],
    [{ agreement_value: "63380.0" }, "below minimum grant value"],
  ])("skips %j (%s)", (over, reason) => {
    expect(mapGrant(row(over), ctx)).toEqual({ skip: reason });
  });

  it("classifies what the project funds", () => {
    expect(grantKind("expand an existing dairy processing facility")).toBe("facility");
    expect(grantKind("launching a world-class advanced manufacturing and testing facility")).toBe("facility");
    expect(grantKind("install a fully automated paneer processing system and a robotic arm")).toBe("equipment");
    expect(grantKind("Develop a new generation of robotic platform software")).toBe("equipment");
    expect(grantKind("Hire a STEM professional for product development")).toBe("other");
  });

  it("builds the public record URL", () => {
    expect(grantRecordUrl("nserc-crsng", "110_2026_2027_Q2_2163")).toBe("https://search.open.canada.ca/grants/record/nserc-crsng%2C110_2026_2027_Q2_2163%2Ccurrent");
  });
});

describe("federalGrants.run", () => {
  it("pages the API newest first, keeps the latest amendment, and stops at the cutoff", async () => {
    const pages = [
      [row({ amendment_number: "0" }), row({ amendment_number: "1", agreement_value: "4500000.0" }), row({ ref_number: "OTHER-1", agreement_start_date: "2026-02-01" })],
      [row({ ref_number: "OLD-1", agreement_start_date: "2025-01-01" })],
    ];
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get("offset"));
      const records = pages[offset / 1000] ?? [];
      // Pretend each page is full so the loop relies on the date cutoff.
      return new Response(JSON.stringify({ success: true, result: { records: offset === 0 ? [...records, ...Array(997).fill(row({ ref_number: "FILL", agreement_start_date: "2026-01-01" }))] : records } }));
    }) as typeof fetch;
    const items = [];
    for await (const it of federalGrants.run({ ...ctx, canadabuysMinValue: 0, fetchImpl, progress: async () => {} } as IngestContext)) items.push(it);
    const rows = items.filter((i): i is { row: SignalRow } => "row" in i).map((i) => i.row);
    const produce = rows.filter((r) => r.source_record_id === "aafc-aac:192-2026-2027-Q2-SMPIF-001");
    expect(produce).toHaveLength(1);
    expect(produce[0].summary).toMatch(/\$4,500,000/); // amendment 1 wins
    expect(rows.some((r) => r.source_record_id === "aafc-aac:OLD-1")).toBe(false);
    expect(urls).toHaveLength(2); // stopped after the page that passed the cutoff
    const q = new URL(urls[0]).searchParams;
    expect(JSON.parse(q.get("filters")!)).toEqual({ recipient_province: "ON", recipient_type: "F" });
    expect(q.get("sort")).toBe("agreement_start_date desc");
  });
});

describe("grants in discovery and analysis", () => {
  const sig = (s: SignalRow, id = "g1"): RecordSignal => ({ id, ...s, raw: s.raw } as unknown as RecordSignal);

  it("weights facility grants above equipment and other grants", () => {
    const w = (desc: string) => signalWeight(sig(mapped({ description_en: desc, agreement_title_en: "" })) as SignalForCandidate);
    expect(w("Expand an existing dairy processing facility")).toEqual({ weight: 4, label: "federal grant: facility or capacity" });
    expect(w("Automate and robotize palletizing and canning.")).toEqual({ weight: 2, label: "federal grant: equipment or automation" });
    expect(w("Market development activities")).toEqual({ weight: 1, label: "federal grant" });
  });

  it("becomes a public record source with the grant's own fields", () => {
    const s = sig(mapped());
    const src = toRecordSource(s)!;
    expect(src).toMatchObject({ publisher: "Government of Canada – Grants and contributions", publishedAt: "2025-11-25", eventAt: null });
    expect(src.url).toContain("search.open.canada.ca/grants/record/");
    const text = recordExcerpt(s);
    expect(text).toContain("Agreement start: 2025-11-25 (the disclosure data has no separate publication date)");
    expect(text).toContain("Project description: To consolidate fresh-cut produce operations");
    expect(text).toContain("Department: Agriculture and Agri-Food Canada / Agriculture et Agroalimentaire Canada");
  });

  it("splits screening three ways: permit-led, grant-led, award-led", () => {
    const c = (key: string, score: number, source: string) =>
      ({ key, displayName: key, aliases: [], score, scoreParts: [], topSignalId: "x", signals: [{ source_type: source }] }) as unknown as Candidate;
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => c(`a${i}`, 9 - i * 0.1, "canadabuys_award")),
      ...Array.from({ length: 10 }, (_, i) => c(`g${i}`, 6 - i * 0.1, "federal_grant")),
      ...Array.from({ length: 10 }, (_, i) => c(`p${i}`, 5 - i * 0.1, "permit_mississauga")),
    ];
    const picked = selectForScreening(pool, 9);
    expect(["permit", "grant", "award"].map((f) => picked.filter((x) => candidateFamily(x) === f).length)).toEqual([3, 3, 3]);
    // With no permits, their share goes to the others
    const noPermits = selectForScreening(pool.filter((x) => candidateFamily(x) !== "permit"), 9);
    expect(noPermits).toHaveLength(9);
    expect(noPermits.filter((x) => candidateFamily(x) === "grant").length).toBeGreaterThanOrEqual(4);
  });
});
