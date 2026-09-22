import { bestOneRepMax } from "@/domain/oneRepMax";
import type { OneRepMaxFormula, TrackingType } from "@/domain/types";
import type { SessionSlice } from "./analytics";

export type ProgressAction = "add_load" | "add_reps" | "hold" | "deload" | "easier_week";

export interface Exposure {
  date: string;
  workoutId: string;
  working: Array<{ weightG?: number; reps?: number; rpe?: number }>;
  bestWeightG: number;
  bestE1rm: number;
  hit: boolean;
  topHit: boolean;
  avgRpe?: number;
}

export interface ProgressionCall {
  exerciseId: string;
  exerciseName: string;
  trackingType: TrackingType;
  action: ProgressAction;
  suggestedWeightG?: number;
  suggestedReps?: number;
  suggestedSets?: number;
  why: string;
  hitRate: number;
  missStreak: number;
  stallSessions: number;
  exposuresAtLoad: number;
  typicalExposuresToProgress?: number;
  lastDate?: string;
}

export interface EasierWeekCall {
  needed: boolean;
  why: string;
  stalled: string[];
}

function workingSets(
  slice: SessionSlice,
  workoutExerciseId: string,
  excludeWarmups: boolean,
) {
  return slice.sets
    .filter(
      (set) =>
        set.workoutExerciseId === workoutExerciseId &&
        set.isCompleted &&
        (!excludeWarmups || set.setType !== "warmup"),
    )
    .sort((a, b) => a.order - b.order);
}

export function collectExposures(
  exerciseId: string,
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
  excludeWarmups: boolean,
  targetRepMin?: number,
  targetRepMax?: number,
): Exposure[] {
  const out: Exposure[] = [];
  for (const slice of slices) {
    const row = slice.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!row) continue;
    const sets = workingSets(slice, row.id, excludeWarmups);
    const pool = sets.filter((set) => set.setType === "working" || set.setType === "failure");
    const used = pool.length ? pool : sets;
    if (used.length === 0) continue;
    const best = bestOneRepMax(used, formula, { includeWarmups: !excludeWarmups });
    const bestWeightG = used.reduce((max, set) => Math.max(max, set.weightG ?? 0), 0);
    const min = targetRepMin ?? 0;
    const max = targetRepMax;
    const rpes = used.map((set) => set.rpe).filter((value): value is number => value != null);
    const qualifying = min > 0 ? used.filter((set) => (set.reps ?? 0) >= min).length : used.length;
    const hit = min > 0 ? qualifying >= Math.max(1, used.length - 1) : true;
    const topHit = max != null ? used.every((set) => (set.reps ?? 0) >= max) : false;
    out.push({
      date: slice.workout.localDate,
      workoutId: slice.workout.id,
      working: used.map((set) => ({ weightG: set.weightG, reps: set.reps, rpe: set.rpe })),
      bestWeightG,
      bestE1rm: best?.value ?? 0,
      hit,
      topHit,
      avgRpe: rpes.length ? rpes.reduce((sum, value) => sum + value, 0) / rpes.length : undefined,
    });
  }
  return out;
}

export function typicalExposuresToProgress(exposures: Exposure[]): number | undefined {
  const loads = exposures.filter((row) => row.bestWeightG > 0);
  const runs: number[] = [];
  let index = 0;
  while (index < loads.length) {
    const load = loads[index]!.bestWeightG;
    let count = 1;
    let cursor = index + 1;
    while (cursor < loads.length && Math.abs(loads[cursor]!.bestWeightG - load) < 80) {
      count += 1;
      cursor += 1;
    }
    if (cursor < loads.length && loads[cursor]!.bestWeightG > load + 80 && count >= 2) runs.push(count);
    index = cursor;
  }
  if (runs.length < 2) return undefined;
  return Math.round(runs.reduce((sum, value) => sum + value, 0) / runs.length);
}

function stallLength(exposures: Exposure[]): number {
  if (exposures.length < 3) return 0;
  const peak = Math.max(...exposures.map((row) => row.bestE1rm));
  if (peak <= 0) return 0;
  const lastPeak = [...exposures].reverse().find((row) => row.bestE1rm >= peak * 0.995);
  if (!lastPeak) return 0;
  return exposures.length - 1 - exposures.indexOf(lastPeak);
}

function exposuresAtCurrentLoad(exposures: Exposure[]): number {
  const last = exposures[exposures.length - 1];
  if (!last) return 0;
  let count = 0;
  for (let i = exposures.length - 1; i >= 0; i -= 1) {
    if (Math.abs(exposures[i]!.bestWeightG - last.bestWeightG) < 80) count += 1;
    else break;
  }
  return count;
}

