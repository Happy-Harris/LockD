import { registerPlugin } from "@capacitor/core";
import { HEALTH_FIRST_READ_DAYS } from "@/domain/health";
import { localDateOf } from "@/domain/time";
import type { BodyMeasurement, HealthSample, HealthSettings, HealthSource, HrvMethod } from "@/domain/types";
import { platform } from "./platform";

/**
 * Health context (Opp 10, `docs/design/health-context.md`): read-only bodyweight, sleep and heart rate
 * variability from Apple Health (iOS) or Health Connect (Android). This file is the TypeScript side: the
 * plugin contract with a no-op web implementation, and the pure functions that turn a reading into rows.
 * The native half of `LockdHealth` (HealthKit, Health Connect) is not written here.
 *
 * Nothing is written back to the health store, nothing is scored, and the web build reads nothing.
 */

export type HealthType = "bodyweight" | "sleep" | "hrv";

/** One sleep stretch counted as asleep. The night a stretch belongs to is the date it ended. */
export interface SleepSegment {
  startAt: string;
  endAt: string;
  asleepSeconds: number;
}

export interface HealthReading {
  bodyweight: { sourceId: string; grams: number; at: string }[];
  sleep: SleepSegment[];
  hrv: { sourceId: string; method: HrvMethod; milliseconds: number; at: string }[];
}

/** What the native `LockdHealth` plugin implements. */
export interface LockdHealthPlugin {
  /** Asks for read permission for exactly these types. Resolves with the ones the lifter allowed. */
  requestAccess(options: { types: HealthType[] }): Promise<{ granted: HealthType[] }>;
  /** Samples that start at or after the given ISO time, for the given types only. */
  read(options: { types: HealthType[]; since: Partial<Record<HealthType, string>> }): Promise<HealthReading>;
}

export const emptyReading = (): HealthReading => ({ bodyweight: [], sleep: [], hrv: [] });

/** The web implementation asks for nothing and reads nothing. */
export const LockdHealth = registerPlugin<LockdHealthPlugin>("LockdHealth", {
  web: () =>
    Promise.resolve({
      requestAccess: async () => ({ granted: [] }),
      read: async () => emptyReading(),
    } satisfies LockdHealthPlugin),
});

/** Where readings on this device come from, or null on the web. */
export function healthSourceForPlatform(): HealthSource | null {
  const name = platform();
  return name === "ios" ? "apple_health" : name === "android" ? "health_connect" : null;
}

/** The types the lifter switched on. */
export function enabledHealthTypes(health: HealthSettings | undefined): HealthType[] {
  const types: HealthType[] = [];
  if (health?.bodyweight) types.push("bodyweight");
  if (health?.sleep) types.push("sleep");
  if (health?.hrv) types.push("hrv");
  return types;
}

const DAY_MS = 86_400_000;

/**
 * Where a read of one type starts: a day before the newest reading of that type from this source (so a
 * night that finished late is picked up again), or 365 days back the first time.
 */
export function healthReadSince(
  type: HealthType,
  source: HealthSource,
  measurements: readonly BodyMeasurement[],
  samples: readonly HealthSample[],
  now: Date,
): string {
  const stamps =
    type === "bodyweight"
      ? measurements.filter((row) => row.source === source).map((row) => row.recordedAt)
      : samples.filter((row) => row.source === source && row.kind === type).map((row) => row.endAt);
  const newest = stamps.reduce<string | null>((best, stamp) => (best === null || stamp > best ? stamp : best), null);
  const from = newest ? new Date(newest).getTime() - DAY_MS : now.getTime() - HEALTH_FIRST_READ_DAYS * DAY_MS;
  return new Date(from).toISOString();
}

