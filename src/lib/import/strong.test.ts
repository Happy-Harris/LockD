import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { toGrams } from "@/domain/units";
import {
  applyImportBatch,
  buildImportBatch,
  findExerciseCandidates,
  storedFingerprints,
  type ImportBatch,
} from "./batch";
import { analyseCsv, autoMap, detectDistanceUnit, detectWeightUnit } from "./engine";
import { parseDuration, parseLocalMoment, parseNumber } from "./parse";
import { analyseStrongCsv, STRONG_PROFILE } from "./strong";

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/strong", name), "utf8");
const standardCsv = fixture("strong-standard.csv");
const messyCsv = fixture("strong-messy.csv");
const euroCsv = fixture("strong-euro.csv");

const library: Exercise[] = [
  {
    id: "seed-bench-press",
    name: "Bench Press",
    primaryMuscleGroup: "chest",
    secondaryMuscleGroups: ["triceps"],
    equipment: "barbell",
    movementPattern: "horizontal push",
    trackingType: "weight_reps",
    isCustom: false,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

let counter = 0;
const options = (extra: Partial<Parameters<typeof buildImportBatch>[1]> = {}) => ({
  source: STRONG_PROFILE,
  fileName: "strong.csv",
  existingExercises: library,
  existingFingerprints: new Set<string>(),
  newId: () => `id-${(counter += 1)}`,
  now: () => new Date("2026-09-29T10:00:00.000Z"),
  ...extra,
});

const originalZone = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalZone;
});

describe("header mapping", () => {
  it("maps the standard Strong header and reads its unit", () => {
    const analysis = analyseStrongCsv(standardCsv);
    expect(analysis.missingRequired).toEqual([]);
    expect(analysis.mapping.exerciseName).toBe(3);
    expect(analysis.mapping.weight).toBe(5);
    expect(analysis.detectedUnit).toBe("kg");
    expect(analyseStrongCsv(messyCsv).detectedUnit).toBe("lb");
  });

  it("ignores case and accents", () => {
    const mapping = autoMap(
      ["DATE", "exercise name", "Set ORDER", "WEIGHT", "Übung"],
      STRONG_PROFILE,
    );
    expect(mapping).toMatchObject({ date: 0, exerciseName: 1, setOrder: 2, weight: 3 });
  });

  it("lets the file's own unit win over the lifter's setting, which is only a fallback", () => {
    const pounds = "Date,Exercise Name,Weight (lb),Reps\n2026-01-01,Bench Press,100,5\n";
    const unlabelled = "Date,Exercise Name,Weight,Reps\n2026-01-01,Bench Press,100,5\n";
    const weight = (text: string, unit: "kg" | "lb") =>
      analyseStrongCsv(text, { unit }).workouts[0]?.exercises[0]?.sets[0]?.weightG;
    expect(weight(pounds, "kg")).toBe(toGrams(100, "lb"));
    expect(weight(unlabelled, "lb")).toBe(toGrams(100, "lb"));
    expect(weight(unlabelled, "kg")).toBe(100_000);
  });

  it("reports missing required columns instead of importing garbage", () => {
    const analysis = analyseStrongCsv("foo,bar\n1,2\n");
    expect(analysis.missingRequired).toEqual(["date", "exerciseName"]);
    expect(analysis.workouts).toEqual([]);
  });

  it("lists columns it did not map, and takes a person's own mapping", () => {
    const text = "Date,Exercise Name,Mystery\n2026-01-01,Bench Press,7\n";
    expect(analyseStrongCsv(text).unmappedColumns).toEqual([{ index: 2, name: "Mystery" }]);
    expect(
      analyseStrongCsv(text, { mapping: { reps: 2 } }).workouts[0]?.exercises[0]?.sets[0]?.reps,
    ).toBe(7);
  });

  it("reads the unit and distance unit a header declares", () => {
    expect(detectWeightUnit(["Weight (lbs)"])).toBe("lb");
    expect(detectWeightUnit(["weight_kg"])).toBe("kg");
    expect(detectWeightUnit(["Weight"])).toBeUndefined();
    expect(detectDistanceUnit(["distance_miles"])).toBe("mi");
    expect(detectDistanceUnit(["distance_km"])).toBe("km");
    expect(detectDistanceUnit(["Distance (m)"])).toBe("m");
  });
});

