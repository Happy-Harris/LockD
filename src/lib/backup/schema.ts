import { z } from "zod";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type Equipment,
  type LockdBackup,
  type MeasurementMetric,
  type MovementPattern,
  type MuscleGroup,
  type SetType,
  type TrackingType,
} from "@/domain/types";

/**
 * Validation for `lockd-backup` files (plan PR 7). A backup is untrusted input, so it is checked
 * before anything is written: unknown keys are dropped, text is bounded, numbers must be finite
 * whole values where the log stores whole values, and rows must point at rows that exist. A file
 * that fails is refused with the reasons; nothing is repaired or dropped silently.
 */

/** Runtime lists for the unions in `types.ts`. The `_Covers` checks fail to compile if one drifts. */
export const MUSCLES = [
  "unmapped",
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "traps",
  "lats",
  "adductors",
  "abductors",
  "neck",
  "full body",
  "cardio",
] as const satisfies readonly MuscleGroup[];
export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "smith machine",
  "plate",
  "other",
] as const satisfies readonly Equipment[];
export const MOVEMENTS = [
  "squat",
  "hinge",
  "horizontal push",
  "vertical push",
  "horizontal pull",
  "vertical pull",
  "lunge",
  "carry",
  "isolation",
  "core",
  "conditioning",
] as const satisfies readonly MovementPattern[];
export const TRACKING = [
  "weight_reps",
  "reps_only",
  "duration",
  "distance_duration",
  "assisted_weight",
] as const satisfies readonly TrackingType[];
export const SET_TYPES = ["warmup", "working", "drop", "failure"] as const satisfies readonly SetType[];
export const METRICS = [
  "bodyweight",
  "neck",
  "shoulders",
  "chest",
  "waist",
  "hips",
  "arm_left",
  "arm_right",
  "thigh_left",
  "thigh_right",
  "calf_left",
  "calf_right",
  "arms",
  "thighs",
  "calves",
] as const satisfies readonly MeasurementMetric[];

type _Covers<T extends never> = T;
export type _MusclesCovered = _Covers<Exclude<MuscleGroup, (typeof MUSCLES)[number]>>;
export type _EquipmentCovered = _Covers<Exclude<Equipment, (typeof EQUIPMENT)[number]>>;
export type _MovementsCovered = _Covers<Exclude<MovementPattern, (typeof MOVEMENTS)[number]>>;
export type _TrackingCovered = _Covers<Exclude<TrackingType, (typeof TRACKING)[number]>>;
export type _SetTypesCovered = _Covers<Exclude<SetType, (typeof SET_TYPES)[number]>>;
export type _MetricsCovered = _Covers<Exclude<MeasurementMetric, (typeof METRICS)[number]>>;

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const MAX_ROWS = 1_000_000;
const MAX_TEXT = 4_000;

const id = z.string().min(1).max(200);
const text = z.string().max(MAX_TEXT);
const name = z.string().min(1).max(200);
const isoDateTime = z
  .string()
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), "not a date and time");
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "not a YYYY-MM-DD date");
/** Whole, non-negative, and small enough to be a real value (a gram, a rep, a second). */
const whole = (max: number) => z.number().int().min(0).max(max);
const grams = whole(1_000_000_000); // 1,000 tonnes
const reps = whole(100_000);
const seconds = whole(10_000_000);
const metres = whole(100_000_000);
const order = z.number().int().min(-1_000_000).max(1_000_000);
const rating = z.number().min(0).max(100);
const rows = <T extends z.ZodType>(schema: T) => z.array(schema).max(MAX_ROWS);