/** Sleep segments summed into one sample per night, keyed to the date the night ended. */
export function sleepNights(segments: readonly SleepSegment[]): { localDate: string; startAt: string; endAt: string; seconds: number }[] {
  const nights = new Map<string, { startAt: string; endAt: string; seconds: number }>();
  for (const segment of segments) {
    if (!(segment.asleepSeconds > 0)) continue;
    const date = localDateOf(new Date(segment.endAt));
    const night = nights.get(date);
    if (!night) {
      nights.set(date, { startAt: segment.startAt, endAt: segment.endAt, seconds: Math.round(segment.asleepSeconds) });
    } else {
      night.seconds += Math.round(segment.asleepSeconds);
      if (segment.startAt < night.startAt) night.startAt = segment.startAt;
      if (segment.endAt > night.endAt) night.endAt = segment.endAt;
    }
  }
  return [...nights.entries()]
    .map(([localDate, night]) => ({ localDate, ...night }))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export interface HealthImportPlan {
  /** Bodyweight rows not on file yet. */
  measurements: BodyMeasurement[];
  /** Samples not on file yet. */
  samples: HealthSample[];
  /** A night already on file whose total changed because more sleep was recorded for it. */
  updatedSamples: HealthSample[];
  /** Readings that were already on file and left alone. */
  alreadyOnFile: number;
}

const sleepSourceId = (localDate: string) => `night:${localDate}`;

/**
 * Turns one reading into rows. Bodyweight and HRV are read once by the health store's own sample id; a
 * sleep night is keyed to its date and updated if more sleep arrived for it. Pure: the caller supplies ids
 * and the clock, and nothing is applied here.
 */
export function planHealthImport(
  reading: HealthReading,
  context: {
    source: HealthSource;
    displayUnit: BodyMeasurement["displayUnit"];
    measurements: readonly BodyMeasurement[];
    samples: readonly HealthSample[];
    newId: () => string;
    nowIso: string;
  },
): HealthImportPlan {
  const { source, displayUnit, newId, nowIso } = context;
  const plan: HealthImportPlan = { measurements: [], samples: [], updatedSamples: [], alreadyOnFile: 0 };

  const haveWeight = new Set(
    context.measurements.filter((row) => row.source === source && row.sourceId).map((row) => row.sourceId),
  );
  for (const item of reading.bodyweight) {
    if (!(item.grams > 0) || !item.sourceId) continue;
    if (haveWeight.has(item.sourceId)) {
      plan.alreadyOnFile += 1;
      continue;
    }
    haveWeight.add(item.sourceId);
    const at = new Date(item.at);
    plan.measurements.push({
      id: newId(),
      metric: "bodyweight",
      value: Math.round(item.grams),
      displayUnit,
      recordedAt: at.toISOString(),
      localDate: localDateOf(at),
      source,
      sourceId: item.sourceId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  const bySourceId = new Map(
    context.samples.filter((row) => row.source === source).map((row) => [`${row.kind}|${row.sourceId}`, row]),
  );
  for (const night of sleepNights(reading.sleep)) {
    const key = `sleep|${sleepSourceId(night.localDate)}`;
    const existing = bySourceId.get(key);
    if (!existing) {
      plan.samples.push({
        id: newId(),
        kind: "sleep",
        value: night.seconds,
        startAt: night.startAt,
        endAt: night.endAt,
        localDate: night.localDate,
        source,
        sourceId: sleepSourceId(night.localDate),
        createdAt: nowIso,
      });
    } else if (existing.value !== night.seconds) {
      plan.updatedSamples.push({ ...existing, value: night.seconds, startAt: night.startAt, endAt: night.endAt });
    } else {
      plan.alreadyOnFile += 1;
    }
  }
  for (const item of reading.hrv) {
    if (!(item.milliseconds > 0) || !item.sourceId) continue;
    const key = `hrv|${item.sourceId}`;
    if (bySourceId.has(key)) {
      plan.alreadyOnFile += 1;
      continue;
    }
    const at = new Date(item.at);
    const sample: HealthSample = {
      id: newId(),
      kind: "hrv",
      method: item.method,
      value: Math.round(item.milliseconds),
      startAt: at.toISOString(),
      endAt: at.toISOString(),
      localDate: localDateOf(at),
      source,
      sourceId: item.sourceId,
      createdAt: nowIso,
    };
    bySourceId.set(key, sample);
    plan.samples.push(sample);
  }
  return plan;
}
