import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { excelDate, readXlsx } from "./xlsx";
import { mapBarrie, mapKingston, mapKitchener, mapOttawa, mapWaterloo, ottawaRows, ottawaWork, pickOttawaFiles } from "./permits-ontario";
import { resolveOccupier } from "./occupier";
import { recordUrl } from "@/lib/research/records";
import { regionsIn } from "@/lib/research/filters";
import { getIngestSource } from "./sources";
import type { IngestItem, SignalRow } from "./types";

const ctx = { today: "2026-11-23", cutoff: "2025-11-23" };
const ms = (d: string) => Date.parse(`${d}T05:00:00Z`);
const rowOf = (i: IngestItem): SignalRow => {
  if (!("row" in i)) throw new Error(`skipped: ${i.skip}`);
  return i.row;
};

describe("occupier names in permit text outside the GTA", () => {
  const name = (t: string) => resolveOccupier(t, { outsideGta: true }).name;
  it("reads the wording these cities use", () => {
    expect(name("interior alterations for Sephora in unit 2.")).toBe("Sephora");
    expect(name("interior finishes for a Tim Horton's restaurant in Building B, Unit 109.")).toBe("Tim Horton's");
    expect(name("interior alterations for Distinctive Wood Products.")).toBe("Distinctive Wood Products");
    expect(name("Interior alteration to existing office building for Alder Concrete Group.")).toBe("Alder Concrete Group");
    expect(name("Unit A11 - Tenant fit out to create Knix.")).toBe("Knix");
    expect(name("Tenant fit up in a 1 storey industrial building (McCabe Promotional)")).toBe("McCabe Promotional");
    expect(name("Unit 4 - Tenant fit-up - Jersey Mike's Subs")).toBe("Jersey Mike's Subs");
    expect(name("New wall sign for Structube")).toBe("Structube");
    expect(name("interior alterations for Gwalia Sweets and Restaurants in unit C.")).toBe("Gwalia Sweets and Restaurants");
    expect(name("Interior alterations (Units 201 and 202, Ticket Ninja Inc)")).toBe("Ticket Ninja Inc");
  });
  it("rejects work notes, business types and public bodies", () => {
    expect(name("Interior Alterations to a 1 storey industrial building (Fire Panel Replacement)")).toBeNull();
    expect(name("Construct a 1 storey industrial building (Building G)(F3 Occupancy Classification)")).toBeNull();
    expect(name("interior alterations for a medical office in unit 204.")).toBeNull();
    expect(name("Tenant Fit Up - Tattoo Shop Unit 2-B (206)")).toBeNull();
    expect(name("Tenant fit-up in a 1 storey retail building (Ottawa Public Library)")).toBeNull();
    expect(name("Adding in new ventilation system for Bay.")).toBeNull();
  });
  it("leaves GTA resolution unchanged", () => {
    expect(resolveOccupier("interior alterations for Sephora in unit 2.").name).toBeNull();
  });
});

describe("Kitchener", () => {
  const base = { PERMITNO: "25128853", PERMIT_TYPE: "Industrial/Commercial/Institutional Building Permit", PERMIT_STATUS: "Issued", APPLICATION_DATE: ms("2025-10-31"), ISSUE_DATE: ms("2026-04-21"), FOLDERNAME: "1 MAIN ST", CONSTRUCTION_VALUE: 1343000 };
  it("keeps industrial permits and names the business", () => {
    const r = rowOf(mapKitchener({ ...base, SUB_WORK_TYPE: "Manufacturing / Processing", WORK_TYPE: "Alterations / Improvements to Building", PERMIT_DESCRIPTION: "Permit is for interior alterations for Distinctive Wood Products." }, ctx));
    expect(r).toMatchObject({ source_type: "permit_kitchener", sector: "industrial", raw_entity_name: "Distinctive Wood Products", signal_strength: "alteration", published_at: "2026-04-21", location: "1 MAIN ST, Kitchener, Ontario" });
    expect(r.raw).toMatchObject({ stage: "issued", est_value: 1343000 });
  });
  it("keeps retail only when named; skips other uses", () => {
    const shop = { ...base, SUB_WORK_TYPE: "Retail or Wholesale Outlet / Department Store / Personal Services / Dry Cleaner", WORK_TYPE: "Alterations / Improvements to Building" };
    expect(rowOf(mapKitchener({ ...shop, PERMIT_DESCRIPTION: "Permit is for interior alterations for Sephora in unit 2." }, ctx))).toMatchObject({ sector: "retail", raw_entity_name: "Sephora" });
    expect(mapKitchener({ ...shop, PERMIT_DESCRIPTION: "Permit is for interior alterations for a grocery store in unit 1." }, ctx)).toEqual({ skip: "retail: no business named" });
    expect(mapKitchener({ ...base, SUB_WORK_TYPE: "Elementary School", PERMIT_DESCRIPTION: "x" }, ctx)).toEqual({ skip: "not industrial or retail" });
    expect(mapKitchener({ ...shop, PERMIT_STATUS: "Cancelled", PERMIT_DESCRIPTION: "for Sephora in unit 2." }, ctx)).toEqual({ skip: "cancelled or revoked" });
  });
  it("stores an unissued permit as an application", () => {
    const r = rowOf(mapKitchener({ ...base, ISSUE_DATE: null, APPLICATION_DATE: ms("2026-10-01"), PERMIT_STATUS: "In Review", SUB_WORK_TYPE: "Warehouse", WORK_TYPE: "New Construction", PERMIT_DESCRIPTION: "Permit is for a new warehouse." }, ctx));
    expect(r).toMatchObject({ published_at: "2026-10-01", signal_strength: "new_building" });
    expect(r.title).toMatch(/application \(in review\)/);
  });
});

