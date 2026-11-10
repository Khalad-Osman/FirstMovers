import type { RecencyTier } from "@/lib/brief/schema";

// CLAUDE.md §7 recency tiers, measured from the analysis date:
//   recent      <= 12 months  (can support "What changed")
//   context     12–24 months  (known public programs; look for follow-ups)
//   historical  > 24 months   (excluded unless it explains a current development)
//   undated     no usable date
// The event date is used when known, otherwise the publication date.

function parse(d: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function minusMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export function recencyTier(
  source: { publishedAt: string | null; eventAt: string | null },
  analysisDate: string,
): RecencyTier {
  const ref = parse(analysisDate);
  if (!ref) throw new Error(`Invalid analysis date: ${analysisDate}`);
  const raw = source.eventAt ?? source.publishedAt;
  const date = raw ? parse(raw) : null;
  if (!date) return "undated";
  if (date >= minusMonths(ref, 12)) return "recent";
  if (date >= minusMonths(ref, 24)) return "context";
  return "historical";
}
