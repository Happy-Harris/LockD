import { estimateOneRepMax } from "@/domain/oneRepMax";
import type { Exercise, OneRepMaxFormula } from "@/domain/types";
import { formatWeight, type WeightUnit } from "@/domain/units";
import type { SessionSlice } from "./analytics";

export interface RmMark {
  reps: number;
  weightG: number;
  date: string;
  workoutId: string;
}

export interface MilestoneTarget {
  id: string;
  exerciseId: string;
  name: string;
  kind: "rep_pr" | "load_pr" | "e1rm" | "named";
  current: string;
  target: string;
  how: string;
  closeness: number;
}

export interface NearMiss {
  id: string;
  exerciseId: string;
  name: string;
  setLabel: string;
  miss: string;
  wouldHaveBeen: string;
  workoutId: string;
  date: string;
}

export function rmTable(
  exerciseId: string,
  slices: SessionSlice[],
  excludeWarmups: boolean,
): RmMark[] {
  const best = new Map<number, RmMark>();
  for (const slice of slices) {
    const row = slice.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!row) continue;
    for (const set of slice.sets) {
      if (set.workoutExerciseId !== row.id || !set.isCompleted) continue;
      if (excludeWarmups && set.setType === "warmup") continue;
      const reps = set.reps ?? 0;
      const weight = set.weightG ?? 0;
      if (reps < 1 || reps > 12 || weight <= 0) continue;
      const current = best.get(reps);
      if (!current || weight > current.weightG) {
        best.set(reps, {
          reps,
          weightG: weight,
          date: slice.workout.localDate,
          workoutId: slice.workout.id,
        });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.reps - b.reps);
}

export function milestoneQueue(opts: {
  exercises: Array<Pick<Exercise, "id" | "name" | "incrementG">>;
  slices: SessionSlice[];
  formula: OneRepMaxFormula;
  excludeWarmups: boolean;
  incrementG: number;
  unit: WeightUnit;
  goalIds: string[];
}): MilestoneTarget[] {
  const ids = opts.goalIds.length ? opts.goalIds : opts.exercises.slice(0, 6).map((row) => row.id);
  const out: MilestoneTarget[] = [];
  for (const id of ids) {
    const exercise = opts.exercises.find((row) => row.id === id);
    if (!exercise) continue;
    const table = rmTable(id, opts.slices, opts.excludeWarmups);
    if (table.length === 0) continue;
    const increment = exercise.incrementG ?? opts.incrementG;
    const lastSlice = [...opts.slices].reverse().find((slice) => slice.exercises.some((row) => row.exerciseId === id));
    const lastRow = lastSlice?.exercises.find((row) => row.exerciseId === id);
    const lastSets =
      lastRow && lastSlice
        ? lastSlice.sets.filter((set) => set.workoutExerciseId === lastRow.id && set.isCompleted && set.setType !== "warmup")
        : [];
    const last = lastSets.sort((a, b) => (b.weightG ?? 0) - (a.weightG ?? 0))[0];
    if (!last?.weightG || !last.reps) continue;

    const nextReps = last.reps + 1;
    const atNext = table.find((row) => row.reps === nextReps);
    if (nextReps <= 12) {
      const ties = atNext && last.weightG >= atNext.weightG;
      const beats = atNext && last.weightG > atNext.weightG;
      if (!beats) {
        out.push({
          id: `${id}-rep-${nextReps}`,
          exerciseId: id,
          name: exercise.name,
          kind: "rep_pr",
          current: `${formatWeight(last.weightG, opts.unit)}×${last.reps}`,
          target: `${formatWeight(last.weightG, opts.unit)}×${nextReps}`,
          how: atNext
            ? ties
              ? `+1 rep ties your ${nextReps}RM`
              : `+1 rep at ${formatWeight(last.weightG, opts.unit)} ${opts.unit} to match the ${nextReps}RM`
            : `+1 rep opens a new ${nextReps}RM`,
          closeness: 0.85,
        });
      }
    }

    const nextLoad = last.weightG + increment;
    const sameReps = table.find((row) => row.reps === last.reps);
    if (!sameReps || nextLoad > sameReps.weightG) {
      out.push({
        id: `${id}-load-${last.reps}`,
        exerciseId: id,
        name: exercise.name,
        kind: "load_pr",
        current: `${formatWeight(last.weightG, opts.unit)}×${last.reps}`,
        target: `${formatWeight(nextLoad, opts.unit)}×${last.reps}`,
        how: `+${formatWeight(increment, opts.unit)} ${opts.unit} is a new ${last.reps}RM`,
        closeness: 0.7,
      });
    }

    const estimate = estimateOneRepMax(last.weightG, last.reps, opts.formula);
    if (estimate) {
      const plusRep = estimateOneRepMax(last.weightG, last.reps + 1, opts.formula);
      const plusLoad = estimateOneRepMax(nextLoad, last.reps, opts.formula);
      let best = 0;
      for (const mark of table) {
        const value = estimateOneRepMax(mark.weightG, mark.reps, opts.formula);
        if (value && value.value > best) best = value.value;
      }
      if (plusRep && plusRep.value > best) {
        out.push({
          id: `${id}-e1rm-rep`,
          exerciseId: id,
          name: exercise.name,
          kind: "e1rm",
          current: formatWeight(estimate.value, opts.unit),
          target: formatWeight(plusRep.value, opts.unit),
          how: `+1 rep would be a new estimated 1RM`,
          closeness: 0.9,
        });
      } else if (plusLoad && plusLoad.value > best) {
        out.push({
          id: `${id}-e1rm-load`,
          exerciseId: id,
          name: exercise.name,
          kind: "e1rm",
          current: formatWeight(estimate.value, opts.unit),
          target: formatWeight(plusLoad.value, opts.unit),
          how: `+${formatWeight(increment, opts.unit)} ${opts.unit} would be a new estimated 1RM`,
          closeness: 0.6,
        });
      }
    }
  }
  const unique = new Map<string, MilestoneTarget>();
  for (const row of out.sort((a, b) => b.closeness - a.closeness)) unique.set(row.id, row);
  return [...unique.values()].slice(0, 8);
}

export function nearMisses(opts: {
  slice: SessionSlice;
  slices: SessionSlice[];
  formula: OneRepMaxFormula;
  excludeWarmups: boolean;
  incrementG: number;
  unit: WeightUnit;
}): NearMiss[] {
  const prior = opts.slices.filter((slice) => slice.workout.startedAt < opts.slice.workout.startedAt);
  const misses: NearMiss[] = [];
  for (const exercise of opts.slice.exercises) {
    const table = rmTable(exercise.exerciseId, prior, opts.excludeWarmups);
    const sets = opts.slice.sets
      .filter((set) => set.workoutExerciseId === exercise.id && set.isCompleted && set.setType !== "warmup")
      .sort((a, b) => a.order - b.order);
    for (const set of sets) {
      if (!set.weightG || !set.reps) continue;
      const plusRep = set.reps + 1;
      const mark = table.find((row) => row.reps === plusRep);
      if (mark && set.weightG >= mark.weightG) {
        misses.push({
          id: `${set.id}-rep`,
          exerciseId: exercise.exerciseId,
          name: exercise.exerciseNameSnapshot,
          setLabel: `${formatWeight(set.weightG, opts.unit)}×${set.reps}`,
          miss: `One more rep would have ${set.weightG > mark.weightG ? "beaten" : "tied"} your ${plusRep}RM`,
          wouldHaveBeen: `${formatWeight(set.weightG, opts.unit)}×${plusRep}`,
          workoutId: opts.slice.workout.id,
          date: opts.slice.workout.localDate,
        });
      }
      const plusLoad = set.weightG + opts.incrementG;
      const same = table.find((row) => row.reps === set.reps);
      if (same && plusLoad > same.weightG && set.weightG < same.weightG + opts.incrementG) {
        misses.push({
          id: `${set.id}-load`,
          exerciseId: exercise.exerciseId,
          name: exercise.exerciseNameSnapshot,
          setLabel: `${formatWeight(set.weightG, opts.unit)}×${set.reps}`,
          miss: `+${formatWeight(opts.incrementG, opts.unit)} ${opts.unit} would have been a new ${set.reps}RM`,
          wouldHaveBeen: `${formatWeight(plusLoad, opts.unit)}×${set.reps}`,
          workoutId: opts.slice.workout.id,
          date: opts.slice.workout.localDate,
        });
      }
    }
  }
  return misses.slice(0, 6);
}
