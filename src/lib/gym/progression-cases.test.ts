import { describe, expect, it } from "vitest";
import type { Exercise, ProgramExercise, ProgramSession, WorkoutSet } from "@/domain/types";
import type { SessionSlice } from "./analytics";
import { programSwap, programSwapForWorkout } from "./programs";
import { progressExercise } from "./progression";

/**
 * Opp 3 case fixtures (plan addendum A-6): missed sessions, failed reps, swaps and deloads. Each case pins the call
 * and the sessions it cites, so the "why" on screen can always be opened and checked against the log.
 */

type Row = { date: string; lift?: string; top: number; reps: number[]; type?: WorkoutSet["setType"] };

function slicesFrom(rows: Row[]): SessionSlice[] {
  return rows.map((row, index) => {
    const workoutId = `w-${index}`;
    const blockId = `b-${index}`;
    const lift = row.lift ?? "bench";
    return {
      workout: {
        id: workoutId,
        name: "s",
        status: "completed",
        localDate: row.date,
        startedAt: `${row.date}T12:00:00.000Z`,
        tzOffsetMinutes: 0,
        pausedSeconds: 0,
        createdAt: "",
        updatedAt: "",
      },
      exercises: [
        {
          id: blockId,
          workoutId,
          exerciseId: lift,
          order: 0,
          exerciseNameSnapshot: lift,
          primaryMuscleGroupSnapshot: "chest",
          secondaryMuscleGroupsSnapshot: [],
          equipmentSnapshot: "barbell",
          trackingTypeSnapshot: "weight_reps",
          restSeconds: 120,
        },
      ],
      sets: row.reps.map(
        (reps, order): WorkoutSet => ({
          id: `s-${index}-${order}`,
          workoutId,
          workoutExerciseId: blockId,
          order,
          setType: row.type ?? "working",
          weightG: row.top,
          reps,
          isCompleted: true,
        }),
      ),
    };
  });
}

const call = (rows: Row[], over: Partial<Parameters<typeof progressExercise>[0]> = {}) =>
  progressExercise({
    exerciseId: "bench",
    exerciseName: "Bench Press",
    trackingType: "weight_reps",
    incrementG: 2500,
    targetRepMin: 6,
    targetRepMax: 8,
    targetSets: 3,
    slices: slicesFrom(rows),
    formula: "epley",
    excludeWarmups: true,
    ...over,
  });

const dates = (result: { cites: Array<{ date: string }> }) => result.cites.map((cite) => cite.date);

describe("every call cites the sessions it read", () => {
  it("cites nothing when there is no session on file", () => {
    expect(call([]).cites).toEqual([]);
  });

  it("cites the session ids as well as the dates, so each one can be opened", () => {
    const result = call([{ date: "2026-09-01", top: 100_000, reps: [7, 7, 6] }]);
    expect(result.action).toBe("add_reps");
    expect(result.cites).toEqual([{ workoutId: "w-0", date: "2026-09-01" }]);
  });

  it("an add-load at the top of the range cites every session at that load", () => {
    const result = call([
      { date: "2026-09-01", top: 95_000, reps: [8, 8, 8] },
      { date: "2026-09-04", top: 100_000, reps: [8, 8, 8] },
      { date: "2026-09-08", top: 100_000, reps: [8, 8, 8] },
    ]);
    expect(result.action).toBe("add_load");
    expect(dates(result)).toEqual(["2026-09-04", "2026-09-08"]);
  });

  it("an easier week called on a stall cites the sessions in the stall window, not the older ones", () => {
    const flat = (date: string): Row => ({ date, top: 100_000, reps: [6, 5, 5] });
    const rows = [
      ...["2026-07-20", "2026-07-23", "2026-07-27", "2026-07-30"].map(flat),
      flat("2026-08-20"),
      { date: "2026-08-24", top: 100_000, reps: [6, 6, 5] },
      flat("2026-08-28"),
      { date: "2026-08-31", top: 100_000, reps: [6, 6, 5] },
    ];
    const result = call(rows);
    expect(result.stallSessions).toBe(4);
    // Same best set throughout, two hits in eight: a stall with a low hit rate, not a miss streak.
    expect(result.missStreak).toBe(0);
    expect(result.action).toBe("easier_week");
    expect(dates(result)).toEqual(["2026-08-20", "2026-08-24", "2026-08-28", "2026-08-31"]);
  });
});

describe("missed sessions", () => {
  const steady: Row[] = [
    { date: "2026-08-03", top: 100_000, reps: [7, 7, 7] },
    { date: "2026-08-06", top: 100_000, reps: [7, 7, 7] },
  ];

  it("a skipped week is not a miss and not a comeback: the call reads the sessions as logged", () => {
    const result = call(steady, { today: "2026-08-15" });
    expect(result.action).toBe("add_reps");
    expect(result.missStreak).toBe(0);
    expect(dates(result)).toEqual(["2026-08-06"]);
  });

  it("a gap as long as a layoff restarts by the comeback rule and cites the last session before it", () => {
    const result = call(steady, { today: "2026-08-20" });
    expect(result.action).toBe("re_entry");
    expect(result.suggestedWeightG).toBe(90_000);
    expect(result.cites).toEqual([{ workoutId: "w-1", date: "2026-08-06" }]);
  });

  it("without today's date, the engine reads the log alone and never guesses a gap", () => {
    expect(call(steady).action).toBe("add_reps");
  });
});

