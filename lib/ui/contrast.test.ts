import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CLAUDE.md §10: every badge's text must contrast strongly with its own
// background. Reads the real colours from app/globals.css so a future colour
// change can't silently break legibility.

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const css = readFileSync("app/globals.css", "utf8");
const badges = [...css.matchAll(/\.(badge-[a-z-]+)\s*\{([^}]*)\}/g)].map(([, name, body]) => {
  const bg = /background:\s*(#[0-9a-f]{3,6})/i.exec(body)?.[1];
  const fg = /(?:^|[;\s])color:\s*(#[0-9a-f]{3,6})/i.exec(body)?.[1];
  return { name, bg, fg };
});

describe("badge contrast", () => {
  it("finds the badge styles", () => {
    expect(badges.length).toBeGreaterThanOrEqual(17);
  });

  for (const b of badges) {
    it(`${b.name} text contrasts at least 4.5:1 with its own background`, () => {
      expect(b.bg, `${b.name} has no background`).toBeTruthy();
      expect(b.fg, `${b.name} has no text colour`).toBeTruthy();
      expect(contrast(b.fg!, b.bg!)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("primary button and metadata text are legible", () => {
    expect(contrast("#ffffff", /--accent:\s*(#[0-9a-f]{6})/i.exec(css)![1])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(/--meta:\s*(#[0-9a-f]{6})/i.exec(css)![1], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(/--slate-muted:\s*(#[0-9a-f]{6})/i.exec(css)![1], /--slate:\s*(#[0-9a-f]{6})/i.exec(css)![1])).toBeGreaterThanOrEqual(4.5);
  });
});
