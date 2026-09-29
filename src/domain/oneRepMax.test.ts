import { describe, expect, it } from "vitest";
import { bestOneRepMax, brzycki, epley, estimateOneRepMax } from "./oneRepMax";
import type { WorkoutSet } from "./types";

const set = (partial: Partial<WorkoutSet>): WorkoutSet => ({
  id: partial.id ?? "set",
  workoutId: "w",
  workoutExerciseId: "we",
  order: 0,
  setType: "working",
  isCompleted: true,
  ...partial,
});

describe("epley", () => {
  it("is exact at one rep", () => {
    expect(epley(100, 1)).toBeCloseTo(103.333, 3);
    expect(estimateOneRepMax(100, 1, "epley")?.value).toBe(100);
  });

  it("scales with reps", () => {
    expect(epley(100, 5)).toBeCloseTo(116.667, 3);
    expect(epley(100, 10)).toBeCloseTo(133.333, 3);
  });
});

describe("brzycki", () => {
  it("matches the published formula", () => {
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 6);
    expect(brzycki(100, 10)).toBeCloseTo(133.333, 3);
  });

  it("is applied at the highest trustworthy rep count", () => {
    const result = estimateOneRepMax(100, 12, "brzycki");
    expect(result?.formulaUsed).toBe("brzycki");
    expect(result?.fellBack).toBe(false);
  });
});

describe("estimateOneRepMax boundaries", () => {
  it.each([
    [0, 5],
    [-50, 5],
    [100, 0],
    [100, -3],
    [Number.NaN, 5],
    [100, Number.NaN],
    [Number.POSITIVE_INFINITY, 5],
  ])("returns null for weight %s and reps %s", (weight, reps) => {
    expect(estimateOneRepMax(weight, reps, "epley")).toBeNull();
  });

  it("truncates fractional reps", () => {
    expect(estimateOneRepMax(100, 5.9, "epley")?.value).toBe(
      estimateOneRepMax(100, 5, "epley")?.value,
    );
  });

  it("caps estimates at 12 reps for every formula", () => {
    expect(estimateOneRepMax(100, 12, "epley")).not.toBeNull();
    expect(estimateOneRepMax(100, 12, "brzycki")).not.toBeNull();
    expect(estimateOneRepMax(100, 13, "epley")).toBeNull();
    expect(estimateOneRepMax(100, 13, "brzycki")).toBeNull();
  });
});

describe("bestOneRepMax", () => {
  const sets = [
    set({ id: "warm", setType: "warmup", weightG: 60_000, reps: 5 }),
    set({ id: "a", weightG: 100_000, reps: 5 }),
    set({ id: "b", weightG: 110_000, reps: 3 }),
    set({ id: "c", weightG: 120_000, reps: 1, isCompleted: false }),
    set({ id: "d", weightG: 0, reps: 12 }),
  ];

  it("excludes warm-ups, incomplete and zero-load sets", () => {
    const best = bestOneRepMax(sets, "epley");
    expect(best?.set.id).toBe("b");
    expect(best?.value).toBe(Math.round(epley(110_000, 3)));
  });

  it("can include warm-ups when asked", () => {
    const best = bestOneRepMax(
      [set({ id: "warm", setType: "warmup", weightG: 200_000, reps: 5 })],
      "epley",
      { includeWarmups: true },
    );
    expect(best?.set.id).toBe("warm");
  });

  it("returns null when nothing qualifies", () => {
    expect(bestOneRepMax([set({ weightG: 0, reps: 0 })], "epley")).toBeNull();
  });
});
