import type { WeekStartDay } from "@/domain/types";
import type { LoggedEntry } from "./compute";

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const BASELINE_LOOKBACK_WEEKS = 8;
const MAX_BASELINE_TRAINING_WEEKS = 4;

export interface TrainingWeekWindow {
  startDate: string;
  endDate: string;
}

export interface TrainingBaselineWeek extends TrainingWeekWindow {
  entries: LoggedEntry[];
  sessionCount: number;
}

export function localDateToOrdinal(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return Number.NaN;
  }
  return Math.floor(time / DAY_MS);
}

export function ordinalToLocalDate(ordinal: number): string {
  const date = new Date(ordinal * DAY_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftLocalDate(value: string, days: number): string {
  const ordinal = localDateToOrdinal(value);
  if (!Number.isFinite(ordinal)) return value;
  return ordinalToLocalDate(ordinal + days);
}

export function startOfTrainingWeekDate(value: string, weekStart: WeekStartDay): string {
  const ordinal = localDateToOrdinal(value);
  if (!Number.isFinite(ordinal)) return value;
  const weekday = new Date(ordinal * DAY_MS).getUTCDay();
  const target = weekStart === "saturday" ? 6 : weekStart === "sunday" ? 0 : 1;
  const delta = (weekday - target + WEEK_DAYS) % WEEK_DAYS;
  return ordinalToLocalDate(ordinal - delta);
}

export function weekWindow(startDate: string): TrainingWeekWindow {
  return { startDate, endDate: shiftLocalDate(startDate, WEEK_DAYS - 1) };
}

/** Newest completed week first. */
export function getCompletedWeekWindows(
  referenceLocalDate: string,
  weekStart: WeekStartDay,
  count: number,
): TrainingWeekWindow[] {
  const currentStart = startOfTrainingWeekDate(referenceLocalDate, weekStart);
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    weekWindow(shiftLocalDate(currentStart, -(index + 1) * WEEK_DAYS)),
  );
}

export function entriesInWeek(
  entries: readonly LoggedEntry[],
  window: TrainingWeekWindow,
): LoggedEntry[] {
  return entries.filter(
    (entry) =>
      entry.workout.localDate >= window.startDate && entry.workout.localDate <= window.endDate,
  );
}

export function sessionCount(entries: readonly LoggedEntry[]): number {
  return new Set(entries.map((entry) => entry.workout.id)).size;
}

/**
 * Selects the four most recent non-empty training weeks from the eight completed weeks
 * immediately preceding `subjectWeekStart`. Returned oldest-to-newest for evidence display.
 */
export function selectTrainingBaseline(
  entries: readonly LoggedEntry[],
  subjectWeekStart: string,
  weekStart: WeekStartDay,
): TrainingBaselineWeek[] {
  const anchor = shiftLocalDate(subjectWeekStart, WEEK_DAYS - 1);
  const candidates = getCompletedWeekWindows(anchor, weekStart, BASELINE_LOOKBACK_WEEKS);
  const selected: TrainingBaselineWeek[] = [];

  for (const window of candidates) {
    const weekEntries = entriesInWeek(entries, window);
    const sessions = sessionCount(weekEntries);
    if (sessions === 0) continue;
    selected.push({ ...window, entries: weekEntries, sessionCount: sessions });
    if (selected.length === MAX_BASELINE_TRAINING_WEEKS) break;
  }

  return selected.reverse();
}

export function elapsedDayIndex(referenceLocalDate: string, currentWeekStart: string): number {
  const reference = localDateToOrdinal(referenceLocalDate);
  const start = localDateToOrdinal(currentWeekStart);
  if (!Number.isFinite(reference) || !Number.isFinite(start)) return 0;
  return Math.min(WEEK_DAYS - 1, Math.max(0, reference - start));
}

export function windowThroughElapsedDay(
  window: TrainingWeekWindow,
  dayIndex: number,
): TrainingWeekWindow {
  const clamped = Math.min(WEEK_DAYS - 1, Math.max(0, Math.floor(dayIndex)));
  return { startDate: window.startDate, endDate: shiftLocalDate(window.startDate, clamped) };
}
