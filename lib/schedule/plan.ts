// Pure scheduling and budget logic (unit-tested). Times are Toronto time.

export const CREDITS_PER_CANDIDATE_MAX = 13; // 3 searches x 2 + 5 scrapes + 1 follow-up x 2
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type DiscoverySchedule = {
  frequency: "daily" | "weekly" | "monthly";
  weekdays: number[]; // 0 = Sunday … 6 = Saturday (weekly)
  monthDay: number; // 1–28 (monthly)
};

export function isDiscoveryDay(s: DiscoverySchedule, today: { date: string; weekday: number }): boolean {
  if (s.frequency === "daily") return true;
  if (s.frequency === "weekly") return s.weekdays.includes(today.weekday);
  return Number(today.date.slice(8, 10)) === s.monthDay;
}

export function describeSchedule(s: DiscoverySchedule): string {
  if (s.frequency === "daily") return "every day";
  if (s.frequency === "weekly") return `every ${[...s.weekdays].sort().map((d) => WEEKDAYS[d]).join(", ")}`;
  const n = s.monthDay;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `on the ${n}${suffix} of each month`;
}

export function torontoParts(now: Date): { date: string; weekday: number; month: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date, weekday, month: date.slice(0, 7) };
}

export function maxRunCredits(cap: number): number {
  return Math.max(1, cap) * CREDITS_PER_CANDIDATE_MAX;
}

export type DiscoveryDecision = { run: true } | { run: false; reason: string };

export function decideScheduledDiscovery(input: {
  enabled: boolean;
  schedule: DiscoverySchedule;
  today: { date: string; weekday: number };
  activeRun: boolean;
  monthCredits: number;
  budget: number;
  cap: number;
}): DiscoveryDecision {
  if (!input.enabled) return { run: false, reason: "Scheduled discovery is off." };
  if (!isDiscoveryDay(input.schedule, input.today)) return { run: false, reason: `Not a discovery day (scheduled ${describeSchedule(input.schedule)}).` };
  if (input.activeRun) return { run: false, reason: "A discovery run is already in progress." };
  const worst = maxRunCredits(input.cap);
  if (input.monthCredits + worst > input.budget) {
    return {
      run: false,
      reason: `Monthly Firecrawl budget: ${input.monthCredits} used + up to ${worst} for this run would exceed ${input.budget}.`,
    };
  }
  return { run: true };
}

// Short status for buttons: "every Monday" or "off".
export function scheduleStatus(s: { schedule_discovery_enabled: boolean; discovery_frequency: string; discovery_weekdays: number[]; discovery_month_day: number } | null | undefined): string {
  if (!s?.schedule_discovery_enabled) return "off";
  return describeSchedule({ frequency: s.discovery_frequency as DiscoverySchedule["frequency"], weekdays: s.discovery_weekdays, monthDay: s.discovery_month_day });
}

// Daily ingestion order: sources that read page by page and continue next run
// go last, so the fast sources always run and the slow one gets the time left.
const RESUMABLE = new Set(["ero_approval"]);
export const dailyOrder = <T extends { source: string }>(sources: T[]): T[] => [
  ...sources.filter((s) => !RESUMABLE.has(s.source)),
  ...sources.filter((s) => RESUMABLE.has(s.source)),
];
