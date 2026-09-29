import { setCountKey } from "../volume";
import type { LoggedEntry } from "./compute";
import type { WeeklyMetrics } from "./weeklyVerdict";

export function metricsFor(entries: readonly LoggedEntry[]): WeeklyMetrics {
  const workoutIds = new Set<string>();
  const hardSetKeys = new Set<string>();
  let tonnageG = 0;
  for (const entry of entries) {
    workoutIds.add(entry.workout.id);
    for (const set of entry.sets) {
      if (!set.isCompleted) continue;
      if (set.setType === "working") hardSetKeys.add(setCountKey(set));
      if (
        set.setType !== "warmup" &&
        entry.exercise.trackingTypeSnapshot === "weight_reps" &&
        (set.weightG ?? 0) > 0 &&
        (set.reps ?? 0) > 0
      ) {
        tonnageG += (set.weightG ?? 0) * (set.reps ?? 0);
      }
    }
  }
  return { hardSets: hardSetKeys.size, sessions: workoutIds.size, tonnageG };
}
