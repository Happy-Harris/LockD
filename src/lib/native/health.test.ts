import { describe, expect, it } from "vitest";
import type { BodyMeasurement, HealthSample } from "@/domain/types";
import {
  emptyReading,
  enabledHealthTypes,
  healthReadSince,
  healthSourceForPlatform,
  LockdHealth,
  planHealthImport,
  sleepNights,
  type HealthReading,
} from "./health";

const NOW = new Date("2026-09-30T12:00:00.000Z");
let counter = 0;
const newId = () => `id-${++counter}`;
const context = (overrides: Partial<Parameters<typeof planHealthImport>[1]> = {}) => ({
  source: "apple_health" as const,
  displayUnit: "kg" as const,
  measurements: [] as BodyMeasurement[],
  samples: [] as HealthSample[],
  newId,
  nowIso: NOW.toISOString(),
  ...overrides,
});

describe("on the web", () => {
  it("has no source and the plugin reads nothing", async () => {
    expect(healthSourceForPlatform()).toBeNull();
    expect(await LockdHealth.requestAccess({ types: ["sleep"] })).toEqual({ granted: [] });
    expect(await LockdHealth.read({ types: ["sleep"], since: {} })).toEqual(emptyReading());
  });
});

describe("enabledHealthTypes", () => {
  it("is empty until something is switched on", () => {
    expect(enabledHealthTypes(undefined)).toEqual([]);
    expect(enabledHealthTypes({ overlays: true })).toEqual([]);
    expect(enabledHealthTypes({ sleep: true, hrv: true })).toEqual(["sleep", "hrv"]);
  });
});

describe("sleepNights", () => {
  it("sums the asleep stretches of one night and files it under the date it ended", () => {
    const nights = sleepNights([
      { startAt: "2026-09-29T21:30:00.000Z", endAt: "2026-09-30T02:00:00.000Z", asleepSeconds: 16_200 },
      { startAt: "2026-09-30T02:30:00.000Z", endAt: "2026-09-30T05:30:00.000Z", asleepSeconds: 10_800 },
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({
      localDate: "2026-09-30",
      seconds: 27_000,
      startAt: "2026-09-29T21:30:00.000Z",
      endAt: "2026-09-30T05:30:00.000Z",
    });
  });

  it("ignores stretches with no time asleep", () => {
    expect(sleepNights([{ startAt: "2026-09-30T00:00:00.000Z", endAt: "2026-09-30T01:00:00.000Z", asleepSeconds: 0 }])).toEqual([]);
  });
});

describe("planHealthImport", () => {
  const reading: HealthReading = {
    bodyweight: [{ sourceId: "bw-1", grams: 82_400, at: "2026-09-28T07:00:00.000Z" }],
    sleep: [{ startAt: "2026-09-29T22:00:00.000Z", endAt: "2026-09-30T05:00:00.000Z", asleepSeconds: 25_200 }],
    hrv: [{ sourceId: "hrv-1", method: "sdnn", milliseconds: 48.4, at: "2026-09-30T05:10:00.000Z" }],
  };

  it("turns a reading into bodyweight rows in grams and samples, each with its source", () => {
    const plan = planHealthImport(reading, context());
    expect(plan.measurements).toHaveLength(1);
    expect(plan.measurements[0]).toMatchObject({
      metric: "bodyweight",
      value: 82_400,
      displayUnit: "kg",
      source: "apple_health",
      sourceId: "bw-1",
    });
    expect(plan.samples.map((s) => [s.kind, s.method, s.value, s.sourceId])).toEqual([
      ["sleep", undefined, 25_200, "night:2026-09-30"],
      ["hrv", "sdnn", 48, "hrv-1"],
    ]);
  });

  it("reads each sample once: a second read of the same thing adds nothing", () => {
    const first = planHealthImport(reading, context());
    const again = planHealthImport(
      reading,
      context({ measurements: first.measurements, samples: first.samples }),
    );
    expect(again.measurements).toEqual([]);
    expect(again.samples).toEqual([]);
    expect(again.updatedSamples).toEqual([]);
    expect(again.alreadyOnFile).toBe(3);
  });

  it("updates a night when more sleep was recorded for it, and keeps its id", () => {
    const first = planHealthImport(reading, context());
    const longer: HealthReading = {
      ...emptyReading(),
      sleep: [
        ...reading.sleep,
        { startAt: "2026-09-30T05:20:00.000Z", endAt: "2026-09-30T06:20:00.000Z", asleepSeconds: 3_600 },
      ],
    };
    const again = planHealthImport(longer, context({ samples: first.samples }));
    expect(again.samples).toEqual([]);
    expect(again.updatedSamples).toHaveLength(1);
    expect(again.updatedSamples[0]).toMatchObject({ id: first.samples[0].id, value: 28_800, endAt: "2026-09-30T06:20:00.000Z" });
  });

  it("does not treat a typed bodyweight as an imported one, or another source's sample as this source's", () => {
    const typed: BodyMeasurement = {
      id: "m",
      metric: "bodyweight",
      value: 82_400,
      displayUnit: "kg",
      recordedAt: "2026-09-28T07:00:00.000Z",
      localDate: "2026-09-28",
      createdAt: "2026-09-28T07:00:00.000Z",
      updatedAt: "2026-09-28T07:00:00.000Z",
    };
    expect(planHealthImport(reading, context({ measurements: [typed] })).measurements).toHaveLength(1);
    const other = planHealthImport(reading, context({ source: "health_connect" }));
    expect(other.measurements[0].source).toBe("health_connect");
  });

  it("skips readings with no positive value or no id instead of storing a zero", () => {
    const plan = planHealthImport(
      {
        bodyweight: [{ sourceId: "x", grams: 0, at: "2026-09-28T07:00:00.000Z" }],
        sleep: [],
        hrv: [{ sourceId: "", method: "sdnn", milliseconds: 40, at: "2026-09-28T07:00:00.000Z" }],
      },
      context(),
    );
    expect(plan.measurements).toEqual([]);
    expect(plan.samples).toEqual([]);
  });
});

describe("healthReadSince", () => {
  it("starts 365 days back the first time", () => {
    expect(healthReadSince("sleep", "apple_health", [], [], NOW)).toBe("2025-09-30T12:00:00.000Z");
  });

  it("starts a day before the newest reading of that type from that source", () => {
    const sample: HealthSample = {
      id: "s",
      kind: "sleep",
      value: 1,
      startAt: "2026-09-29T22:00:00.000Z",
      endAt: "2026-09-30T05:00:00.000Z",
      localDate: "2026-09-30",
      source: "apple_health",
      sourceId: "night:2026-09-30",
      createdAt: "2026-09-30T06:00:00.000Z",
    };
    expect(healthReadSince("sleep", "apple_health", [], [sample], NOW)).toBe("2026-09-29T05:00:00.000Z");
    // HRV has none yet, so it still goes back 365 days.
    expect(healthReadSince("hrv", "apple_health", [], [sample], NOW)).toBe("2025-09-30T12:00:00.000Z");
    // Another source's readings do not move this source's start.
    expect(healthReadSince("sleep", "health_connect", [], [sample], NOW)).toBe("2025-09-30T12:00:00.000Z");
  });
});
