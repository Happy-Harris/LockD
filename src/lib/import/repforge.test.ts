import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Exercise } from "@/domain/types";
import { applyImportBatch, buildImportBatch, storedFingerprints } from "./batch";
import { readRepforgeBackup, REPFORGE_SOURCE } from "./repforge";

const raw = fs.readFileSync(
  path.resolve(__dirname, "../../test/fixtures/repforge/repforge-backup-v1.json"),
  "utf8",
);
const file = () => JSON.parse(raw) as Record<string, any>;

const read = (input: unknown = raw) => {
  const result = readRepforgeBackup(input);
  if (!result.ok) throw new Error(`refused: ${result.errors.join("; ")}`);
  return result;
};

const empty = {
  exercises: [] as Exercise[],
  workouts: [],
  workoutExercises: [],
  workoutSets: [],
  templates: [],
  templateExercises: [],
  measurements: [],
};

let counter = 0;
const batchFor = (
  result: ReturnType<typeof read>,
  extra: Partial<Parameters<typeof buildImportBatch>[1]> = {},
) =>
  buildImportBatch(result.analysis, {
    source: REPFORGE_SOURCE,
    fileName: "backup.json",
    existingExercises: [],
    existingFingerprints: new Set(),
    now: () => new Date("2026-09-29T10:00:00Z"),
    newId: () => `id-${++counter}`,
    ...extra,
  });

describe("reading the backup", () => {
  it("takes finished sessions only, and says what it left out", () => {
    const { analysis, notes } = read();
    expect(analysis.workouts.map((w) => w.key)).toEqual(["w1", "w2"]);
    const messages = analysis.issues.map((issue) => issue.message);
    expect(messages).toContain("2 sessions were not finished and left out.");
    expect(messages).toContain("2 sets were planned but never completed and left out.");
    expect(messages).toContain("1 exercise had no completed sets and left out.");
    expect(notes).toEqual(["Not imported: settings, bars. Set those up in this app."]);
  });

  it("negates the other app's time-zone sign so this log's convention holds", () => {
    const [first, second] = read().analysis.workouts;
    // Stored there as +60 (UTC+1) and -120 (UTC-2); here that is -60 and 120.
    expect(first?.tzOffsetMinutes).toBe(-60);
    expect(second?.tzOffsetMinutes).toBe(120);
    expect(first?.stamp).toBe("2026-01-05 18:30:00");
    expect(second?.stamp).toBe("2026-01-12 05:00:00");
    const batch = batchFor(read());
    expect(batch.workouts.map((w) => w.workout.tzOffsetMinutes)).toEqual([-60, 120]);
  });

  it("keeps the session's own length, paused time, notes and local date", () => {
    const [first] = read().analysis.workouts;
    expect(first).toMatchObject({
      name: "Push A",
      localDate: "2026-01-05",
      notes: "Good session",
      durationSeconds: 3900,
      pausedSeconds: 60,
    });
  });

  it("carries RPE, RIR, supersets, sides, notes and blank loads exactly", () => {
    const { workouts } = batchFor(read());
    const [push, other] = workouts;
    const bench = push!.exercises[0]!;
    expect(bench.sets.map((s) => [s.setType, s.weightG, s.reps, s.rpe, s.rir])).toEqual([
      ["warmup", 40000, 10, undefined, undefined],
      ["working", 80000, 5, 8, 2],
      ["working", 80000, 5, 9, undefined],
    ]);
    const pullUp = push!.exercises[1]!;
    expect(pullUp.exercise).toMatchObject({ supersetGroup: "A", notes: "Slow negatives" });
    expect(pullUp.sets.map((s) => s.weightG)).toEqual([undefined, undefined]);
    expect(push!.exercises[2]!.exercise.supersetGroup).toBe("A");
    expect(push!.exercises[2]!.sets[0]?.notes).toBe("Slow");
    const split = other!.exercises[1]!;
    expect(split.exercise.unilateralSnapshot).toBe(true);
    expect(split.sets.map((s) => [s.side, s.pairId])).toEqual([
      ["left", "p1"],
      ["right", "p1"],
    ]);
    expect(split.exercise.restSeconds).toBe(90);
    const sled = other!.exercises[2]!;
    expect(sled.sets[0]).toMatchObject({ distanceM: 50, durationSeconds: 45, weightG: 60000 });
  });
});