describe("reading a file", () => {
  it("groups rows into sessions and exercises", () => {
    const analysis = analyseStrongCsv(standardCsv);
    expect(analysis.workouts).toHaveLength(2);
    const [push, pull] = analysis.workouts;
    expect(push?.name).toBe("Push A");
    expect(push?.exercises.map((entry) => entry.name)).toEqual(["Bench Press", "Overhead Press"]);
    expect(push?.exercises[0]?.sets).toHaveLength(3);
    expect(push?.durationSeconds).toBe(3_900);
    expect(pull?.exercises).toHaveLength(3);
  });

  it("converts weights to grams using the header's unit", () => {
    expect(analyseStrongCsv(standardCsv).workouts[0]?.exercises[0]?.sets[1]?.weightG).toBe(
      toGrams(80, "kg"),
    );
    expect(analyseStrongCsv(messyCsv).workouts[0]?.exercises[0]?.sets[0]?.weightG).toBe(
      toGrams(135, "lb"),
    );
  });

  it("keeps distance and time for cardio, and a blank load stays missing, not zero", () => {
    const rowing = analyseStrongCsv(standardCsv).workouts[1]?.exercises.find(
      (e) => e.name === "Rowing Machine",
    );
    expect(rowing?.sets[0]).toMatchObject({ distanceM: 2_000, durationSeconds: 480 });
    expect(rowing?.sets[0]?.weightG).toBeUndefined();
  });

  it("keeps RPE only within 1 to 10, and says when it left one out", () => {
    const analysis = analyseStrongCsv(standardCsv);
    const sets = analysis.workouts[0]?.exercises[0]?.sets ?? [];
    expect([sets[0]?.rpe, sets[2]?.rpe]).toEqual([7, 9.5]);
    expect(analysis.workouts[0]?.exercises[1]?.sets[0]?.rpe).toBeUndefined();
    const odd = analyseStrongCsv("Date,Exercise Name,Reps,RPE\n2026-01-01,Squat,5,12\n");
    expect(odd.workouts[0]?.exercises[0]?.sets[0]?.rpe).toBeUndefined();
    expect(odd.issues[0]).toMatchObject({ severity: "warning", row: 2 });
  });

  it("reports each row it cannot read, with the row number and the reason", () => {
    const analysis = analyseStrongCsv(messyCsv);
    const at = (row: number) => analysis.issues.find((issue) => issue.row === row);
    expect(at(4)).toMatchObject({
      severity: "warning",
      message: expect.stringContaining("Rest Timer"),
    });
    expect(at(5)).toMatchObject({
      severity: "error",
      message: expect.stringContaining("not a date"),
    });
    expect(at(6)).toMatchObject({ severity: "error", message: "Missing exercise name." });
    expect(analysis.skippedRows).toBe(3);
  });

  it("keeps quoted commas, formula-looking text and multi-line notes intact", () => {
    const analysis = analyseStrongCsv(messyCsv);
    expect(analysis.workouts[0]?.name).toBe("Morning, quick");
    expect(analysis.workouts[0]?.exercises[0]?.sets[0]?.notes).toBe("=SUM(A1:A2)");
    expect(analysis.workouts[1]?.exercises[0]?.sets[0]?.notes).toBe("multi\nline note");
  });

  it("reads a European file: semicolons, decimal commas, day-first dates, localised headers", () => {
    const analysis = analyseStrongCsv(euroCsv);
    expect(analysis.missingRequired).toEqual([]);
    expect(analysis.workouts).toHaveLength(1);
    const sets = analysis.workouts[0]!.exercises[0]!.sets;
    expect(sets.map((set) => set.weightG)).toEqual([100_500, 110_000]);
    expect(sets.map((set) => set.reps)).toEqual([5, 3]);
    expect(analysis.workouts[0]).toMatchObject({
      stamp: "2026-02-03 18:00:00",
      localDate: "2026-02-03",
    });
  });

  it("reads set kinds: W, F and D in the set column, and a type column", () => {
    const text = [
      "Date,Exercise Name,Set Order,Set Type,Weight (kg),Reps",
      "2026-01-01 10:00:00,Squat,W,,60,5",
      "2026-01-01 10:00:00,Squat,1,,100,5",
      "2026-01-01 10:00:00,Squat,2,Failure,100,3",
      "2026-01-01 10:00:00,Squat,D,,80,8",
      "2026-01-01 10:00:00,Squat,3,Dropset,60,10",
      "2026-01-01 10:00:00,Squat,4,Cluster,60,10",
    ].join("\n");
    const analysis = analyseStrongCsv(text);
    expect(analysis.workouts[0]!.exercises[0]!.sets.map((set) => set.type)).toEqual([
      "warmup",
      "working",
      "failure",
      "drop",
      "drop",
      "working",
    ]);
    // A kind it does not know is reported, not quietly treated as a normal set.
    expect(analysis.issues).toEqual([
      {
        row: 7,
        severity: "warning",
        message: 'Unknown set type "Cluster", imported as a working set.',
      },
    ]);
  });

  it("keeps two sessions with the same title apart by their start times", () => {
    const text = [
      "Date,Workout Name,Exercise Name,Set Order,Reps",
      "2026-01-01 08:00:00,Legs,Squat,1,5",
      "2026-01-01 19:00:00,Legs,Squat,1,6",
    ].join("\n");
    expect(analyseStrongCsv(text).workouts.map((w) => w.stamp)).toEqual([
      "2026-01-01 08:00:00",
      "2026-01-01 19:00:00",
    ]);
  });

  it("warns about a negative weight instead of hiding it", () => {
    const analysis = analyseStrongCsv(
      "Date,Exercise Name,Weight (kg),Reps\n2026-01-01,Assisted Pull Up,-20,8\n",
    );
    expect(analysis.workouts[0]!.exercises[0]!.sets[0]!.weightG).toBe(0);
    expect(analysis.issues[0]).toMatchObject({
      severity: "warning",
      message: expect.stringContaining("Negative weight"),
    });
  });
});

