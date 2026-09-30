import { e1rmProvenance, type E1rmProvenance } from "@/domain/provenance";
import { bestOneRepMax } from "@/domain/oneRepMax";
import type { OneRepMaxFormula } from "@/domain/types";
import type { SessionSlice } from "./analytics";

/**
 * Opp 4: the receipt behind an estimated 1RM on screen, and behind a record. It reads the same
 * sets, rules and formula the number came from (`bestOneRepMax`, warm-ups left out as in
 * `e1rmSeries` and `detectPrsForWorkout`), so the receipt can never disagree with the number.
 */

export interface E1rmPoint {
  date: string;
  workoutId: string;
  valueG: number;
  weightG: number;
  reps: number;
}

export interface E1rmReceipt {
  exerciseId: string;
  date: string;
  workoutId: string;
  provenance: E1rmProvenance;
  /** The lift's best estimate in each session on file, oldest first. */
  trend: E1rmPoint[];
  /** The best estimate before this session, the one a record beats; absent for a first session. */
  previous?: E1rmPoint;
}

function pointFor(slice: SessionSlice, exerciseId: string, formula: OneRepMaxFormula): E1rmPoint | null {
  const row = slice.exercises.find((exercise) => exercise.exerciseId === exerciseId);
  if (!row) return null;
  const best = bestOneRepMax(
    slice.sets.filter((set) => set.workoutExerciseId === row.id),
    formula,
  );
  if (!best) return null;
  return {
    date: slice.workout.localDate,
    workoutId: slice.workout.id,
    valueG: best.value,
    weightG: best.set.weightG ?? 0,
    reps: best.set.reps ?? 0,
  };
}

/** The receipt for one lift in one session, or null when that session has no such lift. */
export function e1rmReceipt(
  exerciseId: string,
  workoutId: string,
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
): E1rmReceipt | null {
  const current = slices.find((slice) => slice.workout.id === workoutId);
  const row = current?.exercises.find((exercise) => exercise.exerciseId === exerciseId);
  if (!current || !row) return null;
  const trend: E1rmPoint[] = [];
  let previous: E1rmPoint | undefined;
  for (const slice of slices) {
    const point = pointFor(slice, exerciseId, formula);
    if (!point) continue;
    trend.push(point);
    if (slice.workout.startedAt < current.workout.startedAt && (!previous || point.valueG > previous.valueG)) {
      previous = point;
    }
  }
  trend.sort((a, b) => a.date.localeCompare(b.date));
  return {
    exerciseId,
    date: current.workout.localDate,
    workoutId,
    provenance: e1rmProvenance(
      current.sets.filter((set) => set.workoutExerciseId === row.id),
      formula,
    ),
    trend,
    previous,
  };
}

/** The receipt for the latest session of a lift that produced an estimate, or null. */
export function latestE1rmReceipt(
  exerciseId: string,
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
): E1rmReceipt | null {
  let latest: SessionSlice | undefined;
  for (const slice of slices) {
    if (!pointFor(slice, exerciseId, formula)) continue;
    if (
      !latest ||
      slice.workout.localDate > latest.workout.localDate ||
      (slice.workout.localDate === latest.workout.localDate && slice.workout.startedAt > latest.workout.startedAt)
    ) {
      latest = slice;
    }
  }
  return latest ? e1rmReceipt(exerciseId, latest.workout.id, slices, formula) : null;
}