describe("exercises", () => {
  it("keeps the source's muscle groups and equipment for an exercise it creates", () => {
    const batch = batchFor(read());
    const byName = new Map(batch.newExercises.map((e) => [e.name, e]));
    expect(byName.get("Bench Press")).toMatchObject({
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: ["triceps", "shoulders"],
      equipment: "barbell",
      movementPattern: "horizontal push",
      trackingType: "weight_reps",
      incrementG: 2500,
      isCustom: true,
    });
    expect(byName.get("Bulgarian Split Squat")).toMatchObject({
      unilateral: true,
      movementPattern: "lunge",
    });
    expect(byName.get("Bench Press")?.notes).not.toContain("Choose its muscle group");
  });

  it("never invents a muscle group the source did not give, or that this app does not use", () => {
    const result = read();
    const sled = batchFor(result).newExercises.find((e) => e.name === "Sled Drag");
    expect(sled).toMatchObject({
      primaryMuscleGroup: "unmapped",
      equipment: "other",
      trackingType: "distance_duration",
    });
    expect(sled?.notes).toContain("Choose its muscle group");
    expect(result.analysis.issues.map((i) => i.message)).toContain(
      "Muscle groups this app does not use were not carried over (strange muscle). Those exercises are unmapped.",
    );
  });

  it("uses an exercise already here when the name matches exactly, and creates none for it", () => {
    const existing: Exercise = {
      id: "mine-bench",
      name: "Bench Press",
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: [],
      equipment: "barbell",
      movementPattern: "horizontal push",
      trackingType: "weight_reps",
      isCustom: false,
      isArchived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const batch = batchFor(read(), { existingExercises: [existing] });
    expect(batch.newExercises.map((e) => e.name)).not.toContain("Bench Press");
    const ids = batch.workouts.flatMap((w) => w.exercises.map((e) => e.exercise.exerciseId));
    expect(ids).toContain("mine-bench");
    // the routine's bench press points at it too
    expect(batch.templateExercises[0]?.exerciseId).toBe("mine-bench");
  });
});

describe("routines and measurements", () => {
  it("brings routines over with their targets, and skips a row pointing at nothing", () => {
    const result = read();
    const batch = batchFor(result);
    expect(batch.templates).toHaveLength(1);
    expect(batch.templates[0]).toMatchObject({
      name: "Push Day",
      notes: "From the old app",
      order: 0,
    });
    expect(batch.templateExercises).toHaveLength(2);
    expect(batch.templateExercises[0]).toMatchObject({
      targetSets: 4,
      targetRepMin: 5,
      targetRepMax: 8,
      targetRpe: 8,
      restSeconds: 150,
      includeWarmup: true,
    });
    expect(batch.templateExercises[1]).toMatchObject({ targetRir: 2, supersetGroup: "A" });
    expect(result.analysis.issues.map((i) => i.message)).toContain(
      "1 routine exercise pointed at an exercise missing from the file and left out.",
    );
  });

  it("puts a routine after the ones already here", () => {
    const batch = batchFor(read(), {
      existingTemplates: [
        { id: "t", name: "Legs", order: 4, isArchived: false, createdAt: "", updatedAt: "" },
      ],
    });
    expect(batch.templates[0]?.order).toBe(5);
  });

  it("keeps measurements in the units they were stored in", () => {
    const batch = batchFor(read());
    expect(batch.measurements.map((m) => [m.metric, m.value, m.displayUnit, m.note])).toEqual([
      ["bodyweight", 82000, "kg", undefined],
      ["arm_left", 348, "cm", "Flexed"],
    ]);
  });
});

describe("importing it twice", () => {
  it("adds nothing the second time: sessions, routines and measurements are recognised", () => {
    const first = batchFor(read());
    const log = applyImportBatch(empty, first);
    expect(log.workouts).toHaveLength(2);
    const second = batchFor(read(), {
      existingExercises: log.exercises,
      existingFingerprints: storedFingerprints(log),
      existingTemplates: log.templates,
      existingMeasurements: log.measurements,
    });
    expect(second.workouts).toHaveLength(0);
    expect(second.duplicatesSkipped).toBe(2);
    expect(second.templates).toHaveLength(0);
    expect(second.templatesSkipped).toBe(1);
    expect(second.measurements).toHaveLength(0);
    expect(second.measurementsSkipped).toBe(2);
    expect(second.newExercises).toHaveLength(0);
  });

  it("recognises the sessions again even after the device's own zone has changed", () => {
    // The fingerprint reads the wall clock the file recorded, not this device's zone.
    const log = applyImportBatch(empty, batchFor(read()));
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      const again = batchFor(read(), { existingFingerprints: storedFingerprints(log) });
      expect(again.workouts).toHaveLength(0);
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("refusing a file", () => {
  const errors = (input: unknown) => {
    const result = readRepforgeBackup(input);
    if (result.ok) throw new Error("expected a refusal");
    return result.errors;
  };

  it("is not JSON", () => {
    expect(errors("not json {")).toEqual(["That file is not valid JSON, so it can’t be a backup."]);
  });

  it("is a different kind of file", () => {
    expect(errors('{"format":"something-else"}')).toEqual([
      "That file is not a backup this app can read.",
    ]);
    expect(errors("[]")).toEqual(["That file is not a backup this app can read."]);
    expect(errors("null")).toEqual(["That file is not a backup this app can read."]);
  });

  it("is from a newer format than this reader knows", () => {
    const data = file();
    data.version = 2;
    expect(errors(data)[0]).toContain("newer version");
  });

  it("has a value that is not a date, and says where", () => {
    const data = file();
    data.data.workouts[0].startedAt = "yesterday";
    expect(errors(data)[0]).toBe("data.workouts[0].startedAt: not a date and time");
  });

  it("has a set that is not a number", () => {
    const data = file();
    data.data.workoutSets[1].reps = "five";
    expect(errors(data)[0]).toContain("data.workoutSets[1].reps");
  });

  it("drops unknown keys, including prototype pollution", () => {
    const data = JSON.parse(
      raw.replace(
        '"format": "repforge-backup"',
        '"format": "repforge-backup", "__proto__": {"polluted": true}',
      ),
    );
    const result = read(data);
    expect(result.analysis.workouts).toHaveLength(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
