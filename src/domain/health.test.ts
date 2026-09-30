import { describe, expect, it } from "vitest";
import { eraHealthOverlay, formatAsleep, HEALTH_MIN_SAMPLES, medianOf } from "./health";
import type { BodyMeasurement, HealthSample } from "./types";

const sleep = (date: string, seconds: number, n = 0): HealthSample => ({
  id: `s-${date}-${n}`,
  kind: "sleep",
  value: seconds,
  startAt: `${date}T00:00:00.000Z`,
  endAt: `${date}T07:00:00.000Z`,
  localDate: date,
  source: "apple_health",
  sourceId: `night:${date}`,
  createdAt: `${date}T08:00:00.000Z`,
});
const hrv = (date: string, ms: number, method: "sdnn" | "rmssd", source: "apple_health" | "health_connect"): HealthSample => ({
  id: `h-${date}-${method}-${ms}`,
  kind: "hrv",
  method,
  value: ms,
  startAt: `${date}T06:00:00.000Z`,
  endAt: `${date}T06:00:00.000Z`,
  localDate: date,
  source,
  sourceId: `${method}-${date}-${ms}`,
  createdAt: `${date}T08:00:00.000Z`,
});
const weight = (date: string, grams: number, source?: "apple_health"): BodyMeasurement => ({
  id: `w-${date}`,
  metric: "bodyweight",
  value: grams,
  displayUnit: "kg",
  recordedAt: `${date}T09:00:00.000Z`,
  localDate: date,
  source,
  sourceId: source ? `bw-${date}` : undefined,
  createdAt: `${date}T09:00:00.000Z`,
  updatedAt: `${date}T09:00:00.000Z`,
});

describe("medianOf", () => {
  it("is null for nothing, the middle for odd, and the rounded mean of the middle two for even", () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([1, 2, 3, 4])).toBe(3); // 2.5 rounds to 3
    expect(medianOf([10, 20, 30, 40])).toBe(25);
  });
});

describe("eraHealthOverlay", () => {
  const START = "2026-03-01";
  const END = "2026-03-31";

  it("shows a count but no median below the minimum, and never a zero", () => {
    const overlay = eraHealthOverlay([sleep("2026-03-02", 25_000), sleep("2026-03-03", 27_000)], [], START, END);
    expect(HEALTH_MIN_SAMPLES).toBe(3);
    expect(overlay.sleep.count).toBe(2);
    expect(overlay.sleep.median).toBeNull();
  });

  it("gives a median from the third night, using only nights inside the era (both ends inclusive)", () => {
    const nights = [
      sleep("2026-02-28", 1),
      sleep("2026-03-01", 25_200),
      sleep("2026-03-15", 27_000),
      sleep("2026-03-31", 28_800),
      sleep("2026-04-01", 2),
    ];
    const { sleep: line } = eraHealthOverlay(nights, [], START, END);
    expect(line.count).toBe(3);
    expect(line.median).toBe(27_000);
    expect(line.rows.map((row) => row.date)).toEqual(["2026-03-01", "2026-03-15", "2026-03-31"]);
  });

  it("keeps SDNN and RMSSD apart and never combines them", () => {
    const rows = [
      hrv("2026-03-02", 40, "sdnn", "apple_health"),
      hrv("2026-03-03", 44, "sdnn", "apple_health"),
      hrv("2026-03-04", 48, "sdnn", "apple_health"),
      hrv("2026-03-05", 80, "rmssd", "health_connect"),
    ];
    const { hrv: byMethod } = eraHealthOverlay(rows, [], START, END);
    expect(byMethod.sdnn).toMatchObject({ count: 3, median: 44 });
    expect(byMethod.rmssd).toMatchObject({ count: 1, median: null });
  });

  it("reads bodyweight from manual and imported rows alike, first and last in the era with their sources", () => {
    const overlay = eraHealthOverlay(
      [],
      [weight("2026-02-20", 90_000), weight("2026-03-02", 84_000), weight("2026-03-20", 82_500, "apple_health")],
      START,
      END,
    );
    expect(overlay.bodyweight.count).toBe(2);
    expect(overlay.bodyweight.first).toEqual({ date: "2026-03-02", value: 84_000, source: "manual" });
    expect(overlay.bodyweight.last).toEqual({ date: "2026-03-20", value: 82_500, source: "apple_health" });
  });

  it("says nothing was found as an empty line, not as zero", () => {
    const overlay = eraHealthOverlay([], [], START, END);
    expect(overlay.bodyweight).toEqual({ first: null, last: null, count: 0 });
    expect(overlay.sleep).toMatchObject({ count: 0, median: null, rows: [] });
  });

  it("does not read girths as bodyweight", () => {
    const girth: BodyMeasurement = { ...weight("2026-03-05", 300), metric: "arms", displayUnit: "cm" };
    expect(eraHealthOverlay([], [girth], START, END).bodyweight.count).toBe(0);
  });
});

describe("formatAsleep", () => {
  it("words whole seconds as hours and minutes", () => {
    expect(formatAsleep(27_720)).toBe("7 h 42 min");
    expect(formatAsleep(21_600)).toBe("6 h 00 min");
    expect(formatAsleep(2_400)).toBe("40 min");
  });
});
