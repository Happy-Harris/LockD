import type { BodyMeasurement, HealthSample, HrvMethod, ISODate } from "./types";

/**
 * Health context (Opp 10). Pure functions over stored rows. There is no score, no verdict and no
 * good-or-bad reading here: only counts, medians and the samples behind them. Nothing is stored.
 */

/**
 * The fewest sleep nights, or HRV readings of one method, before a median is shown. Below it the count
 * is shown and the median is not. A product rule, not research; see the evidence catalog.
 */
export const HEALTH_MIN_SAMPLES = 3;

/** How far back the first read goes. Later reads start from the newest sample on file. */
export const HEALTH_FIRST_READ_DAYS = 365;

export interface HealthReceiptRow {
  date: ISODate;
  /** Whole seconds asleep, whole milliseconds, or grams. */
  value: number;
  source: string;
}

export interface HealthLine {
  /** Every reading in the era, oldest first. The receipt lists these. */
  rows: HealthReceiptRow[];
  count: number;
  /** Null when there are fewer than HEALTH_MIN_SAMPLES. Never zero. */
  median: number | null;
}

export interface BodyweightLine {
  /** First and last bodyweight inside the era, with dates. Null when there is none. */
  first: HealthReceiptRow | null;
  last: HealthReceiptRow | null;
  count: number;
}

export interface EraHealthOverlay {
  bodyweight: BodyweightLine;
  sleep: HealthLine;
  /** SDNN (Apple Health) and RMSSD (Health Connect) are kept apart and never compared. */
  hrv: Record<HrvMethod, HealthLine>;
}

/** Median of whole numbers; an even count gives the mean of the middle two, rounded. Null for none. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function line(rows: HealthReceiptRow[]): HealthLine {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return {
    rows: ordered,
    count: ordered.length,
    median: ordered.length >= HEALTH_MIN_SAMPLES ? medianOf(ordered.map((row) => row.value)) : null,
  };
}

function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** The health readings on file for one era's date range (both ends inclusive). */
export function eraHealthOverlay(
  samples: readonly HealthSample[],
  measurements: readonly BodyMeasurement[],
  startDate: ISODate,
  endDate: ISODate,
): EraHealthOverlay {
  const within = samples.filter((sample) => inRange(sample.localDate, startDate, endDate));
  const asRow = (sample: HealthSample): HealthReceiptRow => ({
    date: sample.localDate,
    value: sample.value,
    source: sample.source,
  });
  const weights = measurements
    .filter((row) => row.metric === "bodyweight" && inRange(row.localDate, startDate, endDate))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const weightRow = (row: BodyMeasurement): HealthReceiptRow => ({
    date: row.localDate,
    value: row.value,
    source: row.source ?? "manual",
  });
  return {
    bodyweight: {
      first: weights.length ? weightRow(weights[0]) : null,
      last: weights.length ? weightRow(weights[weights.length - 1]) : null,
      count: weights.length,
    },
    sleep: line(within.filter((sample) => sample.kind === "sleep").map(asRow)),
    hrv: {
      sdnn: line(within.filter((sample) => sample.kind === "hrv" && sample.method === "sdnn").map(asRow)),
      rmssd: line(within.filter((sample) => sample.kind === "hrv" && sample.method === "rmssd").map(asRow)),
    },
  };
}

/** "7 h 42 min" from whole seconds asleep. */
export function formatAsleep(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest} min` : `${hours} h ${String(rest).padStart(2, "0")} min`;
}
