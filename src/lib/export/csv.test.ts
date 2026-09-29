import { beforeEach, describe, expect, it } from "vitest";
import type { BodyMeasurement, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { toGrams } from "@/domain/units";
import { useGym } from "@/lib/gym/store";
import { storedFingerprints } from "@/lib/import/batch";
import { parseCsv } from "@/lib/import/csv";
import { parseDuration } from "@/lib/import/parse";
import { analyseStrongCsv } from "@/lib/import/strong";
import {
  csvFiles,
  durationCell,
  exercisesCsv,
  measurementsCsv,
  routinesCsv,
  sessionsCsv,
  setsCsv,
  weightCell,
  type ExportLog,
} from "./csv";

const T = "2026-01-01T00:00:00.000Z";
const empty: ExportLog = {
  workouts: [],
  workoutExercises: [],
  workoutSets: [],
  exercises: [],
  templates: [],
  templateExercises: [],
  measurements: [],
};

const workout = (over: Partial<Workout> = {}): Workout => ({
  id: "w1",
  name: "Push",
  status: "completed",
  startedAt: "2026-03-01T17:30:00.000Z",
  endedAt: "2026-03-01T18:40:05.000Z",
  localDate: "2026-03-01",
  tzOffsetMinutes: -60,
  pausedSeconds: 0,
  createdAt: T,
  updatedAt: T,
  ...over,
});
const block = (over: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  id: "b1",
  workoutId: "w1",
  exerciseId: "e1",
  order: 0,
  exerciseNameSnapshot: "Bench Press",
  primaryMuscleGroupSnapshot: "chest",
  secondaryMuscleGroupsSnapshot: [],
  equipmentSnapshot: "barbell",
  trackingTypeSnapshot: "weight_reps",
  restSeconds: 90,
  ...over,
});
const set = (id: string, order: number, over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id,
  workoutId: "w1",
  workoutExerciseId: "b1",
  order,
  setType: "working",
  isCompleted: true,
  ...over,
});

const rows = (csv: string) => parseCsv(csv).rows;

