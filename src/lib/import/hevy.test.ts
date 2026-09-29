import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Exercise } from "@/domain/types";
import { applyImportBatch, buildImportBatch, storedFingerprints } from "./batch";
import { analyseHevyCsv, HEVY_PROFILE } from "./hevy";

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/hevy", name), "utf8");
const kgKm = fixture("hevy-synthetic-kg-km.csv");
const lbMiles = fixture("hevy-synthetic-lb-miles.csv");

const HEADER =
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"';
const file = (...rows: string[]) => [HEADER, ...rows].join("\n");
const row = (
  cells: Partial<
    Record<
      | "title"
      | "start"
      | "end"
      | "desc"
      | "exercise"
      | "superset"
      | "notes"
      | "type"
      | "kg"
      | "reps"
      | "km"
      | "sec"
      | "rpe",
      string
    >
  > = {},
  index = 0,
) =>
  [
    `"${cells.title ?? "Session"}"`,
    `"${cells.start ?? "22 Mar 2025, 20:11"}"`,
    `"${cells.end ?? "22 Mar 2025, 20:58"}"`,
    `"${cells.desc ?? ""}"`,
    `"${cells.exercise ?? "Pull Up"}"`,
    cells.superset ?? "",
    `"${cells.notes ?? ""}"`,
    index,
    `"${cells.type ?? "normal"}"`,
    cells.kg ?? "",
    cells.reps ?? "",
    cells.km ?? "",
    cells.sec ?? "",
    cells.rpe ?? "",
  ].join(",");

const sets = (csv: string) =>
  analyseHevyCsv(csv).workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));

describe("the two synthetic Hevy samples", () => {
  const kg = analyseHevyCsv(kgKm);
  const lb = analyseHevyCsv(lbMiles);

  it("map every column and read every row", () => {
    for (const analysis of [kg, lb]) {
      expect(analysis.missingRequired).toEqual([]);
      expect(analysis.unmappedColumns).toEqual([]);
      expect(analysis.totalRows).toBe(71);
      expect(analysis.skippedRows).toBe(0);
      expect(analysis.issues).toEqual([]);
    }
    expect(kg.detectedUnit).toBe("kg");
    expect(lb.detectedUnit).toBe("lb");
  });

  it("keep same-title workouts apart by their timestamps", () => {
    expect(kg.workouts.map((w) => w.name)).toEqual(Array(5).fill("Evening Workout"));
    expect(kg.workouts.map((w) => w.stamp)).toEqual([
      "2025-03-22 20:11:00",
      "2025-04-03 21:54:00",
      "2025-11-05 20:48:00",
      "2025-12-11 21:09:00",
      "2026-02-21 21:48:00",
    ]);
    expect(new Set(kg.workouts.map((w) => w.fingerprint)).size).toBe(5);
  });

  it("read durations from the end time, and keep quoted-comma notes", () => {
    expect(kg.workouts.map((w) => w.durationSeconds)).toEqual([2820, 4080, 720, 5040, 4380]);
    expect(kg.workouts[3]?.notes).toBe("Felt heavy today, kept rests short");
    const pullUp = kg.workouts[1]?.exercises.find((e) => e.name === "Pull Up");
    expect(pullUp?.notes).toBe("Seat at 4, pause on the way down");
  });

  it("convert kilograms and pounds to whole grams, and metres from km or miles", () => {
    const leg = (a: typeof kg) => a.workouts[0]?.exercises[0]?.sets[0];
    expect(leg(kg)?.weightG).toBe(50_000);
    expect(leg(lb)?.weightG).toBe(49_986); // 110.2 lb, converted as written, not rounded to 50 kg
    const run = (a: typeof kg) =>
      a.workouts[2]?.exercises.find((e) => e.name === "Running (Outdoor)")?.sets[0];
    expect(run(kg)).toMatchObject({ distanceM: 2400, durationSeconds: 780 });
    expect(run(kg)?.weightG).toBeUndefined();
    expect(run(kg)?.reps).toBeUndefined();
    expect(run(lb)?.distanceM).toBe(2398); // 1.49 miles
  });

  it("leave a bodyweight set without a load, not at zero", () => {
    const pullUps = kg.workouts[1]?.exercises.find((e) => e.name === "Pull Up");
    expect(pullUps?.sets.map((s) => s.weightG)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(pullUps?.sets.map((s) => s.reps)).toEqual([5, 6, 6, 6]);
  });

  it("map the set types, RPE and supersets it carries", () => {
    const types = new Set(
      kg.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets.map((s) => s.type))),
    );
    expect(types).toEqual(new Set(["warmup", "working", "failure", "drop"]));
    const rows = kg.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));
    expect(rows.filter((s) => s.rpe !== undefined).length).toBeGreaterThan(0);
    expect(kg.workouts[3]?.exercises.map((e) => e.superset)).toEqual([
      undefined,
      "0",
      "0",
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("read the pound file as the same sessions as the kilogram file", () => {
    expect(lb.workouts.map((w) => w.stamp)).toEqual(kg.workouts.map((w) => w.stamp));
    expect(lb.workouts.map((w) => w.setCount)).toEqual(kg.workouts.map((w) => w.setCount));
    const near = (a: number | undefined, b: number | undefined) =>
      a === undefined || b === undefined ? a === b : Math.abs(a - b) <= 100;
    const kgSets = kg.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));
    const lbSets = lb.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));
    kgSets.forEach((set, i) => expect(near(set.weightG, lbSets[i]?.weightG)).toBe(true));
  });
});

