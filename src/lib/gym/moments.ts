import { localDateToOrdinal } from "@/domain/time";
import type { BodyMeasurement } from "@/domain/types";
import { toGrams } from "@/domain/units";
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
}

interface Milestone {
  exerciseName: string;
  exerciseId: string;
  kind: "weight" | "reps";
  threshold: number;
  label: string;
}

const MILESTONES: Milestone[] = [
  { exerciseName: "Bench Press", exerciseId: "seed-bench-press", kind: "weight", threshold: toGrams(60, "kg"), label: "60 kg bench" },
  { exerciseName: "Bench Press", exerciseId: "seed-bench-press", kind: "weight", threshold: toGrams(80, "kg"), label: "80 kg bench" },
  { exerciseName: "Bench Press", exerciseId: "seed-bench-press", kind: "weight", threshold: toGrams(100, "kg"), label: "100 kg bench" },
  { exerciseName: "Bench Press", exerciseId: "seed-bench-press", kind: "weight", threshold: toGrams(120, "kg"), label: "120 kg bench" },
  { exerciseName: "Back Squat", exerciseId: "seed-back-squat", kind: "weight", threshold: toGrams(100, "kg"), label: "100 kg squat" },
  { exerciseName: "Back Squat", exerciseId: "seed-back-squat", kind: "weight", threshold: toGrams(140, "kg"), label: "140 kg squat" },
  { exerciseName: "Conventional Deadlift", exerciseId: "seed-conventional-deadlift", kind: "weight", threshold: toGrams(140, "kg"), label: "140 kg deadlift" },
  { exerciseName: "Conventional Deadlift", exerciseId: "seed-conventional-deadlift", kind: "weight", threshold: toGrams(180, "kg"), label: "180 kg deadlift" },
  { exerciseName: "Overhead Press", exerciseId: "seed-overhead-press", kind: "weight", threshold: toGrams(60, "kg"), label: "60 kg press" },
  { exerciseName: "Pull-Up", exerciseId: "seed-pull-up", kind: "reps", threshold: 10, label: "10 pull-ups" },
];

export function detectMilestones(slices: SessionSlice[]): TrainingMoment[] {
  const hits: TrainingMoment[] = [];
  for (const milestone of MILESTONES) {
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
            ? `${Math.round((set?.weightG ?? milestone.threshold) / 1000)} kg × ${set?.reps ?? "—"}`
            : `${set?.reps ?? milestone.threshold} reps`,
        workoutId: slice.workout.id,
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
): TrainingMoment[] {
  const moments: TrainingMoment[] = [];
  const milestones = detectMilestones(slices);
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
): TrainingMoment[] {
  const slice = slices.find((row) => row.workout.id === workoutId);
  if (!slice) return [];
  const all = buildMoments(slices, records, eras, []);
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
