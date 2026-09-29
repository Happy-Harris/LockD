import { fromGrams, type WeightUnit } from "@/domain/units";

export function formatWeight(grams: number, unit: WeightUnit): string {
  const value = fromGrams(grams, unit);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

export function plural(value: number, singular: string): string {
  return value === 1 ? singular : `${singular}s`;
}

export function formatMetric(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

/** `Mar 2–8`, `Mar 30–Apr 5`: a week as a short range, in UTC so it never shifts with the device. */
export function formatDateRange(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameMonth = startDate.getUTCMonth() === endDate.getUTCMonth();
  const startLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(startDate);
  const endLabel = new Intl.DateTimeFormat(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(endDate);
  return `${startLabel}–${endLabel}`;
}
