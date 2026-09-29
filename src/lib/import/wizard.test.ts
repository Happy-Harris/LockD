import { describe, expect, it } from "vitest";
import type { Exercise } from "@/domain/types";
import { storedFingerprints, applyImportBatch, buildImportBatch } from "./batch";
import { analyseGenericCsv, GENERIC_PROFILE } from "./generic";
import { analyseStrongCsv, STRONG_PROFILE } from "./strong";
import {
  defaultSelection,
  exerciseNames,
  nameOverridesFrom,
  resolveStep,
  sessionRows,
} from "./wizard";

const lib = (id: string, name: string): Exercise => ({
  id,
  name,
  primaryMuscleGroup: "chest",
  secondaryMuscleGroups: [],
  equipment: "barbell",
  movementPattern: "horizontal push",
  trackingType: "weight_reps",
  isCustom: false,
  isArchived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const CSV = [
  "Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps",
  "2026-03-01 10:00:00,Push,Bench Press (Barbell),1,80,5",
  "2026-03-01 10:00:00,Push,Close-Grip Bench Press,1,60,8",
  "2026-03-01 10:00:00,Push,Zercher Thing,1,40,8",
  "2026-03-08 10:00:00,Push,Bench Press (Barbell),1,82.5,5",
].join("\n");

describe("the sessions step", () => {
  it("marks sessions already in the log, and starts with the rest selected", () => {
    const analysis = analyseStrongCsv(CSV);
    const batch = buildImportBatch(analysis, {
      source: STRONG_PROFILE,
      fileName: "a.csv",
      existingExercises: [],
      existingFingerprints: new Set(),
      selectedKeys: new Set([analysis.workouts[0]!.key]),
    });
    const log = applyImportBatch(
      { exercises: [], workouts: [], workoutExercises: [], workoutSets: [] },
      batch,
    );
    const rows = sessionRows(analysis, storedFingerprints(log));
    expect(rows.map((row) => row.alreadyHere)).toEqual([true, false]);
    expect([...defaultSelection(rows)]).toEqual([analysis.workouts[1]!.key]);
  });
});

describe("the Resolve step", () => {
  const analysis = analyseStrongCsv(CSV);
  const all = new Set(analysis.workouts.map((w) => w.key));
  const existing = [lib("bench", "Bench Press"), lib("cg", "Bench Press - Close Grip")];

  it("lists each name once, as the file wrote it, for the chosen sessions only", () => {
    expect(exerciseNames(analysis, all)).toEqual([
      "Bench Press (Barbell)",
      "Close-Grip Bench Press",
      "Zercher Thing",
    ]);
    expect(exerciseNames(analysis, new Set([analysis.workouts[1]!.key]))).toEqual([
      "Bench Press (Barbell)",
    ]);
  });

  it("separates exact matches, near matches to confirm, and new names", () => {
    const step = resolveStep(exerciseNames(analysis, all), existing);
    expect(step.matched).toEqual(["Bench Press (Barbell)"]);
    expect(step.candidates.map((c) => [c.name, c.exercise.id])).toEqual([
      ["Close-Grip Bench Press", "cg"],
    ]);
    expect(step.fresh).toEqual(["Zercher Thing"]);
  });

  it("merges a near match only when it was confirmed", () => {
    const step = resolveStep(exerciseNames(analysis, all), existing);
    const options = {
      source: STRONG_PROFILE,
      fileName: "a.csv",
      existingExercises: existing,
      existingFingerprints: new Set<string>(),
    };
    const unconfirmed = buildImportBatch(analysis, options);
    expect(unconfirmed.newExercises.map((e) => e.name)).toEqual([
      "Close-Grip Bench Press",
      "Zercher Thing",
    ]);

    const confirmed = buildImportBatch(analysis, {
      ...options,
      nameOverrides: nameOverridesFrom(new Map([[step.candidates[0]!.name, "cg"]])),
    });
    expect(confirmed.newExercises.map((e) => e.name)).toEqual(["Zercher Thing"]);
    const ids = confirmed.workouts.flatMap((w) => w.exercises.map((e) => e.exercise.exerciseId));
    expect(ids).toContain("cg");
  });
});

describe("the mapping step", () => {
  it("lets a person's own unit win over what the header says", () => {
    const text = "Date,Exercise Name,Weight (lb),Reps\n2026-01-01,Bench Press,100,5\n";
    const weight = (chosenUnit?: "kg" | "lb") =>
      analyseStrongCsv(text, { chosenUnit }).workouts[0]?.exercises[0]?.sets[0]?.weightG;
    expect(weight()).toBe(45_359); // the header says pounds
    expect(weight("kg")).toBe(100_000);
  });

  it("lets a person choose the distance unit over the header's", () => {
    const text = "Date,Exercise Name,Distance (km),Seconds\n2026-01-01,Run,5,1500\n";
    const metres = (chosenDistanceUnit?: "m" | "km" | "mi") =>
      analyseStrongCsv(text, { chosenDistanceUnit }).workouts[0]?.exercises[0]?.sets[0]?.distanceM;
    expect(metres()).toBe(5000);
    expect(metres("mi")).toBe(8047);
  });

  it("reads a file with unfamiliar columns once the person maps them", () => {
    const text = "when,lift,kilos,count\n2026-01-01,Bench Press,100,5\n";
    const before = analyseGenericCsv(text);
    expect(before.missingRequired).toEqual(["date", "exerciseName"]);
    expect(before.workouts).toEqual([]);
    const after = analyseGenericCsv(text, {
      mapping: { date: 0, exerciseName: 1, weight: 2, reps: 3 },
    });
    expect(after.missingRequired).toEqual([]);
    expect(after.workouts[0]?.exercises[0]?.sets[0]).toMatchObject({ weightG: 100_000, reps: 5 });
    expect(GENERIC_PROFILE.id).toBe("generic-csv");
  });
});
