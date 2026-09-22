import { estimateOneRepMax } from "@/domain/oneRepMax";
import type { OneRepMaxFormula, Workout, WorkoutSet } from "@/domain/types";
import { formatWeight, type WeightUnit } from "@/domain/units";
import type { SessionSlice } from "./analytics";

export interface GhostSet {
  weightG?: number;
  reps?: number;
  rpe?: number;
}

export type GhostVerdict = "beat" | "tie" | "behind" | "new";

export interface GhostCompare {
  verdict: GhostVerdict;
  label: string;
  weightDeltaG: number;
  repsDelta: number;
}

export function findGhostSlice(
  slices: SessionSlice[],
  opts: { templateId?: string; beatWorkoutId?: string; name?: string; beforeIso?: string },
): SessionSlice | undefined {
  if (opts.beatWorkoutId) {
    return slices.find((slice) => slice.workout.id === opts.beatWorkoutId);
  }
  const prior = [...slices]
    .filter((slice) => (opts.beforeIso ? slice.workout.startedAt < opts.beforeIso : true))
    .reverse();
  if (opts.templateId) {
    const same = prior.find((slice) => slice.workout.templateId === opts.templateId);
    if (same) return same;
  }
  if (opts.name) {
    const named = prior.find((slice) => slice.workout.name === opts.name);
    if (named) return named;
  }
  return undefined;
}

export function ghostSetsForExercise(slice: SessionSlice | undefined, exerciseId: string): GhostSet[] {
  if (!slice) return [];
  const row = slice.exercises.find((exercise) => exercise.exerciseId === exerciseId);
  if (!row) return [];
  return slice.sets
    .filter((set) => set.workoutExerciseId === row.id && set.isCompleted && set.setType !== "warmup")
    .sort((a, b) => a.order - b.order)
    .map((set) => ({ weightG: set.weightG, reps: set.reps, rpe: set.rpe }));
}

export function formatGhostSet(set: GhostSet | undefined, unit: WeightUnit): string {
  if (!set) return "—";
  if (set.weightG) return `${formatWeight(set.weightG, unit)}×${set.reps ?? "—"}`;
  if (set.reps != null) return `${set.reps}r`;
  return "—";
}

export function compareSet(
  current: { weightG?: number; reps?: number },
  ghost?: GhostSet,
): GhostCompare {
  if (!ghost || ((ghost.weightG ?? 0) === 0 && (ghost.reps ?? 0) === 0)) {
    return { verdict: "new", label: "First time", weightDeltaG: 0, repsDelta: 0 };
  }
  const weightDeltaG = (current.weightG ?? 0) - (ghost.weightG ?? 0);
  const repsDelta = (current.reps ?? 0) - (ghost.reps ?? 0);
  const bits: string[] = [];
  if (weightDeltaG !== 0) {
    const kg = Math.abs(weightDeltaG) / 1000;
    bits.push(`${weightDeltaG > 0 ? "+" : "−"}${trim(kg)} kg`);
  }
  if (repsDelta !== 0) {
    bits.push(`${repsDelta > 0 ? "+" : ""}${repsDelta} rep${Math.abs(repsDelta) === 1 ? "" : "s"}`);
  }
  if (weightDeltaG > 0 || (weightDeltaG === 0 && repsDelta > 0)) {
    return { verdict: "beat", label: bits.join(" · ") || "beat", weightDeltaG, repsDelta };
  }
  if (weightDeltaG === 0 && repsDelta === 0) {
    return { verdict: "tie", label: "tied last time", weightDeltaG, repsDelta };
  }
  return { verdict: "behind", label: bits.join(" · ") || "behind", weightDeltaG, repsDelta };
}

export interface WorkoutDiffLine {
  exerciseId: string;
  exerciseName: string;
  summary: string;
  verdict: GhostVerdict;
  ghostDate?: string;
}

export interface WorkoutDiff {
  ghost?: { id: string; name: string; date: string };
  headline: string;
  lines: WorkoutDiffLine[];
  score: { beat: number; tie: number; behind: number; new: number };
}