describe("set types", () => {
  it("maps the four Hevy types and a blank one", () => {
    const parsed = sets(
      file(
        row({ type: "normal", kg: "50", reps: "5" }, 0),
        row({ type: "warmup", kg: "20", reps: "8" }, 1),
        row({ type: "failure", kg: "50", reps: "3" }, 2),
        row({ type: "dropset", kg: "40", reps: "6" }, 3),
        row({ type: "", kg: "50", reps: "5" }, 4),
      ),
    );
    expect(parsed.map((s) => s.type)).toEqual(["working", "warmup", "failure", "drop", "working"]);
  });

  it("reports a type it does not know instead of quietly calling it a working set", () => {
    const analysis = analyseHevyCsv(file(row({ type: "amrap", kg: "50", reps: "5" })));
    expect(analysis.issues).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining('Unknown set type "amrap"'),
      }),
    ]);
  });

  it("does not match a word that only contains a known one", () => {
    const analysis = analyseHevyCsv(file(row({ type: "not a warmup", kg: "50", reps: "5" })));
    expect(analysis.issues).toHaveLength(1);
    expect(analysis.workouts[0]?.exercises[0]?.sets[0]?.type).toBe("working");
  });
});

describe("blank and zero loads", () => {
  it("never turns an empty or zero external load into a logged weight", () => {
    const parsed = sets(
      file(
        row({ kg: "", reps: "8" }, 0),
        row({ kg: "0", reps: "8" }, 1),
        row({ kg: "0.0", reps: "8" }, 2),
      ),
    );
    expect(parsed.map((s) => s.weightG)).toEqual([undefined, undefined, undefined]);
  });

  it("still reads a real load next to them", () => {
    const parsed = sets(file(row({ kg: "", reps: "8" }, 0), row({ kg: "10", reps: "8" }, 1)));
    expect(parsed.map((s) => s.weightG)).toEqual([undefined, 10_000]);
  });

  it("makes no tonnage or muscle mapping out of a bodyweight exercise", () => {
    const analysis = analyseHevyCsv(file(row({ kg: "0", reps: "8" })));
    const batch = buildImportBatch(analysis, {
      source: HEVY_PROFILE,
      fileName: "h.csv",
      existingExercises: [],
      existingFingerprints: new Set(),
    });
    const log = applyImportBatch(
      { exercises: [], workouts: [], workoutExercises: [], workoutSets: [] },
      batch,
    );
    expect(log.workoutSets.map((s) => s.weightG)).toEqual([undefined]);
    expect(log.exercises[0]).toMatchObject({
      primaryMuscleGroup: "unmapped",
      trackingType: "reps_only",
    });
  });
});

