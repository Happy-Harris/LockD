import { describe, expect, it } from "vitest";
import { attributeVolumeByMuscle, completedSetCount, hardSetCount } from "@/domain/volume";
import { toGrams } from "@/domain/units";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { metricsFor } from "@/domain/analytics/weeklyVerdict.metrics";
import { muscleSetInsight } from "@/domain/analytics/muscleSets";
import { computeRecords, sliceSessions, workoutTonnageG } from "./analytics";
import { loggedEntriesOf } from "./entries";

/**
 * How the engines treat left/right rows. Step 9f-2a (`unilateral-characterisation`) pinned the old rule (a row is a set); 9f-2b changed
 * it so a left+right pair counts as ONE set. What did not change, and is still pinned here: tonnage adds
 * both sides, and the e1RM record is the best single row, never a sum of the two limbs.
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

describe("left/right rows in the engines", () => {
  const rowSets = sets.filter((row) => row.workoutExerciseId === "row");

  it("counts a left+right pair as one set", () => {
    expect(hardSetCount(rowSets)).toBe(3);
    expect(completedSetCount(rowSets)).toBe(3);
    expect(hardSetCount(sets)).toBe(5);
  });

  it("counts a pair with only one side done once, and ignores a pairId with no side", () => {
    const oneSided = rowSets.map((row) => (row.id === "r1" ? { ...row, isCompleted: false } : row));
    expect(hardSetCount(oneSided)).toBe(3);
    const noSide = rowSets.map(({ side: _side, ...rest }) => rest);
    expect(hardSetCount(noSide)).toBe(6);
  });

  it("adds tonnage across both sides", () => {
    // 3 × (30 kg × 10) + 3 × (28 kg × 10) = 1740 kg·reps; bench 2 × 60 × 5 = 600.
    expect(workoutTonnageG(slice!, false)).toBe(kg(1740 + 600));
  });

  it("credits the muscle with one set per pair", () => {
    const groups = slice!.exercises.map((exercise) => ({
      exercise,
      sets: slice!.sets.filter((row) => row.workoutExerciseId === exercise.id),
    }));
    const lats = attributeVolumeByMuscle(groups).find((row) => row.muscle === "lats");
    expect(lats?.attributedSets).toBe(3);
  });

  it("takes the e1RM record from the best single row, never a sum of limbs", () => {
    const record = computeRecords([slice!], "epley", false).find(
      (row) => row.exerciseId === "e-row" && row.kind === "e1rm",
    );
    expect(record?.weightG).toBe(kg(30));
    expect(record?.reps).toBe(10);
  });

  it("keeps tonnage the same whether or not the rows are paired, and halves only the set count", () => {
    const bilateral = sets.map(({ side: _side, pairId: _pairId, ...rest }) => rest);
    const [plain] = sliceSessions([workout], exercises, bilateral);
    expect(workoutTonnageG(plain!, false)).toBe(workoutTonnageG(slice!, false));
    expect(hardSetCount(plain!.sets)).toBe(8);
    expect(hardSetCount(slice!.sets)).toBe(5);
  });

  it("counts the pair once in the weekly verdict's hard sets and the muscle-set insight", () => {
    const entries = loggedEntriesOf([slice!]);
    expect(metricsFor(entries).hardSets).toBe(5);
    const lats = muscleSetInsight(entries, {
      referenceLocalDate: "2026-03-01",
      weekStart: "monday",
      secondaryCredit: 0.5,
    }).find((row) => row.muscle === "lats");
    expect(lats?.sets).toBe(3);
  });
});
