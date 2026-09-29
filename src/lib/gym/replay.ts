import { formatWeight, type WeightUnit } from "@/domain/units";
import type { SessionSlice } from "./analytics";

export interface ReplayEvent {
  at: string;
  offsetSeconds: number;
  kind: "start" | "set" | "pr" | "rest" | "end";
  label: string;
  detail?: string;
}

export function sessionReplay(
  slice: SessionSlice,
  prExerciseIds: string[] = [],
  unit: WeightUnit = "kg",
): ReplayEvent[] {
  const start = Date.parse(slice.workout.startedAt);
  const events: ReplayEvent[] = [
    {
      at: slice.workout.startedAt,
      offsetSeconds: 0,
      kind: "start",
      label: "Session opened",
      detail: slice.workout.name,
    },
  ];
  const completed = slice.sets
    .filter((set) => set.isCompleted && set.completedAt)
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  let lastAt = start;
  for (const set of completed) {
    const at = Date.parse(set.completedAt!);
    const rest = (at - lastAt) / 1000;
    if (rest >= 20 && rest <= 600 && lastAt !== start) {
      events.push({
        at: new Date(lastAt).toISOString(),
        offsetSeconds: Math.round((lastAt - start) / 1000),
        kind: "rest",
        label: `Rest ${Math.round(rest)}s`,
      });
    }
    const exercise = slice.exercises.find((row) => row.id === set.workoutExerciseId);
    const pr = exercise && prExerciseIds.includes(exercise.exerciseId);
    events.push({
      at: set.completedAt!,
      offsetSeconds: Math.round((at - start) / 1000),
      kind: pr ? "pr" : "set",
      label: exercise?.exerciseNameSnapshot ?? "Set",
      detail: set.weightG
        ? `${formatWeight(set.weightG, unit)} × ${set.reps ?? "—"}`
        : `${set.reps ?? "—"} reps`,
    });
    lastAt = at;
  }
  if (slice.workout.endedAt) {
    events.push({
      at: slice.workout.endedAt,
      offsetSeconds: Math.round((Date.parse(slice.workout.endedAt) - start) / 1000),
      kind: "end",
      label: "Session closed",
    });
  }
  return events;
}
