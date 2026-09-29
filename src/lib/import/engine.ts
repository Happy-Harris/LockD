import { fingerprint } from "@/domain/ids";
import type {
  Exercise,
  ImportIssue,
  ImportSource,
  MeasurementMetric,
  SetType,
} from "@/domain/types";
import { toGrams, type WeightUnit } from "@/domain/units";
import { normaliseHeader, parseCsv } from "./csv";
import { parseDuration, parseLocalMoment, parseNumber } from "./parse";

/**
 * The import engine (plan PR 7): one pipeline for every CSV source. A **source profile** says what
 * a source calls its columns, how it writes a set's kind, and how it dates a session; the engine
 * reads the rows, groups them into sessions, reports what it could not read, and builds a batch
 * that can be applied to the log in one step.
 *
 * Two rules run through it:
 *  - **Nothing is invented.** A blank cell stays missing (never zero), a body-weight lift keeps no
 *    load, an unreadable row is reported and skipped, and an unknown kind of set is reported. A
 *    name that is not exactly an exercise already here becomes a new exercise with no muscle
 *    assigned. The engine suggests near matches for a person to confirm; it never merges on its own.
 *  - **Nothing is lost silently.** Every skipped or adjusted row is in `issues`, with its row number.
 */

export type ImportField =
  | "date"
  | "endTime"
  | "workoutName"
  | "duration"
  | "exerciseName"
  | "setOrder"
  | "weight"
  | "reps"
  | "distance"
  | "seconds"
  | "rpe"
  | "setNotes"
  | "workoutNotes"
  | "exerciseNotes"
  | "superset"
  | "setType";

export const FIELD_LABELS: Record<ImportField, string> = {
  date: "Date and time",
  endTime: "End time",
  workoutName: "Workout name",
  duration: "Workout duration",
  exerciseName: "Exercise name",
  setOrder: "Set number",
  weight: "Weight",
  reps: "Reps",
  distance: "Distance",
  seconds: "Seconds",
  rpe: "RPE",
  setNotes: "Set notes",
  workoutNotes: "Workout notes",
  exerciseNotes: "Exercise notes",
  superset: "Superset",
  setType: "Set type",
};

export type ColumnMapping = Partial<Record<ImportField, number>>;

/** What a source's set-kind columns say about one row. */
export type SetInterpretation =
  { kind: "set"; type: SetType; unsupported?: string } | { kind: "skip"; reason: string };

export interface SourceProfile {
  id: ImportSource;
  /** How the source is named to the lifter, for example in the notes of exercises it creates. */
  label: string;
  /** Known header spellings per field, as `normaliseHeader` writes them. */
  aliases: Record<ImportField, string[]>;
  required: ImportField[];
  /**
   * A zero in the weight column means "no external load" (a pull-up), not a recorded 0 kg. When set,
   * a zero weight is read as missing, so it can never look like a logged load.
   */
  zeroWeightIsMissing?: boolean;
  /** Reads the set-number and set-type cells. */
  interpretSet: (setOrder: string, setType: string) => SetInterpretation;
}

export interface ParsedSetRow {
  rowNumber: number;
  type: SetType;
  weightG?: number;
  reps?: number;
  distanceM?: number;
  durationSeconds?: number;
  rpe?: number;
  /** Reps in reserve, from a source that records it (a backup). CSV sources leave it out. */
  rir?: number;
  /** Left or right, for a unilateral exercise. Undefined is a bilateral row. */
  side?: "left" | "right";
  /** Links the left and right row of one set number, as the source wrote it. */
  pairId?: string;
  notes?: string;
}

/**
 * What a source says about an exercise, used only when the exercise has to be created here. A
 * source that classifies its exercises (another Lock'd-family backup) passes its own choices on;
 * a CSV has none, so its exercises are created unmapped.
 */
export type ExerciseHints = Partial<
  Pick<
    Exercise,
    | "primaryMuscleGroup"
    | "secondaryMuscleGroups"
    | "equipment"
    | "movementPattern"
    | "trackingType"
    | "unilateral"
    | "incrementG"
  >
>;

export interface ParsedExercise {
  name: string;
  notes?: string;
  /** The source's superset id, when the exercise is part of one. */
  superset?: string;
  restSeconds?: number;
  hints?: ExerciseHints;
  sets: ParsedSetRow[];
}

export interface ParsedWorkout {
  key: string;
  fingerprint: string;
  name: string;
  /** `YYYY-MM-DD HH:mm:ss` as the file wrote it, independent of this device's time zone. */
  stamp: string;
  localDate: string;
  startedAt: string;
  durationSeconds?: number;
  notes?: string;
  /** The source's own offset, raw `getTimezoneOffset()` sign. Without it this device's is used. */
  tzOffsetMinutes?: number;
  pausedSeconds?: number;
  exercises: ParsedExercise[];
  setCount: number;
}

