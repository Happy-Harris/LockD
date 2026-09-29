import { HEATMAP_MUSCLES } from "@/domain/taxonomy";
import { localDateOf, localDateToOrdinal } from "@/domain/time";
import type { MuscleGroup } from "@/domain/types";
import { countsForVolume } from "@/domain/volume";
import type { SessionSlice } from "./analytics";

/**
 * When each muscle last had a working set, and nothing more. This is a fact from the log, not a
 * recovery score: there is no "fresh" or "ready", because nothing here can know how recovered
 * anyone is. A muscle with no sets on file says so instead of reading as rested.
 */
export interface MuscleLastTrained {
  muscle: MuscleGroup;
  /** Local date of the latest session with a completed set that counts for volume. */
  lastDate?: string;
  /** Whole calendar days since then; 0 is today. Null when no set is on file. */
  daysAgo: number | null;
}

export function muscleLastTrained(
  slices: readonly SessionSlice[],
  reference = new Date(),
): MuscleLastTrained[] {
  const last = new Map<MuscleGroup, string>();
  for (const slice of slices) {
    for (const exercise of slice.exercises) {
      const hard = slice.sets.some(
        (set) =>
          set.workoutExerciseId === exercise.id && set.isCompleted && countsForVolume(set.setType),
      );
      if (!hard) continue;
      const muscles = [
        exercise.primaryMuscleGroupSnapshot,
        ...exercise.secondaryMuscleGroupsSnapshot,
      ];
      for (const muscle of muscles) {
        const prev = last.get(muscle);
        if (!prev || slice.workout.localDate > prev) last.set(muscle, slice.workout.localDate);
      }
    }
  }
  const today = localDateToOrdinal(localDateOf(reference));
  return HEATMAP_MUSCLES.map((muscle) => {
    const lastDate = last.get(muscle);
    if (!lastDate) return { muscle, daysAgo: null };
    // A session dated after today (a clock change, an import) is "today", never a negative count.
    return { muscle, lastDate, daysAgo: Math.max(0, today - localDateToOrdinal(lastDate)) };
  });
}

export function lastTrainedLabel(daysAgo: number | null): string {
  if (daysAgo === null) return "No sets logged";
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
}
