import { HEATMAP_MUSCLES } from "@/domain/taxonomy";
import { localDateToOrdinal } from "@/domain/time";
import type { MuscleGroup } from "@/domain/types";
import { countsForVolume } from "@/domain/volume";
import type { SessionSlice } from "./analytics";

export type Freshness = "loaded" | "recovering" | "ready" | "fresh";

export interface MuscleRecovery {
  muscle: MuscleGroup;
  lastDate?: string;
  hours: number | null;
  state: Freshness;
}

function hoursSince(date: string, reference = new Date()): number {
  const ordinal = localDateToOrdinal(date);
  const now = localDateToOrdinal(
    `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-${String(reference.getDate()).padStart(2, "0")}`,
  );
  return (now - ordinal) * 24;
}

export function classifyHours(hours: number | null): Freshness {
  if (hours == null) return "fresh";
  if (hours < 24) return "loaded";
  if (hours < 48) return "recovering";
  if (hours < 72) return "ready";
  return "fresh";
}

export function muscleRecovery(slices: SessionSlice[], reference = new Date()): MuscleRecovery[] {
  const last = new Map<MuscleGroup, string>();
  for (const slice of slices) {
    for (const exercise of slice.exercises) {
      const hard = slice.sets.some(
        (set) => set.workoutExerciseId === exercise.id && set.isCompleted && countsForVolume(set.setType),
      );
      if (!hard) continue;
      const muscles = [exercise.primaryMuscleGroupSnapshot, ...exercise.secondaryMuscleGroupsSnapshot];
      for (const muscle of muscles) {
        const prev = last.get(muscle);
        if (!prev || slice.workout.localDate > prev) last.set(muscle, slice.workout.localDate);
      }
    }
  }
  return HEATMAP_MUSCLES.map((muscle) => {
    const lastDate = last.get(muscle);
    const hours = lastDate ? hoursSince(lastDate, reference) : null;
    return { muscle, lastDate, hours, state: classifyHours(hours) };
  });
}

export function freshnessLabel(state: Freshness): string {
  if (state === "loaded") return "Loaded";
  if (state === "recovering") return "Recovering";
  if (state === "ready") return "Ready";
  return "Fresh";
}
