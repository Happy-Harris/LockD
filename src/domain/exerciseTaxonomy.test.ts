import { describe, expect, it } from "vitest";
import { suggestExerciseTaxonomy } from "./exerciseTaxonomy";

describe("suggestExerciseTaxonomy", () => {
  it.each([
    ["Bicep Curl (Barbell)", "barbell"],
    ["Incline Curl (Dumbbell)", "dumbbell"],
    ["Preacher Curl (Machine)", "machine"],
    ["Band Hammer Curls", "band"],
  ] as const)("recognises arm curls and their equipment: %s", (name, equipment) => {
    expect(suggestExerciseTaxonomy(name)).toEqual({
      primaryMuscleGroup: "biceps",
      equipment,
      movementPattern: "isolation",
    });
  });

  it.each([
    ["Band Leg Curl", "hamstrings", "band", "isolation"],
    ["Wrist Curl (Barbell)", "forearms", "barbell", "isolation"],
    ["Shrug (Smith Machine)", "traps", "smith machine", "isolation"],
    ["Deadlift (Barbell)", "hamstrings", "barbell", "hinge"],
    ["Cable Hip Thrust", "glutes", "cable", "hinge"],
  ] as const)(
    "classifies posterior-chain and forearm names: %s",
    (name, muscle, equipment, pattern) => {
      expect(suggestExerciseTaxonomy(name)).toEqual({
        primaryMuscleGroup: muscle,
        equipment,
        movementPattern: pattern,
      });
    },
  );

  it.each([
    ["Chest Press (Machine)", "chest", "machine", "horizontal push"],
    ["Diamond Push Up", "chest", "bodyweight", "horizontal push"],
    ["Seated Overhead Press (Dumbbell)", "shoulders", "dumbbell", "vertical push"],
    ["Cable Lateral Raise", "shoulders", "cable", "isolation"],
    ["Triceps Pushdown (Cable - Straight Bar)", "triceps", "cable", "isolation"],
  ] as const)("classifies push and isolation names: %s", (name, muscle, equipment, pattern) => {
    expect(suggestExerciseTaxonomy(name)).toEqual({
      primaryMuscleGroup: muscle,
      equipment,
      movementPattern: pattern,
    });
  });

  it.each([
    ["Neutral Grip Lat Pulldown", "lats", "cable", "vertical pull"],
    ["Bent Over Row (Barbell)", "back", "barbell", "horizontal pull"],
    ["Single Arm Cable Row", "back", "cable", "horizontal pull"],
    ["Reverse Fly (Machine)", "shoulders", "machine", "isolation"],
  ] as const)(
    "classifies pull names without merging unlike exercises: %s",
    (name, muscle, equipment, pattern) => {
      expect(suggestExerciseTaxonomy(name)).toEqual({
        primaryMuscleGroup: muscle,
        equipment,
        movementPattern: pattern,
      });
    },
  );

  it.each([
    ["Power Rack Concentric Squat", "quads", "other", "squat"],
    ["Lunge (Dumbbell)", "quads", "dumbbell", "lunge"],
    ["Calf Press On Leg Press", "calves", "machine", "isolation"],
    ["Decline Russian Twist", "core", "bodyweight", "core"],
  ] as const)("classifies lower-body and core names: %s", (name, muscle, equipment, pattern) => {
    expect(suggestExerciseTaxonomy(name)).toEqual({
      primaryMuscleGroup: muscle,
      equipment,
      movementPattern: pattern,
    });
  });

  it("returns no suggestion for a name it cannot classify confidently", () => {
    expect(suggestExerciseTaxonomy("Jefferson Pull")).toBeNull();
  });

  it.each([
    ["Band Lat Pulldown", "lats", "band", "vertical pull"],
    ["Band Tricep Pushdown", "triceps", "band", "isolation"],
    ["Band Diamond Push-Ups", "chest", "band", "horizontal push"],
    ["Oblique Crunch (On Glute Ham Raise)", "core", "other", "core"],
    ["Side Leg Raises", "abductors", "other", "isolation"],
    ["Farmer’s Walk", "forearms", "other", "carry"],
    ["Farmer’s Walk On Toes", "calves", "other", "carry"],
    ["Reverse Grip Lat Pull Down", "lats", "cable", "vertical pull"],
    ["Seated Face pull", "shoulders", "cable", "horizontal pull"],
    ["Above The Knee Rack Pull", "back", "other", "hinge"],
    ["Cable Crossover", "chest", "cable", "isolation"],
    ["Upright Row (Barbell)", "shoulders", "barbell", "isolation"],
    ["Single Leg Press", "quads", "machine", "squat"],
    ["Chest Dip", "chest", "bodyweight", "horizontal push"],
    ["Rope Lat Push Down", "lats", "cable", "isolation"],
    ["Single Arm Tricep Push Down (Under Hand)", "triceps", "cable", "isolation"],
  ] as const)(
    "handles precedence and spelling traps from a real Strong export: %s",
    (name, muscle, equipment, pattern) => {
      expect(suggestExerciseTaxonomy(name)).toEqual({
        primaryMuscleGroup: muscle,
        equipment,
        movementPattern: pattern,
      });
    },
  );

  it("does not guess whether an unqualified kickback is for triceps or glutes", () => {
    expect(suggestExerciseTaxonomy("Cable Kickback")).toBeNull();
  });
});
