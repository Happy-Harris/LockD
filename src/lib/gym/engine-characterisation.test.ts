import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSlice } from "./analytics";
import { sliceSessions } from "./analytics";
import { autopsyLift, loadsSimilar } from "./autopsy";
import { buildChronicle, eraForDate } from "./chronicle";
import { buildDemoLog } from "./demo";
import { buildLiftDna } from "./dna";
import { compareSet, workoutDiff, wouldBePr } from "./ghost";
import { easierWeekCall, progressExercise } from "./progression";
import { seedExerciseId, seedExercises } from "./seed";

const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/domain/ids", () => ({ uuid: () => `fixture-${++ids.next}` }));

// Local noon pins the demo's local calendar across timezones. No wall clock or real history.
const now = () => new Date(2026, 8, 28, 12);
const exercises = seedExercises("2026-09-28T12:00:00.000Z");
const bench = exercises.find((row) => row.name === "Bench Press")!;
const goalIds = ["Bench Press", "Back Squat", "Conventional Deadlift"].map(seedExerciseId);

function demo() {
  const log = buildDemoLog(exercises, now());
  return { log, slices: sliceSessions(log.workouts, log.workoutExercises, log.workoutSets) };
}

// A deliberately small synthetic log makes branch boundaries reviewable without demo noise.
function exposures(reps: number[], weights = reps.map(() => 100_000)): SessionSlice[] {
  return reps.map((rep, index) => {
    const date = `2026-09-${String(index + 1).padStart(2, "0")}`;
    const workoutId = `workout-${index}`;
    const exerciseRowId = `exercise-${index}`;
    return {
      workout: {
        id: workoutId, name: "Bench session", status: "completed", localDate: date,
        startedAt: `${date}T12:00:00.000Z`, endedAt: `${date}T13:00:00.000Z`,
        createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T13:00:00.000Z`,
        tzOffsetMinutes: 0, pausedSeconds: 0,
      },
      exercises: [{
        id: exerciseRowId, workoutId, exerciseId: bench.id, order: 0, restSeconds: 120,
        exerciseNameSnapshot: bench.name, primaryMuscleGroupSnapshot: bench.primaryMuscleGroup,
        secondaryMuscleGroupsSnapshot: bench.secondaryMuscleGroups,
        equipmentSnapshot: bench.equipment, trackingTypeSnapshot: bench.trackingType,
      }],
      sets: [0, 1, 2].map((order) => ({
        id: `set-${index}-${order}`, workoutId, workoutExerciseId: exerciseRowId, order,
        setType: "working" as const, weightG: weights[index], reps: rep,
        rpe: index < 6 ? 7 : 9, isCompleted: true,
        completedAt: `${date}T12:${String(order * 2).padStart(2, "0")}:00.000Z`,
      })),
    };
  });
}

function progress(slices: SessionSlice[]) {
  return progressExercise({
    exerciseId: bench.id, exerciseName: bench.name, trackingType: bench.trackingType,
    incrementG: 2500, targetRepMin: 6, targetRepMax: 8, targetSets: 3,
    slices, formula: "epley", excludeWarmups: true,
  });
}

beforeEach(() => { ids.next = 0; });

describe("engine characterisation — current behaviour, not desired correctness", () => {
  it("pins the deterministic demo size and calendar", () => {
    const { log } = demo();
    expect({
      sessions: log.workouts.length, exercises: log.workoutExercises.length,
      sets: log.workoutSets.length, measurements: log.measurements.length,
      first: log.workouts[0]?.localDate, last: log.workouts.at(-1)?.localDate,
    }).toMatchSnapshot();
    ids.next = 0;
    expect(buildDemoLog(exercises, now())).toEqual(log);
  });

  it("pins detected and named Chronicle eras, all events, strongest stretch and biggest jump", () => {
    const { log, slices } = demo();
    const detected = buildChronicle(slices, "epley", goalIds);
    const named = buildChronicle(slices, "epley", goalIds, log.eraNames);
    expect({ detected, named }).toMatchSnapshot();
    expect(buildChronicle([], "epley", goalIds)).toEqual({ eras: [], events: [] });
  });

  it("naming one era relabels it and leaves every other era and every session where they were (plan I-17)", () => {
    const { slices } = demo();
    const detected = buildChronicle(slices, "epley", goalIds);
    const later = detected.eras.at(-1)!;
    expect(later.startDate).not.toBe(slices[0]!.workout.localDate);
    const renamed = buildChronicle(slices, "epley", goalIds, [{ startDate: later.startDate, name: "Renamed" }]);
    expect(renamed.eras.map((era) => [era.startDate, era.endDate, era.sessions])).toEqual(
      detected.eras.map((era) => [era.startDate, era.endDate, era.sessions]),
    );
    expect(renamed.eras.at(-1)?.name).toBe("Renamed");
    expect(renamed.eras.at(-1)?.autoName).toBe(later.autoName);
    expect(renamed.eras.slice(0, -1).map((era) => era.name)).toEqual(detected.eras.slice(0, -1).map((era) => era.name));
    expect(eraForDate(renamed.eras, slices[0]!.workout.localDate)).toBeDefined();
    expect(renamed.eras.reduce((sum, era) => sum + era.sessions, 0)).toBe(slices.length);
  });

  it("every session falls in exactly one era, whatever names exist", () => {
    const { log, slices } = demo();
    for (const names of [[], log.eraNames, [{ startDate: "2000-01-01", name: "Before the log" }]]) {
      const chronicle = buildChronicle(slices, "epley", goalIds, names);
      expect(chronicle.eras.reduce((sum, era) => sum + era.sessions, 0)).toBe(slices.length);
      for (const slice of slices) expect(eraForDate(chronicle.eras, slice.workout.localDate)).toBeDefined();
    }
  });

  it("a name whose date is not an era start is kept in the data but labels nothing", () => {
    const { slices } = demo();
    const detected = buildChronicle(slices, "epley", goalIds);
    const stray = buildChronicle(slices, "epley", goalIds, [{ startDate: "2000-01-01", name: "Stray" }]);
    expect(stray.eras.map((era) => era.name)).toEqual(detected.eras.map((era) => era.name));
  });

  it("pins Ghost comparisons and the current skipped-exercise behind verdict", () => {
    const { slices } = demo();
    const current = slices.at(-1)!;
    expect(workoutDiff(structuredClone(current), slices, "kg")).toMatchSnapshot("demo comparison");
    const history = exposures([8, 8]);
    const skipped = { ...history[1]!, sets: [] };
    const diff = workoutDiff(skipped, history, "kg");
    expect(diff.score).toEqual({ beat: 0, tie: 0, behind: 1, new: 0 });
    expect(diff.lines[0]?.verdict).toBe("behind");
    expect(diff).toMatchSnapshot("skipped exercise");
    expect([
      compareSet({ weightG: 102500, reps: 3 }, { weightG: 100000, reps: 8 }),
      compareSet({ weightG: 100000, reps: 8 }, { weightG: 100000, reps: 8 }),
      compareSet({ weightG: 100000, reps: 8 }),
    ]).toMatchSnapshot("weight wins despite fewer reps, tie, first exposure");
  });

  it("BUG: first exposure is called a new e1RM record without a previous baseline", () => {
    expect(wouldBePr({
      weightG: 100000, reps: 6, exerciseId: bench.id, slices: [],
      formula: "epley", excludeWarmups: true,
    })).toEqual({ would: true, label: "new e1RM" });
  });

  it("pins progression decisions and easier-week board thresholds", () => {
    const cases = {
      empty: progress([]), topOnce: progress(exposures([8])),
      addLoad: progress(exposures([8, 8])), addReps: progress(exposures([6])),
      oneMiss: progress(exposures([4])), twoMisses: progress(exposures([4, 4])),
      threeMisses: progress(exposures([4, 4, 4])),
    };
    expect(Object.values(cases).map((call) => call.action))
      .toEqual(["hold", "hold", "add_load", "add_reps", "hold", "deload", "easier_week"]);
    expect(cases).toMatchSnapshot();
    const second = { ...cases.twoMisses, exerciseId: "squat", exerciseName: "Squat" };
    expect({
      none: easierWeekCall([]), one: easierWeekCall([cases.threeMisses]),
      two: easierWeekCall([cases.threeMisses, second]),
      threeStalls: easierWeekCall(["Bench", "Squat", "Deadlift"].map((exerciseName) => ({
        ...cases.oneMiss, exerciseName, stallSessions: 4,
      }))),
    }).toMatchSnapshot("easier-week thresholds");
  });

  it("pins autopsy evidence for misses, rising effort and falling volume (a plateau needs an earlier window to compare with)", () => {
    const slices = exposures([8, 8, 8, 8, 8, 8, 4, 4, 4, 4, 4, 4]);
    for (const slice of slices.slice(6)) slice.sets = slice.sets.slice(0, 2);
    const call = progress(slices);
    const result = autopsyLift(call, slices, "epley", true);
    expect(result.findings.map((finding) => finding.code))
      .toEqual(["missed_reps", "falling_volume", "rising_rpe"]);
    expect(result).toMatchSnapshot();
    expect(autopsyLift(progress([]), [], "epley", true)).toMatchSnapshot("no history");
  });

  it("pins lift DNA for long, sparse and synthetic progression histories", () => {
    const { slices } = demo();
    expect({
      bench: buildLiftDna(bench, slices, "epley", true),
      noHistory: buildLiftDna(bench, [], "epley", true),
      oneExposure: buildLiftDna(bench, exposures([8]), "epley", true),
      loadSteps: buildLiftDna(bench, exposures([6, 6, 6, 6, 6, 6], [100000, 100000, 102500, 102500, 105000, 105000]), "epley", true),
      repSteps: buildLiftDna(bench, exposures([4, 5, 6, 7, 8, 9]), "epley", true),
    }).toMatchSnapshot();
  });
});

describe("autopsy copy only claims what the load supports (plan I-16)", () => {
  const stalled = (recentWeight: number) => {
    const slices = exposures([8, 8, 8, 8, 8, 8, 4, 4, 4, 4, 4, 4]);
    for (const slice of slices.slice(6)) {
      slice.sets = slice.sets.slice(0, 2);
      for (const set of slice.sets) set.weightG = recentWeight;
    }
    return autopsyLift(progress(slices), slices, "epley", true);
  };
  const text = (result: ReturnType<typeof stalled>) =>
    result.findings.map((finding) => `${finding.detail} ${finding.evidence}`).join(" | ");

  it("keeps the clauses when the load held", () => {
    expect(text(stalled(100_000))).toContain("at similar loads");
    expect(text(stalled(100_000))).toContain("while the load stayed put");
    expect(text(stalled(104_000))).toContain("at similar loads"); // +4%, inside the 5% band
  });

  it("drops both clauses when the load moved", () => {
    const moved = text(stalled(120_000));
    expect(moved).toContain("RPE 7.0 → 9.0.");
    expect(moved).toContain("Fewer credited sets.");
    expect(moved).not.toContain("similar loads");
    expect(moved).not.toContain("stayed put");
  });

  it("does not claim similar loads when no load was logged", () => {
    expect(loadsSimilar([{ bestWeightG: 0 }], [{ bestWeightG: 0 }])).toBe(false);
    expect(loadsSimilar([], [{ bestWeightG: 100_000 }])).toBe(false);
  });
});
