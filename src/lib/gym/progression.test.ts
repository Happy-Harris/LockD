import { describe, expect, it } from "vitest";
import type { WorkoutSet } from "@/domain/types";
import { computeStallComparison, stepDownG, stepUpG } from "@/domain/progression";
import { applyProgramLoad } from "./programs";
import { barbellSnap } from "./loads";
import type { SessionSlice } from "./analytics";
import { progressExercise, type ProgressionCall } from "./progression";
import { seedBarProfiles, seedPlateInventories } from "./seed";

const EXERCISE = "bench";

/** One session of one lift: `top` grams for `reps` on each of three sets, on a given local date. */
function session(date: string, top: number, reps: number, index: number): SessionSlice {
  const workoutId = `w-${index}`;
  const blockId = `b-${index}`;
  return {
    workout: {
      id: workoutId,
      name: "s",
      status: "completed",
      localDate: date,
      startedAt: `${date}T12:00:00.000Z`,
      tzOffsetMinutes: 0,
      pausedSeconds: 0,
      createdAt: "",
      updatedAt: "",
    },
    exercises: [
      {
        id: blockId,
        workoutId,
        exerciseId: EXERCISE,
        order: 0,
        exerciseNameSnapshot: "Bench Press",
        primaryMuscleGroupSnapshot: "chest",
        secondaryMuscleGroupsSnapshot: [],
        equipmentSnapshot: "barbell",
        trackingTypeSnapshot: "weight_reps",
        restSeconds: 120,
      },
    ],
    sets: [0, 1, 2].map((order): WorkoutSet => ({
      id: `s-${index}-${order}`,
      workoutId,
      workoutExerciseId: blockId,
      order,
      setType: "working",
      weightG: top,
      reps,
      isCompleted: true,
    })),
  };
}

const days = (start: string, offsets: number[]): string[] =>
  offsets.map((n) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  });

function slicesFrom(rows: Array<[date: string, top: number, reps: number]>): SessionSlice[] {
  return rows.map(([date, top, reps], index) => session(date, top, reps, index));
}

const call = (slices: SessionSlice[], over: Partial<Parameters<typeof progressExercise>[0]> = {}) =>
  progressExercise({
    exerciseId: EXERCISE,
    exerciseName: "Bench Press",
    trackingType: "weight_reps",
    incrementG: 2500,
    targetRepMin: 6,
    targetRepMax: 8,
    targetSets: 3,
    slices,
    formula: "epley",
    excludeWarmups: true,
    ...over,
  });

describe("stall is measured over a window, not against the all-time peak", () => {
  it("a lifter coming back after a long layoff is not stalled, and gets no easier week", () => {
    // A strong year, a 60-day break, then three lighter sessions on the way back.
    const before = days("2026-03-02", [0, 3, 7, 10, 14, 17]).map((d): [string, number, number] => [
      d,
      120_000,
      6,
    ]);
    const back = days("2026-06-20", [0, 3, 6]).map((d): [string, number, number] => [
      d,
      100_000,
      8,
    ]);
    const result = call(slicesFrom([...before, ...back]));
    expect(result.stallSessions).toBe(0);
    expect(result.action).not.toBe("easier_week");
  });

  it("an old peak years ago does not make three good recent sessions look stalled", () => {
    const old = days("2024-01-01", [0, 3, 7]).map((d): [string, number, number] => [d, 130_000, 5]);
    const recent = days("2026-09-01", [0, 4, 8, 11]).map((d, i): [string, number, number] => [
      d,
      90_000 + i * 2500,
      6,
    ]);
    expect(call(slicesFrom([...old, ...recent])).stallSessions).toBe(0);
  });

  it("flat estimates across the window and the sessions before it are a stall, and say how many", () => {
    const earlier = days("2026-07-20", [0, 3, 7, 10]).map((d): [string, number, number] => [
      d,
      100_000,
      6,
    ]);
    const window = days("2026-08-20", [0, 4, 8, 11]).map((d): [string, number, number] => [
      d,
      100_000,
      6,
    ]);
    const result = call(slicesFrom([...earlier, ...window]));
    expect(result.stallSessions).toBe(4);
  });

  it("says nothing about a stall when there is no earlier window to compare with", () => {
    const only = days("2026-09-01", [0, 2, 4, 6, 8]).map((d): [string, number, number] => [
      d,
      100_000,
      6,
    ]);
    expect(call(slicesFrom(only)).stallSessions).toBe(0);
  });

  it("the domain rule refuses to compare across a break longer than 28 days", () => {
    const sessions = [
      ...days("2026-01-05", [0, 3, 7]).map((d) => ({
        localDate: d,
        sets: session(d, 120_000, 6, 0).sets,
      })),
      ...days("2026-04-05", [0, 3, 7]).map((d) => ({
        localDate: d,
        sets: session(d, 100_000, 6, 1).sets,
      })),
    ];
    const gap = computeStallComparison(sessions, "epley", "2026-04-05", "2026-04-30");
    expect(gap.state).toBe("insufficient_data");
    expect(gap.comparisonSource).toBeNull();
    const close = [
      ...days("2026-03-20", [0, 3, 7]).map((d) => ({
        localDate: d,
        sets: session(d, 120_000, 6, 0).sets,
      })),
      ...days("2026-04-05", [0, 3, 7]).map((d) => ({
        localDate: d,
        sets: session(d, 100_000, 6, 1).sets,
      })),
    ];
    expect(computeStallComparison(close, "epley", "2026-04-05", "2026-04-30").state).toBe(
      "stalled",
    );
  });
});

