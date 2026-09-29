import { localDateToOrdinal } from "@/domain/time";
import type { BodyMeasurement } from "@/domain/types";
import { formatWeight, toGrams, type WeightUnit } from "@/domain/units";
import type { PersonalRecord, SessionSlice } from "./analytics";
import { e1rmSeries } from "./analytics";
import type { TrainingEra } from "./chronicle";
import { eraForDate } from "./chronicle";

export type MomentKind = "pr" | "first" | "comeback" | "era" | "streak" | "milestone";

export interface TrainingMoment {
  id: string;
  kind: MomentKind;
  date: string;
  title: string;
  kicker: string;
  detail: string;
  exerciseName?: string;
  exerciseId?: string;
  valueLabel?: string;
  workoutId?: string;
  eraName?: string;
  /** The Today card prefers these first-time milestones (the big three round numbers). */
  featured?: boolean;
}

interface Milestone {
  exerciseName: string;
  exerciseId: string;
  kind: "weight" | "reps";
  threshold: number;
  label: string;
  featured?: boolean;
}

/**
 * Round-number ladders in the lifter's own unit, not one ladder converted: 100 kg and 225 lb are milestones, 220.5 lb
 * is not. Each rung is a whole number of the unit, so the threshold in grams is what a set logged in that unit stores.
 */
const LADDERS: Record<WeightUnit, Array<{ name: string; id: string; word: string; rungs: number[]; featured: number }>> = {
  kg: [
    { name: "Bench Press", id: "seed-bench-press", word: "bench", rungs: [60, 80, 100, 120], featured: 100 },
    { name: "Back Squat", id: "seed-back-squat", word: "squat", rungs: [100, 140], featured: 140 },
    { name: "Conventional Deadlift", id: "seed-conventional-deadlift", word: "deadlift", rungs: [140, 180], featured: 180 },
    { name: "Overhead Press", id: "seed-overhead-press", word: "press", rungs: [60], featured: -1 },
  ],
  lb: [
    { name: "Bench Press", id: "seed-bench-press", word: "bench", rungs: [135, 185, 225, 275], featured: 225 },
    { name: "Back Squat", id: "seed-back-squat", word: "squat", rungs: [225, 315], featured: 315 },
    { name: "Conventional Deadlift", id: "seed-conventional-deadlift", word: "deadlift", rungs: [315, 405], featured: 405 },
    { name: "Overhead Press", id: "seed-overhead-press", word: "press", rungs: [135], featured: -1 },
  ],
};

export function milestonesFor(unit: WeightUnit): Milestone[] {
  const weights = LADDERS[unit].flatMap((lift) =>
    lift.rungs.map<Milestone>((rung) => ({
      exerciseName: lift.name,
      exerciseId: lift.id,
      kind: "weight",
      threshold: toGrams(rung, unit),
      label: `${rung} ${unit} ${lift.word}`,
      featured: rung === lift.featured,
    })),
  );
  return [...weights, { exerciseName: "Pull-Up", exerciseId: "seed-pull-up", kind: "reps", threshold: 10, label: "10 pull-ups" }];
}

export function detectMilestones(slices: SessionSlice[], unit: WeightUnit = "kg"): TrainingMoment[] {
  const hits: TrainingMoment[] = [];
  for (const milestone of milestonesFor(unit)) {
    for (const slice of slices) {
      const row = slice.exercises.find((exercise) => exercise.exerciseId === milestone.exerciseId);
      if (!row) continue;
      const sets = slice.sets.filter((set) => set.workoutExerciseId === row.id && set.isCompleted && set.setType !== "warmup");
      const crossed =
        milestone.kind === "weight"
          ? sets.some((set) => (set.weightG ?? 0) >= milestone.threshold)
          : sets.some((set) => (set.reps ?? 0) >= milestone.threshold);
      if (!crossed) continue;
      const set = sets.find((item) =>
        milestone.kind === "weight" ? (item.weightG ?? 0) >= milestone.threshold : (item.reps ?? 0) >= milestone.threshold,
      );
      hits.push({
        id: `ms-${milestone.exerciseId}-${milestone.threshold}`,
        kind: "first",
        date: slice.workout.localDate,
        title: `First ${milestone.label}`,
        kicker: "Milestone",
        detail: `The first time ${milestone.exerciseName} crossed ${milestone.label}.`,
        exerciseName: milestone.exerciseName,
        exerciseId: milestone.exerciseId,
        valueLabel:
          milestone.kind === "weight"
            ? `${formatWeight(set?.weightG ?? milestone.threshold, unit)} ${unit} × ${set?.reps ?? "—"}`
            : `${set?.reps ?? milestone.threshold} reps`,
        workoutId: slice.workout.id,
        ...(milestone.featured ? { featured: true } : {}),
      });
      break;
    }
  }
  return hits;
}

