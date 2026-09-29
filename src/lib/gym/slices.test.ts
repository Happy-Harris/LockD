import { describe, expect, it } from "vitest";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { sliceSessions, stabiliseSlices } from "./analytics";

const w = (id: string, status: Workout["status"], localDate: string): Workout => ({
  id,
  name: id,
  status,
  startedAt: `${localDate}T10:00:00.000Z`,
  localDate,
  tzOffsetMinutes: 0,
  pausedSeconds: 0,
  createdAt: "",
  updatedAt: "",
});
const ex = (id: string, workoutId: string): WorkoutExercise => ({
  id,
  workoutId,
  exerciseId: `e-${id}`,
  order: 0,
  exerciseNameSnapshot: id,
  primaryMuscleGroupSnapshot: "chest",
  secondaryMuscleGroupsSnapshot: [],
  equipmentSnapshot: "barbell",
  trackingTypeSnapshot: "weight_reps",
  restSeconds: 90,
});
const set = (
  id: string,
  workoutId: string,
  workoutExerciseId: string,
  order: number,
): WorkoutSet => ({
  id,
  workoutId,
  workoutExerciseId,
  order,
  setType: "working",
  isCompleted: true,
});

const workouts = [
  w("b", "completed", "2026-02-01"),
  w("a", "completed", "2026-01-01"),
  w("live", "active", "2026-03-01"),
];
const exercises = [ex("x1", "a"), ex("x2", "b"), ex("x3", "live")];
const sets = [
  set("s1", "a", "x1", 0),
  set("s2", "b", "x2", 0),
  set("s3", "a", "x1", 1),
  set("s4", "live", "x3", 0),
];

describe("sliceSessions", () => {
  it("returns finished sessions oldest first, each with its own rows in log order", () => {
    const slices = sliceSessions(workouts, exercises, sets);
    expect(slices.map((slice) => slice.workout.id)).toEqual(["a", "b"]);
    expect(slices[0]!.sets.map((row) => row.id)).toEqual(["s1", "s3"]);
    expect(slices[1]!.exercises.map((row) => row.id)).toEqual(["x2"]);
  });
});

describe("stabiliseSlices", () => {
  it("keeps the same array and slices when only the active workout's sets change", () => {
    const before = sliceSessions(workouts, exercises, sets);
    const edited = sets.map((row) => (row.id === "s4" ? { ...row, reps: 5 } : row));
    const after = stabiliseSlices(before, sliceSessions(workouts, exercises, edited));
    expect(after).toBe(before);
  });

  it("replaces only the session whose set changed", () => {
    const before = sliceSessions(workouts, exercises, sets);
    const edited = sets.map((row) => (row.id === "s2" ? { ...row, reps: 5 } : row));
    const after = stabiliseSlices(before, sliceSessions(workouts, exercises, edited));
    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1]!.sets[0]!.reps).toBe(5);
  });

  it("returns the new slices when there is nothing to compare with", () => {
    const next = sliceSessions(workouts, exercises, sets);
    expect(stabiliseSlices(undefined, next)).toBe(next);
  });
});