describe("Waterloo, Kingston and Barrie", () => {
  it("Waterloo: Group F is industrial; Group E retail when named", () => {
    const w = { PERMIT_NUM: "26 1", STATUS: "Issued", ISSUEDATE: ms("2026-06-01"), ADDRESS: "1 King St", CONTRVALUE: 10000000 };
    expect(rowOf(mapWaterloo({ ...w, SUBDESC: "Industrial (Group F)", WORKDESC: "NewShellOnly", DESCRIPTN: "New Industrial Building Shell only" }, ctx))).toMatchObject({ sector: "industrial", signal_strength: "new_building", raw_entity_name: null });
    expect(rowOf(mapWaterloo({ ...w, SUBDESC: "Mercantile (Group E)", WORKDESC: "InteriorWork", DESCRIPTN: "Unit A11 - Tenant fit out to create Knix." }, ctx))).toMatchObject({ sector: "retail", raw_entity_name: "Knix" });
    expect(mapWaterloo({ ...w, SUBDESC: "Business and Personal Services (Group D)", WORKDESC: "InteriorWork", DESCRIPTN: "Interior renovation for IG Wealth Management office." }, ctx)).toEqual({ skip: "not industrial or retail" });
  });
  it("Kingston: case records and tents are skipped; unissued dates of 0 are not dates", () => {
    const k = { PERMIT_NUMBER: "D30-0051-2026", STATUS: "Permit Closed", DATE_APPLICATION: ms("2026-02-01"), DATE_ISSUE: ms("2026-03-10"), ADDRESS: "759 GARDINERS RD" };
    expect(rowOf(mapKingston({ ...k, USE_TYPE: "Restaurant/Bar/Tavern  <30 Occupants", TYPE_OF_WORK: "Alteration or Renovation", PROJECTDESCRIPTION: "Unit 4 - Tenant fit-up - Jersey Mike's Subs" }, ctx))).toMatchObject({ sector: "retail", raw_entity_name: "Jersey Mike's Subs" });
    expect(mapKingston({ ...k, USE_TYPE: "Retail Complex/Shopping Mall", TYPE_OF_WORK: "Temporary Structure", PROJECTDESCRIPTION: "(4) temporary tents for Garden Centre at Loblaws" }, ctx)).toEqual({ skip: "temporary structure" });
    expect(mapKingston({ ...k, USE_TYPE: "Plant for Manufacturing/Processing/Assembling", TYPE_OF_WORK: "Permit Case", PROJECTDESCRIPTION: "x" }, ctx)).toEqual({ skip: "case record (the permits are listed separately)" });
    const app = rowOf(mapKingston({ ...k, DATE_ISSUE: 0, STATUS: "In Review", USE_TYPE: "Storage Building/Warehouse/Freight Depot", TYPE_OF_WORK: "New Construction", PROJECTDESCRIPTION: "New storage building" }, ctx));
    expect(app).toMatchObject({ published_at: "2026-02-01", sector: "industrial" });
  });
  it("Barrie: reads the work from the description and the dotted status date", () => {
    const r = rowOf(mapBarrie({ RECORD_ID: "PMT25-00538", Full_Address: "50 IRONSTONE CRES", Sub_Type: "Building Permit (All Other Types)", Description: "Industrial - New Shell", RECORD_STATUS: "Issued", Date_Status: "2026.01.07" }, ctx));
    expect(r).toMatchObject({ sector: "industrial", signal_strength: "new_building", published_at: "2026-01-07" });
    expect(mapBarrie({ RECORD_ID: "x", Description: "Residential - New SFD", Sub_Type: "Building Permit (All Other Types)", RECORD_STATUS: "Issued", Date_Status: "2026.01.07" }, ctx)).toEqual({ skip: "not industrial or retail" });
  });
});

