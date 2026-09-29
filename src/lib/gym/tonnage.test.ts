import { describe, expect, it } from "vitest";
import type { SetType, TrackingType, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { workoutTonnageG, type SessionSlice } from "./analytics";

let n = 0;
function block(id: string, trackingType: TrackingType): WorkoutExercise {
  return {
    id,
    workoutId: "w",
    exerciseId: `ex-${id}`,
    order: n++,
    exerciseNameSnapshot: id,
    primaryMuscleGroupSnapshot: "chest",
    secondaryMuscleGroupsSnapshot: [],
    equipmentSnapshot: "other",
    trackingTypeSnapshot: trackingType,
    restSeconds: 90,
  };
}
function row(
  blockId: string,
  weightG: number | undefined,
  reps: number | undefined,
  setType: SetType = "working",
  isCompleted = true,
): WorkoutSet {
  return {
    id: `s${(n += 1)}`,
    workoutExerciseId: blockId,
    workoutId: "w",
    order: n,
    setType,
    weightG,
    reps,
    isCompleted,
  };
}
function slice(exercises: WorkoutExercise[], sets: WorkoutSet[]): SessionSlice {
  return {
    workout: {
      id: "w",
      name: "Session",
      status: "completed",
      startedAt: "2026-09-28T10:00:00.000Z",
      localDate: "2026-09-28",
      tzOffsetMinutes: 0,
      pausedSeconds: 0,
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T10:00:00.000Z",
    },
    exercises,
    sets,
  };
}

describe("workoutTonnageG counts external load only", () => {
  const bench = block("bench", "weight_reps");
  const assisted = block("assisted-pull-up", "assisted_weight");
  const bodyweight = block("push-up", "reps_only");
  const plank = block("plank", "duration");
  const row2 = block("rowing", "distance_duration");

  it("a plain weight_reps session is weight × reps, summed", () => {
    const s = slice(
      [bench],
      [row("bench", 100_000, 5), row("bench", 100_000, 5), row("bench", 90_000, 8)],
    );
    expect(workoutTonnageG(s, true)).toBe(100_000 * 5 * 2 + 90_000 * 8);
  });

  it("FIXED: an assisted-weight set records the assistance, not the load lifted, so it adds nothing", () => {
    // Before this change a 40 kg assistance x 8 counted as 320 kg of tonnage.
    const s = slice(
      [bench, assisted],
      [row("bench", 100_000, 5), row("assisted-pull-up", 40_000, 8)],
    );
    expect(workoutTonnageG(s, true)).toBe(100_000 * 5);
  });

  it("FIXED: bodyweight, duration and distance sets add nothing even if a weight was recorded", () => {
    const s = slice(
      [bench, bodyweight, plank, row2],
      [
        row("bench", 100_000, 5),
        row("push-up", 10_000, 20),
        row("plank", 5_000, 1),
        row("rowing", 1_000, 1),
      ],
    );
    expect(workoutTonnageG(s, true)).toBe(100_000 * 5);
  });

  it("drop and failure sets count; warm-ups don't unless the caller opts in", () => {
    const s = slice(
      [bench],
      [
        row("bench", 60_000, 10, "warmup"),
        row("bench", 100_000, 5),
        row("bench", 80_000, 6, "drop"),
        row("bench", 100_000, 3, "failure"),
      ],
    );
    expect(workoutTonnageG(s, true)).toBe(100_000 * 5 + 80_000 * 6 + 100_000 * 3);
    expect(workoutTonnageG(s, false)).toBe(60_000 * 10 + 100_000 * 5 + 80_000 * 6 + 100_000 * 3);
  });

  it("uncompleted sets, and sets missing a load or reps, add nothing (missing data is not zero-filled into a total)", () => {
    const s = slice(
      [bench],
      [
        row("bench", 100_000, 5, "working", false),
        row("bench", undefined, 5),
        row("bench", 100_000, undefined),
        row("bench", 0, 5),
      ],
    );
    expect(workoutTonnageG(s, true)).toBe(0);
  });

  it("a set whose exercise row is missing has no tracking type to judge it by, so it is not counted", () => {
    const s = slice([bench], [row("bench", 100_000, 5), row("gone", 100_000, 5)]);
    expect(workoutTonnageG(s, true)).toBe(100_000 * 5);
  });
});
