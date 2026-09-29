import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import type { WeightUnit } from "@/domain/units";

/** Reading a file is in `src/lib/import`. This is the export only. */
export function exportSetsCsv(args: {
  workouts: Workout[];
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
  unit: WeightUnit;
  formatWeight: (grams: number) => string;
}): string {
  const header = "Date,Workout Name,Exercise Name,Set Order,Set Type,Weight,Reps,RPE,Seconds,Notes";
  const lines = [header];
  const completed = args.workouts.filter((row) => row.status === "completed");
  for (const workout of completed) {
    const blocks = args.exercises
      .filter((row) => row.workoutId === workout.id)
      .sort((a, b) => a.order - b.order);
    for (const exercise of blocks) {
      const sets = args.sets
        .filter((set) => set.workoutExerciseId === exercise.id)
        .sort((a, b) => a.order - b.order);
      sets.forEach((set, index) => {
        const cells = [
          workout.localDate,
          workout.name,
          exercise.exerciseNameSnapshot,
          String(index + 1),
          set.setType,
          set.weightG != null ? args.formatWeight(set.weightG) : "",
          set.reps != null ? String(set.reps) : "",
          set.rpe != null ? String(set.rpe) : "",
          set.durationSeconds != null ? String(set.durationSeconds) : "",
          set.notes ?? "",
        ].map((cell) => {
          const safe =
            cell.startsWith("=") ||
            cell.startsWith("+") ||
            cell.startsWith("-") ||
            cell.startsWith("@")
              ? `'${cell}`
              : cell;
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        });
        lines.push(cells.join(","));
      });
    }
  }
  return lines.join("\n");
}
