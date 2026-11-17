import { describe, expect, it } from "vitest";
import { SAMPLE_BRIEFS } from "@/lib/samples";
import type { RecordSignal } from "@/lib/research/records";
import type { BriefAnalysis } from "./schema";
import { buildTimeline } from "./timeline";

const base = SAMPLE_BRIEFS[0].analysis;
const entry = (over: Partial<BriefAnalysis["ledger"][number]>): BriefAnalysis["ledger"][number] => ({ ...base.ledger[0], ...over });
const brief = (ledger: BriefAnalysis["ledger"]): BriefAnalysis => ({ ...base, ledger });

const permit: RecordSignal = {
  id: "sig1",
  source_type: "permit_mississauga",
  source_record_id: "BP 3NEW 25-11208",
  raw_entity_name: "STELUMAR ADVANCED MANUFACTURING INC.",
  entity_key: "stelumar advanced manufacturing",
  signal_strength: "addition",
  title: "Mississauga permit: ADDITION at 560 SLATE DR",
  summary: null,
  url: null,
  published_at: "2026-03-03",
  event_at: null,
  location: "560 SLATE DR, Mississauga, Ontario",
  raw: {},
};
const grant: RecordSignal = { ...permit, id: "sig2", source_type: "federal_grant", source_record_id: "aafc-aac:X", signal_strength: "grant", title: "Federal grant: SMPIF (Stelumar)", url: "https://search.open.canada.ca/grants/record/aafc-aac%2CX%2Ccurrent", published_at: "2026-09-01" };

describe("buildTimeline", () => {
  it("merges Signal evidence from all versions with uncited records, oldest first", () => {
    const v1 = brief([
      entry({ id: "S1", url: "https://news.ca/a", publishedAt: "2026-06-01", eventAt: null, relevance: "signal", finding: "Old finding." }),
      entry({ id: "S2", url: "https://news.ca/noise", publishedAt: "2026-07-01", relevance: "not_relevant", finding: "Importer list." }),
    ]);
    const v2 = brief([entry({ id: "S1", url: "https://news.ca/a", publishedAt: "2026-06-01", eventAt: "2026-05-20", relevance: "signal", finding: "Newer finding." })]);
    const items = buildTimeline({ briefs: [{ version: 1, analysis: v1 }, { version: 2, analysis: v2 }], records: [grant, permit] });
    expect(items.map((i) => [i.date, i.kind, i.dateKind, i.versions])).toEqual([
      ["2026-03-03", "record", "issued", []],
      ["2026-05-20", "evidence", "event", [1, 2]],
      ["2026-09-01", "record", "agreement start", []],
    ]);
    expect(items[1].text).toBe("Newer finding."); // latest version's wording
    expect(items.some((i) => i.text === "Importer list.")).toBe(false); // only Signal evidence
    expect(items[0].publisher).toBe("City of Mississauga – Building permits");
  });

  it("doesn't repeat a record that a brief already cites", () => {
    const recordUrl = "https://search.open.canada.ca/grants/record/aafc-aac%2CX%2Ccurrent";
    const v1 = brief([entry({ id: "S1", url: recordUrl, publishedAt: "2026-09-01", relevance: "signal", finding: "Grant for expansion." })]);
    const items = buildTimeline({ briefs: [{ version: 1, analysis: v1 }], records: [grant] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "evidence", versions: [1] });
  });
});
