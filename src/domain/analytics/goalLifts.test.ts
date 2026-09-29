import { describe, expect, it } from "vitest";
import type { Workout, WorkoutExercise } from "@/domain/types";
import type { LoggedEntry } from "./compute";
import type { TrainingBaselineWeek } from "./trainingWeeks";
import { resolveGoalLifts } from "./weeklyVerdict";

function lift(exerciseId: string, name: string, sessionId: string): LoggedEntry {
  const startedAt = "2026-08-10T10:00:00.000Z";
  const workout: Workout = {
    id: `workout-${sessionId}`,
    name: "Session",
    status: "completed",
    startedAt,
    endedAt: startedAt,
    localDate: "2026-08-10",
    tzOffsetMinutes: 0,
    pausedSeconds: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  const exercise: WorkoutExercise = {
    id: `exercise-${sessionId}`,
    workoutId: workout.id,
    exerciseId,
    order: 0,
    exerciseNameSnapshot: name,
    primaryMuscleGroupSnapshot: "chest",
    secondaryMuscleGroupsSnapshot: [],
    equipmentSnapshot: "barbell",
    trackingTypeSnapshot: "weight_reps",
    restSeconds: 120,
  };
  return { workout, exercise, sets: [] };
}

function week(entries: LoggedEntry[]): TrainingBaselineWeek {
  return { startDate: "2026-08-10", endDate: "2026-08-16", entries, sessionCount: 1 };
}

const weeks: TrainingBaselineWeek[] = [
  week([
    lift("bench", "Bench Press", "s1"),
    lift("row", "Barbell Row", "s2"),
    lift("curl", "Barbell Curl", "s3"),
    lift("squat", "Back Squat", "s4"),
  ]),
];

describe("resolveGoalLifts", () => {
  it("falls back to the inferred top lifts when nothing is picked", () => {
    const result = resolveGoalLifts(weeks, undefined);
    expect(result.source).toBe("inferred");
    expect(result.lifts).toHaveLength(3);
  });

  it("falls back to inferred for an empty picked list too", () => {
    const result = resolveGoalLifts(weeks, []);
    expect(result.source).toBe("inferred");
  });

  it("uses the picked lifts, in pick order, when any are set", () => {
    const result = resolveGoalLifts(weeks, ["squat", "curl"]);
    expect(result.source).toBe("chosen");
    expect(result.lifts.map((entry) => entry.id)).toEqual(["squat", "curl"]);
  });

  it("drops a picked lift with no data in the baseline window", () => {
    const result = resolveGoalLifts(weeks, ["squat", "deadlift"]);
    expect(result.source).toBe("chosen");
    expect(result.lifts.map((entry) => entry.id)).toEqual(["squat"]);
  });

  it("reports chosen with an empty list when every pick is absent", () => {
    const result = resolveGoalLifts(weeks, ["deadlift"]);
    expect(result.source).toBe("chosen");
    expect(result.lifts).toEqual([]);
  });

  it("truncates a picked list beyond the 3-lift cap", () => {
    const result = resolveGoalLifts(weeks, ["bench", "row", "curl", "squat"]);
    expect(result.lifts.map((entry) => entry.id)).toEqual(["bench", "row", "curl"]);
  });
});
