// Pure scheduling and budget logic (unit-tested). Times are Toronto time.

export const CREDITS_PER_CANDIDATE_MAX = 13; // 3 searches x 2 + 5 scrapes + 1 follow-up x 2
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

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
  weekday: number; // configured
  todayWeekday: number;
  activeRun: boolean;
  monthCredits: number;
  budget: number;
  cap: number;
}): DiscoveryDecision {
  if (!input.enabled) return { run: false, reason: "Scheduled discovery is off." };
  if (input.todayWeekday !== input.weekday) return { run: false, reason: `Not the discovery day (${WEEKDAYS[input.weekday]}).` };
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