/** A routine from a backup: exercises are named, and resolved the same way a session's are. */
export interface ParsedTemplate {
  key: string;
  name: string;
  notes?: string;
  isArchived: boolean;
  exercises: Array<{
    name: string;
    hints?: ExerciseHints;
    targetSets: number;
    targetRepMin?: number;
    targetRepMax?: number;
    targetRpe?: number;
    targetRir?: number;
    restSeconds: number;
    defaultSetType: SetType;
    includeWarmup: boolean;
    notes?: string;
    superset?: string;
  }>;
}

/** A body measurement in canonical units: grams for body weight, millimetres for a length. */
export interface ParsedMeasurement {
  metric: MeasurementMetric;
  value: number;
  displayUnit: "kg" | "lb" | "cm" | "in";
  recordedAt: string;
  localDate: string;
  note?: string;
}

export type IssueDraft = Omit<ImportIssue, "id" | "jobId">;

export interface ImportAnalysis {
  header: string[];
  mapping: ColumnMapping;
  unmappedColumns: Array<{ index: number; name: string }>;
  missingRequired: ImportField[];
  workouts: ParsedWorkout[];
  /** Backups only: routines and body measurements found beside the sessions. */
  templates?: ParsedTemplate[];
  measurements?: ParsedMeasurement[];
  issues: IssueDraft[];
  totalRows: number;
  skippedRows: number;
  detectedUnit?: WeightUnit;
}

export interface AnalyseOptions {
  /** A person's own column choices, applied over the automatic ones. */
  mapping?: ColumnMapping;
  /** Weight unit to use when the header does not say. */
  unit?: WeightUnit;
  distanceUnit?: "m" | "km" | "mi";
}

const MAX_ROWS = 250_000;

