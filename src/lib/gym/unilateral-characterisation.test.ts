import { describe, expect, it } from "vitest";
import { attributeVolumeByMuscle, completedSetCount, hardSetCount } from "@/domain/volume";
import { toGrams } from "@/domain/units";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { computeRecords, sliceSessions, workoutTonnageG } from "./analytics";

/**
 * Pins how the engines treat left/right rows TODAY, before Step 9f-2 changes any counting.
 * Importers already write `side` (and `pairId`), so a lifter can have these rows in their log.
 * Current rule: a row is a set. A left row and a right row are two sets, two hard sets, and add
 * their tonnage together; the e1RM record is the best single row, never a sum of the two limbs.
 * When the counting rule changes, this file is the reviewable diff.
 */
const kg = (n: number) => toGrams(n, "kg");

const workout: Workout = {
  id: "w1",
  name: "Pull",
  status: "completed",
  startedAt: "2026-03-01T10:00:00.000Z",
  localDate: "2026-03-01",
  tzOffsetMinutes: 0,
  pausedSeconds: 0,
  createdAt: "",
  updatedAt: "",
};
const block = (
  id: string,
  name: string,
  primary: WorkoutExercise["primaryMuscleGroupSnapshot"],
  unilateral: boolean,
): WorkoutExercise => ({
  id,
  workoutId: "w1",
  exerciseId: `e-${id}`,
  order: id === "row" ? 0 : 1,
  exerciseNameSnapshot: name,
  primaryMuscleGroupSnapshot: primary,
  secondaryMuscleGroupsSnapshot: [],
  equipmentSnapshot: "dumbbell",
  trackingTypeSnapshot: "weight_reps",
  restSeconds: 90,
  ...(unilateral ? { unilateralSnapshot: true } : {}),
});
const set = (
  id: string,
  blockId: string,
  order: number,
  weight: number,
  reps: number,
  side?: "left" | "right",
  pairId?: string,
): WorkoutSet => ({
  id,
  workoutId: "w1",
  workoutExerciseId: blockId,
  order,
  setType: "working",
  weightG: kg(weight),
  reps,
  isCompleted: true,
  ...(side ? { side, pairId } : {}),
});

const exercises = [
  block("row", "One-arm row", "lats", true),
  block("bench", "Bench", "chest", false),
];
const sets = [
  set("l1", "row", 0, 30, 10, "left", "p1"),
  set("r1", "row", 1, 28, 10, "right", "p1"),
  set("l2", "row", 2, 30, 10, "left", "p2"),
  set("r2", "row", 3, 28, 10, "right", "p2"),
  set("l3", "row", 4, 30, 10, "left", "p3"),
  set("r3", "row", 5, 28, 10, "right", "p3"),
  set("b1", "bench", 0, 60, 5),
  set("b2", "bench", 1, 60, 5),
];
const [slice] = sliceSessions([workout], exercises, sets);

describe("left/right rows in the engines (current behaviour)", () => {
  const rowSets = sets.filter((row) => row.workoutExerciseId === "row");

  it("counts every side row as its own set", () => {
    expect(hardSetCount(rowSets)).toBe(6);
    expect(completedSetCount(rowSets)).toBe(6);
    expect(hardSetCount(sets)).toBe(8);
  });

  it("adds tonnage across both sides", () => {
    // 3 × (30 kg × 10) + 3 × (28 kg × 10) = 1740 kg·reps; bench 2 × 60 × 5 = 600.
    expect(workoutTonnageG(slice!, false)).toBe(kg(1740 + 600));
  });

  it("credits the muscle with one set per row", () => {
    const groups = slice!.exercises.map((exercise) => ({
      exercise,
      sets: slice!.sets.filter((row) => row.workoutExerciseId === exercise.id),
    }));
    const lats = attributeVolumeByMuscle(groups).find((row) => row.muscle === "lats");
    expect(lats?.attributedSets).toBe(6);
  });

  it("takes the e1RM record from the best single row, never a sum of limbs", () => {
    const record = computeRecords([slice!], "epley", false).find(
      (row) => row.exerciseId === "e-row" && row.kind === "e1rm",
    );
    expect(record?.weightG).toBe(kg(30));
    expect(record?.reps).toBe(10);
  });

  it("does not tell the pair rows apart from bilateral sets anywhere in the totals", () => {
    const bilateral = sets.map(({ side: _side, pairId: _pairId, ...rest }) => rest);
    const [plain] = sliceSessions([workout], exercises, bilateral);
    expect(workoutTonnageG(plain!, false)).toBe(workoutTonnageG(slice!, false));
    expect(hardSetCount(plain!.sets)).toBe(hardSetCount(slice!.sets));
  });
});