describe("loads are ones that can be selected or built", () => {
  it("steps up to the next grid load from any starting point, and always above it", () => {
    for (const current of [100_000, 100_300, 101_249, 102_499, 62_500]) {
      const next = stepUpG(current, 2500);
      expect(next % 2500, String(current)).toBe(0);
      expect(next).toBeGreaterThan(current);
    }
  });

  it("drops to a lighter grid load about the asked fraction down, never at or above the last", () => {
    expect(stepDownG(100_000, 0.9, 2500)).toBe(90_000);
    expect(stepDownG(102_500, 0.9, 2500)).toBe(92_500); // 92,250 is not a load anyone can pick
    expect(stepDownG(102_500, 0.95, 2500)).toBe(97_500);
    expect(stepDownG(2_500, 0.95, 2500)).toBeLessThan(2_500);
    expect(stepDownG(0, 0.9, 2500)).toBe(0);
  });

  it("an add-load call lands on the grid even when history is off it", () => {
    const rows = days("2026-09-01", [0, 3]).map((d): [string, number, number] => [d, 101_249, 8]);
    const result = call(slicesFrom(rows));
    expect(result.action).toBe("add_load");
    expect(result.suggestedWeightG! % 2500).toBe(0);
    expect(result.suggestedWeightG!).toBeGreaterThan(101_249);
  });

  it("an easier week and a deload land on the grid", () => {
    const misses = days("2026-09-01", [0, 3, 6]).map((d): [string, number, number] => [
      d,
      102_500,
      3,
    ]);
    const easier = call(slicesFrom(misses));
    expect(easier.action).toBe("easier_week");
    expect(easier.suggestedWeightG! % 2500).toBe(0);
    expect(easier.suggestedWeightG!).toBeLessThan(102_500);
    const two = call(slicesFrom(misses.slice(0, 2)));
    expect(two.action).toBe("deload");
    expect(two.suggestedWeightG! % 2500).toBe(0);
    expect(two.suggestedWeightG!).toBeLessThan(102_500);
  });

  it("with the lifter's bar and plates, a barbell load is one those plates can make", () => {
    const bars = seedBarProfiles();
    const plates = seedPlateInventories();
    const settings = {
      defaultBarProfileId: "seed-bar-olympic-kg",
      defaultPlateInventoryId: "seed-plates-kg",
    };
    const snap = barbellSnap({ equipment: "barbell" }, bars, plates, settings)!;
    expect(snap).toBeTypeOf("function");
    // 20 kg bar plus pairs from 25, 20, 15, 10, 5, 2.5, 1.25, 0.5: steps of 1 kg per pair at the
    // finest (0.5 pair = 1 kg), so any whole-kg total above the bar is reachable.
    expect(snap(101_000, "nearest")).toBe(101_000);
    expect(snap(100_400, "down")).toBe(100_000);
    expect(snap(100_400, "up")).toBe(101_000);
    const rows = days("2026-09-01", [0, 3]).map((d): [string, number, number] => [d, 100_000, 8]);
    const built = call(slicesFrom(rows), { snap });
    expect(built.action).toBe("add_load");
    expect(snap(built.suggestedWeightG!, "nearest")).toBe(built.suggestedWeightG);
    expect(built.suggestedWeightG!).toBeGreaterThanOrEqual(102_500);
    // Only a barbell gets one.
    expect(barbellSnap({ equipment: "dumbbell" }, bars, plates, settings)).toBeUndefined();
    expect(barbellSnap({ equipment: "barbell" }, [], plates, settings)).toBeUndefined();
  });

  it("with only 2.5 kg pairs to load, the next load is the next one those plates can make", () => {
    const bars = [{ id: "bar", name: "Bar", weightG: 20_000, collarWeightG: 0, isDefault: true }];
    const plates = [
      {
        id: "p",
        name: "Only 5s",
        unit: "kg" as const,
        plates: [{ weightG: 5_000, count: 20 }],
        isDefault: true,
      },
    ];
    const snap = barbellSnap({ equipment: "barbell" }, bars, plates, {
      defaultBarProfileId: "bar",
      defaultPlateInventoryId: "p",
    })!;
    // Every total is 20 kg + 10 kg per pair: 20, 30, 40 … 100.
    expect(snap(97_500, "nearest")).toBe(100_000);
    expect(snap(97_500, "down")).toBe(90_000);
    expect(stepUpG(90_000, 2500, snap)).toBe(100_000);
    expect(stepDownG(100_000, 0.9, 2500, snap)).toBe(90_000);
  });
});

