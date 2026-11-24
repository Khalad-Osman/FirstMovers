import { describe, expect, it } from "vitest";
import { addressKey, attachByAddress } from "./address";
import { buildCandidates, groupKey, signalWeight, type SignalForCandidate } from "./candidates";
import { mapAgco, noticeDates, storeKey } from "@/lib/ingest/agco";
import { isPhysical, familyOf } from "@/lib/prospects";
import { recordExcerpt } from "@/lib/research/records";

let n = 0;
const sig = (over: Partial<SignalForCandidate>): SignalForCandidate => ({
  id: `s${++n}`,
  source_type: "permit_mississauga",
  raw_entity_name: null,
  entity_key: null,
  signal_strength: "addition",
  title: "Mississauga permit",
  summary: "Addition",
  url: null,
  published_at: "2026-10-01",
  event_at: null,
  location: "6755 INVADER CRES, Mississauga, Ontario",
  raw: {},
  ...over,
});

describe("address keys", () => {
  it("normalizes street types, units and the city", () => {
    expect(addressKey("1500 BIRCHMOUNT RD, Unit 4, Toronto, Ontario M1P 2G5")).toEqual({ key: "toronto|1500 birchmount rd", street: "1500 birchmount rd", unit: "4" });
    expect(addressKey("1500 Birchmount Road, Toronto, Ontario")?.key).toBe("toronto|1500 birchmount rd");
    expect(addressKey("Mississauga, Ontario")).toBeNull();
    expect(addressKey("Unknown address, Brampton, Ontario")).toBeNull();
  });
});

describe("permits naming no business, matched by address", () => {
  it("joins the one company named at that address and says so", () => {
    const named = sig({ raw_entity_name: "BACKERHAUS VIET LTD", entity_key: "backerhaus viet", signal_strength: "alteration" });
    const unnamed = sig({ signal_strength: "addition", raw: { stage: "application" } });
    const [m] = attachByAddress([named, unnamed], groupKey);
    expect(m).toMatchObject({ id: unnamed.id, raw_entity_name: "BACKERHAUS VIET LTD", entity_key: "backerhaus viet" });
    expect(m.title).toMatch(/names no business; same address as a record naming BACKERHAUS VIET LTD/);
    expect(signalWeight(m).label).toMatch(/same address; the permit names no business/);
    const { candidates } = buildCandidates([named, unnamed], { today: "2026-11-23", skipKeys: new Set() });
    expect(candidates[0].signals.map((s) => s.id).sort()).toEqual([named.id, unnamed.id].sort());
    expect(recordExcerpt(m as never)).toMatch(/Business named in the record: none\. Linked by address/);
  });
  it("doesn't link shared buildings, other units or other sources", () => {
    const a = sig({ raw_entity_name: "ACME LTD", entity_key: "acme" });
    const b = sig({ raw_entity_name: "OTHER CO INC", entity_key: "other co" });
    expect(attachByAddress([a, b, sig({})], groupKey)).toEqual([]);
    const unitA = sig({ raw_entity_name: "LEGO", entity_key: "lego", location: "100 CITY CENTRE DR, Unit 2-427, Mississauga, Ontario" });
    expect(attachByAddress([unitA, sig({ location: "100 CITY CENTRE DR, Unit 1-K02B, Mississauga, Ontario" })], groupKey)).toEqual([]);
    expect(attachByAddress([unitA, sig({ location: "100 CITY CENTRE DR, Mississauga, Ontario" })], groupKey)).toEqual([]);
    expect(attachByAddress([a, sig({ source_type: "canadabuys_award" })], groupKey)).toEqual([]);
  });
});

describe("AGCO cannabis stores", () => {
  const store = { PremisesName: "Hunny Pot Cannabis", Address: "102 MCEWEN AVE UNIT C, OTTAWA, ON, K2B 5K7", City: "OTTAWA", ApplicationStatus: "Public Notice", PublicNoticeDate: "From Nov 17, 2026 to Dec 01, 2026", Website: "" };
  const today = "2026-11-23";
  it("reads public notice dates", () => {
    expect(noticeDates("From Nov 17, 2026 to Dec 01, 2026")).toEqual({ start: "2026-11-17", end: "2026-12-01" });
    expect(noticeDates("To be Determined")).toBeNull();
  });
  it("dates a new store by its notice, else the day it was first seen", () => {
    const r = mapAgco(store, "notice", { today, stored: new Map() });
    expect(r).toMatchObject({ row: { source_type: "agco_cannabis", signal_strength: "store_licence", sector: "retail", published_at: "2026-11-17", raw_entity_name: "Hunny Pot Cannabis", location: "102 MCEWEN AVE UNIT C, OTTAWA, Ontario, K2B 5K7" } });
    const tbd = { ...store, ApplicationStatus: "In Progress", PublicNoticeDate: "To be Determined" };
    const id = `open:${storeKey(tbd)}`;
    expect(mapAgco(tbd, "progress", { today, stored: new Map() })).toMatchObject({ row: { published_at: today, raw: { date_basis: "first seen in the AGCO list" } } });
    expect(mapAgco(tbd, "progress", { today, stored: new Map([[id, "2026-10-02"]]) })).toMatchObject({ row: { published_at: "2026-10-02" } });
  });
  it("updates tracked stores when authorized; skips stores open before tracking", () => {
    const auth = { ...store, ApplicationStatus: "Authorized to Open", PublicNoticeDate: "." };
    expect(mapAgco(auth, "authorized", { today, stored: new Map([["x", null]]) })).toEqual({ skip: "authorized before tracking began" });
    const id = `open:${storeKey(auth)}`;
    expect(mapAgco(auth, "authorized", { today, stored: new Map([[id, "2026-11-17"]]) })).toMatchObject({ row: { source_record_id: id, published_at: "2026-11-17" } });
  });
  it("cancelled stores: undated on the first run, dated when first seen later", () => {
    const gone = { ...store, ApplicationStatus: "Cancelled", PublicNoticeDate: "." };
    const first = mapAgco(gone, "cancelled", { today, stored: new Map() });
    expect(first).toMatchObject({ row: { published_at: null, raw: { kind: "closing" } } });
    const later = mapAgco(gone, "cancelled", { today, stored: new Map([["open:other", "2026-11-01"]]) });
    expect(later).toMatchObject({ row: { published_at: today } });
  });
  it("scores openings and closings for retail and shows them on Prospects", () => {
    const item = mapAgco(store, "notice", { today, stored: new Map() });
    if (!("row" in item)) throw new Error("skipped");
    const open = { ...sig({}), ...item.row } as SignalForCandidate;
    expect(signalWeight(open)).toEqual({ weight: 4, label: "retail: new store application" });
    expect(signalWeight({ ...open, raw: { kind: "closing" } })).toEqual({ weight: 3, label: "retail: store authorization cancelled (store closing)" });
    expect(familyOf(open)).toBe("licence");
    expect(isPhysical(open as never)).toBe(true);
    expect(isPhysical({ ...open, published_at: null } as never)).toBe(false);
  });
});