describe("weights and durations read back exactly", () => {
  it("every whole gram survives kilograms and pounds", () => {
    const wrong: string[] = [];
    for (let grams = 0; grams <= 400_000; grams += 1) {
      if (toGrams(Number(weightCell(grams, "kg")), "kg") !== grams) wrong.push(`${grams} kg`);
      if (toGrams(Number(weightCell(grams, "lb")), "lb") !== grams) wrong.push(`${grams} lb`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("writes no exponent and no trailing zeros, and nothing for a missing weight", () => {
    expect(weightCell(100_500, "kg")).toBe("100.5");
    expect(weightCell(100_000, "kg")).toBe("100");
    expect(weightCell(49_986, "kg")).toBe("49.986");
    expect(weightCell(0, "kg")).toBe("0");
    expect(weightCell(undefined, "kg")).toBe("");
    expect(weightCell(undefined, "lb")).toBe("");
  });

  it("durations read back as the same seconds", () => {
    for (const seconds of [1, 59, 60, 61, 3599, 3600, 3661, 4205, 86_399]) {
      expect(parseDuration(durationCell(seconds))).toBe(seconds);
    }
    expect(durationCell(undefined)).toBe("");
    expect(durationCell(0)).toBe("");
  });
});

describe("the sets file", () => {
  const log: ExportLog = {
    ...empty,
    workouts: [
      workout(),
      workout({ id: "w2", name: "Unfinished", status: "active" }),
      workout({ id: "w3", name: "Dropped", status: "discarded" }),
    ],
    workoutExercises: [
      block(),
      block({ id: "b2", workoutId: "w2", exerciseNameSnapshot: "Squat" }),
      block({
        id: "b3",
        order: 1,
        exerciseNameSnapshot: "Pull Up",
        supersetGroup: "A",
        notes: "Slow",
      }),
    ],
    workoutSets: [
      set("s1", 0, { weightG: 100_500, reps: 5, rpe: 8.5, rir: 1 }),
      set("s2", 1, { weightG: 100_500, reps: 3, setType: "failure", isCompleted: false }),
      set("s3", 2, { weightG: 90_000, reps: 5, notes: "=1+1" }),
      set("s4", 0, { workoutExerciseId: "b3", reps: 8 }),
      set("s5", 0, { workoutId: "w2", workoutExerciseId: "b2", weightG: 60_000, reps: 5 }),
    ],
  };

  it("has the unit in the header and one row per completed set of a finished session", () => {
    const out = rows(setsCsv(log, "kg"));
    const csv = setsCsv(log, "kg");
    expect(csv.split("\r\n")[0]).toContain("Weight (kg)");
    expect(setsCsv(log, "lb").split("\r\n")[0]).toContain("Weight (lb)");
    expect(out.map((row) => [row[2], row[3], row[4], row[5], row[6]])).toEqual([
      ["Bench Press", "1", "working", "100.5", "5"],
      ["Bench Press", "2", "working", "90", "5"], // the uncompleted set is not there; numbering is by what is
      ["Pull Up", "1", "working", "", "8"], // no weight: empty, not 0
    ]);
  });

  it("writes the session's own wall-clock time, in the offset it was logged in", () => {
    expect(rows(setsCsv(log, "kg"))[0]?.[0]).toBe("2026-03-01 18:30:00");
    const west = { ...log, workouts: [workout({ tzOffsetMinutes: 300 })] };
    expect(rows(setsCsv(west, "kg"))[0]?.[0]).toBe("2026-03-01 12:30:00");
  });

  it("carries RPE, RIR, notes, superset and the session's length", () => {
    const [first, , third] = rows(setsCsv(log, "kg"));
    expect(first?.[7]).toBe("8.5");
    expect(first?.[8]).toBe("1");
    expect(third?.[13]).toBe("Slow");
    expect(third?.[14]).toBe("A");
    expect(first?.[15]).toBe("1h 10m 5s");
  });

  it("cannot run as a formula when opened in a spreadsheet", () => {
    const csv = setsCsv(log, "kg");
    expect(csv).toContain("'=1+1");
    expect(rows(csv)[1]?.[11]).toBe("'=1+1");
  });

  it("quotes commas, quotes and line breaks", () => {
    const tricky: ExportLog = {
      ...log,
      workouts: [workout({ name: 'Legs, "heavy"', notes: "line one\nline two" })],
    };
    const [first] = rows(setsCsv(tricky, "kg"));
    expect(first?.[1]).toBe('Legs, "heavy"');
    expect(first?.[12]).toBe("line one\nline two");
  });
});

describe("the other files", () => {
  it("sessions: every status, in date order, with completed sets", () => {
    const log: ExportLog = {
      ...empty,
      workouts: [
        workout({
          id: "b",
          startedAt: "2026-03-02T10:00:00.000Z",
          name: "Second",
          status: "active",
          endedAt: undefined,
        }),
        workout({ id: "a" }),
      ],
      workoutSets: [
        set("s1", 0, { workoutId: "a" }),
        set("s2", 1, { workoutId: "a", isCompleted: false }),
      ],
    };
    const out = rows(sessionsCsv(log));
    expect(out.map((r) => [r[0], r[1], r[5], r[6]])).toEqual([
      ["a", "Push", "completed", "1"],
      ["b", "Second", "active", "0"],
    ]);
    expect(out[0]?.[2]).toBe("2026-03-01 18:30:00");
    expect(out[0]?.[3]).toBe("2026-03-01 19:40:05");
    expect(out[1]?.[3]).toBe("");
  });

  it("exercises: muscles, equipment, tracking, one-sided, source and state", () => {
    const out = rows(
      exercisesCsv([
        {
          id: "e1",
          name: "Split Squat",
          primaryMuscleGroup: "quads",
          secondaryMuscleGroups: ["glutes", "core"],
          equipment: "dumbbell",
          movementPattern: "lunge",
          trackingType: "weight_reps",
          unilateral: true,
          isCustom: false,
          isArchived: true,
          createdAt: T,
          updatedAt: T,
        },
      ]),
    );
    expect(out[0]).toEqual([
      "e1",
      "Split Squat",
      "quads",
      "glutes; core",
      "dumbbell",
      "lunge",
      "weight_reps",
      "yes",
      "library",
      "archived",
      "",
    ]);
  });

  it("routines: one row per exercise, in order, with the exercise's name", () => {
    const log: ExportLog = {
      ...empty,
      exercises: [
        {
          id: "e1",
          name: "Bench Press",
          primaryMuscleGroup: "chest",
          secondaryMuscleGroups: [],
          equipment: "barbell",
          movementPattern: "horizontal push",
          trackingType: "weight_reps",
          isCustom: false,
          isArchived: false,
          createdAt: T,
          updatedAt: T,
        },
      ],
      templates: [
        { id: "t1", name: "Push", order: 0, isArchived: false, createdAt: T, updatedAt: T },
      ],
      templateExercises: [
        {
          id: "te1",
          templateId: "t1",
          exerciseId: "e1",
          order: 0,
          targetSets: 4,
          targetRepMin: 5,
          targetRepMax: 8,
          targetRir: 2,
          restSeconds: 150,
          defaultSetType: "working",
          includeWarmup: true,
        },
      ],
    };
    expect(rows(routinesCsv(log))[0]).toEqual([
      "Push",
      "active",
      "1",
      "Bench Press",
      "4",
      "5",
      "8",
      "",
      "2",
      "150",
      "working",
      "yes",
      "",
      "",
    ]);
  });

  it("measurements: weight in the lifter's unit, lengths in centimetres or inches", () => {
    const m = (id: string, metric: BodyMeasurement["metric"], value: number): BodyMeasurement => ({
      id,
      metric,
      value,
      displayUnit: "kg",
      recordedAt: `2026-03-0${id}T08:00:00.000Z`,
      localDate: `2026-03-0${id}`,
      createdAt: T,
      updatedAt: T,
    });
    const list = [m("1", "bodyweight", 82_350), m("2", "arm_left", 348), m("3", "arms", 254)];
    expect(rows(measurementsCsv(list, "kg", "cm")).map((r) => [r[2], r[3], r[4]])).toEqual([
      ["bodyweight", "82.35", "kg"],
      ["arm_left", "34.8", "cm"],
      ["arms", "25.4", "cm"],
    ]);
    expect(rows(measurementsCsv(list, "lb", "in")).map((r) => [r[2], r[3], r[4]])).toEqual([
      ["bodyweight", "181.5507", "lb"],
      ["arm_left", "13.7", "in"],
      ["arms", "10", "in"],
    ]);
  });

  it("names every file with the date", () => {
    const files = csvFiles(empty, { mass: "kg", length: "cm" }, "2026-09-29");
    expect(Object.values(files).map((f) => f.fileName)).toEqual([
      "lockd-sets-2026-09-29.csv",
      "lockd-sessions-2026-09-29.csv",
      "lockd-exercises-2026-09-29.csv",
      "lockd-routines-2026-09-29.csv",
      "lockd-measurements-2026-09-29.csv",
    ]);
  });
});

describe("taking the log out and bringing it back", () => {
  beforeEach(() => {
    useGym.getState().resetAll();
  });

  for (const unitSystem of ["metric", "imperial"] as const) {
    it(`re-importing the ${unitSystem} sets file finds every session already there`, () => {
      useGym.getState().completeOnboarding({ loadDemo: true, unitSystem });
      const state = useGym.getState();
      const finished = state.workouts.filter((w) => w.status === "completed");
      expect(finished.length).toBeGreaterThan(100);

      const csv = setsCsv(state, unitSystem === "metric" ? "kg" : "lb");
      const analysis = analyseStrongCsv(csv);
      expect(analysis.missingRequired).toEqual([]);
      expect(analysis.issues).toEqual([]);
      expect(analysis.workouts).toHaveLength(finished.length);

      const here = storedFingerprints(state);
      const missing = analysis.workouts.filter((w) => !here.has(w.fingerprint));
      expect(missing.map((w) => `${w.stamp} ${w.name}`)).toEqual([]);
    });
  }
});
