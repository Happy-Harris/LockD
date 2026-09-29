import type { ISODate, ISODateTime, WeekStartDay } from "./types";

export function nowIso(): ISODateTime {
  return new Date().toISOString();
}

export function localDateOf(date: Date = new Date()): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Offset of the local timezone from UTC in minutes, **positive east** (+60 = UTC+1).
 *
 * This is NOT the value Lock'd stores in `Workout.tzOffsetMinutes`: that field holds the raw
 * `Date.getTimezoneOffset()` (positive *west*, UTC+1 = -60) and has since the first build, so it
 * is a live identifier and never changes sign. Strong-Pro stored the opposite sign, so a
 * Strong-Pro import must negate its value (see docs/data-format notes in the import PR).
 */
export function utcOffsetMinutes(date: Date = new Date()): number {
  // `0 - x` rather than `-x`: in UTC the latter is -0, which prints as "-0" and fails Object.is.
  return 0 - date.getTimezoneOffset();
}

export function parseIso(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type RangeKey = "this_week" | "4w" | "8w" | "12w" | "6m" | "1y" | "all";

export const RANGE_LABELS: Record<RangeKey, string> = {
  this_week: "This week",
  "4w": "4W",
  "8w": "8W",
  "12w": "12W",
  "6m": "6M",
  "1y": "1Y",
  all: "All",
};

export const RANGE_DESCRIPTIONS: Record<RangeKey, string> = {
  this_week: "Your training week through today",
  "4w": "Last 4 weeks",
  "8w": "Last 8 weeks",
  "12w": "Last 12 weeks",
  "6m": "Last 6 months",
  "1y": "Last year",
  all: "All time",
};

// A week-based range is useful because most training programs run on weekly cycles.
const RANGE_DAYS: Record<Exclude<RangeKey, "all" | "this_week">, number> = {
  "4w": 28,
  "8w": 56,
  "12w": 84,
  "6m": 182,
  "1y": 365,
};

export interface DateRange {
  from: Date | null;
  to: Date;
}

/** Start of the user's configured training week at local midnight. */
export function startOfTrainingWeek(reference: Date, weekStart: WeekStartDay = "monday"): Date {
  const targetDay = weekStart === "saturday" ? 6 : weekStart === "sunday" ? 0 : 1;
  const start = new Date(reference);
  const delta = (start.getDay() - targetDay + 7) % 7;
  start.setDate(start.getDate() - delta);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function resolveRange(
  key: RangeKey,
  reference: Date = new Date(),
  weekStart: WeekStartDay = "monday",
): DateRange {
  if (key === "all") return { from: null, to: reference };
  if (key === "this_week")
    return { from: startOfTrainingWeek(reference, weekStart), to: reference };
  const from = new Date(reference);
  from.setDate(from.getDate() - RANGE_DAYS[key]);
  from.setHours(0, 0, 0, 0);
  return { from, to: reference };
}

/** The equivalent window immediately before `range`, used for period-over-period deltas. */
export function previousRange(
  key: RangeKey,
  reference: Date = new Date(),
  weekStart: WeekStartDay = "monday",
): DateRange | null {
  if (key === "all") return null;
  if (key === "this_week") {
    const currentFrom = startOfTrainingWeek(reference, weekStart);
    const from = new Date(currentFrom);
    from.setDate(from.getDate() - 7);
    return { from, to: new Date(currentFrom.getTime() - 1) };
  }
  const days = RANGE_DAYS[key];
  const currentFrom = resolveRange(key, reference, weekStart).from!;
  const from = new Date(currentFrom);
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to: new Date(currentFrom.getTime() - 1) };
}

export function isWithin(range: DateRange, value: Date): boolean {
  if (range.from && value < range.from) return false;
  return value <= range.to;
}

export function formatDate(value: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" ? parseIso(value) : value;
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, opts ?? { dateStyle: "medium" }).format(date);
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? parseIso(value) : value;
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
}

export function relativeDay(value: string | Date): string {
  const date = typeof value === "string" ? parseIso(value) : value;
  if (!date) return "—";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfValue = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfValue.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return formatDate(date);
}

/** Seconds elapsed in a workout, excluding paused time. */
export function elapsedSeconds(
  startedAt: string,
  endedAt: string | undefined,
  pausedSeconds = 0,
): number {
  const start = parseIso(startedAt);
  if (!start) return 0;
  const end = endedAt ? parseIso(endedAt) : new Date();
  if (!end) return 0;
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 1000) - Math.max(0, pausedSeconds),
  );
}

/**
 * Timestamp, local date and stored timezone offset for a moment. `tzOffsetMinutes` is the raw
 * `getTimezoneOffset()` (positive west of UTC): the value the log has always stored.
 */
export function nowParts(date = new Date()) {
  return {
    iso: date.toISOString(),
    localDate: localDateOf(date),
    tzOffsetMinutes: date.getTimezoneOffset(),
  };
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function localDateToOrdinal(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

export function ordinalToLocalDate(ordinal: number): ISODate {
  const date = new Date(ordinal * 86_400_000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatLocalDate(value: ISODate, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(
    undefined,
    opts ?? { weekday: "short", month: "short", day: "numeric" },
  );
}

export function formatWeekday(value: ISODate): string {
  return formatLocalDate(value, { weekday: "long", month: "long", day: "numeric" });
}
