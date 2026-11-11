import { describe, expect, it } from "vitest";
import { stripLabel } from "./format";

describe("stripLabel", () => {
  it("removes a repeated heading prefix", () => {
    expect(stripLabel("What changed: Won a contract.", "What changed")).toBe("Won a contract.");
    expect(stripLabel("countercase – Existing space may suffice.", "Countercase")).toBe("Existing space may suffice.");
  });
  it("leaves other text alone", () => {
    expect(stripLabel("Won a contract; what changed is the volume.", "What changed")).toBe("Won a contract; what changed is the volume.");
  });
});
