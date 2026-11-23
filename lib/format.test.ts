import { describe, expect, it } from "vitest";
import { stripLabel, citationParts, normalAddressCase } from "./format";

describe("stripLabel", () => {
  it("removes a repeated heading prefix", () => {
    expect(stripLabel("What changed: Won a contract.", "What changed")).toBe("Won a contract.");
    expect(stripLabel("countercase – Existing space may suffice.", "Countercase")).toBe("Existing space may suffice.");
  });
  it("leaves other text alone", () => {
    expect(stripLabel("Won a contract; what changed is the volume.", "What changed")).toBe("Won a contract; what changed is the volume.");
  });
});

describe("normalAddressCase", () => {
  it.each([
    ["Permits at 560 SLATE DR and 600 SLATE DR.", "Permits at 560 Slate Dr and 600 Slate Dr."],
    ["Located at 12173 DIXIE ROAD, Caledon", "Located at 12173 Dixie Road, Caledon"],
    ["1293 NORTH SERVICE RD E", "1293 North Service Rd E"],
    ["TD SYNNEX at 255 Biscayne Crescent", "TD SYNNEX at 255 Biscayne Crescent"],
    ["Order 3 GFL TRUCKS today", "Order 3 GFL TRUCKS today"],
  ])("%s", (input, out) => expect(normalAddressCase(input)).toBe(out));
});

describe("citationParts", () => {
  const known = new Set(["S1", "S3", "S5"]);
  it("splits bracketed and bare citations, keeping only known ids", () => {
    expect(citationParts("Two permits (S1, S3). S5 adds the site; S9 is unknown.", known)).toEqual([
      { text: "Two permits " },
      { ids: ["S1", "S3"] },
      { text: ". " },
      { ids: ["S5"] },
      { text: " adds the site; S9 is unknown." },
    ]);
    expect(citationParts("No sources here.", known)).toEqual([{ text: "No sources here." }]);
    expect(citationParts("Reasons [S1; S5]", known)).toEqual([{ text: "Reasons " }, { ids: ["S1", "S5"] }]);
  });
});
