import { bestOneRepMax, estimateOneRepMax } from "@/domain/oneRepMax";
import { REP_BRACKETS, type RepBracket } from "@/domain/records";
import type { OneRepMaxFormula, UUID, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { isWithin, type DateRange } from "@/domain/time";
import {
  attributeVolumeByMuscle,
  isoWeekKey,
  monthKey,
  totalsForGroups,
  type MuscleAttribution,
  type VolumeTotals,
} from "@/domain/volume";

/**
 * Analytics aggregation.
 *
 * Everything here is a pure function over stored workouts and sets. Nothing is persisted:
 * charts are recomputed on read, so editing or deleting a workout immediately and
 * correctly changes every number derived from it.
 */

export interface LoggedEntry {
  workout: Workout;
  exercise: WorkoutExercise;
  sets: WorkoutSet[];
}

export interface AnalyticsOptions {
  formula: OneRepMaxFormula;
  includeWarmups: boolean;
  secondaryCredit: number;
}

export function filterByRange(entries: readonly LoggedEntry[], range: DateRange): LoggedEntry[] {
  return entries.filter((entry) => {
    const date = new Date(entry.workout.startedAt);
    return !Number.isNaN(date.getTime()) && isWithin(range, date);
  });
}

export interface PeriodSummary extends VolumeTotals {
  workouts: number;
}

export function summarise(
  entries: readonly LoggedEntry[],
  options: AnalyticsOptions,
): PeriodSummary {
  const totals = totalsForGroups(
    entries.map((entry) => ({ exercise: entry.exercise, sets: entry.sets })),
    { includeWarmups: options.includeWarmups },
  );
  return { ...totals, workouts: new Set(entries.map((entry) => entry.workout.id)).size };
}

export interface SeriesPoint {
  /** ISO date of the workout, used for sorting. */
  date: string;
  label: string;
  value: number;
  detail?: string;
}

export interface ExerciseProgress {
  oneRepMax: SeriesPoint[];
  bestWeight: SeriesPoint[];
  volume: SeriesPoint[];
  totalReps: SeriesPoint[];
  repMaxes: Array<{ reps: RepBracket; weightG: number; date: string }>;
}

const DAY_LABEL: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

function labelFor(date: Date): string {
  return new Intl.DateTimeFormat(undefined, DAY_LABEL).format(date);
}

/** Per-workout progression for a single exercise. One point per session. */
export function exerciseProgress(
  entries: readonly LoggedEntry[],
  exerciseId: UUID,
  options: AnalyticsOptions,
): ExerciseProgress {
  const relevant = entries
    .filter(
      (entry) =>
        entry.exercise.exerciseId === exerciseId &&
        !Number.isNaN(new Date(entry.workout.startedAt).getTime()),
    )
    .sort((a, b) => a.workout.startedAt.localeCompare(b.workout.startedAt));

  const oneRepMax: SeriesPoint[] = [];
  const bestWeight: SeriesPoint[] = [];
  const volume: SeriesPoint[] = [];
  const totalReps: SeriesPoint[] = [];
  const repMaxes = new Map<RepBracket, { weightG: number; date: string }>();

  // Several entries can share a workout (the same exercise added twice); merge by workout.
  const byWorkout = new Map<string, LoggedEntry[]>();
  for (const entry of relevant) {
    const bucket = byWorkout.get(entry.workout.id);
    if (bucket) bucket.push(entry);
    else byWorkout.set(entry.workout.id, [entry]);
  }

  for (const [, group] of byWorkout) {
    const workout = group[0]!.workout;
    const date = new Date(workout.startedAt);
    const label = labelFor(date);
    const sets = group
      .flatMap((entry) => entry.sets)
      .filter((set) => set.isCompleted && (options.includeWarmups || set.setType !== "warmup"));

    const best = bestOneRepMax(sets, options.formula, { includeWarmups: options.includeWarmups });
    if (best) {
      oneRepMax.push({
        date: workout.startedAt,
        label,
        value: best.value,
        detail: `${best.set.weightG ?? 0} g × ${best.set.reps ?? 0} (${best.formulaUsed})`,
      });
    }

    const heaviest = sets.reduce<WorkoutSet | null>(
      (top, set) => ((set.weightG ?? 0) > (top?.weightG ?? 0) ? set : top),
      null,
    );
    if (heaviest?.weightG) {
      bestWeight.push({
        date: workout.startedAt,
        label,
        value: heaviest.weightG,
        detail: `${heaviest.reps ?? 0} reps`,
      });
    }

    const sessionVolume = sets.reduce((sum, set) => sum + (set.weightG ?? 0) * (set.reps ?? 0), 0);
    if (sessionVolume > 0) volume.push({ date: workout.startedAt, label, value: sessionVolume });

    const reps = sets.reduce((sum, set) => sum + (set.reps ?? 0), 0);
    if (reps > 0) totalReps.push({ date: workout.startedAt, label, value: reps });

    for (const set of sets) {
      const weightG = set.weightG ?? 0;
      const setReps = set.reps ?? 0;
      if (weightG <= 0 || setReps <= 0) continue;
      for (const bracket of REP_BRACKETS) {
        if (setReps < bracket) continue;
        const existing = repMaxes.get(bracket);
        if (!existing || weightG > existing.weightG) {
          repMaxes.set(bracket, { weightG, date: workout.startedAt });
        }
      }
    }
  }

  return {
    oneRepMax,
    bestWeight,
    volume,
    totalReps,
    repMaxes: [...repMaxes.entries()]
      .map(([reps, value]) => ({ reps, ...value }))
      .sort((a, b) => a.reps - b.reps),
  };
}

export interface PeriodBucket {
  key: string;
  /** ISO timestamp at the start of the represented week or month. */
  date: string;
  label: string;
  volumeG: number;
  sets: number;
  workouts: number;
}

/** Volume bucketed by ISO week or calendar month. */
export function bucketVolume(
  entries: readonly LoggedEntry[],
  granularity: "week" | "month",
  options: AnalyticsOptions,
): PeriodBucket[] {
  const buckets = new Map<string, PeriodBucket & { workoutIds: Set<string> }>();

  for (const entry of entries) {
    const date = new Date(entry.workout.startedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = granularity === "week" ? isoWeekKey(date) : monthKey(date);
    const bucket = buckets.get(key) ?? {
      key,
      date: periodStart(date, granularity).toISOString(),
      label: granularity === "week" ? weekLabel(date) : monthLabel(date),
      volumeG: 0,
      sets: 0,
      workouts: 0,
      workoutIds: new Set<string>(),
    };

    const totals = totalsForGroups([{ exercise: entry.exercise, sets: entry.sets }], {
      includeWarmups: options.includeWarmups,
    });
    bucket.volumeG += totals.volumeG;
    bucket.sets += totals.completedSets;
    bucket.workoutIds.add(entry.workout.id);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map(({ workoutIds, ...bucket }) => ({ ...bucket, workouts: workoutIds.size }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function periodStart(date: Date, granularity: "week" | "month"): Date {
  const start = new Date(date);
  if (granularity === "month") {
    start.setDate(1);
  } else {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

function weekLabel(date: Date): string {
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - (day - 1));
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(monday);
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(date);
}

export function muscleBreakdown(
  entries: readonly LoggedEntry[],
  options: AnalyticsOptions,
): MuscleAttribution[] {
  return attributeVolumeByMuscle(
    entries.map((entry) => ({ exercise: entry.exercise, sets: entry.sets })),
    { includeWarmups: options.includeWarmups, secondaryCredit: options.secondaryCredit },
  );
}

export interface ExerciseOption {
  id: UUID;
  name: string;
  sessions: number;
  lastPerformed: string;
}

export function exerciseOptions(entries: readonly LoggedEntry[]): ExerciseOption[] {
  const map = new Map<UUID, ExerciseOption & { workoutIds: Set<string> }>();
  for (const entry of entries) {
    const existing = map.get(entry.exercise.exerciseId) ?? {
      id: entry.exercise.exerciseId,
      name: entry.exercise.exerciseNameSnapshot,
      sessions: 0,
      lastPerformed: entry.workout.startedAt,
      workoutIds: new Set<string>(),
    };
    existing.workoutIds.add(entry.workout.id);
    if (entry.workout.startedAt > existing.lastPerformed)
      existing.lastPerformed = entry.workout.startedAt;
    map.set(entry.exercise.exerciseId, existing);
  }
  return [...map.values()]
    .map(({ workoutIds, ...option }) => ({ ...option, sessions: workoutIds.size }))
    .sort((a, b) => b.lastPerformed.localeCompare(a.lastPerformed));
}

/** Percentage change between two period totals; null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Best estimated 1RM across a flat set list — used by the exercise detail header. */
export function bestEstimate(
  sets: readonly WorkoutSet[],
  formula: OneRepMaxFormula,
  includeWarmups: boolean,
): number | null {
  let best: number | null = null;
  for (const set of sets) {
    if (!set.isCompleted) continue;
    if (!includeWarmups && set.setType === "warmup") continue;
    const estimate = estimateOneRepMax(set.weightG ?? 0, set.reps ?? 0, formula);
    if (estimate && (best === null || estimate.value > best)) best = estimate.value;
  }
  return best;
}