export function progressExercise(opts: {
  exerciseId: string;
  exerciseName: string;
  trackingType: TrackingType;
  incrementG: number;
  targetRepMin?: number;
  targetRepMax?: number;
  targetSets?: number;
  slices: SessionSlice[];
  formula: OneRepMaxFormula;
  excludeWarmups: boolean;
}): ProgressionCall {
  const exposures = collectExposures(
    opts.exerciseId,
    opts.slices,
    opts.formula,
    opts.excludeWarmups,
    opts.targetRepMin,
    opts.targetRepMax,
  );
  const last8 = exposures.slice(-8);
  const hitRate = last8.length ? last8.filter((row) => row.hit).length / last8.length : 0;
  let missStreak = 0;
  for (let i = exposures.length - 1; i >= 0; i -= 1) {
    if (exposures[i]!.hit) break;
    missStreak += 1;
  }
  const stallSessions = stallLength(exposures);
  const typical = typicalExposuresToProgress(exposures);
  const atLoad = exposuresAtCurrentLoad(exposures);
  const last = exposures[exposures.length - 1];
  const bodyweight = opts.trackingType === "reps_only";
  const increment = opts.incrementG > 0 ? opts.incrementG : 2500;

  const base = {
    exerciseId: opts.exerciseId,
    exerciseName: opts.exerciseName,
    trackingType: opts.trackingType,
    hitRate,
    missStreak,
    stallSessions,
    exposuresAtLoad: atLoad,
    typicalExposuresToProgress: typical,
    lastDate: last?.date,
    suggestedSets: opts.targetSets,
  };

  if (!last) {
    return {
      ...base,
      action: "hold",
      why: "No prior working sets on file. Start conservative and log honestly.",
    };
  }

  const lastLoad = last.bestWeightG;
  const lastReps = last.working.reduce((max, set) => Math.max(max, set.reps ?? 0), 0);
  const recentTwo = last8.slice(-2);

  if (missStreak >= 3 || (stallSessions >= 4 && hitRate < 0.45 && last8.length >= 4)) {
    return {
      ...base,
      action: "easier_week",
      suggestedWeightG: bodyweight ? undefined : Math.round(lastLoad * 0.9),
      suggestedReps: last.working[0]?.reps,
      why:
        missStreak >= 3
          ? `Missed the target ${missStreak} sessions in a row. Drop about 10% and rebuild the hit.`
          : `Four sessions with no estimated 1RM progress and a ${Math.round(hitRate * 100)}% hit rate. Call an easier week.`,
    };
  }

  if (missStreak >= 2) {
    return {
      ...base,
      action: "deload",
      suggestedWeightG: bodyweight ? undefined : Math.round(lastLoad * 0.95),
      suggestedReps: opts.targetRepMin ?? last.working[0]?.reps,
      why: "Missed the target twice at this load. Small drop, same range, then retry.",
    };
  }

  if (typical && typical >= 2 && atLoad >= typical && last.hit && !bodyweight) {
    return {
      ...base,
      action: "add_load",
      suggestedWeightG: lastLoad + increment,
      suggestedReps: opts.targetRepMin ?? last.working[0]?.reps,
      why: `You usually progress after ${typical} exposures at a load. This is exposure ${atLoad}. Add one increment.`,
    };
  }

  if (last.topHit && (atLoad >= 2 || (recentTwo.length === 2 && recentTwo.every((row) => row.topHit)))) {
    if (bodyweight) {
      return {
        ...base,
        action: "add_reps",
        suggestedReps: lastReps + 1,
        why: "Hit the top of the range. Add a rep.",
      };
    }
    return {
      ...base,
      action: "add_load",
      suggestedWeightG: lastLoad + increment,
      suggestedReps: opts.targetRepMin ?? last.working[0]?.reps,
      why:
        atLoad >= 2
          ? "Hit the top of the range twice at this load. Add one increment."
          : "All sets hit the top of the range. Add one increment.",
    };
  }

  if (last.hit && !last.topHit) {
    const nextReps = Math.min((last.working[0]?.reps ?? lastReps) + 1, opts.targetRepMax ?? lastReps + 1);
    return {
      ...base,
      action: "add_reps",
      suggestedWeightG: lastLoad || undefined,
      suggestedReps: nextReps,
      why: "In range, not yet at the top. Same load, push a rep.",
    };
  }

  if (last.hit) {
    return {
      ...base,
      action: "hold",
      suggestedWeightG: lastLoad || undefined,
      suggestedReps: last.working[0]?.reps,
      why: "Last session hit. Repeat the load and confirm it.",
    };
  }

  return {
    ...base,
    action: "hold",
    suggestedWeightG: lastLoad || undefined,
    suggestedReps: last.working[0]?.reps,
    why: "One miss isn't a stall. Repeat the load.",
  };
}

export function progressBoard(
  targets: Array<{
    exerciseId: string;
    exerciseName: string;
    trackingType: TrackingType;
    incrementG: number;
    targetRepMin?: number;
    targetRepMax?: number;
    targetSets?: number;
  }>,
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
  excludeWarmups: boolean,
): ProgressionCall[] {
  return targets.map((target) =>
    progressExercise({
      ...target,
      slices,
      formula,
      excludeWarmups,
    }),
  );
}

export function easierWeekCall(calls: ProgressionCall[]): EasierWeekCall {
  const stalled = calls.filter((call) => call.action === "easier_week" || call.action === "deload");
  if (stalled.length >= 2) {
    return {
      needed: true,
      stalled: stalled.map((call) => call.exerciseName),
      why: `${stalled.map((call) => call.exerciseName).join(", ")} are missing targets. Take an easier week: about 10% off the bar, same reps.`,
    };
  }
  const harsh = calls.filter((call) => call.missStreak >= 2 || call.stallSessions >= 4);
  if (harsh.length >= 3) {
    return {
      needed: true,
      stalled: harsh.map((call) => call.exerciseName),
      why: "Hit rate is slipping across the board. One easier week now is cheaper than three stalled ones later.",
    };
  }
  return { needed: false, why: "", stalled: [] };
}

export function actionLabel(action: ProgressAction): string {
  if (action === "add_load") return "Add load";
  if (action === "add_reps") return "Add reps";
  if (action === "deload") return "Drop load";
  if (action === "easier_week") return "Easier week";
  return "Hold";
}