export function comebackStreak(slices: SessionSlice[]): { current: number; best: number } {
  if (slices.length === 0) return { current: 0, best: 0 };
  const dates = [...new Set(slices.map((slice) => slice.workout.localDate))].sort();
  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const gap = localDateToOrdinal(dates[i]!) - localDateToOrdinal(dates[i - 1]!);
    if (gap <= 4) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return { current, best };
}

export function buildMoments(
  slices: SessionSlice[],
  records: PersonalRecord[],
  eras: TrainingEra[],
  _measurements: BodyMeasurement[],
  unit: WeightUnit = "kg",
): TrainingMoment[] {
  const moments: TrainingMoment[] = [];
  const milestones = detectMilestones(slices, unit);
  moments.push(...milestones);

  for (const pr of records.filter((row) => row.kind === "e1rm").slice(0, 8)) {
    const era = eraForDate(eras, pr.date);
    moments.push({
      id: `pr-${pr.workoutId}-${pr.exerciseId}`,
      kind: "pr",
      date: pr.date,
      title: pr.exerciseName,
      kicker: "Estimated 1RM stamp",
      detail: era ? `Set during ${era.name}.` : "New estimated 1RM on file.",
      exerciseName: pr.exerciseName,
      exerciseId: pr.exerciseId,
      workoutId: pr.workoutId,
      eraName: era?.name,
    });
  }

  for (const era of eras) {
    moments.push({
      id: era.id,
      kind: "era",
      date: era.startDate,
      title: era.name,
      kicker: "Named era",
      detail: `${era.sessions} sessions from ${era.startDate} to ${era.endDate}.`,
      eraName: era.name,
    });
  }

  const streak = comebackStreak(slices);
  if (streak.best >= 8) {
    moments.push({
      id: "streak-best",
      kind: "streak",
      date: slices[slices.length - 1]?.workout.localDate ?? "",
      title: `${streak.best}-session consistency run`,
      kicker: "Comeback streak",
      detail: "Sessions spaced no more than four days apart.",
    });
  }

  const unique = new Map<string, TrainingMoment>();
  for (const moment of moments) unique.set(moment.id, moment);
  return [...unique.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function momentsForWorkout(
  workoutId: string,
  slices: SessionSlice[],
  records: PersonalRecord[],
  eras: TrainingEra[],
  unit: WeightUnit = "kg",
): TrainingMoment[] {
  const slice = slices.find((row) => row.workout.id === workoutId);
  if (!slice) return [];
  const all = buildMoments(slices, records, eras, [], unit);
  const workoutPrs = records.filter((row) => row.workoutId === workoutId);
  const fromPrs: TrainingMoment[] = workoutPrs.map((pr) => ({
    id: `pr-${pr.workoutId}-${pr.exerciseId}`,
    kind: "pr" as const,
    date: pr.date,
    title: pr.exerciseName,
    kicker: "New stamp",
    detail: eraForDate(eras, pr.date) ? `Locked in ${eraForDate(eras, pr.date)!.name}.` : "New estimated 1RM.",
    exerciseName: pr.exerciseName,
    exerciseId: pr.exerciseId,
    workoutId,
    eraName: eraForDate(eras, pr.date)?.name,
  }));
  const firsts = all.filter((moment) => moment.kind === "first" && moment.workoutId === workoutId);
  return [...fromPrs, ...firsts];
}

export function findMoment(id: string, moments: TrainingMoment[]): TrainingMoment | undefined {
  return moments.find((row) => row.id === id);
}

export function heaviestSetLabel(exerciseId: string, slices: SessionSlice[]): { date: string; weightG: number; reps: number } | null {
  let best: { date: string; weightG: number; reps: number } | null = null;
  for (const slice of slices) {
    const row = slice.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!row) continue;
    for (const set of slice.sets) {
      if (set.workoutExerciseId !== row.id || !set.isCompleted || set.setType === "warmup") continue;
      const weight = set.weightG ?? 0;
      if (!best || weight > best.weightG) {
        best = { date: slice.workout.localDate, weightG: weight, reps: set.reps ?? 0 };
      }
    }
  }
  return best;
}

export { e1rmSeries };
