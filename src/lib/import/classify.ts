import type {
  Equipment,
  Exercise,
  MovementPattern,
  MuscleGroup,
  WorkoutExercise,
} from "@/domain/types";
import { suggestExerciseTaxonomy } from "@/domain/exerciseTaxonomy";

/**
 * Bulk Classify (plan PR 7): giving the exercises an import left unmapped a muscle group,
 * equipment and movement pattern, after the lifter has looked at each one.
 *
 * Rules:
 *  - Only an exercise that is still `unmapped` is changed. A classification someone already made
 *    (or a source supplied) is never overwritten by this.
 *  - Past sessions keep the muscle group they were logged with (a snapshot), and muscle analytics
 *    reads that snapshot. So a session's block is filled in **only where its snapshot is still
 *    `unmapped`** (and its equipment only where it is still the placeholder `other`). Nothing a
 *    session already recorded is changed.
 *  - Suggestions come from the name and are never applied here. The caller shows each one and
 *    applies only what the lifter accepted.
 */

export interface Classification {
  exerciseId: string;
  primaryMuscleGroup: MuscleGroup;
  equipment: Equipment;
  movementPattern: MovementPattern;
}

export interface Classifiable {
  exercises: Exercise[];
  workoutExercises: WorkoutExercise[];
}

/** Exercises that still have no muscle group, not archived, in library order. */
export function unmappedExercises(exercises: readonly Exercise[]): Exercise[] {
  return exercises.filter(
    (exercise) => exercise.primaryMuscleGroup === "unmapped" && !exercise.isArchived,
  );
}

export interface ClassifySuggestion {
  exercise: Exercise;
  /** From the name, or null when the name does not say enough to suggest anything. */
  suggestion: ReturnType<typeof suggestExerciseTaxonomy>;
}

export function suggestFor(exercises: readonly Exercise[]): ClassifySuggestion[] {
  return unmappedExercises(exercises).map((exercise) => ({
    exercise,
    suggestion: suggestExerciseTaxonomy(exercise.name),
  }));
}

/** The log with these classifications applied. Returns the same arrays when nothing changes. */
export function applyClassification(
  log: Classifiable,
  items: readonly Classification[],
  now: string,
): Classifiable & { changed: number } {
  const byId = new Map<string, Classification>();
  for (const item of items) {
    if (item.primaryMuscleGroup === "unmapped") continue; // "unmapped" is not a classification
    byId.set(item.exerciseId, item);
  }
  let changed = 0;
  const exercises = log.exercises.map((exercise) => {
    const item = byId.get(exercise.id);
    if (!item || exercise.primaryMuscleGroup !== "unmapped") return exercise;
    changed += 1;
    return {
      ...exercise,
      primaryMuscleGroup: item.primaryMuscleGroup,
      equipment: item.equipment,
      movementPattern: item.movementPattern,
      updatedAt: now,
    };
  });
  if (changed === 0)
    return { exercises: log.exercises, workoutExercises: log.workoutExercises, changed };

  const applied = new Map(
    exercises
      .filter((exercise, index) => exercise !== log.exercises[index])
      .map((exercise) => [exercise.id, exercise]),
  );
  const workoutExercises = log.workoutExercises.map((block) => {
    const exercise = applied.get(block.exerciseId);
    if (!exercise || block.primaryMuscleGroupSnapshot !== "unmapped") return block;
    return {
      ...block,
      primaryMuscleGroupSnapshot: exercise.primaryMuscleGroup,
      equipmentSnapshot:
        block.equipmentSnapshot === "other" ? exercise.equipment : block.equipmentSnapshot,
    };
  });
  return { exercises, workoutExercises, changed };
}
