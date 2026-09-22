import type { ISODate, WeekStartDay } from "./types";

export function localDateOf(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function nowParts(date = new Date()) {
  return {
    iso: date.toISOString(),
    localDate: localDateOf(date),
    tzOffsetMinutes: date.getTimezoneOffset(),
  };
}

export function startOfTrainingWeek(reference: Date, weekStart: WeekStartDay): Date {
  const target = weekStart === "saturday" ? 6 : weekStart === "sunday" ? 0 : 1;
  const start = new Date(reference);
  const delta = (start.getDay() - target + 7) % 7;
  start.setDate(start.getDate() - delta);
  start.setHours(0, 0, 0, 0);
  return start;
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
  return date.toLocaleDateString(undefined, opts ?? { weekday: "short", month: "short", day: "numeric" });
}

export function formatWeekday(value: ISODate): string {
  return formatLocalDate(value, { weekday: "long", month: "long", day: "numeric" });
}

export function elapsedSeconds(startedAt: string, endedAt?: string, pausedSeconds = 0): number {
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000) - pausedSeconds);
}