describe("a program's linear rule", () => {
  const base = (over: Partial<ProgressionCall> = {}): ProgressionCall => ({
    exerciseId: EXERCISE,
    exerciseName: "Bench Press",
    trackingType: "weight_reps",
    action: "hold",
    suggestedWeightG: 100_000,
    suggestedReps: 6,
    why: "",
    cites: [],
    hitRate: 1,
    missStreak: 0,
    stallSessions: 0,
    exposuresAtLoad: 1,
    lastWeightG: 100_000,
    ...over,
  });
  const rule = { kind: "linear" as const, incrementG: 2500 };
  const at = (week: number, over: Partial<Parameters<typeof applyProgramLoad>[0]> = {}) =>
    applyProgramLoad({
      rule,
      weekNumber: week,
      isDeload: false,
      baseSets: 4,
      previousWeightG: 60_000,
      suggestion: base(),
      ...over,
    });

  it("adds exactly one increment to the last working load, in any week, when the last session went to plan", () => {
    expect(at(2).weightG).toBe(102_500);
    expect(at(6).weightG).toBe(102_500); // it used to add (week - 1) increments to the last load
  });

  it("does not add load after a missed session: the engine's lighter call stands", () => {
    const missed = base({ action: "deload", missStreak: 2, suggestedWeightG: 95_000 });
    expect(at(3, { suggestion: missed }).weightG).toBe(95_000);
    const easier = base({ action: "easier_week", missStreak: 3, suggestedWeightG: 90_000 });
    expect(at(3, { suggestion: easier }).weightG).toBe(90_000);
  });

  it("steps from the last working load, not from a warm-up set it was handed", () => {
    expect(at(2, { previousWeightG: 40_000 }).weightG).toBe(102_500);
  });

  it("applies with no engine call at all, from the last weight it has", () => {
    expect(at(2, { suggestion: undefined, previousWeightG: 80_000 }).weightG).toBe(82_500);
  });

  it("a deload week is a fraction of the load, on the grid, with a set fewer", () => {
    const result = at(4, { isDeload: true });
    expect(result.weightG! % 2500).toBe(0);
    expect(result.weightG!).toBeLessThan(100_000);
    expect(result.sets).toBe(3);
  });

  it("a non-linear rule leaves the engine's number alone", () => {
    expect(at(3, { rule: { kind: "hold" } as never }).weightG).toBe(100_000);
  });
});