const exercise = z.object({
  id,
  name,
  primaryMuscleGroup: z.enum(MUSCLES),
  secondaryMuscleGroups: z.array(z.enum(MUSCLES)).max(20),
  equipment: z.enum(EQUIPMENT),
  movementPattern: z.enum(MOVEMENTS),
  trackingType: z.enum(TRACKING),
  incrementG: grams.optional(),
  unilateral: z.boolean().optional(),
  isCustom: z.boolean(),
  isArchived: z.boolean(),
  notes: text.optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const template = z.object({
  id,
  name,
  notes: text.optional(),
  order,
  isArchived: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const templateExercise = z.object({
  id,
  templateId: id,
  exerciseId: id,
  order,
  targetSets: reps,
  targetRepMin: reps.optional(),
  targetRepMax: reps.optional(),
  targetRpe: rating.optional(),
  targetRir: rating.optional(),
  restSeconds: seconds,
  defaultSetType: z.enum(SET_TYPES),
  includeWarmup: z.boolean(),
  notes: text.optional(),
  supersetGroup: z.string().max(100).optional(),
});

const workout = z.object({
  id,
  templateId: id.optional(),
  programId: id.optional(),
  programWeek: whole(10_000).optional(),
  name,
  status: z.enum(["active", "completed", "discarded"]),
  startedAt: isoDateTime,
  endedAt: isoDateTime.optional(),
  localDate,
  /** Raw `Date.getTimezoneOffset()`: minutes, positive west of UTC. */
  tzOffsetMinutes: z.number().int().min(-1440).max(1440),
  pausedSeconds: seconds,
  notes: text.optional(),
  beatWorkoutId: id.optional(),
  importFingerprint: z.string().max(200).optional(),
  importJobId: id.optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const workoutExercise = z.object({
  id,
  workoutId: id,
  exerciseId: id,
  order,
  exerciseNameSnapshot: name,
  primaryMuscleGroupSnapshot: z.enum(MUSCLES),
  secondaryMuscleGroupsSnapshot: z.array(z.enum(MUSCLES)).max(20),
  equipmentSnapshot: z.enum(EQUIPMENT),
  trackingTypeSnapshot: z.enum(TRACKING),
  restSeconds: seconds,
  notes: text.optional(),
  supersetGroup: z.string().max(100).optional(),
  unilateralSnapshot: z.boolean().optional(),
});

const workoutSet = z.object({
  id,
  workoutExerciseId: id,
  workoutId: id,
  order,
  setType: z.enum(SET_TYPES),
  weightG: grams.optional(),
  reps: reps.optional(),
  rpe: rating.optional(),
  rir: rating.optional(),
  durationSeconds: seconds.optional(),
  distanceM: metres.optional(),
  isCompleted: z.boolean(),
  completedAt: isoDateTime.optional(),
  notes: text.optional(),
  grind: z.enum(["easy", "normal", "grind"]).optional(),
  clipId: id.optional(),
  side: z.enum(["left", "right"]).optional(),
  pairId: id.optional(),
});

const measurement = z.object({
  id,
  metric: z.enum(METRICS),
  value: z.number().min(0).max(100_000_000),
  displayUnit: z.enum(["kg", "lb", "cm", "in"]),
  recordedAt: isoDateTime,
  localDate,
  note: text.optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const plateInventory = z.object({
  id,
  name,
  unit: z.enum(["kg", "lb"]),
  plates: z.array(z.object({ weightG: grams, count: whole(10_000) })).max(200),
  isDefault: z.boolean(),
});

const barProfile = z.object({
  id,
  name,
  weightG: grams,
  collarWeightG: grams,
  isDefault: z.boolean(),
});

const band = z.object({ min: z.number().min(0).max(1000), max: z.number().min(0).max(1000) });

const settings = z.object({
  unitSystem: z.enum(["metric", "imperial"]),
  oneRepMaxFormula: z.enum(["epley", "brzycki"]),
  intensityMode: z.enum(["rpe", "rir", "none"]),
  weekStartDay: z.enum(["saturday", "sunday", "monday"]),
  quickIncrementG: grams,
  defaultRestSeconds: seconds,
  restTimerAutoStart: z.boolean(),
  restTimerSound: z.boolean(),
  excludeWarmupsFromAnalytics: z.boolean(),
  secondaryMuscleCredit: z.number().min(0).max(1),
  personalMuscleTargets: z.partialRecord(z.enum(MUSCLES), band).optional(),
  warmupRestSeconds: seconds.optional(),
  restTimerVibrate: z.boolean().optional(),
  restTimerNotification: z.boolean().optional(),
  goalLiftIds: z.array(id).max(50),
  defaultBarProfileId: id,
  defaultPlateInventoryId: id,
  themeMode: z.enum(["light", "dark", "system"]),
  accentTheme: z.enum(["stamp", "ember", "glacier", "moss"]),
  goalLens: z.enum([
    "powerbuilding",
    "hypertrophy",
    "strength",
    "calisthenics",
    "hybrid",
    "general",
  ]),
  presentationMode: z.enum(["loud", "calm"]),
  activeProgramId: id.optional(),
  onboardingCompletedAt: isoDateTime.optional(),
  demoLoaded: z.boolean(),
});

const program = z.object({
  id,
  name,
  notes: text.optional(),
  lens: z.enum(["powerbuilding", "hypertrophy", "strength", "calisthenics", "hybrid", "general"]),
  weekCount: whole(1000),
  currentWeek: whole(1000),
  currentSessionOrder: whole(10_000),
  isActive: z.boolean(),
  isArchived: z.boolean(),
  origin: z.enum(["pack", "custom", "duplicated"]),
  packId: z.string().max(200).optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const programWeek = z.object({
  id,
  programId: id,
  weekNumber: whole(1000),
  isDeload: z.boolean(),
  notes: text.optional(),
});
const programSession = z.object({ id, programId: id, name, order, dayIndex: whole(100) });
const programExercise = z.object({
  id,
  programSessionId: id,
  exerciseId: id,
  order,
  targetSets: reps,
  targetRepMin: reps.optional(),
  targetRepMax: reps.optional(),
  targetRpe: rating.optional(),
  restSeconds: seconds,
  includeWarmup: z.boolean(),
  substitutionOf: id.optional(),
  unresolvedName: name.optional(),
  rule: z.object({
    kind: z.enum(["double_progression", "linear", "hold", "percent_deload"]),
    incrementG: grams.optional(),
    deloadPercent: z.number().min(0).max(100).optional(),
  }),
  notes: text.optional(),
});

const eraName = z.object({ startDate: localDate, name });
const machineSetup = z.object({
  exerciseId: id,
  gymName: text.optional(),
  seat: text.optional(),
  lever: text.optional(),
  handle: text.optional(),
  pin: text.optional(),
  stackNote: text.optional(),
  notes: text.optional(),
  updatedAt: isoDateTime,
});
const lesson = z.object({
  id,
  exerciseId: id,
  text,
  pinnedAt: isoDateTime,
  workoutId: id.optional(),
});
const namedPr = z.object({ id, exerciseId: id, workoutId: id, note: text, namedAt: isoDateTime });
const clip = z.object({
  id,
  setId: id,
  workoutId: id,
  exerciseId: id,
  exerciseName: name,
  createdAt: isoDateTime,
  localDate,
  mimeType: z.string().min(1).max(100),
  durationMs: whole(86_400_000).optional(),
});

/** Collections older backups may not have. A missing one means "none". */
const optionalRows = <T extends z.ZodType>(schema: T) => rows(schema).optional().default([]);

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: isoDateTime,
  exercises: rows(exercise),
  templates: rows(template),
  templateExercises: rows(templateExercise),
  workouts: rows(workout),
  workoutExercises: rows(workoutExercise),
  workoutSets: rows(workoutSet),
  measurements: rows(measurement),
  plates: rows(plateInventory),
  bars: rows(barProfile),
  settings,
  programs: optionalRows(program),
  programWeeks: optionalRows(programWeek),
  programSessions: optionalRows(programSession),
  programExercises: optionalRows(programExercise),
  eraNames: optionalRows(eraName),
  machineSetups: optionalRows(machineSetup),
  lessons: optionalRows(lesson),
  namedPrs: optionalRows(namedPr),
  clips: optionalRows(clip),
});

export type BackupSummary = {
  exportedAt: string;
  sessions: number;
  sets: number;
  exercises: number;
  programs: number;
};

export type ParseBackupResult =
  | { ok: true; backup: LockdBackup; summary: BackupSummary; warnings: string[] }
  | { ok: false; errors: string[] };

const MAX_REPORTED = 8;

function describe(path: ReadonlyArray<PropertyKey>): string {
  return (
    path
      .map((part, index) =>
        typeof part === "number" ? `[${part}]` : `${index ? "." : ""}${String(part)}`,
      )
      .join("") || "the file"
  );
}

/** Rows that point at a row that does not exist. A hand-edited or truncated file, not a real export. */
function integrityErrors(backup: LockdBackup): string[] {
  const errors: string[] = [];
  const ids = (list: ReadonlyArray<{ id: string }>) => new Set(list.map((row) => row.id));
  const duplicates = (label: string, singular: string, list: ReadonlyArray<{ id: string }>) => {
    const seen = new Set<string>();
    let dupes = 0;
    for (const row of list) {
      if (seen.has(row.id)) dupes += 1;
      seen.add(row.id);
    }
    if (dupes) errors.push(`${dupes} ${label} share an id with another ${singular}.`);
  };
  duplicates("sessions", "session", backup.workouts);
  duplicates("exercises in sessions", "exercise in a session", backup.workoutExercises);
  duplicates("sets", "set", backup.workoutSets);
  duplicates("library exercises", "library exercise", backup.exercises);

  const workoutIds = ids(backup.workouts);
  const blockIds = ids(backup.workoutExercises);
  const templateIds = ids(backup.templates);
  const orphanBlocks = backup.workoutExercises.filter(
    (row) => !workoutIds.has(row.workoutId),
  ).length;
  const orphanSets = backup.workoutSets.filter(
    (row) => !workoutIds.has(row.workoutId) || !blockIds.has(row.workoutExerciseId),
  ).length;
  const orphanRoutine = backup.templateExercises.filter(
    (row) => !templateIds.has(row.templateId),
  ).length;
  if (orphanBlocks) {
    errors.push(
      `${orphanBlocks} exercises in sessions belong to a session that is not in the file.`,
    );
  }
  if (orphanSets) {
    errors.push(`${orphanSets} sets belong to a session or exercise that is not in the file.`);
  }
  if (orphanRoutine) {
    errors.push(`${orphanRoutine} routine exercises belong to a routine that is not in the file.`);
  }
  return errors;
}

/**
 * Checks a backup file's contents. Accepts the file text or already-parsed JSON. On success the
 * result is a fully typed `LockdBackup` with older collections filled in; on failure it is a list
 * of reasons, the first few with where in the file they are.
 */
export function parseBackup(input: unknown): ParseBackupResult {
  let value = input;
  if (typeof input === "string") {
    if (input.length > MAX_BACKUP_BYTES) {
      return { ok: false, errors: ["That file is too large to be a backup."] };
    }
    try {
      value = JSON.parse(input);
    } catch {
      return {
        ok: false,
        errors: ["That file is not valid JSON, so it can’t be a Lock’d backup."],
      };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["That file is not a Lock’d backup."] };
  }
  const format = (value as { format?: unknown }).format;
  if (format !== BACKUP_FORMAT) return { ok: false, errors: ["That file is not a Lock’d backup."] };
  const version = (value as { version?: unknown }).version;
  if (typeof version === "number" && version > BACKUP_VERSION) {
    return {
      ok: false,
      errors: [
        `That backup was made by a newer version of Lock’d (format ${version}). Update the app and try again.`,
      ],
    };
  }

  const result = backupSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues;
    const shown = issues
      .slice(0, MAX_REPORTED)
      .map((issue) => `${describe(issue.path)}: ${issue.message}`);
    const more = issues.length - shown.length;
    return { ok: false, errors: more > 0 ? [...shown, `…and ${more} more problems.`] : shown };
  }

  const backup = result.data as unknown as LockdBackup;
  const problems = integrityErrors(backup);
  if (problems.length) return { ok: false, errors: problems };

  const warnings: string[] = [];
  const known = new Set(backup.exercises.map((row) => row.id));
  const unknown = new Set(
    backup.workoutExercises
      .map((row) => row.exerciseId)
      .filter((exerciseId) => !known.has(exerciseId)),
  );
  if (unknown.size) {
    warnings.push(
      `${unknown.size} exercises used in sessions are not in the file’s exercise list. Their sessions still read correctly from the names saved with them.`,
    );
  }
  return {
    ok: true,
    backup,
    warnings,
    summary: {
      exportedAt: backup.exportedAt,
      sessions: backup.workouts.filter((w) => w.status === "completed" || w.status === "active")
        .length,
      sets: backup.workoutSets.length,
      exercises: backup.exercises.length,
      programs: (backup.programs ?? []).length,
    },
  };
}