describe("what a file can say about a session", () => {
  it("keeps a quoted comma in a description, a note and a title", () => {
    const analysis = analyseHevyCsv(
      file(
        row({
          title: "Legs, heavy",
          desc: "Felt ok, then not",
          notes: "Seat at 4, pause",
          kg: "50",
          reps: "5",
        }),
      ),
    );
    const workout = analysis.workouts[0];
    expect(workout?.name).toBe("Legs, heavy");
    expect(workout?.notes).toBe("Felt ok, then not");
    expect(workout?.exercises[0]?.notes).toBe("Seat at 4, pause");
  });

  it("keeps two sessions with the same title and different starts apart", () => {
    const analysis = analyseHevyCsv(
      file(
        row({ start: "1 Jun 2025, 07:00", end: "1 Jun 2025, 07:30", kg: "50", reps: "5" }),
        row({ start: "1 Jun 2025, 18:00", end: "1 Jun 2025, 18:40", kg: "50", reps: "5" }),
      ),
    );
    expect(analysis.workouts).toHaveLength(2);
    expect(analysis.workouts.map((w) => w.durationSeconds)).toEqual([1800, 2400]);
  });

  it("carries distance, duration, RPE and superset", () => {
    const [set] = sets(file(row({ superset: "3", km: "5.25", sec: "1500", rpe: "8.5" })));
    expect(set).toMatchObject({ distanceM: 5250, durationSeconds: 1500, rpe: 8.5 });
    const analysis = analyseHevyCsv(file(row({ superset: "3" })));
    expect(analysis.workouts[0]?.exercises[0]?.superset).toBe("3");
  });

  it("refuses a date it cannot read instead of guessing", () => {
    const analysis = analyseHevyCsv(
      file(row({ start: "31 Feb 2025, 20:11", kg: "50", reps: "5" })),
    );
    expect(analysis.workouts).toEqual([]);
    expect(analysis.skippedRows).toBe(1);
  });
});

describe("through the common pipeline", () => {
  const library: Exercise[] = [];
  const run = (csv: string, existing: ReadonlySet<string> = new Set()) =>
    buildImportBatch(analyseHevyCsv(csv), {
      source: HEVY_PROFILE,
      fileName: "hevy.csv",
      existingExercises: library,
      existingFingerprints: existing,
    });

  it("imports the sample, marks the job as a Hevy import, and creates unmapped exercises", () => {
    const batch = run(kgKm);
    expect(batch.job.source).toBe("hevy-csv");
    expect(batch.workouts).toHaveLength(5);
    expect(batch.job.setsImported).toBe(71);
    expect(batch.newExercises.length).toBeGreaterThan(10);
    expect(batch.newExercises.every((e) => e.primaryMuscleGroup === "unmapped")).toBe(true);
    expect(batch.newExercises[0]?.notes).toContain("a Hevy CSV");
  });

  it("carries superset into the stored blocks", () => {
    const batch = run(kgKm);
    const blocks = batch.workouts.flatMap((w) => w.exercises.map((e) => e.exercise));
    expect(blocks.filter((b) => b.supersetGroup === "0")).toHaveLength(2);
  });

  it("importing the same file again adds nothing", () => {
    const first = run(kgKm);
    const log = applyImportBatch(
      { exercises: [], workouts: [], workoutExercises: [], workoutSets: [] },
      first,
    );
    const second = run(kgKm, storedFingerprints(log));
    expect(second.workouts).toHaveLength(0);
    expect(second.duplicatesSkipped).toBe(5);
  });

  it("does not skip the pound file against the kilogram file (different grams are different sessions)", () => {
    const log = applyImportBatch(
      { exercises: [], workouts: [], workoutExercises: [], workoutSets: [] },
      run(kgKm),
    );
    // Weights differ by rounding, so nothing pretends they are the same sessions.
    expect(run(lbMiles, storedFingerprints(log)).workouts.length).toBeGreaterThan(0);
  });
});
