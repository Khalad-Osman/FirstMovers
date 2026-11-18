import { describe, expect, it } from "vitest";
import { analysisInputSchema, sourceRecordSchema } from "@/lib/analysis/types";
import { buildBrief } from "@/lib/analysis/build";
import { MAX_RECORDS, recordExcerpt, recordUrl, selectRecords, toRecordSource, type RecordSignal } from "./records";

const TODAY = "2026-11-16";

function sig(over: Partial<RecordSignal> & Pick<RecordSignal, "id" | "source_type" | "source_record_id">): RecordSignal {
  return {
    raw_entity_name: "STELUMAR ADVANCED MANUFACTURING INC.",
    entity_key: "stelumar advanced manufacturing",
    signal_strength: "alteration",
    title: "Mississauga permit",
    summary: null,
    url: null,
    published_at: "2026-06-01",
    event_at: null,
    location: "560 SLATE DR, Mississauga, Ontario",
    raw: {},
    ...over,
  };
}

const addition = sig({
  id: "a",
  source_type: "permit_mississauga",
  source_record_id: "BP 9NEW 26-0100",
  signal_strength: "addition",
  published_at: "2026-03-03",
  title: "Mississauga permit: ADDITION at 560 SLATE DR",
  summary: "NEW (1) STOREY ADDITION (2) NEW MEZZANINES - STELUMAR ADVANCED MANUFACTURING INC.. Est. value $5,714,371",
  raw: {
    BP_NO: "BP 9NEW 26-0100",
    OBJECTID: 42,
    ADDRESS: "560 SLATE DR",
    DESCRIPTION: "NEW (1) STOREY ADDITION (2) NEW MEZZANINES",
    EST_CON_VALUE: 5714371,
    ISSUE_DATE: Date.UTC(2026, 2, 3),
    BUILDER: "Some Builder Ltd",
  },
});
const racking = sig({ id: "b", source_type: "permit_mississauga", source_record_id: "BP 3ALT 26-2794", published_at: "2026-08-20", summary: "INSTALLATION OF RACKING SYSTEM" });
const dust = sig({ id: "c", source_type: "permit_mississauga", source_record_id: "BP 3ALT 26-3000", signal_strength: "other", published_at: "2026-10-13" });
const fitout = sig({ id: "d", source_type: "permit_mississauga", source_record_id: "BP 3ALT 26-1316", signal_strength: "addition", published_at: "2026-06-30", location: "600 SLATE DR, Mississauga, Ontario" });

describe("selectRecords", () => {
  it("ranks by signal weight, then date, and caps at MAX_RECORDS", () => {
    const picked = selectRecords([dust, racking, addition, fitout], { today: TODAY });
    expect(picked).toHaveLength(MAX_RECORDS);
    expect(picked.map((s) => s.id)).toEqual(["d", "a", "b"]); // two additions (newest first), then the alteration
  });

  it("puts the signal that surfaced the company first", () => {
    const picked = selectRecords([dust, racking, addition, fitout], { today: TODAY, mustInclude: "c" });
    expect(picked[0].id).toBe("c");
    expect(picked).toHaveLength(MAX_RECORDS);
  });

  it("drops records older than 24 months or dated in the future", () => {
    const old = sig({ id: "o", source_type: "permit_mississauga", source_record_id: "BP 1 24-1", published_at: "2024-10-01" });
    const future = sig({ id: "f", source_type: "permit_mississauga", source_record_id: "BP 1 27-1", published_at: "2027-01-01" });
    expect(selectRecords([old, future, racking], { today: TODAY }).map((s) => s.id)).toEqual(["b"]);
  });

  it("keeps only the latest revision of a Toronto permit", () => {
    const r0 = sig({ id: "t0", source_type: "permit_toronto", source_record_id: "25 123456 BLD:00" });
    const r1 = sig({ id: "t1", source_type: "permit_toronto", source_record_id: "25 123456 BLD:01", published_at: "2026-07-01" });
    expect(selectRecords([r0, r1], { today: TODAY }).map((s) => s.id)).toEqual(["t1"]);
  });

  it("drops a Mississauga revision when its original permit is present", () => {
    const rev = sig({ id: "r", source_type: "permit_mississauga", source_record_id: "BP 3ALT 26-2000", summary: "REVISION TO BP 26-0100 - INTERIOR ALTERATION" });
    expect(selectRecords([addition, rev], { today: TODAY }).map((s) => s.id)).toEqual(["a"]);
    // …but keeps it when the original isn't among the records
    expect(selectRecords([rev], { today: TODAY }).map((s) => s.id)).toEqual(["r"]);
  });
});

