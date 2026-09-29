import { describe, expect, it } from "vitest";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { bucketVolume, exerciseProgress, type AnalyticsOptions, type LoggedEntry } from "./compute";

const options: AnalyticsOptions = {
  formula: "epley",
  includeWarmups: false,
  secondaryCredit: 0.5,
};

function entry(date: string, id: string, weightG = 100_000, reps = 5): LoggedEntry {
  const workout: Workout = {
    id: `workout-${id}`,
    name: "Session",
    status: "completed",
    startedAt: date,
    endedAt: date,
    localDate: date.slice(0, 10),
    tzOffsetMinutes: 0,
    pausedSeconds: 0,
    createdAt: date,
    updatedAt: date,
  };
  const exercise: WorkoutExercise = {
    id: `workout-exercise-${id}`,
    workoutId: workout.id,
    exerciseId: "bench",
    order: 0,
    exerciseNameSnapshot: "Bench Press",
    primaryMuscleGroupSnapshot: "chest",
    secondaryMuscleGroupsSnapshot: ["triceps"],
    equipmentSnapshot: "barbell",
    trackingTypeSnapshot: "weight_reps",
    restSeconds: 120,
  };
  const set: WorkoutSet = {
    id: `set-${id}`,
    workoutId: workout.id,
    workoutExerciseId: exercise.id,
    order: 0,
    setType: "working",
    weightG,
    reps,
    isCompleted: true,
    completedAt: date,
  };
  return { workout, exercise, sets: [set] };
}

describe("exerciseProgress", () => {
  it("returns real chronological dates even when input is unordered", () => {
    const progress = exerciseProgress(
      [
        entry("2026-03-20T10:00:00.000Z", "later", 110_000),
        entry("2026-01-05T10:00:00.000Z", "earlier", 100_000),
      ],
      "bench",
      options,
    );

    expect(progress.oneRepMax.map((point) => point.date)).toEqual([
      "2026-01-05T10:00:00.000Z",
      "2026-03-20T10:00:00.000Z",
    ]);
  });

  it("ignores entries with invalid workout timestamps", () => {
    const progress = exerciseProgress(
      [entry("not-a-date", "invalid"), entry("2026-03-20T10:00:00.000Z", "valid")],
      "bench",
      options,
    );

    expect(progress.oneRepMax).toHaveLength(1);
    expect(progress.oneRepMax[0]?.date).toBe("2026-03-20T10:00:00.000Z");
  });
});

describe("bucketVolume", () => {
  it("attaches the real start timestamp for every weekly bucket", () => {
    const buckets = bucketVolume([entry("2026-09-17T10:00:00.000Z", "week")], "week", options);

    expect(buckets).toHaveLength(1);
    const start = new Date(buckets[0]!.date);
    expect(start.getDay()).toBe(1);
    expect([start.getFullYear(), start.getMonth() + 1, start.getDate()]).toEqual([2026, 9, 14]);
  });

  it("sorts monthly buckets chronologically and keeps their start timestamps", () => {
    const buckets = bucketVolume(
      [
        entry("2026-12-03T10:00:00.000Z", "december"),
        entry("2026-02-03T10:00:00.000Z", "february"),
      ],
      "month",
      options,
    );

    expect(buckets.map((bucket) => bucket.key)).toEqual(["2026-02", "2026-12"]);
    expect(buckets.map((bucket) => new Date(bucket.date).getDate())).toEqual([1, 1]);
  });
});
