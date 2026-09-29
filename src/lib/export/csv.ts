import type {
  BodyMeasurement,
  Exercise,
  Template,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@/domain/types";
import { fromMillimetres, type LengthUnit, type WeightUnit } from "@/domain/units";
import { GRAMS_PER_KG, GRAMS_PER_LB } from "@/domain/units";
import { toCsv } from "@/lib/import/csv";
import { wallClock } from "@/lib/import/foreign";

/**
 * CSV export. History is never paywalled and never locked in: everything here is a plain file a
 * lifter can open in a spreadsheet, keep, or bring back into this app (the import wizard reads the
 * sets file, and a re-import finds every session already there).
 *
 * Rules:
 *  - **Exact values.** Weights are written at enough precision that reading them back gives the
 *    same whole grams (three decimals in kilograms, four in pounds). A set with no weight has an
 *    empty cell, never 0.
 *  - **The unit is in the header** (`Weight (kg)`), so a file is unambiguous on its own.
 *  - **Local time as it was.** A session's date is the wall-clock time it was logged at, in the
 *    offset it was logged in, so it does not shift with the device that exports it.
 *  - **Text cannot run as a formula.** Every cell passes through `escapeCsvValue`, which prefixes
 *    `= + - @` (a note of `=cmd|...` exports as text).
 *  - Only finished sessions and completed sets are in the sets file: that is the log.
 */

export interface ExportLog {
  workouts: readonly Workout[];
  workoutExercises: readonly WorkoutExercise[];
  workoutSets: readonly WorkoutSet[];
  exercises: readonly Exercise[];
  templates: readonly Template[];
  templateExercises: readonly TemplateExercise[];
  measurements: readonly BodyMeasurement[];
}

/** `100.5`, `49.986`, `0.25`: no exponent, no trailing zeros. */
function plain(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

/** A weight cell that reads back as the same whole grams. */
export function weightCell(grams: number | undefined, unit: WeightUnit): string {
  if (grams === undefined) return "";
  return unit === "kg" ? plain(grams / GRAMS_PER_KG, 3) : plain(grams / GRAMS_PER_LB, 4);
}

/** `1h 10m 5s`, which the importer reads back as the same seconds. Empty when there is none. */
export function durationCell(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : "", s ? `${s}s` : ""].filter(Boolean).join(" ");
}

const stampOf = (workout: Workout) => wallClock(workout.startedAt, workout.tzOffsetMinutes);
const endStampOf = (workout: Workout) =>
  workout.endedAt ? wallClock(workout.endedAt, workout.tzOffsetMinutes) : "";

const byStart = (a: Workout, b: Workout) => a.startedAt.localeCompare(b.startedAt);

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const list = out.get(key(row)) ?? [];
    list.push(row);
    out.set(key(row), list);
  }
  return out;
}

/** One row per completed set of every finished session. */
export function setsCsv(log: ExportLog, unit: WeightUnit): string {
  const blocks = groupBy(log.workoutExercises, (row) => row.workoutId);
  const sets = groupBy(log.workoutSets, (row) => row.workoutExerciseId);
  const muscle = new Map(log.exercises.map((row) => [row.id, row.primaryMuscleGroup]));

  const rows: unknown[][] = [];
  for (const workout of [...log.workouts].filter((w) => w.status === "completed").sort(byStart)) {
    const duration =
      workout.endedAt && workout.endedAt > workout.startedAt
        ? Math.round((Date.parse(workout.endedAt) - Date.parse(workout.startedAt)) / 1000)
        : undefined;
    const ordered = [...(blocks.get(workout.id) ?? [])].sort((a, b) => a.order - b.order);
    for (const block of ordered) {
      const done = [...(sets.get(block.id) ?? [])]
        .filter((set) => set.isCompleted)
        .sort((a, b) => a.order - b.order);
      done.forEach((set, index) => {
        rows.push([
          stampOf(workout),
          workout.name,
          block.exerciseNameSnapshot,
          index + 1,
          set.setType,
          weightCell(set.weightG, unit),
          set.reps ?? "",
          set.rpe ?? "",
          set.rir ?? "",
          set.durationSeconds ?? "",
          set.distanceM ?? "",
          set.notes ?? "",
          workout.notes ?? "",
          block.notes ?? "",
          block.supersetGroup ?? "",
          durationCell(duration),
          block.primaryMuscleGroupSnapshot ?? muscle.get(block.exerciseId) ?? "",
        ]);
      });
    }
  }
  return toCsv(
    [
      "Date",
      "Workout Name",
      "Exercise Name",
      "Set Order",
      "Set Type",
      `Weight (${unit})`,
      "Reps",
      "RPE",
      "RIR",
      "Seconds",
      "Distance (m)",
      "Notes",
      "Workout Notes",
      "Exercise Notes",
      "Superset",
      "Duration",
      "Primary Muscle",
    ],
    rows,
  );
}

