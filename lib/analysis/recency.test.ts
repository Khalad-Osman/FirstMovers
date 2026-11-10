import { describe, expect, it } from "vitest";
import { recencyTier } from "./recency";

const at = (publishedAt: string | null, eventAt: string | null = null) => recencyTier({ publishedAt, eventAt }, "2026-11-10");

describe("recencyTier", () => {
  it("classifies by months from the analysis date", () => {
    expect(at("2026-11-10")).toBe("recent");
    expect(at("2025-11-10")).toBe("recent"); // exactly 12 months
    expect(at("2025-11-09")).toBe("context");
    expect(at("2024-11-10")).toBe("context"); // exactly 24 months
    expect(at("2024-11-09")).toBe("historical");
  });

  it("prefers the event date over the publication date", () => {
    expect(at("2026-10-01", "2023-05-01")).toBe("historical");
    expect(at("2023-05-01", "2026-10-01")).toBe("recent");
  });

  it("returns undated for missing or malformed dates", () => {
    expect(at(null)).toBe("undated");
    expect(at("May 2026")).toBe("undated");
  });

  it("rejects an invalid analysis date", () => {
    expect(() => recencyTier({ publishedAt: null, eventAt: null }, "yesterday")).toThrow();
  });
});
