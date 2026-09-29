import { bestOneRepMax, estimateOneRepMax } from "@/domain/oneRepMax";
import { HEATMAP_MUSCLES } from "@/domain/taxonomy";
import { addDays, localDateOf, localDateToOrdinal, startOfTrainingWeek } from "@/domain/time";
import type {
  AppSettings,
  Exercise,
  MuscleGroup,
  OneRepMaxFormula,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@/domain/types";
import { attributeMuscleVolume, hardSetCount, totalsForGroups } from "@/domain/volume";

export interface SessionSlice {
  workout: Workout;
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
}

export function sliceSessions(
  workouts: Workout[],
  workoutExercises: WorkoutExercise[],
  workoutSets: WorkoutSet[],
): SessionSlice[] {
  const completed = workouts.filter((workout) => workout.status === "completed");
  return completed
    .map((workout) => ({
      workout,
      exercises: workoutExercises.filter((row) => row.workoutId === workout.id),
      sets: workoutSets.filter((row) => row.workoutId === workout.id),
    }))
    .sort((a, b) => a.workout.localDate.localeCompare(b.workout.localDate));
}

/**
 * External-load tonnage of a session, in gram-reps. Tracking-type aware: only `weight_reps`
 * sets count, so assisted-weight sets (which record the assistance, not the load lifted) and
 * bodyweight, duration and distance sets add nothing. A set whose exercise row is missing has
 * no tracking type to judge it by and is not counted.
 */
export function workoutTonnageG(slice: SessionSlice, excludeWarmups: boolean): number {
  const groups = slice.exercises.map((exercise) => ({
    exercise,
    sets: slice.sets.filter((set) => set.workoutExerciseId === exercise.id),
  }));
  return totalsForGroups(groups, { includeWarmups: !excludeWarmups }).volumeG;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  kind: "e1rm" | "weight" | "reps";
  value: number;
  weightG?: number;
  reps?: number;
  date: string;
  workoutId: string;
}

export function computeRecords(
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
  excludeWarmups: boolean,
): PersonalRecord[] {
  const byExercise = new Map<string, PersonalRecord[]>();
  for (const slice of slices) {
    const grouped = new Map<string, { exercise: WorkoutExercise; sets: WorkoutSet[] }>();
    for (const exercise of slice.exercises) {
      grouped.set(exercise.id, {
        exercise,
        sets: slice.sets.filter((set) => set.workoutExerciseId === exercise.id),
      });
    }
    for (const { exercise, sets } of grouped.values()) {
      const best = bestOneRepMax(sets, formula, { includeWarmups: !excludeWarmups });
      const heaviest = sets
        .filter((set) => set.isCompleted && (!excludeWarmups || set.setType !== "warmup"))
        .reduce<(WorkoutSet & { weightG: number }) | null>((acc, set) => {
          const weight = set.weightG ?? 0;
          if (weight <= 0) return acc;
          if (!acc || weight > acc.weightG) return { ...set, weightG: weight };
          return acc;
        }, null);
      const list = byExercise.get(exercise.exerciseId) ?? [];
      if (best) {
        list.push({
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseNameSnapshot,
          kind: "e1rm",
          value: best.value,
          weightG: best.set.weightG,
          reps: best.set.reps,
          date: slice.workout.localDate,
          workoutId: slice.workout.id,
        });
      }
      if (heaviest) {
        list.push({
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseNameSnapshot,
          kind: "weight",
          value: heaviest.weightG,
          weightG: heaviest.weightG,
          reps: heaviest.reps,
          date: slice.workout.localDate,
          workoutId: slice.workout.id,
        });
      }
      byExercise.set(exercise.exerciseId, list);
    }
  }

  const records: PersonalRecord[] = [];
  for (const list of byExercise.values()) {
    for (const kind of ["e1rm", "weight"] as const) {
      const ofKind = list.filter((row) => row.kind === kind);
      if (ofKind.length === 0) continue;
      ofKind.sort((a, b) => b.value - a.value);
      records.push(ofKind[0]!);
    }
  }
  return records.sort((a, b) => b.date.localeCompare(a.date));
}

export function detectPrsForWorkout(
  workoutId: string,
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
): PersonalRecord[] {
  const current = slices.find((slice) => slice.workout.id === workoutId);
  if (!current) return [];
  const prior = slices.filter((slice) => slice.workout.startedAt < current.workout.startedAt);
  const priorBest = new Map<string, number>();
  for (const slice of prior) {
    for (const exercise of slice.exercises) {
      const sets = slice.sets.filter((set) => set.workoutExerciseId === exercise.id);
      const best = bestOneRepMax(sets, formula);
      if (!best) continue;
      const prev = priorBest.get(exercise.exerciseId) ?? 0;
      if (best.value > prev) priorBest.set(exercise.exerciseId, best.value);
    }
  }
  const hits: PersonalRecord[] = [];
  for (const exercise of current.exercises) {
    const sets = current.sets.filter((set) => set.workoutExerciseId === exercise.id);
    const best = bestOneRepMax(sets, formula);
    if (!best) continue;
    // First time on file is the baseline, not a record: there is nothing earlier to beat.
    const prev = priorBest.get(exercise.exerciseId);
    if (prev !== undefined && best.value > prev) {
      hits.push({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseNameSnapshot,
        kind: "e1rm",
        value: best.value,
        weightG: best.set.weightG,
        reps: best.set.reps,
        date: current.workout.localDate,
        workoutId,
      });
    }
  }
  return hits;
}

export interface WeeklyPoint {
  weekStart: string;
  sessions: number;
  hardSets: number;
  tonnageG: number;
}

export function weeklySeries(slices: SessionSlice[], weekStartDay: AppSettings["weekStartDay"]): WeeklyPoint[] {
  const buckets = new Map<string, WeeklyPoint>();
  for (const slice of slices) {
    const [y, m, d] = slice.workout.localDate.split("-").map(Number);
    const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
    const start = localDateOf(startOfTrainingWeek(date, weekStartDay));
    const current = buckets.get(start) ?? { weekStart: start, sessions: 0, hardSets: 0, tonnageG: 0 };
    current.sessions += 1;
    current.hardSets += hardSetCount(slice.sets);
    current.tonnageG += workoutTonnageG(slice, true);
    buckets.set(start, current);
  }
  return [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function muscleSetMap(
  slices: SessionSlice[],
  rangeStart: string,
  rangeEnd: string,
  secondaryCredit: number,
): Record<MuscleGroup, number> {
  const totals = Object.fromEntries(HEATMAP_MUSCLES.map((muscle) => [muscle, 0])) as Record<MuscleGroup, number>;
  for (const slice of slices) {
    if (slice.workout.localDate < rangeStart || slice.workout.localDate > rangeEnd) continue;
    for (const exercise of slice.exercises) {
      const sets = slice.sets.filter((set) => set.workoutExerciseId === exercise.id);
      const attributed = attributeMuscleVolume(
        sets,
        exercise.primaryMuscleGroupSnapshot,
        exercise.secondaryMuscleGroupsSnapshot,
        secondaryCredit,
      );
      for (const [muscle, value] of Object.entries(attributed)) {
        const key = muscle as MuscleGroup;
        if (key in totals) totals[key] += value;
      }
    }
  }
  return totals;
}

export interface HeatDay {
  date: string;
  sessions: number;
  tonnageG: number;
}

export function calendarHeat(slices: SessionSlice[], days = 84, reference = new Date()): HeatDay[] {
  const end = localDateOf(reference);
  const startOrd = localDateToOrdinal(end) - (days - 1);
  const map = new Map<string, HeatDay>();
  for (const slice of slices) {
    const current = map.get(slice.workout.localDate) ?? {
      date: slice.workout.localDate,
      sessions: 0,
      tonnageG: 0,
    };
    current.sessions += 1;
    current.tonnageG += workoutTonnageG(slice, true);
    map.set(slice.workout.localDate, current);
  }
  const result: HeatDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = ordinalToDate(startOrd + i);
    result.push(map.get(date) ?? { date, sessions: 0, tonnageG: 0 });
  }
  return result;
}

function ordinalToDate(ordinal: number): string {
  const date = new Date(ordinal * 86_400_000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function streakDays(slices: SessionSlice[], reference = new Date()): number {
  if (slices.length === 0) return 0;
  const dates = new Set(slices.map((slice) => slice.workout.localDate));
  let cursor = localDateOf(reference);
  if (!dates.has(cursor)) {
    const yesterday = localDateOf(addDays(reference, -1));
    if (!dates.has(yesterday)) return 0;
    cursor = yesterday;
  }
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    const [y, m, d] = cursor.split("-").map(Number);
    cursor = localDateOf(addDays(new Date(y!, (m ?? 1) - 1, d ?? 1), -1));
  }
  return streak;
}

export function sessionCountStreak(slices: SessionSlice[]): number {
  if (slices.length === 0) return 0;
  const dates = [...new Set(slices.map((slice) => slice.workout.localDate))].sort();
  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const gap = localDateToOrdinal(dates[i]!) - localDateToOrdinal(dates[i - 1]!);
    if (gap <= 3) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return dates.length;
}

export interface PreviousSet {
  weightG?: number;
  reps?: number;
  rpe?: number;
}

export function previousSetsForExercise(
  exerciseId: string,
  slices: SessionSlice[],
  beforeIso?: string,
): PreviousSet[] {
  const prior = [...slices]
    .filter((slice) => (beforeIso ? slice.workout.startedAt < beforeIso : true))
    .reverse();
  for (const slice of prior) {
    const row = slice.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!row) continue;
    const sets = slice.sets
      .filter((set) => set.workoutExerciseId === row.id && set.isCompleted && set.setType !== "warmup")
      .sort((a, b) => a.order - b.order);
    if (sets.length === 0) continue;
    return sets.map((set) => ({ weightG: set.weightG, reps: set.reps, rpe: set.rpe }));
  }
  return [];
}

export function suggestNextLoad(
  previous: PreviousSet[],
  incrementG: number,
  targetRepMax?: number,
): { weightG?: number; reps?: number; reason: string } {
  if (previous.length === 0) return { reason: "No prior working sets on file." };
  const last = previous[previous.length - 1]!;
  const allHitTop =
    targetRepMax != null && previous.every((set) => (set.reps ?? 0) >= targetRepMax);
  if (allHitTop && last.weightG) {
    return {
      weightG: last.weightG + incrementG,
      reps: previous[0]?.reps,
      reason: `All sets hit ${targetRepMax}. Add one increment.`,
    };
  }
  return {
    weightG: last.weightG,
    reps: last.reps,
    reason: "Repeat last load.",
  };
}

export function e1rmSeries(
  exerciseId: string,
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
): Array<{ date: string; value: number; label: string }> {
  const points: Array<{ date: string; value: number; label: string }> = [];
  for (const slice of slices) {
    const row = slice.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!row) continue;
    const sets = slice.sets.filter((set) => set.workoutExerciseId === row.id);
    const best = bestOneRepMax(sets, formula);
    if (!best) continue;
    points.push({
      date: slice.workout.localDate,
      value: best.value,
      label: `${best.set.weightG}×${best.set.reps}`,
    });
  }
  return points;
}

export function estimateFromSet(weightG: number, reps: number, formula: OneRepMaxFormula): number | null {
  return estimateOneRepMax(weightG, reps, formula)?.value ?? null;
}

export function findExercise(exercises: Exercise[], id: string): Exercise | undefined {
  return exercises.find((exercise) => exercise.id === id);
}
