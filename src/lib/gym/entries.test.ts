import { describe, expect, it } from "vitest";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { sliceSessions } from "./analytics";
import { loggedEntriesOf } from "./entries";

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
const b = (id: string, workoutId: string, order: number): WorkoutExercise => ({
  id,
  workoutId,
  exerciseId: `e-${id}`,
  order,
  exerciseNameSnapshot: id,
  primaryMuscleGroupSnapshot: "chest",
  secondaryMuscleGroupsSnapshot: [],
  equipmentSnapshot: "barbell",
  trackingTypeSnapshot: "weight_reps",
  restSeconds: 90,
});
const s = (
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

describe("the log as the analytics engines read it", () => {
  it("is one entry per exercise block of a finished session, with only that block's sets", () => {
    const slices = sliceSessions(
      [
        w("w1", "completed", "2026-03-01"),
        w("w2", "active", "2026-03-02"),
        w("w3", "completed", "2026-03-03"),
      ],
      [b("b1", "w1", 0), b("b2", "w1", 1), b("b3", "w2", 0), b("b4", "w3", 0)],
      [
        s("s1", "w1", "b1", 0),
        s("s2", "w1", "b1", 1),
        s("s3", "w1", "b2", 0),
        s("s4", "w2", "b3", 0),
        s("s5", "w3", "b4", 0),
      ],
    );
    const entries = loggedEntriesOf(slices);
    expect(entries.map((e) => [e.workout.id, e.exercise.id, e.sets.map((x) => x.id)])).toEqual([
      ["w1", "b1", ["s1", "s2"]],
      ["w1", "b2", ["s3"]],
      ["w3", "b4", ["s5"]],
    ]);
  });

  it("keeps a block that has no sets, and an empty log is empty", () => {
    const slices = sliceSessions([w("w1", "completed", "2026-03-01")], [b("b1", "w1", 0)], []);
    expect(loggedEntriesOf(slices).map((e) => e.sets)).toEqual([[]]);
    expect(loggedEntriesOf([])).toEqual([]);
  });
});
