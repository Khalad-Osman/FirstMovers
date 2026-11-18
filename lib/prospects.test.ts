import { describe, expect, it } from "vitest";
import type { RecordSignal } from "@/lib/research/records";
import { buildProspects, filterProspects, isPhysical, municipalityOf, parseProspectFilters, prospectsCsv, signalValue, type LatestBrief } from "./prospects";

const TODAY = "2026-11-17";
let n = 0;
const sig = (over: Partial<RecordSignal>): RecordSignal => ({
  id: `s${++n}`,
  source_type: "permit_mississauga",
  source_record_id: `BP ${n}`,
  raw_entity_name: "CROWN DISTRIBUTORS LTD.",
  entity_key: "crown distributors",
  signal_strength: "new_building",
  title: "Mississauga permit: NEW BUILDING at 6670 CAMPOBELLO RD",
  summary: "NEW (1) STOREY INDUSTRIAL BLDG",
  url: null,
  published_at: "2026-08-18",
  event_at: null,
  location: "6670 CAMPOBELLO RD, Mississauga, Ontario",
  raw: { EST_CON_VALUE: 14261813, APPL_AREA: 4015.15 },
  ...over,
});

describe("prospect helpers", () => {
  it("treats space-related permits and facility/equipment grants as physical, not awards alone", () => {
    expect(isPhysical(sig({}))).toBe(true);
    expect(isPhysical(sig({ signal_strength: "sign", raw: {} }))).toBe(false);
    expect(isPhysical(sig({ source_type: "federal_grant", signal_strength: "grant", raw: { grant_kind: "facility" } }))).toBe(true);
    expect(isPhysical(sig({ source_type: "federal_grant", signal_strength: "grant", raw: { grant_kind: "other" } }))).toBe(false);
    expect(isPhysical(sig({ source_type: "canadabuys_award", signal_strength: "award", raw: {} }))).toBe(false);
  });
  it("reads values and municipalities from records", () => {
    expect(signalValue(sig({}))).toBe(14261813);
    expect(signalValue(sig({ raw: { agreement_value: "4000000.0" } }))).toBe(4000000);
    expect(signalValue(sig({ raw: { "contractAmount-montantContrat": "1200000", "totalContractValue-valeurTotaleContrat": "1500000" } }))).toBe(1500000);
    expect(signalValue(sig({ raw: {} }))).toBeNull();
    expect(municipalityOf("560 SLATE DR, Mississauga, Ontario")).toBe("Mississauga");
    expect(municipalityOf("BRAMPTON, Ontario, L6T 5V8")).toBe("Brampton");
    expect(municipalityOf("Ontario")).toBeNull();
  });
});

describe("buildProspects / filterProspects", () => {
  const briefs = new Map<string, LatestBrief>([["crown distributors", { id: "b1", rating: "no_meaningful_signal", analyzedAt: "2026-11-16T20:00:00Z" }]]);
  const list = () =>
    buildProspects(
      [
        sig({}),
        sig({ signal_strength: "sign", raw: {}, published_at: "2026-09-01", title: "Sign" }),
        sig({ raw_entity_name: "Saputo Dairy Products Canada G.P.", entity_key: "saputo dairy products canada g p", source_type: "federal_grant", signal_strength: "grant", location: "GEORGETOWN, Ontario, L7G 4S4", raw: { grant_kind: "facility", agreement_value: "18000000" }, published_at: "2026-09-01", url: "https://search.open.canada.ca/grants/record/x" }),
        sig({ raw_entity_name: "Oracle Canada ULC", entity_key: "oracle", source_type: "canadabuys_award", signal_strength: "award", location: "Toronto, Ontario", raw: { "contractAmount-montantContrat": "2000000" }, url: "https://canadabuys.canada.ca/x" }),
        sig({ raw_entity_name: "Mariposa Dairy Ltd.", entity_key: "mariposa dairy", source_type: "federal_grant", signal_strength: "grant", location: "Lindsay, Ontario", raw: { grant_kind: "equipment", agreement_value: "2684600" }, url: "https://search.open.canada.ca/grants/record/y" }),
      ],
      { today: TODAY, briefsByKey: briefs },
    );

  it("keeps only companies with physical activity, ranked by score, with their brief", () => {
    const l = list();
    expect(l.map((p) => p.name)).toEqual(["CROWN DISTRIBUTORS LTD.", "Saputo Dairy Products Canada G.P.", "Mariposa Dairy Ltd."]); // no Oracle
    const crown = l[0];
    expect(crown).toMatchObject({ municipality: "Mississauga", regions: ["peel"], families: ["permit"], maxValue: 14261813, latestDate: "2026-09-01", brief: { id: "b1" } });
    expect(crown.signals[0]).toMatchObject({ physical: true, publisher: "City of Mississauga – Building permits" }); // physical first
    expect(crown.signals[0].url).toContain("arcgis.com");
    expect(l[1]).toMatchObject({ regions: ["halton"], families: ["grant"], brief: null });
  });

  it("filters by region (GTA by default), signal type, never analyzed and minimum value", () => {
    const l = list();
    const f = (p: Record<string, string>) => filterProspects(l, parseProspectFilters(p)).map((x) => x.name);
    expect(f({})).toEqual(["CROWN DISTRIBUTORS LTD.", "Saputo Dairy Products Canada G.P."]); // GTA only: no Lindsay
    expect(f({ region: "all" })).toHaveLength(3);
    expect(f({ region: "peel" })).toEqual(["CROWN DISTRIBUTORS LTD."]);
    expect(f({ type: "grant" })).toEqual(["Saputo Dairy Products Canada G.P."]);
    expect(f({ new: "1" })).toEqual(["Saputo Dairy Products Canada G.P."]);
    expect(f({ region: "all", min: "5,000,000" })).toEqual(["CROWN DISTRIBUTORS LTD.", "Saputo Dairy Products Canada G.P."]);
  });

  it("exports CSV with quoting", () => {
    const csv = prospectsCsv(list().slice(0, 1));
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe("Company,Municipality,Regions,Score,Score reasons,Signal types,Largest value ($),Latest signal,Top signals,Latest brief rating,Latest brief date");
    expect(row.startsWith('CROWN DISTRIBUTORS LTD.,Mississauga,Peel,')).toBe(true);
    expect(row).toContain(",no_meaningful_signal,2026-11-16");
  });
});
