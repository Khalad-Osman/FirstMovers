import { z } from "zod";

// A collected source handed to the analysis. In Phase 3 these come from the
// `sources` table (Firecrawl scrape + date extraction); in tests, from fixtures.
export const sourceRecordSchema = z.object({
  id: z.string().regex(/^S\d+$/, "Source ids look like S1, S2…"),
  url: z.url(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  publishedAt: z.iso.date().nullable(),
  eventAt: z.iso.date().nullable(),
  excerpt: z.string(), // untrusted scraped text
});
export type SourceRecord = z.infer<typeof sourceRecordSchema>;

export const MAX_ANALYSIS_SOURCES = 8;

export const analysisInputSchema = z.object({
  company: z.object({
    name: z.string().min(1),
    knownAliases: z.array(z.string()).default([]),
    ontarioConnectionNotes: z.string().nullable().default(null),
  }),
  trigger: z.string().min(1), // the signal or query that surfaced the company
  analysisDate: z.iso.date(),
  // Up to 5 web sources plus up to 3 public records (CLAUDE.md §8, decided 2026-11-16).
  sources: z.array(sourceRecordSchema).max(MAX_ANALYSIS_SOURCES, `At most ${MAX_ANALYSIS_SOURCES} sources per candidate (CLAUDE.md §8)`),
});
export type AnalysisInput = z.input<typeof analysisInputSchema>;
export type ParsedAnalysisInput = z.output<typeof analysisInputSchema>;
