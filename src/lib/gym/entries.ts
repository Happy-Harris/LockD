import type { LoggedEntry } from "@/domain/analytics/compute";
import type { SessionSlice } from "./analytics";

/**
 * The finished log as the analytics engines read it: one entry per exercise block of a finished
 * session, with that block's sets. Sets are grouped once, so this is linear in the size of the log.
 */
export function loggedEntriesOf(slices: readonly SessionSlice[]): LoggedEntry[] {
  const entries: LoggedEntry[] = [];
  for (const slice of slices) {
    const byBlock = new Map<string, SessionSlice["sets"]>();
    for (const set of slice.sets) {
      const list = byBlock.get(set.workoutExerciseId);
      if (list) list.push(set);
      else byBlock.set(set.workoutExerciseId, [set]);
    }
    for (const exercise of slice.exercises) {
      entries.push({ workout: slice.workout, exercise, sets: byBlock.get(exercise.id) ?? [] });
    }
  }
  return entries;
}