describe("recordUrl", () => {
  it("links each record type to that one record", () => {
    const m = new URL(recordUrl(racking)!);
    expect(m.hostname).toBe("services6.arcgis.com");
    expect(m.searchParams.get("where")).toBe("BP_NO='BP 3ALT 26-2794'");
    expect(m.searchParams.get("f")).toBe("html");

    const b = new URL(recordUrl(sig({ id: "x", source_type: "permit_brampton", source_record_id: "25-192638-000-01" }))!);
    expect(b.hostname).toBe("maps1.brampton.ca");
    expect(b.searchParams.get("where")).toBe("PERMITNUMBER='25-192638-000-01'");
    expect(b.searchParams.get("f")).toBe("pjson");

    const t = new URL(
      recordUrl(sig({ id: "y", source_type: "permit_toronto", source_record_id: "17 101315 BLD:02", raw: { _resource_id: "cleared-id", REVISION_NUM: "02" } }))!,
    );
    expect(t.searchParams.get("resource_id")).toBe("cleared-id");
    expect(JSON.parse(t.searchParams.get("filters")!)).toEqual({ PERMIT_NUM: "17 101315 BLD", REVISION_NUM: "02" });

    const award = sig({ id: "z", source_type: "canadabuys_award", source_record_id: "C1", url: "https://canadabuys.canada.ca/en/tender-opportunities/award-notice/cb-1" });
    expect(recordUrl(award)).toBe(award.url);
    expect(recordUrl({ ...award, url: null })).toBeNull();
  });

  it("escapes quotes in permit numbers", () => {
    const u = new URL(recordUrl(sig({ id: "q", source_type: "permit_mississauga", source_record_id: "BP O'1" }))!);
    expect(u.searchParams.get("where")).toBe("BP_NO='BP O''1'");
  });
});

describe("recordExcerpt / toRecordSource", () => {
  it("copies record fields, converts epoch dates, and leaves out ids and builders", () => {
    const text = recordExcerpt(addition);
    expect(text).toContain("Record type: Issued building permit (City of Mississauga open data)");
    expect(text).toContain("Record number: BP 9NEW 26-0100");
    expect(text).toContain("Issued: 2026-03-03");
    expect(text).toContain("EST_CON_VALUE: 5714371");
    expect(text).toContain("ISSUE_DATE: 2026-03-03");
    expect(text).not.toMatch(/OBJECTID|BUILDER|Some Builder/);
  });

  it("uses English CanadaBuys columns only", () => {
    const award = sig({
      id: "z",
      source_type: "canadabuys_award",
      source_record_id: "C1",
      signal_strength: "award",
      url: "https://canadabuys.canada.ca/en/tender-opportunities/award-notice/cb-1",
      published_at: "2026-05-01",
      event_at: "2026-04-20",
      raw: { "supplierLegalName-nomLegalFournisseur-eng": "Acme Fabrication Inc.", "supplierLegalName-nomLegalFournisseur-fra": "Acme FR", "contractAmount-montantContrat": "1200000" },
    });
    const text = recordExcerpt(award);
    expect(text).toContain("Supplier: Acme Fabrication Inc.");
    expect(text).toContain("Contract amount: 1200000");
    expect(text).toContain("Awarded: 2026-04-20");
    expect(text).not.toContain("Acme FR");
    const src = toRecordSource(award)!;
    expect(src.publisher).toBe("CanadaBuys – Award notice");
    expect(src.eventAt).toBe("2026-04-20");
  });

  it("produces valid analysis sources that build into a brief with record URLs and dates", () => {
    const records = [addition, racking].map((s, i) => {
      const r = toRecordSource(s)!;
      return sourceRecordSchema.parse({ id: `S${i + 1}`, url: r.url, publisher: r.publisher, title: r.title, publishedAt: r.publishedAt, eventAt: r.eventAt, excerpt: r.excerpt });
    });
    const step = { status: "unknown" as const, text: "Unknown.", sourceIds: [] };
    const built = buildBrief(
      {
        company: { name: "Stelumar Advanced Manufacturing Inc.", entityStatus: "verified", entityNotes: "x", localConnection: "Mississauga" },
        chain: { whatChanged: step, operationalConsequence: step, facilityPressure: step, forcingEvent: step, realEstateDecision: step },
        ledger: records.map((r) => ({ sourceId: r.id, evidenceType: "fact", relevance: "signal", finding: "Permit.", repeatCoverageOf: null })),
        countercase: ["Expansion in place."],
        alternativesAssessment: "alternatives_likely",
        existingFacilityInvestment: true,
        otherPremises: { assessment: "not_indicated", address: null, text: "No other premises identified.", sourceIds: [] },
        companyType: "unknown",
        dealIndicators: [],
        brokerAngle: { type: "monitor_only", headline: "Nothing to act on yet.", talkingPoints: [] },
        workingHypothesis: null,
        unknowns: [],
        commercialValue: null,
        nextStep: { action: "monitor", text: "Watch.", validatingQuestion: "Is it full?" },
        rating: "worth_monitoring",
        ratingReason: "Recent permits.",
        stage: "undetermined",
      } as unknown as Parameters<typeof buildBrief>[0],
      records,
      TODAY,
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.brief.ledger[0].url).toBe(records[0].url);
      expect(built.brief.ledger[0].publishedAt).toBe("2026-03-03");
      expect(built.brief.ledger[0].recencyTier).toBe("recent");
    }
  });
});

describe("analysis input limit", () => {
  const src = (i: number) => ({ id: `S${i}`, url: `https://example.com/${i}`, publisher: "p", title: "t", publishedAt: null, eventAt: null, excerpt: "" });
  const input = (n: number) => ({ company: { name: "X Inc." }, trigger: "t", analysisDate: TODAY, sources: Array.from({ length: n }, (_, i) => src(i + 1)) });
  it("accepts 8 sources (5 web + 3 records) and rejects 9", () => {
    expect(analysisInputSchema.safeParse(input(8)).success).toBe(true);
    expect(analysisInputSchema.safeParse(input(9)).success).toBe(false);
  });
});
