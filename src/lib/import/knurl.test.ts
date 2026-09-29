import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Exercise } from "@/domain/types";
import { MEASUREMENT_METRICS } from "@/domain/taxonomy";
import { parseBackup } from "@/lib/backup/schema";
import { useGym } from "@/lib/gym/store";
import { applyImportBatch, buildImportBatch, storedFingerprints } from "./batch";
import { KNURL_SOURCE, readKnurlVault } from "./knurl";

const raw = fs.readFileSync(
  path.resolve(__dirname, "../../test/fixtures/knurl/knurl-vault-v1.json"),
  "utf8",
);
const file = () => JSON.parse(raw) as Record<string, any>;

const read = (input: unknown = raw) => {
  const result = readKnurlVault(input);
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
    source: KNURL_SOURCE,
    fileName: "vault.json",
    existingExercises: [],
    existingFingerprints: new Set(),
    now: () => new Date("2026-09-29T10:00:00Z"),
    newId: () => `id-${++counter}`,
    ...extra,
  });

describe("sessions", () => {
  it("takes finished sessions only, and says what it left out", () => {
    const { analysis, notes } = read();
    expect(analysis.workouts.map((w) => w.key)).toEqual(["wk-000001", "wk-000002"]);
    const messages = analysis.issues.map((issue) => issue.message);
    expect(messages).toContain("2 sessions were not finished and left out.");
    expect(messages).toContain("1 set was planned but never completed and left out.");
    expect(notes).toEqual(["Not imported: settings, bars and plates. Set those up in this app."]);
  });

  it("keeps the time-zone offset as it is: it already has this log's sign", () => {
    const [lower, upper] = read().analysis.workouts;
    // -60 there is UTC+1 (raw getTimezoneOffset), and so it is here.
    expect(lower?.tzOffsetMinutes).toBe(-60);
    expect(upper?.tzOffsetMinutes).toBe(300);
    expect(lower?.stamp).toBe("2026-02-03 18:30:00");
    expect(upper?.stamp).toBe("2026-02-05 02:00:00");
    expect(lower?.localDate).toBe("2026-02-03");
    expect(upper?.localDate).toBe("2026-02-05");
    expect(batchFor(read()).workouts.map((w) => w.workout.tzOffsetMinutes)).toEqual([-60, 300]);
  });

  it("uses the session's own length and notes", () => {
    const [lower] = read().analysis.workouts;
    expect(lower).toMatchObject({ name: "Lower", notes: "Heavy", durationSeconds: 4200 });
    expect(batchFor(read()).workouts[0]?.workout.endedAt).toBe("2026-02-03T18:40:00.000Z");
  });

  it("turns decimal kilograms and metres into whole grams and metres", () => {
    const { workouts } = batchFor(read());
    const squat = workouts[0]!.exercises[0]!;
    expect(squat.sets.map((s) => [s.setType, s.weightG, s.reps, s.rpe, s.rir])).toEqual([
      ["warmup", 60000, 8, undefined, undefined],
      ["working", 100500, 5, 8, 2],
      ["failure", 100500, 3, undefined, undefined],
    ]);
    const carry = workouts[1]!.exercises[2]!;
    expect(carry.sets[0]).toMatchObject({ weightG: 32000, durationSeconds: 40, distanceM: 51 });
  });

  it("keeps a missing value missing, and a timed set timed", () => {
    const plank = batchFor(read()).workouts[0]!.exercises[2]!;
    expect(plank.sets[0]).toMatchObject({ durationSeconds: 60 });
    expect(plank.sets[0]?.weightG).toBeUndefined();
    expect(plank.sets[0]?.reps).toBeUndefined();
  });

  it("carries supersets, notes, RPE with a decimal, and rest", () => {
    const upper = batchFor(read()).workouts[1]!;
    expect(upper.exercises[0]!.exercise).toMatchObject({
      supersetGroup: "ss-1",
      notes: "Pause reps",
      restSeconds: 120,
    });
    expect(upper.exercises[1]!.exercise.supersetGroup).toBe("ss-1");
    expect(upper.exercises[1]!.sets[0]?.rpe).toBe(7.5);
    expect(upper.exercises[2]!.exercise.supersetGroup).toBeUndefined();
  });
});