/** One row per session, with its status and how many sets were completed. */
export function sessionsCsv(log: ExportLog): string {
  const completed = new Map<string, number>();
  for (const set of log.workoutSets) {
    if (set.isCompleted) completed.set(set.workoutId, (completed.get(set.workoutId) ?? 0) + 1);
  }
  const rows = [...log.workouts]
    .sort(byStart)
    .map((workout) => [
      workout.id,
      workout.name,
      stampOf(workout),
      endStampOf(workout),
      workout.localDate,
      workout.status,
      completed.get(workout.id) ?? 0,
      workout.pausedSeconds || "",
      workout.notes ?? "",
    ]);
  return toCsv(
    [
      "Session id",
      "Name",
      "Started",
      "Ended",
      "Date",
      "Status",
      "Completed sets",
      "Paused seconds",
      "Notes",
    ],
    rows,
  );
}

export function exercisesCsv(exercises: readonly Exercise[]): string {
  const rows = [...exercises]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((exercise) => [
      exercise.id,
      exercise.name,
      exercise.primaryMuscleGroup,
      exercise.secondaryMuscleGroups.join("; "),
      exercise.equipment,
      exercise.movementPattern,
      exercise.trackingType,
      exercise.unilateral ? "yes" : "",
      exercise.isCustom ? "custom" : "library",
      exercise.isArchived ? "archived" : "active",
      exercise.notes ?? "",
    ]);
  return toCsv(
    [
      "Exercise id",
      "Name",
      "Primary muscle",
      "Secondary muscles",
      "Equipment",
      "Movement pattern",
      "Tracking",
      "One side at a time",
      "Source",
      "State",
      "Notes",
    ],
    rows,
  );
}

/** One row per exercise in each routine. */
export function routinesCsv(log: ExportLog): string {
  const names = new Map(log.exercises.map((exercise) => [exercise.id, exercise.name]));
  const inRoutine = groupBy(log.templateExercises, (row) => row.templateId);
  const rows = [...log.templates]
    .sort((a, b) => a.order - b.order)
    .flatMap((template) =>
      [...(inRoutine.get(template.id) ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((row) => [
          template.name,
          template.isArchived ? "archived" : "active",
          row.order + 1,
          names.get(row.exerciseId) ?? row.exerciseId,
          row.targetSets,
          row.targetRepMin ?? "",
          row.targetRepMax ?? "",
          row.targetRpe ?? "",
          row.targetRir ?? "",
          row.restSeconds,
          row.defaultSetType,
          row.includeWarmup ? "yes" : "",
          row.supersetGroup ?? "",
          row.notes ?? "",
        ]),
    );
  return toCsv(
    [
      "Routine",
      "State",
      "Position",
      "Exercise",
      "Target sets",
      "Rep min",
      "Rep max",
      "Target RPE",
      "Target RIR",
      "Rest (s)",
      "Set type",
      "Warm-up",
      "Superset",
      "Notes",
    ],
    rows,
  );
}

/** Body weight in the lifter's mass unit; every length in centimetres or inches. */
export function measurementsCsv(
  measurements: readonly BodyMeasurement[],
  mass: WeightUnit,
  length: LengthUnit,
): string {
  const rows = [...measurements]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((row) => {
      const isMass = row.metric === "bodyweight";
      return [
        row.recordedAt,
        row.localDate,
        row.metric,
        isMass ? weightCell(row.value, mass) : plain(fromMillimetres(row.value, length), 2),
        isMass ? mass : length,
        row.note ?? "",
      ];
    });
  return toCsv(["Recorded at", "Date", "Metric", "Value", "Unit", "Note"], rows);
}

export interface CsvFile {
  fileName: string;
  content: string;
}

/** Every CSV, named with the date, for the Settings buttons. */
export function csvFiles(
  log: ExportLog,
  units: { mass: WeightUnit; length: LengthUnit },
  date: string,
): Record<"sets" | "sessions" | "exercises" | "routines" | "measurements", CsvFile> {
  return {
    sets: { fileName: `lockd-sets-${date}.csv`, content: setsCsv(log, units.mass) },
    sessions: { fileName: `lockd-sessions-${date}.csv`, content: sessionsCsv(log) },
    exercises: { fileName: `lockd-exercises-${date}.csv`, content: exercisesCsv(log.exercises) },
    routines: { fileName: `lockd-routines-${date}.csv`, content: routinesCsv(log) },
    measurements: {
      fileName: `lockd-measurements-${date}.csv`,
      content: measurementsCsv(log.measurements, units.mass, units.length),
    },
  };
}
