import { describe, expect, it } from "vitest";
import { buildDemoLog } from "./demo";
import { seedExercises } from "./seed";

describe("the sample log stores whole canonical units (plan I-23, principle 3)", () => {
  const exercises = seedExercises("2026-09-28T12:00:00.000Z");
  const log = buildDemoLog(exercises, new Date(2026, 8, 28, 12));

  it("has body measurements to check", () => {
    expect(log.measurements.length).toBeGreaterThan(100);
    const metrics = new Set(log.measurements.map((row) => row.metric));
    for (const metric of ["bodyweight", "waist", "arm_right", "arm_left"])
      expect(metrics.has(metric as never)).toBe(true);
  });

  it("every measurement is a whole number of grams or millimetres", () => {
    const fractional = log.measurements.filter((row) => !Number.isInteger(row.value));
    expect(fractional.map((row) => `${row.metric} ${row.value}`)).toEqual([]);
  });

  it("every logged load, rep count and set duration is whole too", () => {
    for (const set of log.workoutSets) {
      for (const field of ["weightG", "reps", "durationSeconds", "distanceM"] as const) {
        const value = set[field];
        if (value != null) expect(Number.isInteger(value), `${field} ${value}`).toBe(true);
      }
    }
  });
});