// A tiny .xlsx built in memory: zip with stored + deflated parts.
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const book = zip({
  "xl/workbook.xml": `<workbook><sheets><sheet name="October 2026" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst><si><t>PERMIT NUMBER</t></si><si><t>STREET ADDRESS</t></si><si><t>ISSUED DATE</t></si><si><t>BUILDING TYPE</t></si><si><t>DESCRIPTION</t></si><si><t>VALUE</t></si><si><t>SQUARE METRES</t></si><si><t>CON-2025-018725</t></si><si><t>47 ANTARES DR</t></si><si><t>Industrial</t></si><si><t>Tenant fit up in a 1 storey industrial building (McCabe Promotional)</t></si><si><r><t>PERMITS </t></r><r><t>ISSUED</t></r></si><si><t>Fish &amp; Chips</t></si></sst>`,
  "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
    <row r="1"><c r="D1" t="s"><v>11</v></c></row>
    <row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c><c r="C2" t="s"><v>2</v></c><c r="D2" t="s"><v>3</v></c><c r="E2" t="s"><v>4</v></c><c r="F2" t="s"><v>5</v></c><c r="G2" t="s"><v>6</v></c></row>
    <row r="3"><c r="A3" t="s"><v>7</v></c><c r="B3" t="s"><v>8</v></c><c r="C3"><v>46048</v></c><c r="D3" t="s"><v>9</v></c><c r="E3" t="s"><v>10</v></c><c r="F3"><v>750000</v></c><c r="G3"><v>1069.5</v></c></row>
    <row r="4"><c r="A4" t="s"><v>12</v></c><c r="C4" t="inlineStr"><is><t>inline</t></is></c></row>
  </sheetData></worksheet>`,
});

describe("Ottawa monthly Excel files", () => {
  it("reads sheets, shared and rich strings, and gaps between cells", () => {
    const [s] = readXlsx(book);
    expect(s.name).toBe("October 2026");
    expect(s.rows[0]).toEqual([null, null, null, "PERMITS ISSUED"]);
    expect(s.rows[3]).toEqual(["Fish & Chips", null, "inline"]);
    expect(excelDate(46048)).toBe("2026-01-26");
    expect(excelDate("2026.01.07")).toBe("2026-01-07");
  });
  it("maps a permit row, naming the business in brackets", () => {
    const [r] = ottawaRows(book);
    const row = rowOf(mapOttawa(r, ctx, "https://www.arcgis.com/home/item.html?id=abc"));
    expect(row).toMatchObject({ source_type: "permit_ottawa", source_record_id: "CON-2025-018725", raw_entity_name: "McCabe Promotional", sector: "industrial", signal_strength: "alteration", published_at: "2026-01-26", location: "47 ANTARES DR, Ottawa, Ontario" });
    expect(recordUrl(row as never)).toBe("https://www.arcgis.com/home/item.html?id=abc");
  });
  it("classifies the work and skips revisions and plumbing", () => {
    expect(ottawaWork("Construct a 1 storey addition to a 1 storey industrial building (Tony Graham Motors)")).toBe("addition");
    expect(ottawaWork("Construct a 1 storey 4-unit warehouse building")).toBe("new building");
    expect(mapOttawa({ "PERMIT NUMBER": "x", DESCRIPTION: "Revision: AMENDMENT TO CON-1", "BUILDING TYPE": "Industrial" }, ctx, null)).toEqual({ skip: "revision of another permit" });
    expect(mapOttawa({ "PERMIT NUMBER": "x", DESCRIPTION: "PLUMBING ONLY: Install a backflow device", "BUILDING TYPE": "Industrial" }, ctx, null)).toEqual({ skip: "plumbing only" });
  });
  it("picks this year's file and the one covering last year", () => {
    const items = [
      { id: "a", title: "Construction, Demolition, and Pool Permits 2026", name: "BuildingPermits2026.xlsx" },
      { id: "b", title: "Construction, demolition, and pool enclosure permits monthly - 2024 to 2025", name: "Permits2024.xlsx" },
      { id: "c", title: "Construction, demolition, and pool enclosure permits monthly - 2023", name: "Permits2023EN.xlsx" },
    ];
    expect(pickOttawaFiles(items, "2026-11-23").map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("wiring", () => {
  it("registers the sources, links records and knows the regions", () => {
    for (const s of ["permit_kitchener", "permit_waterloo", "permit_kingston", "permit_barrie", "permit_ottawa"]) expect(getIngestSource(s)).toBeDefined();
    expect(recordUrl({ source_type: "permit_kitchener", source_record_id: "25128853", raw: {} } as never)).toContain("PERMITNO%3D%2725128853%27");
    expect(regionsIn("47 ANTARES DR, Ottawa, Ontario")).toEqual(["ottawa"]);
    expect(regionsIn("1 Main St, Barrie, Ontario")).toEqual(["barrie_simcoe"]);
    expect(regionsIn("1 Main St, Kingston, Ontario")).toEqual(["kingston"]);
  });
});
