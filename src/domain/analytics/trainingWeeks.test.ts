import { describe, expect, it } from "vitest";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import type { LoggedEntry } from "./compute";
import {
  entriesInWeek,
  getCompletedWeekWindows,
  selectTrainingBaseline,
  startOfTrainingWeekDate,
  windowThroughElapsedDay,
} from "./trainingWeeks";

function entry(
  localDate: string,
  id: string,
  startedAt = `${localDate}T10:00:00.000Z`,
): LoggedEntry {
  const workout: Workout = {
    id: `workout-${id}`,
    name: "Session",
    status: "completed",
    startedAt,
    endedAt: startedAt,
    localDate,
    tzOffsetMinutes: 0,
    pausedSeconds: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  const exercise: WorkoutExercise = {
    id: `exercise-${id}`,
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
    weightG: 100_000,
    reps: 5,
    isCompleted: true,
    completedAt: startedAt,
  };
  return { workout, exercise, sets: [set] };
}

describe("training week windows", () => {
  it.each([
    ["2026-09-17", "monday", "2026-09-14"],
    ["2026-09-17", "sunday", "2026-09-13"],
    ["2026-09-17", "saturday", "2026-09-12"],
  ] as const)("finds the %s local week boundary for %s", (date, weekStart, expected) => {
    expect(startOfTrainingWeekDate(date, weekStart)).toBe(expected);
  });

  it("returns completed calendar weeks immediately before the current training week", () => {
    expect(getCompletedWeekWindows("2026-09-17", "saturday", 2)).toEqual([
      { startDate: "2026-09-05", endDate: "2026-09-11" },
      { startDate: "2026-08-29", endDate: "2026-09-04" },
    ]);
  });

  it("uses the stored localDate rather than reinterpreting startedAt in the current timezone", () => {
    const travelling = entry("2026-09-13", "travel", "2026-09-12T20:30:00.000Z");
    const week = { startDate: "2026-09-13", endDate: "2026-09-19" };
    expect(entriesInWeek([travelling], week)).toHaveLength(1);
  });

  it("selects the four most recent non-empty training weeks and skips empty weeks", () => {
    const entries = [
      entry("2026-09-05", "w1"),
      entry("2026-08-22", "w3"),
      entry("2026-08-08", "w5"),
      entry("2026-08-01", "w6"),
      entry("2026-07-25", "w7-older"),
    ];

    const baseline = selectTrainingBaseline(entries, "2026-09-12", "saturday");

    expect(baseline).toHaveLength(4);
    expect(baseline.map((week) => week.startDate)).toEqual([
      "2026-08-01",
      "2026-08-08",
      "2026-08-22",
      "2026-09-05",
    ]);
    expect(baseline.every((week) => week.sessionCount === 1)).toBe(true);
  });

  it("allows a trustworthy baseline with three training weeks inside the eight-week lookback", () => {
    const entries = [
      entry("2026-09-05", "w1"),
      entry("2026-08-22", "w3"),
      entry("2026-08-08", "w5"),
    ];

    expect(selectTrainingBaseline(entries, "2026-09-12", "saturday")).toHaveLength(3);
  });

  it("builds the identical elapsed-day slice for a prior week", () => {
    const prior = { startDate: "2026-09-05", endDate: "2026-09-11" };
    expect(windowThroughElapsedDay(prior, 2)).toEqual({
      startDate: "2026-09-05",
      endDate: "2026-09-07",
    });
  });

  it("keeps a 23:50 local session on its stored localDate across week starts", () => {
    const late = entry("2026-09-13", "late", "2026-09-13T23:50:00.000+04:00");
    expect(entriesInWeek([late], { startDate: "2026-09-13", endDate: "2026-09-19" })).toHaveLength(
      1,
    );
    expect(entriesInWeek([late], { startDate: "2026-09-07", endDate: "2026-09-12" })).toHaveLength(
      0,
    );
    expect(startOfTrainingWeekDate(late.workout.localDate, "sunday")).toBe("2026-09-13");
    expect(startOfTrainingWeekDate(late.workout.localDate, "monday")).toBe("2026-09-07");
    expect(startOfTrainingWeekDate(late.workout.localDate, "saturday")).toBe("2026-09-12");
  });
});