export function workoutDiff(
  current: SessionSlice,
  slices: SessionSlice[],
  unit: WeightUnit,
): WorkoutDiff {
  const ghost = findGhostSlice(slices, {
    beatWorkoutId: current.workout.beatWorkoutId,
    templateId: current.workout.templateId,
    name: current.workout.name,
    beforeIso: current.workout.startedAt,
  });
  const score = { beat: 0, tie: 0, behind: 0, new: 0 };
  const lines: WorkoutDiffLine[] = [];
  for (const exercise of current.exercises.sort((a, b) => a.order - b.order)) {
    const nowSets = current.sets
      .filter((set) => set.workoutExerciseId === exercise.id && set.isCompleted && set.setType !== "warmup")
      .sort((a, b) => a.order - b.order);
    const prior = ghostSetsForExercise(ghost, exercise.exerciseId);
    if (nowSets.length === 0 && prior.length === 0) continue;
    const nowBest = bestWorking(nowSets);
    const ghostBest = prior[0] ? bestGhost(prior) : undefined;
    const cmp = compareSet(nowBest, ghostBest);
    score[cmp.verdict] += 1;
    const nowLabel = formatGhostSet(nowBest, unit);
    const ghostLabel = formatGhostSet(ghostBest, unit);
    const summary =
      cmp.verdict === "new"
        ? `${nowLabel} — first time on file`
        : `${ghostLabel} → ${nowLabel} (${cmp.label})`;
    lines.push({
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseNameSnapshot,
      summary,
      verdict: cmp.verdict,
      ghostDate: ghost?.workout.localDate,
    });
  }
  const headline = !ghost
    ? "No comparable session on file."
    : score.beat > score.behind
      ? `Beat the last ${ghost.workout.name}.`
      : score.behind > score.beat
        ? `Behind the last ${ghost.workout.name}.`
        : `Even with the last ${ghost.workout.name}.`;
  return {
    ghost: ghost ? { id: ghost.workout.id, name: ghost.workout.name, date: ghost.workout.localDate } : undefined,
    headline,
    lines,
    score,
  };
}

function bestWorking(sets: WorkoutSet[]): GhostSet {
  return sets.reduce<GhostSet>(
    (best, set) => {
      const score = (set.weightG ?? 0) * 100 + (set.reps ?? 0);
      const current = (best.weightG ?? 0) * 100 + (best.reps ?? 0);
      return score >= current ? { weightG: set.weightG, reps: set.reps, rpe: set.rpe } : best;
    },
    { weightG: 0, reps: 0 },
  );
}

function bestGhost(sets: GhostSet[]): GhostSet {
  return sets.reduce((best, set) => {
    const score = (set.weightG ?? 0) * 100 + (set.reps ?? 0);
    const current = (best.weightG ?? 0) * 100 + (best.reps ?? 0);
    return score >= current ? set : best;
  });
}

export function wouldBePr(opts: {
  weightG?: number;
  reps?: number;
  extraReps?: number;
  extraWeightG?: number;
  exerciseId: string;
  slices: SessionSlice[];
  formula: OneRepMaxFormula;
  excludeWarmups: boolean;
}): { would: boolean; label: string } | null {
  const reps = (opts.reps ?? 0) + (opts.extraReps ?? 0);
  const weight = (opts.weightG ?? 0) + (opts.extraWeightG ?? 0);
  const estimate = estimateOneRepMax(weight, reps, opts.formula);
  if (!estimate) return null;
  let best = 0;
  for (const slice of opts.slices) {
    const row = slice.exercises.find((exercise) => exercise.exerciseId === opts.exerciseId);
    if (!row) continue;
    for (const set of slice.sets) {
      if (set.workoutExerciseId !== row.id || !set.isCompleted) continue;
      if (opts.excludeWarmups && set.setType === "warmup") continue;
      const value = estimateOneRepMax(set.weightG ?? 0, set.reps ?? 0, opts.formula);
      if (value && value.value > best) best = value.value;
    }
  }
  if (estimate.value > best) {
    return { would: true, label: "new e1RM" };
  }
  return { would: false, label: "not a record" };
}

export function ghostHeader(workout: Workout, ghost?: SessionSlice): string {
  if (workout.beatWorkoutId && ghost) return `Beat this · ${ghost.workout.localDate}`;
  if (ghost) return `Ghost · ${ghost.workout.localDate}`;
  return "No ghost on file";
}

function trim(value: number): string {
  return String(Math.round(value * 100) / 100).replace(/\.0+$/, "");
}
