import { describe, expect, it } from "vitest";
import type { SetType, WorkoutSet } from "./types";
import { attributeMuscleVolume, completedSetCount, countsForVolume, hardSetCount } from "./volume";

let n = 0;
const set = (setType: SetType, isCompleted = true): WorkoutSet => ({
  id: `s${(n += 1)}`,
  workoutExerciseId: "we",
  workoutId: "w",
  order: n,
  setType,
  weightG: 100_000,
  reps: 5,
  isCompleted,
});

describe("the three set measures are different on purpose (see the table in volume.ts)", () => {
  const sets = [
    set("warmup"),
    set("working"),
    set("working"),
    set("drop"),
    set("failure"),
    set("working", false),
  ];

  it("completedSetCount: every completed set after warming up, drop and failure included", () => {
    expect(completedSetCount(sets)).toBe(4);
    expect(completedSetCount([])).toBe(0);
    expect(
      completedSetCount([
        { ...set("working"), weightG: undefined, reps: undefined, durationSeconds: 60 },
      ]),
    ).toBe(1);
  });

  it("hardSetCount: completed working sets only; drop, failure and warm-ups are not hard sets", () => {
    expect(hardSetCount(sets)).toBe(2);
  });

  it("countsForVolume: working, drop and failure train a muscle; a warm-up does not", () => {
    expect(countsForVolume("working")).toBe(true);
    expect(countsForVolume("drop")).toBe(true);
    expect(countsForVolume("failure")).toBe(true);
    expect(countsForVolume("warmup")).toBe(false);
  });

  it("attributeMuscleVolume counts working + drop + failure, so it is 4 where hardSetCount is 2", () => {
    expect(attributeMuscleVolume(sets, "chest", ["triceps"], 0.5)).toEqual({
      chest: 4,
      triceps: 2,
    });
  });

  it("warm-ups count in attribution only when the caller opts in, and then still don't train a muscle", () => {
    expect(attributeMuscleVolume(sets, "chest", [], 0.5, false)).toEqual({ chest: 4 });
  });

  it("uncompleted sets never count anywhere", () => {
    expect(hardSetCount([set("working", false)])).toBe(0);
    expect(attributeMuscleVolume([set("working", false)], "chest", [], 0.5)).toEqual({});
  });
});

describe("secondary credit is clamped, and a bad value no longer poisons every number", () => {
  const sets = [set("working"), set("working")];

  it("clamps to 0..1", () => {
    expect(attributeMuscleVolume(sets, "chest", ["triceps"], 3)).toEqual({ chest: 2, triceps: 2 });
    expect(attributeMuscleVolume(sets, "chest", ["triceps"], -1)).toEqual({ chest: 2, triceps: 0 });
  });

  it("falls back to the default 0.5 for NaN (it used to make every attributed value NaN)", () => {
    expect(attributeMuscleVolume(sets, "chest", ["triceps"], Number.NaN)).toEqual({
      chest: 2,
      triceps: 1,
    });
  });
});