describe("exercises: the two vocabularies", () => {
  const byName = (batch: ReturnType<typeof batchFor>) =>
    new Map(batch.newExercises.map((e) => [e.name, e]));

  it("maps names that are the same or plainly renamed", () => {
    const squat = byName(batchFor(read())).get("Back Squat");
    expect(squat).toMatchObject({
      primaryMuscleGroup: "quads",
      secondaryMuscleGroups: ["glutes", "adductors"],
      equipment: "barbell",
      movementPattern: "squat",
      trackingType: "weight_reps",
    });
    expect(byName(batchFor(read())).get("Plank")).toMatchObject({
      primaryMuscleGroup: "core",
      secondaryMuscleGroups: [],
      trackingType: "duration",
    });
    expect(byName(batchFor(read())).get("Farmer Carry")).toMatchObject({
      trackingType: "distance_duration",
      movementPattern: "carry",
    });
  });

  it("maps a group this app holds inside a wider one to the wider group, and says so", () => {
    const result = read();
    const bench = byName(batchFor(result)).get("Bench Press");
    expect(bench).toMatchObject({
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: ["shoulders", "triceps"],
    });
    expect(byName(batchFor(result)).get("Chest Supported Row")).toMatchObject({
      primaryMuscleGroup: "back",
      secondaryMuscleGroups: ["shoulders", "biceps"],
    });
    const message = result.analysis.issues.find((i) => i.message.startsWith("This app groups"));
    expect(message?.message).toContain("upper back");
    expect(message?.message).toContain("front delts");
    expect(message?.message).toContain("rear delts");
    expect(message?.message).toContain("spinal erectors");
    expect(message?.message).toContain("obliques");
  });

  it("does not guess horizontal or vertical for push and pull", () => {
    const result = read();
    const bench = byName(batchFor(result)).get("Bench Press");
    expect(bench?.movementPattern).toBe("isolation"); // the placeholder every unclassified exercise has
    expect(result.analysis.workouts[1]?.exercises[0]?.hints?.movementPattern).toBeUndefined();
    expect(result.analysis.issues.map((i) => i.message).join(" ")).toContain(
      "does not split push and pull",
    );
  });

  it("sets a specialty bar to barbell and says so", () => {
    const result = read();
    expect(byName(batchFor(result)).get("Safety Bar Squat")?.equipment).toBe("barbell");
    expect(result.analysis.issues.map((i) => i.message)).toContain(
      "Specialty-bar exercises were set to barbell.",
    );
  });

  it("carries no muscle group it does not know", () => {
    const data = file();
    data.exercises[0].primaryMuscleGroup = "elbows";
    data.workoutExercises[0].snapshotPrimary = "elbows";
    const result = read(data);
    expect(byName(batchFor(result)).get("Back Squat")?.primaryMuscleGroup).toBe("unmapped");
    expect(result.analysis.issues.map((i) => i.message).join(" ")).toContain(
      "Muscle groups this app does not know were not carried over (elbows)",
    );
  });
});

describe("routines and measurements", () => {
  it("brings a routine over with its targets", () => {
    const batch = batchFor(read());
    expect(batch.templates).toHaveLength(1);
    expect(batch.templates[0]).toMatchObject({ name: "Lower A", order: 0 });
    expect(
      batch.templateExercises.map((row) => [
        row.targetSets,
        row.targetRepMin,
        row.targetRepMax,
        row.targetRpe,
        row.targetRir,
        row.restSeconds,
        row.includeWarmup,
        row.supersetGroup,
        row.notes,
      ]),
    ).toEqual([
      [4, 5, 8, 8, undefined, 180, true, undefined, "Belt"],
      [3, 1, 1, undefined, 2, 60, false, "ss-9", undefined],
    ]);
  });

  it("converts kilograms and centimetres to grams and millimetres", () => {
    const measured = batchFor(read()).measurements.map((m) => [m.metric, m.value, m.displayUnit]);
    expect(measured).toEqual([
      ["bodyweight", 82350, "kg"],
      ["arms", 348, "cm"],
      ["thighs", 583, "cm"],
      ["waist", 840, "cm"],
    ]);
  });

  it("keeps a girth recorded without a side as one value with no side", () => {
    const metrics = batchFor(read()).measurements.map((m) => m.metric);
    expect(metrics).toContain("arms");
    expect(metrics).not.toContain("arm_left");
    expect(metrics).not.toContain("arm_right");
    for (const metric of ["arms", "thighs", "calves"]) {
      expect(MEASUREMENT_METRICS.map((row) => row.value)).toContain(metric);
    }
  });

  it("a backup of this app holds an unsided measurement and reads it back", () => {
    useGym.getState().resetAll();
    useGym.getState().completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    const before = useGym.getState();
    useGym.setState(applyImportBatch(before, batchFor(read())));
    const backup = useGym.getState().exportBackup();
    const result = parseBackup(JSON.stringify(backup));
    if (!result.ok) throw new Error(result.errors.join("; "));
    expect(result.backup.measurements.map((m) => m.metric)).toEqual(
      expect.arrayContaining(["arms", "thighs"]),
    );
  });

  it("uses inches and pounds for the display unit when the file's owner used pounds", () => {
    const data = file();
    data.prefs.units = "lb";
    const measured = batchFor(read(data)).measurements.map((m) => [m.metric, m.displayUnit]);
    expect(measured).toEqual([
      ["bodyweight", "lb"],
      ["arms", "in"],
      ["thighs", "in"],
      ["waist", "in"],
    ]);
  });
});

describe("importing it twice", () => {
  it("adds nothing the second time", () => {
    const log = applyImportBatch(empty, batchFor(read()));
    const second = batchFor(read(), {
      existingExercises: log.exercises,
      existingFingerprints: storedFingerprints(log),
      existingTemplates: log.templates,
      existingMeasurements: log.measurements,
    });
    expect(second.workouts).toHaveLength(0);
    expect(second.duplicatesSkipped).toBe(2);
    expect(second.templatesSkipped).toBe(1);
    expect(second.measurementsSkipped).toBe(4);
    expect(second.newExercises).toHaveLength(0);
  });
});

describe("refusing a file", () => {
  const errors = (input: unknown) => {
    const result = readKnurlVault(input);
    if (result.ok) throw new Error("expected a refusal");
    return result.errors;
  };

  it("is not JSON, or is another kind of file", () => {
    expect(errors("nope {")).toEqual(["That file is not valid JSON, so it can’t be a backup."]);
    expect(errors('{"brand":"other"}')).toEqual(["That file is not a backup this app can read."]);
    expect(errors("[]")).toEqual(["That file is not a backup this app can read."]);
  });

  it("is from a newer format", () => {
    const data = file();
    data.schemaVersion = 2;
    expect(errors(data)[0]).toContain("newer version");
  });

  it("has a bad value, and says where", () => {
    const data = file();
    data.workouts[0].startedAt = "later";
    expect(errors(data)[0]).toBe("workouts[0].startedAt: not a date and time");
    const other = file();
    other.workoutSets[2].reps = "five";
    expect(errors(other)[0]).toContain("workoutSets[2].reps");
  });
});
