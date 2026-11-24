import { z } from "zod";

// Admin-editable settings (single row in public.settings). Ranges mirror the
// database check constraints (CLAUDE.md §8).
const optionalModel = z
  .string()
  .trim()
  .max(100, "Model name is too long.")
  .regex(/^[A-Za-z0-9._:\-/]*$/, "Model names may only contain letters, numbers and . _ : - /")
  .transform((v) => (v === "" ? null : v));

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true");

// The database allows up to 8, but each company is one chained step and Vercel
// stops long self-call chains (HTTP 508). Keep runs at 3 until steps are
// triggered from outside the app (decided 2026-11-16).
export const DISCOVERY_CAP_MAX = 3;

export const settingsFormSchema = z.object({
  discovery_cap: z.coerce
    .number()
    .int()
    .min(1, "Discovery cap is at least 1.")
    .max(DISCOVERY_CAP_MAX, `Discovery cap is at most ${DISCOVERY_CAP_MAX} for now: longer runs are stopped by the host.`),
  sources_per_candidate: z.coerce.number().int().min(1).max(5, "At most 5 sources per candidate."),
  skip_window_days: z.coerce.number().int().min(0).max(365),
  canadabuys_min_value: z.coerce.number().min(0).max(1_000_000_000),
  grants_min_value: z.coerce.number().min(0).max(1_000_000_000),
  screening_model: optionalModel,
  analysis_model: optionalModel,
  schedule_ingestion_enabled: checkbox,
  schedule_discovery_enabled: checkbox,
  discovery_frequency: z.enum(["daily", "weekly", "monthly"], { message: "Choose daily, weekly or monthly." }),
  discovery_weekdays: z
    .array(z.coerce.number().int().min(0).max(6))
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  discovery_month_day: z.coerce.number().int().min(1, "Day of month is 1–28.").max(28, "Day of month is 1–28 (so every month has it)."),
  firecrawl_monthly_budget: z.coerce.number().int().min(0).max(100_000),
  discovery_sector: z.enum(["industrial", "retail"], { message: "Choose industrial or retail." }),
}).superRefine((v, ctx) => {
  if (v.discovery_frequency === "weekly" && v.discovery_weekdays.length === 0) {
    ctx.addIssue({ code: "custom", path: ["discovery_weekdays"], message: "Choose at least one day for weekly discovery." });
  }
}).transform((v) => ({ ...v, discovery_weekdays: v.discovery_weekdays.length ? v.discovery_weekdays : [1] }));
export type SettingsForm = z.output<typeof settingsFormSchema>;

export function parseSettingsForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  };
  return settingsFormSchema.safeParse({
    discovery_cap: get("discovery_cap"),
    sources_per_candidate: get("sources_per_candidate"),
    skip_window_days: get("skip_window_days"),
    canadabuys_min_value: get("canadabuys_min_value"),
    grants_min_value: get("grants_min_value"),
    screening_model: get("screening_model") ?? "",
    analysis_model: get("analysis_model") ?? "",
    schedule_ingestion_enabled: get("schedule_ingestion_enabled"),
    schedule_discovery_enabled: get("schedule_discovery_enabled"),
    discovery_frequency: get("discovery_frequency") ?? "weekly",
    discovery_weekdays: formData.getAll("discovery_weekdays").filter((v): v is string => typeof v === "string"),
    discovery_month_day: get("discovery_month_day") ?? "1",
    firecrawl_monthly_budget: get("firecrawl_monthly_budget"),
    discovery_sector: get("discovery_sector") ?? "industrial",
  });
}