/** Which weight unit a header declares: `Weight (kg)`, `weight_lbs`, `Weight (lb)`. */
export function detectWeightUnit(header: readonly string[]): WeightUnit | undefined {
  const joined = header.join(" ").toLowerCase();
  if (/weight[\s_(]*(lbs?|pounds?)\b/.test(joined)) return "lb";
  if (/weight[\s_(]*(kgs?|kilograms?)\b/.test(joined)) return "kg";
  return undefined;
}

/** Which distance unit a header declares: `distance_km`, `Distance (m)`, `distance_miles`. */
export function detectDistanceUnit(header: readonly string[]): "m" | "km" | "mi" | undefined {
  const joined = header.join(" ").toLowerCase();
  if (/distance[\s_(]*(miles?|mi)\b/.test(joined)) return "mi";
  if (/distance[\s_(]*km\b/.test(joined)) return "km";
  if (/distance[\s_(]*(m|meters?|metres?)\b/.test(joined)) return "m";
  return undefined;
}

export function autoMap(header: readonly string[], profile: SourceProfile): ColumnMapping {
  const mapping: ColumnMapping = {};
  header.forEach((raw, index) => {
    const key = normaliseHeader(raw);
    for (const [field, aliases] of Object.entries(profile.aliases) as Array<
      [ImportField, string[]]
    >) {
      if (mapping[field] !== undefined) continue;
      if (aliases.includes(key)) {
        mapping[field] = index;
        return;
      }
    }
  });
  return mapping;
}

const cell = (row: readonly string[], index: number | undefined): string =>
  index === undefined ? "" : (row[index] ?? "");

export function normaliseExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toMetres(value: number, unit: "m" | "km" | "mi"): number {
  if (unit === "km") return Math.round(value * 1000);
  if (unit === "mi") return Math.round(value * 1609.344);
  return Math.round(value);
}

/**
 * A session's fingerprint: its start as written, its name and, for each exercise (by normalised
 * name) each set's kind and values in order. The same session read from the same file, on any device
 * in any time zone, gets the same fingerprint, so importing a file twice adds nothing the second
 * time. A different session cannot share it unless every value is identical.
 */
export function fingerprintSession(
  stamp: string,
  name: string,
  exercises: ReadonlyArray<{
    name: string;
    sets: ReadonlyArray<{
      type: SetType;
      weightG?: number;
      reps?: number;
      durationSeconds?: number;
      distanceM?: number;
    }>;
  }>,
): string {
  const parts = [stamp, name];
  for (const exercise of exercises) {
    parts.push(normaliseExerciseName(exercise.name));
    for (const set of exercise.sets) {
      parts.push(
        `${set.type}|${set.weightG ?? ""}|${set.reps ?? ""}|${set.durationSeconds ?? ""}|${set.distanceM ?? ""}`,
      );
    }
  }
  return fingerprint(parts.join("~"));
}

export function analyseCsv(
  text: string,
  profile: SourceProfile,
  options: AnalyseOptions = {},
): ImportAnalysis {
  const { header, rows } = parseCsv(text);
  const detectedUnit = detectWeightUnit(header);
  // What the file says wins over the lifter's own unit setting, which is only a fallback.
  const unit: WeightUnit = detectedUnit ?? options.unit ?? "kg";
  const distanceUnit = detectDistanceUnit(header) ?? options.distanceUnit ?? "m";
  const mapping: ColumnMapping = { ...autoMap(header, profile), ...(options.mapping ?? {}) };

  const issues: IssueDraft[] = [];
  const missingRequired = profile.required.filter((field) => mapping[field] === undefined);
  const used = new Set(Object.values(mapping));
  const unmappedColumns = header
    .map((name, index) => ({ index, name }))
    .filter(({ index }) => !used.has(index));

  const grouped = new Map<string, ParsedWorkout>();
  let skippedRows = 0;

  if (missingRequired.length === 0) {
    const limit = Math.min(rows.length, MAX_ROWS);
    if (rows.length > MAX_ROWS) {
      issues.push({
        row: MAX_ROWS,
        severity: "warning",
        message: `The file has ${rows.length} rows; only the first ${MAX_ROWS} were read.`,
      });
    }

    for (let i = 0; i < limit; i += 1) {
      const row = rows[i]!;
      const rowNumber = i + 2; // the header is row 1
      const skip = (severity: "warning" | "error", message: string) => {
        skippedRows += 1;
        issues.push({ row: rowNumber, severity, message });
      };

      const rawDate = cell(row, mapping.date);
      const started = parseLocalMoment(rawDate);
      if (!started) {
        skip("error", `Unreadable date "${rawDate}".`);
        continue;
      }
      const exerciseName = cell(row, mapping.exerciseName).trim();
      if (!exerciseName) {
        skip("error", "Missing exercise name.");
        continue;
      }

      const interpreted = profile.interpretSet(
        cell(row, mapping.setOrder).trim(),
        cell(row, mapping.setType).trim(),
      );
      if (interpreted.kind === "skip") {
        skip("warning", interpreted.reason);
        continue;
      }
      if (interpreted.unsupported) {
        issues.push({
          row: rowNumber,
          severity: "warning",
          message: `Unknown set type "${interpreted.unsupported}", imported as a working set.`,
        });
      }

      const weight = parseNumber(cell(row, mapping.weight));
      const reps = parseNumber(cell(row, mapping.reps));
      const distance = parseNumber(cell(row, mapping.distance));
      const seconds = parseNumber(cell(row, mapping.seconds));
      const rpe = parseNumber(cell(row, mapping.rpe));

      if (weight !== undefined && weight < 0) {
        issues.push({
          row: rowNumber,
          severity: "warning",
          message: "Negative weight (an assisted lift?) set to 0.",
        });
      }
      if (rpe !== undefined && (rpe < 1 || rpe > 10)) {
        issues.push({
          row: rowNumber,
          severity: "warning",
          message: `RPE ${rpe} is outside 1 to 10 and was left out.`,
        });
      }

      const workoutName = cell(row, mapping.workoutName).trim() || "Imported workout";
      const key = `${started.stamp}::${workoutName}`;
      let workout = grouped.get(key);
      if (!workout) {
        const end = parseLocalMoment(cell(row, mapping.endTime));
        const fromEnd = end
          ? Math.round((end.date.getTime() - started.date.getTime()) / 1000)
          : undefined;
        workout = {
          key,
          fingerprint: "",
          name: workoutName,
          stamp: started.stamp,
          localDate: started.localDate,
          startedAt: started.date.toISOString(),
          durationSeconds:
            fromEnd && fromEnd > 0 ? fromEnd : parseDuration(cell(row, mapping.duration)),
          notes: cell(row, mapping.workoutNotes).trim() || undefined,
          exercises: [],
          setCount: 0,
        };
        grouped.set(key, workout);
      }

      const set: ParsedSetRow = {
        rowNumber,
        type: interpreted.type,
        // A blank stays missing. It is never turned into a zero load.
        weightG:
          weight === undefined || (profile.zeroWeightIsMissing && weight === 0)
            ? undefined
            : toGrams(Math.max(0, weight), unit),
        reps: reps === undefined ? undefined : Math.max(0, Math.round(reps)),
        distanceM:
          distance === undefined ? undefined : toMetres(Math.max(0, distance), distanceUnit),
        durationSeconds: seconds === undefined ? undefined : Math.max(0, Math.round(seconds)),
        rpe: rpe !== undefined && rpe >= 1 && rpe <= 10 ? rpe : undefined,
        notes: cell(row, mapping.setNotes).trim() || undefined,
      };

      let exercise = workout.exercises.find((entry) => entry.name === exerciseName);
      if (!exercise) {
        exercise = {
          name: exerciseName,
          notes: cell(row, mapping.exerciseNotes).trim() || undefined,
          superset: cell(row, mapping.superset).trim() || undefined,
          sets: [],
        };
        workout.exercises.push(exercise);
      }
      exercise.sets.push(set);
      workout.setCount += 1;
    }
  }

  const workouts = [...grouped.values()]
    .map((workout) => ({
      ...workout,
      fingerprint: fingerprintSession(workout.stamp, workout.name, workout.exercises),
    }))
    .sort((a, b) => a.stamp.localeCompare(b.stamp));

  return {
    header,
    mapping,
    unmappedColumns,
    missingRequired,
    workouts,
    issues,
    totalRows: rows.length,
    skippedRows,
    detectedUnit,
  };
}