describe("cell parsers", () => {
  it.each([
    ["100.5", 100.5],
    ["100,5", 100.5],
    ["1 234.5", 1234.5],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["0,125", 0.125],
    ["1,234,567", 1234567],
    ["-20", -20],
    ["", undefined],
    ["abc", undefined],
    ["12abc", undefined],
    ["1.2.3", undefined],
  ])("reads the number %j as %j", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it.each([
    ["1h 5m", 3_900],
    ["45m", 2_700],
    ["1:05:00", 3_900],
    ["1:05", 3_900],
    ["90s", 90],
    ["90", 5_400],
    ["", undefined],
    ["soon", undefined],
  ])("reads the duration %j as %j seconds", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each([
    ["2026-01-05 18:30:00", "2026-01-05 18:30:00"],
    ["2026-01-05T18:30", "2026-01-05 18:30:00"],
    ["2026-01-05", "2026-01-05 12:00:00"],
    ["05/01/2026 09:15", "2026-01-05 09:15:00"],
    ["05.01.2026", "2026-01-05 12:00:00"],
    ["22 Mar 2025, 20:11", "2025-03-22 20:11:00"],
    ["3 April 2025, 9:05", "2025-04-03 09:05:00"],
  ])("reads the moment %j as %j", (input, stamp) => {
    expect(parseLocalMoment(input)?.stamp).toBe(stamp);
  });

  it("refuses dates that are not dates, including ones that only roll over", () => {
    for (const bad of [
      "",
      "not a date",
      "2026-02-31",
      "31/02/2026",
      "2026-13-01",
      "32 Mar 2025",
      "5 Foo 2025",
    ]) {
      expect(parseLocalMoment(bad), bad).toBeNull();
    }
  });
});

describe("what a session is stamped with", () => {
  it("records the raw time-zone offset, positive west of UTC, and keeps the calendar day", () => {
    process.env.TZ = "America/Chicago"; // UTC-6 in January: raw offset 360
    const chicago = buildImportBatch(analyseStrongCsv(euroCsv), options());
    expect(chicago.workouts[0]!.workout.tzOffsetMinutes).toBe(360);
    expect(chicago.workouts[0]!.workout.localDate).toBe("2026-02-03");

    process.env.TZ = "Europe/Berlin"; // UTC+1: raw offset -60
    const berlin = buildImportBatch(analyseStrongCsv(euroCsv), options());
    expect(berlin.workouts[0]!.workout.tzOffsetMinutes).toBe(-60);
    expect(berlin.workouts[0]!.workout.localDate).toBe("2026-02-03");
  });

  it("gives a session the same fingerprint on a device in any time zone", () => {
    process.env.TZ = "America/Los_Angeles";
    const a = analyseStrongCsv(standardCsv).workouts.map((w) => w.fingerprint);
    process.env.TZ = "Asia/Tokyo";
    const b = analyseStrongCsv(standardCsv).workouts.map((w) => w.fingerprint);
    process.env.TZ = "UTC";
    const c = analyseStrongCsv(standardCsv).workouts.map((w) => w.fingerprint);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("gives different sessions different fingerprints, and changes when a value changes", () => {
    const analysis = analyseStrongCsv(standardCsv);
    expect(analysis.workouts[0]!.fingerprint).not.toBe(analysis.workouts[1]!.fingerprint);
    const edited = analyseStrongCsv(standardCsv.replace(",80,", ",82.5,"));
    expect(edited.workouts[0]!.fingerprint).not.toBe(analysis.workouts[0]!.fingerprint);
  });
});

describe("findExerciseCandidates", () => {
  const closeGrip: Exercise = {
    ...library[0]!,
    id: "seed-close-grip-bench-press",
    name: "Close-Grip Bench Press",
  };

  it("suggests a reordering of an existing name, once", () => {
    const found = findExerciseCandidates(
      ["Bench Press - Close Grip (Barbell)", "Bench Press - Close Grip (Barbell)"],
      [closeGrip],
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.exercise.id).toBe("seed-close-grip-bench-press");
  });

  it("does not suggest a different exercise that shares a word, or a name with no close match, or an exact match", () => {
    expect(findExerciseCandidates(["Incline Bench Press"], library)).toEqual([]);
    expect(findExerciseCandidates(["Behind The Legs Deadlift"], library)).toEqual([]);
    expect(findExerciseCandidates(["Bench Press"], library)).toEqual([]);
  });
});

describe("buildImportBatch", () => {
  const analysis = analyseStrongCsv(standardCsv);

  it("matches an exact name (equipment in brackets ignored) and creates the rest with no muscle chosen", () => {
    const batch = buildImportBatch(analysis, options());
    expect(batch.workouts).toHaveLength(2);
    expect(batch.workouts[0]?.exercises[0]?.exercise.exerciseId).toBe("seed-bench-press");
    expect(batch.newExercises.map((e) => e.name)).toEqual([
      "Overhead Press",
      "Barbell Row",
      "Pull-Up",
      "Rowing Machine",
    ]);
    expect(batch.newExercises.every((e) => e.isCustom && e.primaryMuscleGroup === "unmapped")).toBe(
      true,
    );
    expect(batch.newExercises[0]!.notes).toContain("Created by an import from a Strong CSV");

    const bracketed = analyseStrongCsv(
      "Date,Exercise Name,Reps\n2026-01-01,Bench Press (Barbell),5\n",
    );
    expect(buildImportBatch(bracketed, options()).newExercises).toEqual([]);
  });

  it("never merges a near match on its own", () => {
    const near = analyseStrongCsv(
      "Date,Exercise Name,Reps\n2026-01-01,Barbell Bench Press Wide,5\n",
    );
    const batch = buildImportBatch(near, options());
    expect(batch.newExercises.map((e) => e.name)).toEqual(["Barbell Bench Press Wide"]);
  });

  it("infers how a new exercise is tracked from its values, without inventing a load", () => {
    const batch = buildImportBatch(analysis, options());
    const byName = Object.fromEntries(batch.newExercises.map((e) => [e.name, e.trackingType]));
    expect(byName).toEqual({
      "Overhead Press": "weight_reps",
      "Barbell Row": "weight_reps",
      "Pull-Up": "reps_only",
      "Rowing Machine": "distance_duration",
    });
  });

  it("completes every set and describes the job", () => {
    const batch = buildImportBatch(analysis, options());
    const sets = batch.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));
    expect(sets.every((s) => s.isCompleted)).toBe(true);
    expect(batch.job).toMatchObject({
      source: "strong-csv",
      fileName: "strong.csv",
      status: "completed",
      setsImported: sets.length,
    });
    expect(batch.workouts.every((w) => w.workout.importJobId === batch.job.id)).toBe(true);
    expect(batch.workouts.every((w) => Boolean(w.workout.importFingerprint))).toBe(true);
  });

  it("skips sessions already in the log, unless told to import them anyway", () => {
    const fingerprints = new Set(analysis.workouts.map((w) => w.fingerprint));
    const skipped = buildImportBatch(analysis, options({ existingFingerprints: fingerprints }));
    expect(skipped.workouts).toHaveLength(0);
    expect(skipped.duplicatesSkipped).toBe(2);
    expect(skipped.job.messages.join(" ")).toContain("2 already here");
    expect(
      buildImportBatch(
        analysis,
        options({ existingFingerprints: fingerprints, allowDuplicates: true }),
      ).workouts,
    ).toHaveLength(2);
  });

  it("imports only the sessions selected", () => {
    const batch = buildImportBatch(
      analysis,
      options({ selectedKeys: new Set([analysis.workouts[0]!.key]) }),
    );
    expect(batch.workouts.map((w) => w.workout.name)).toEqual(["Push A"]);
  });

  it("uses a confirmed 'same exercise' choice, and only that", () => {
    const text =
      "Date,Exercise Name,Set Order,Weight (kg),Reps\n2026-01-01,Overhead Press,1,40,8\n";
    const confirmed = buildImportBatch(
      analyseStrongCsv(text),
      options({ nameOverrides: new Map([["overhead press", "seed-bench-press"]]) }),
    );
    expect(confirmed.newExercises).toHaveLength(0);
    expect(confirmed.workouts[0]?.exercises[0]?.exercise.exerciseId).toBe("seed-bench-press");
    expect(
      buildImportBatch(analyseStrongCsv(text), options({ nameOverrides: new Map() })).newExercises,
    ).toHaveLength(1);
  });

  it("carries a superset and exercise notes when the source has them", () => {
    const profile = {
      ...STRONG_PROFILE,
      aliases: {
        ...STRONG_PROFILE.aliases,
        exerciseNotes: ["exercise_notes"],
        superset: ["superset_id"],
      },
    };
    const text =
      "Date,Exercise Name,Set Order,Reps,Superset ID,Exercise Notes\n2026-01-01,Squat,1,5,3,Pause at the bottom\n";
    const batch = buildImportBatch(analyseStrongCsvWith(text, profile), options());
    expect(batch.workouts[0]?.exercises[0]?.exercise).toMatchObject({
      supersetGroup: "3",
      notes: "Pause at the bottom",
    });
  });
});

const analyseStrongCsvWith = (text: string, profile: typeof STRONG_PROFILE) =>
  analyseCsv(text, profile);

describe("importing twice adds nothing", () => {
  const emptyLog = {
    exercises: [...library],
    workouts: [] as Workout[],
    workoutExercises: [] as WorkoutExercise[],
    workoutSets: [] as WorkoutSet[],
  };

  it("recognises a file it already imported, on any device", () => {
    const analysis = analyseStrongCsv(standardCsv);
    const first = buildImportBatch(analysis, options());
    const log = applyImportBatch(emptyLog, first);
    expect(log.workouts).toHaveLength(2);

    process.env.TZ = "Asia/Tokyo"; // a different device reads the same file
    const again = buildImportBatch(
      analyseStrongCsv(standardCsv),
      options({ existingFingerprints: storedFingerprints(log) }),
    );
    expect(again.workouts).toHaveLength(0);
    expect(again.duplicatesSkipped).toBe(2);
  });

  it("recognises sessions imported before fingerprints existed, from what is stored", () => {
    const analysis = analyseStrongCsv(standardCsv);
    const batch = buildImportBatch(analysis, options());
    // The same sessions as an older importer left them: no fingerprint, no job id.
    const stripped: ImportBatch = {
      ...batch,
      workouts: batch.workouts.map((detail) => ({
        ...detail,
        workout: { ...detail.workout, importFingerprint: undefined, importJobId: undefined },
      })),
    };
    const log = applyImportBatch(emptyLog, stripped);
    const again = buildImportBatch(
      analysis,
      options({ existingFingerprints: storedFingerprints(log) }),
    );
    expect(again.workouts).toHaveLength(0);
    expect(again.duplicatesSkipped).toBe(2);
  });

  it("does not mistake a different session for one already here", () => {
    const log = applyImportBatch(
      emptyLog,
      buildImportBatch(analyseStrongCsv(standardCsv), options()),
    );
    const other = analyseStrongCsv(standardCsv.replace(",80,", ",82.5,"));
    const batch = buildImportBatch(
      other,
      options({ existingFingerprints: storedFingerprints(log) }),
    );
    expect(batch.workouts).toHaveLength(1);
    expect(batch.duplicatesSkipped).toBe(1);
  });

  it("applying a batch adds rows and leaves what was there alone", () => {
    const log = applyImportBatch(
      emptyLog,
      buildImportBatch(analyseStrongCsv(standardCsv), options()),
    );
    expect(log.exercises).toHaveLength(library.length + 4);
    expect(log.workoutExercises.length).toBeGreaterThan(0);
    expect(
      log.workoutSets.every((set) =>
        log.workoutExercises.some((block) => block.id === set.workoutExerciseId),
      ),
    ).toBe(true);
    expect(log.exercises.slice(0, library.length)).toEqual(library);
  });
});