describe("failed reps", () => {
  const hit: Row = { date: "2026-09-01", top: 100_000, reps: [7, 7, 7] };
  const miss = (date: string): Row => ({ date, top: 100_000, reps: [5, 4, 4] });

  it("one session short of the range holds the load and cites that session", () => {
    const result = call([hit, miss("2026-09-04")]);
    expect(result.action).toBe("hold");
    expect(result.suggestedWeightG).toBe(100_000);
    expect(dates(result)).toEqual(["2026-09-04"]);
  });

  it("two in a row drops the load a little and cites both misses", () => {
    const result = call([hit, miss("2026-09-04"), miss("2026-09-08")]);
    expect(result.action).toBe("deload");
    expect(result.missStreak).toBe(2);
    expect(dates(result)).toEqual(["2026-09-04", "2026-09-08"]);
  });

  it("three in a row calls an easier week and cites all three, not the hit before them", () => {
    const result = call([hit, miss("2026-09-04"), miss("2026-09-08"), miss("2026-09-11")]);
    expect(result.action).toBe("easier_week");
    expect(result.suggestedWeightG).toBe(90_000);
    expect(dates(result)).toEqual(["2026-09-04", "2026-09-08", "2026-09-11"]);
  });

  it("one missed set out of three still counts as a hit", () => {
    const result = call([{ date: "2026-09-01", top: 100_000, reps: [7, 7, 5] }]);
    expect(result.missStreak).toBe(0);
    expect(result.action).toBe("add_reps");
  });

  it("sets logged as failure sets are read as working sets, so a failed rep counts", () => {
    const result = call([
      hit,
      { ...miss("2026-09-04"), type: "failure" },
      { ...miss("2026-09-08"), type: "failure" },
    ]);
    expect(result.action).toBe("deload");
    expect(dates(result)).toEqual(["2026-09-04", "2026-09-08"]);
  });
});

describe("deloads", () => {
  it("a deload lands on the increment grid below the last load", () => {
    const result = call([
      { date: "2026-09-01", top: 101_000, reps: [4, 4, 4] },
      { date: "2026-09-04", top: 101_000, reps: [4, 4, 4] },
    ]);
    expect(result.action).toBe("deload");
    expect(result.suggestedWeightG! % 2500).toBe(0);
    expect(result.suggestedWeightG!).toBeLessThan(101_000);
  });

  it("after a deload session goes to plan, the call moves on and cites only that session", () => {
    const result = call([
      { date: "2026-09-01", top: 100_000, reps: [4, 4, 4] },
      { date: "2026-09-04", top: 100_000, reps: [4, 4, 4] },
      { date: "2026-09-08", top: 95_000, reps: [7, 7, 7] },
    ]);
    expect(result.missStreak).toBe(0);
    expect(result.action).toBe("add_reps");
    expect(result.suggestedWeightG).toBe(95_000);
    expect(dates(result)).toEqual(["2026-09-08"]);
  });
});

describe("swaps", () => {
  const rows: Row[] = [
    { date: "2026-09-01", lift: "bench", top: 100_000, reps: [4, 4, 4] },
    { date: "2026-09-04", lift: "bench", top: 100_000, reps: [4, 4, 4] },
    { date: "2026-09-08", lift: "db-bench", top: 32_000, reps: [8, 8, 8] },
    { date: "2026-09-11", lift: "db-bench", top: 32_000, reps: [8, 8, 8] },
  ];

  it("a swapped-in lift reads its own sessions only: the original's misses never become its deload", () => {
    const result = call(rows, { exerciseId: "db-bench", exerciseName: "Dumbbell Bench Press" });
    expect(result.action).toBe("add_load");
    expect(dates(result)).toEqual(["2026-09-08", "2026-09-11"]);
  });

  it("the original lift keeps its own history and its own call", () => {
    const result = call(rows);
    expect(result.action).toBe("deload");
    expect(dates(result)).toEqual(["2026-09-01", "2026-09-04"]);
  });

  const library = [
    { id: "bench", name: "Bench Press" },
    { id: "db-bench", name: "Dumbbell Bench Press" },
  ] as Exercise[];
  const row = (over: Partial<ProgramExercise>): ProgramExercise => ({
    id: "pe-1",
    programSessionId: "ps-1",
    exerciseId: "db-bench",
    order: 0,
    targetSets: 3,
    restSeconds: 120,
    includeWarmup: false,
    rule: { kind: "double_progression" },
    ...over,
  });

  it("a program swap names the lift it stands in for", () => {
    expect(programSwap(row({ substitutionOf: "bench" }), library)).toEqual({
      name: "Dumbbell Bench Press",
      originalName: "Bench Press",
    });
    expect(programSwap(row({}), library)).toBeUndefined();
    expect(programSwap(row({ substitutionOf: "db-bench" }), library)).toBeUndefined();
  });

  it("a program workout finds the swap through its program's sessions only", () => {
    const sessions = [{ id: "ps-1", programId: "p-1" }] as ProgramSession[];
    const rows = [row({ substitutionOf: "bench" })];
    expect(programSwapForWorkout("p-1", "db-bench", sessions, rows, library)?.originalName).toBe("Bench Press");
    expect(programSwapForWorkout("p-2", "db-bench", sessions, rows, library)).toBeUndefined();
    expect(programSwapForWorkout(undefined, "db-bench", sessions, rows, library)).toBeUndefined();
  });
});
