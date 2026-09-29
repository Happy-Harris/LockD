import { describe, expect, it } from "vitest";
import type { Exercise, WorkoutExercise } from "@/domain/types";
import { applyClassification, suggestFor, unmappedExercises } from "./classify";

const exercise = (id: string, name: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name,
  primaryMuscleGroup: "unmapped",
  secondaryMuscleGroups: [],
  equipment: "other",
  movementPattern: "isolation",
  trackingType: "weight_reps",
  isCustom: true,
  isArchived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const block = (
  id: string,
  exerciseId: string,
  over: Partial<WorkoutExercise> = {},
): WorkoutExercise => ({
  id,
  workoutId: "w",
  exerciseId,
  order: 0,
  exerciseNameSnapshot: "x",
  primaryMuscleGroupSnapshot: "unmapped",
  secondaryMuscleGroupsSnapshot: [],
  equipmentSnapshot: "other",
  trackingTypeSnapshot: "weight_reps",
  restSeconds: 90,
  ...over,
});

const NOW = "2026-09-29T12:00:00.000Z";
const chest = {
  primaryMuscleGroup: "chest",
  equipment: "barbell",
  movementPattern: "horizontal push",
} as const;

describe("which exercises need classifying", () => {
  it("lists unmapped ones that are not archived, and only those", () => {
    const list = [
      exercise("a", "Bench"),
      exercise("b", "Squat", { primaryMuscleGroup: "quads" }),
      exercise("c", "Old", { isArchived: true }),
    ];
    expect(unmappedExercises(list).map((e) => e.id)).toEqual(["a"]);
  });

  it("suggests from the name, and says nothing when the name does not say enough", () => {
    const [bench, mystery] = suggestFor([
      exercise("a", "Bench Press (Barbell)"),
      exercise("b", "Zercher Thing"),
    ]);
    expect(bench?.suggestion).toMatchObject({ primaryMuscleGroup: "chest", equipment: "barbell" });
    expect(mystery?.suggestion).toBeNull();
  });
});

describe("applying a classification", () => {
  it("fills the exercise and the past sessions that recorded no muscle group", () => {
    const log = {
      exercises: [exercise("a", "Bench")],
      workoutExercises: [block("b1", "a"), block("b2", "a")],
    };
    const result = applyClassification(log, [{ exerciseId: "a", ...chest }], NOW);
    expect(result.changed).toBe(1);
    expect(result.exercises[0]).toMatchObject({ ...chest, updatedAt: NOW });
    expect(
      result.workoutExercises.map((b) => [b.primaryMuscleGroupSnapshot, b.equipmentSnapshot]),
    ).toEqual([
      ["chest", "barbell"],
      ["chest", "barbell"],
    ]);
  });

  it("never overwrites what a session already recorded", () => {
    const log = {
      exercises: [exercise("a", "Bench")],
      workoutExercises: [
        block("b1", "a", {
          primaryMuscleGroupSnapshot: "shoulders",
          equipmentSnapshot: "dumbbell",
        }),
        block("b2", "a", { equipmentSnapshot: "cable" }),
      ],
    };
    const result = applyClassification(log, [{ exerciseId: "a", ...chest }], NOW);
    expect(result.workoutExercises[0]).toMatchObject({
      primaryMuscleGroupSnapshot: "shoulders",
      equipmentSnapshot: "dumbbell",
    });
    // no muscle recorded, but the equipment it did record is kept
    expect(result.workoutExercises[1]).toMatchObject({
      primaryMuscleGroupSnapshot: "chest",
      equipmentSnapshot: "cable",
    });
  });

  it("never reclassifies an exercise that already has a muscle group", () => {
    const log = {
      exercises: [exercise("a", "Bench", { primaryMuscleGroup: "triceps", equipment: "cable" })],
      workoutExercises: [block("b1", "a", { primaryMuscleGroupSnapshot: "triceps" })],
    };
    const result = applyClassification(log, [{ exerciseId: "a", ...chest }], NOW);
    expect(result.changed).toBe(0);
    expect(result.exercises).toBe(log.exercises);
    expect(result.workoutExercises).toBe(log.workoutExercises);
  });

  it("does not treat 'unmapped' as a classification", () => {
    const log = { exercises: [exercise("a", "Bench")], workoutExercises: [block("b1", "a")] };
    const result = applyClassification(
      log,
      [
        {
          exerciseId: "a",
          primaryMuscleGroup: "unmapped",
          equipment: "barbell",
          movementPattern: "squat",
        },
      ],
      NOW,
    );
    expect(result.changed).toBe(0);
  });

  it("leaves other exercises and their sessions alone", () => {
    const log = {
      exercises: [exercise("a", "Bench"), exercise("z", "Other")],
      workoutExercises: [block("b1", "a"), block("b9", "z")],
    };
    const result = applyClassification(log, [{ exerciseId: "a", ...chest }], NOW);
    expect(result.exercises[1]).toBe(log.exercises[1]);
    expect(result.workoutExercises[1]).toBe(log.workoutExercises[1]);
  });
});
