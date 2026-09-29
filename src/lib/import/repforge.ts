import { z } from "zod";
import type {
  Equipment,
  MeasurementMetric,
  MovementPattern,
  MuscleGroup,
  SetType,
  TrackingType,
} from "@/domain/types";
import { EQUIPMENT, METRICS, MOVEMENTS, MUSCLES, TRACKING } from "@/lib/backup/schema";
import {
  fingerprintSession,
  type ExerciseHints,
  type ImportAnalysis,
  type IssueDraft,
  type ParsedExercise,
  type ParsedMeasurement,
  type ParsedSetRow,
  type ParsedTemplate,
  type ParsedWorkout,
} from "./engine";

/**
 * Reads a backup file from a sister app that keeps its log in the same shape (`repforge-backup`,
 * format 1). Its sessions, routines and measurements become the same parsed structures a CSV
 * produces, so they go through the same pipeline: the same duplicate check, the same exact-name
 * exercise match, the same "nothing invented" rules.
 *
 * What is carried: finished sessions (with sets, RPE, RIR, supersets, sides and notes), the
 * exercises they use with the source's own muscle groups, routines, and body measurements.
 * What is not: settings, bars, plates and the source's own import history. Those describe the
 * other app, not the lifter's training, and are reported rather than applied.
 *
 * The other app stored the time-zone offset with the opposite sign to this one (positive east).
 * It is negated here so the raw `getTimezoneOffset()` convention of this log holds.
 */

export const REPFORGE_SOURCE = { id: "repforge-json", label: "a backup from another app" } as const;

/** The newest format version this reader understands. */
const SUPPORTED_VERSION = 1;
const MAX_TEXT_BYTES = 64 * 1024 * 1024;
const MAX_ROWS = 500_000;

const id = z.string().min(1).max(200);
const text = z.string().max(4_000);
const stamp = z
  .string()
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), "not a date and time");
const number = z.number().finite();
const rows = <T extends z.ZodType>(schema: T) => z.array(schema).max(MAX_ROWS);

const exerciseSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  primaryMuscleGroup: z.string().max(40),
  secondaryMuscleGroups: z.array(z.string().max(40)).max(20).default([]),
  equipment: z.string().max(40),
  movementPattern: z.string().max(40),
  trackingType: z.string().max(40),
  incrementG: number.optional(),
  unilateral: z.boolean().optional(),
});

const templateSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  notes: text.optional(),
  order: number.default(0),
  isArchived: z.boolean().default(false),
});

const templateExerciseSchema = z.object({
  id,
  templateId: id,
  exerciseId: id,
  order: number,
  targetSets: number,
  targetRepMin: number.optional(),
  targetRepMax: number.optional(),
  targetRpe: number.optional(),
  targetRir: number.optional(),
  restSeconds: number.default(120),
  defaultSetType: z.string().max(20).default("working"),
  includeWarmup: z.boolean().default(false),
  notes: text.optional(),
  supersetGroup: z.string().max(100).optional(),
});

const workoutSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  status: z.string().max(20),
  startedAt: stamp,
  endedAt: stamp.optional(),
  localDate: z.string().max(20).optional(),
  tzOffsetMinutes: number.default(0),
  pausedSeconds: number.default(0),
  notes: text.optional(),
});

const workoutExerciseSchema = z.object({
  id,
  workoutId: id,
  exerciseId: id,
  order: number,
  exerciseNameSnapshot: z.string().min(1).max(200),
  primaryMuscleGroupSnapshot: z.string().max(40).optional(),
  secondaryMuscleGroupsSnapshot: z.array(z.string().max(40)).max(20).default([]),
  equipmentSnapshot: z.string().max(40).optional(),
  trackingTypeSnapshot: z.string().max(40).optional(),
  restSeconds: number.default(120),
  notes: text.optional(),
  supersetGroup: z.string().max(100).optional(),
  unilateralSnapshot: z.boolean().optional(),
});

const workoutSetSchema = z.object({
  id,
  workoutExerciseId: id,
  workoutId: id,
  order: number,
  setType: z.string().max(20),
  weightG: number.optional(),
  reps: number.optional(),
  rpe: number.optional(),
  rir: number.optional(),
  durationSeconds: number.optional(),
  distanceM: number.optional(),
  isCompleted: z.boolean(),
  notes: text.optional(),
  side: z.enum(["left", "right"]).optional(),
  pairId: id.optional(),
});

const measurementSchema = z.object({
  id,
  metric: z.string().max(40),
  value: number,
  displayUnit: z.enum(["kg", "lb", "cm", "in"]),
  recordedAt: stamp,
  localDate: z.string().max(20).optional(),
  note: text.optional(),
});

const fileSchema = z.object({
  format: z.literal("repforge-backup"),
  version: z.number().int().min(1),
  data: z.object({
    exercises: rows(exerciseSchema).default([]),
    templates: rows(templateSchema).default([]),
    templateExercises: rows(templateExerciseSchema).default([]),
    workouts: rows(workoutSchema).default([]),
    workoutExercises: rows(workoutExerciseSchema).default([]),
    workoutSets: rows(workoutSetSchema).default([]),
    measurements: rows(measurementSchema).default([]),
    barProfiles: z.array(z.unknown()).default([]),
    plateInventories: z.array(z.unknown()).default([]),
    settings: z.unknown().nullable().default(null),
  }),
});

export type ForeignReadResult =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      analysis: ImportAnalysis;
      /** What the file holds and what was left out, one plain line each. */
      notes: string[];
    };

export function isRepforgeBackup(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { format?: unknown }).format === "repforge-backup"
  );
}

const oneOf = <T extends string>(list: readonly T[], value: string | undefined): T | undefined =>
  list.find((entry) => entry === value);

/** A whole, non-negative number, or undefined when the source's value cannot be one. */
function whole(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

function wallClock(startedAt: string, tzRaw: number): string {
  const local = new Date(Date.parse(startedAt) - tzRaw * 60_000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
}

function describePath(path: PropertyKey[]): string {
  return path.reduce<string>(
    (out, part) =>
      typeof part === "number" ? `${out}[${part}]` : out ? `${out}.${String(part)}` : String(part),
    "",
  );
}

/**
 * The source's classification of an exercise, kept only where it is a value this log knows.
 * A value it does not know is left out (and the exercise stays unmapped), never guessed.
 */
function hintsFor(
  source: {
    primaryMuscleGroup?: string;
    secondaryMuscleGroups?: string[];
    equipment?: string;
    movementPattern?: string;
    trackingType?: string;
    unilateral?: boolean;
    incrementG?: number;
  },
  unknown: Set<string>,
): ExerciseHints | undefined {
  const hints: ExerciseHints = {};
  const primary = oneOf<MuscleGroup>(MUSCLES, source.primaryMuscleGroup);
  if (primary) {
    hints.primaryMuscleGroup = primary;
    hints.secondaryMuscleGroups = (source.secondaryMuscleGroups ?? [])
      .map((value) => oneOf<MuscleGroup>(MUSCLES, value))
      .filter((value): value is MuscleGroup => value !== undefined && value !== primary);
  } else if (source.primaryMuscleGroup) {
    unknown.add(source.primaryMuscleGroup);
  }
  const equipment = oneOf<Equipment>(EQUIPMENT, source.equipment);
  if (equipment) hints.equipment = equipment;
  const pattern = oneOf<MovementPattern>(MOVEMENTS, source.movementPattern);
  if (pattern) hints.movementPattern = pattern;
  const tracking = oneOf<TrackingType>(TRACKING, source.trackingType);
  if (tracking) hints.trackingType = tracking;
  if (source.unilateral !== undefined) hints.unilateral = source.unilateral;
  const increment = whole(source.incrementG);
  if (increment !== undefined && increment > 0) hints.incrementG = increment;
  return Object.keys(hints).length > 0 ? hints : undefined;
}

export function readRepforgeBackup(input: unknown): ForeignReadResult {
  let value = input;
  if (typeof input === "string") {
    if (input.length > MAX_TEXT_BYTES) {
      return { ok: false, errors: ["That file is too large to be a backup."] };
    }
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["That file is not valid JSON, so it can’t be a backup."] };
    }
  }
  if (!isRepforgeBackup(value)) {
    return { ok: false, errors: ["That file is not a backup this app can read."] };
  }
  const version = (value as { version?: unknown }).version;
  if (typeof version === "number" && version > SUPPORTED_VERSION) {
    return {
      ok: false,
      errors: [
        `That backup was made by a newer version of the other app (format ${version}), which this app can’t read yet.`,
      ],
    };
  }
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const shown = issues
      .slice(0, 8)
      .map((issue) => `${describePath(issue.path)}: ${issue.message}`);
    const more = issues.length - shown.length;
    return { ok: false, errors: more > 0 ? [...shown, `…and ${more} more problems.`] : shown };
  }
  const data = parsed.data.data;

  const issues: IssueDraft[] = [];
  const warn = (message: string) => issues.push({ row: 0, severity: "warning", message });
  const unknownMuscles = new Set<string>();

  const exerciseById = new Map(data.exercises.map((row) => [row.id, row]));
  const blocksByWorkout = new Map<string, typeof data.workoutExercises>();
  for (const block of data.workoutExercises) {
    const list = blocksByWorkout.get(block.workoutId) ?? [];
    list.push(block);
    blocksByWorkout.set(block.workoutId, list);
  }
  const setsByBlock = new Map<string, typeof data.workoutSets>();
  for (const set of data.workoutSets) {
    const list = setsByBlock.get(set.workoutExerciseId) ?? [];
    list.push(set);
    setsByBlock.set(set.workoutExerciseId, list);
  }

  let unfinished = 0;
  let unfinishedSets = 0;
  let emptyBlocks = 0;
  let adjusted = 0;
  const workouts: ParsedWorkout[] = [];

  for (const workout of data.workouts) {
    if (workout.status !== "completed") {
      unfinished += 1;
      continue;
    }
    const tzRaw = -workout.tzOffsetMinutes; // the source's sign is the opposite of this log's
    const wall = wallClock(workout.startedAt, tzRaw);
    const localDate =
      workout.localDate && /^\d{4}-\d{2}-\d{2}$/.test(workout.localDate)
        ? workout.localDate
        : wall.slice(0, 10);

    const exercises: ParsedExercise[] = [];
    const blocks = [...(blocksByWorkout.get(workout.id) ?? [])].sort((a, b) => a.order - b.order);
    for (const block of blocks) {
      const sets: ParsedSetRow[] = [];
      const source = [...(setsByBlock.get(block.id) ?? [])].sort((a, b) => a.order - b.order);
      source.forEach((set, position) => {
        if (!set.isCompleted) {
          unfinishedSets += 1;
          return;
        }
        const weightG = whole(set.weightG);
        const reps = whole(set.reps);
        const durationSeconds = whole(set.durationSeconds);
        const distanceM = whole(set.distanceM);
        if (
          (set.weightG !== undefined && weightG !== set.weightG) ||
          (set.reps !== undefined && reps !== set.reps) ||
          (set.durationSeconds !== undefined && durationSeconds !== set.durationSeconds) ||
          (set.distanceM !== undefined && distanceM !== set.distanceM)
        ) {
          adjusted += 1;
        }
        sets.push({
          rowNumber: position + 1,
          type: (oneOf<SetType>(["warmup", "working", "drop", "failure"], set.setType) ??
            "working") as SetType,
          weightG,
          reps,
          distanceM,
          durationSeconds,
          rpe: set.rpe !== undefined && set.rpe >= 1 && set.rpe <= 10 ? set.rpe : undefined,
          rir: set.rir !== undefined && set.rir >= 0 && set.rir <= 10 ? set.rir : undefined,
          side: set.side,
          pairId: set.pairId,
          notes: set.notes,
        });
      });
      if (sets.length === 0) {
        emptyBlocks += 1;
        continue;
      }
      const listed = exerciseById.get(block.exerciseId);
      exercises.push({
        name: block.exerciseNameSnapshot,
        notes: block.notes,
        superset: block.supersetGroup,
        restSeconds: whole(block.restSeconds),
        hints: hintsFor(
          {
            primaryMuscleGroup: block.primaryMuscleGroupSnapshot ?? listed?.primaryMuscleGroup,
            secondaryMuscleGroups: block.secondaryMuscleGroupsSnapshot.length
              ? block.secondaryMuscleGroupsSnapshot
              : listed?.secondaryMuscleGroups,
            equipment: block.equipmentSnapshot ?? listed?.equipment,
            movementPattern: listed?.movementPattern,
            trackingType: block.trackingTypeSnapshot ?? listed?.trackingType,
            unilateral: block.unilateralSnapshot ?? listed?.unilateral,
            incrementG: listed?.incrementG,
          },
          unknownMuscles,
        ),
        sets,
      });
    }
    if (exercises.length === 0) continue;

    const ended = workout.endedAt ? Date.parse(workout.endedAt) : undefined;
    const started = Date.parse(workout.startedAt);
    const duration =
      ended !== undefined && ended > started ? Math.round((ended - started) / 1000) : undefined;
    workouts.push({
      key: workout.id,
      fingerprint: fingerprintSession(wall, workout.name, exercises),
      name: workout.name,
      stamp: wall,
      localDate,
      startedAt: new Date(started).toISOString(),
      durationSeconds: duration,
      notes: workout.notes,
      tzOffsetMinutes: tzRaw,
      pausedSeconds: whole(workout.pausedSeconds) ?? 0,
      exercises,
      setCount: exercises.reduce((sum, entry) => sum + entry.sets.length, 0),
    });
  }
  workouts.sort((a, b) => a.stamp.localeCompare(b.stamp));

  const templates: ParsedTemplate[] = [];
  const routineRows = new Map<string, typeof data.templateExercises>();
  for (const row of data.templateExercises) {
    const list = routineRows.get(row.templateId) ?? [];
    list.push(row);
    routineRows.set(row.templateId, list);
  }
  let routineExercisesMissing = 0;
  for (const template of [...data.templates].sort((a, b) => a.order - b.order)) {
    const list = [...(routineRows.get(template.id) ?? [])].sort((a, b) => a.order - b.order);
    const entries: ParsedTemplate["exercises"] = [];
    for (const row of list) {
      const listed = exerciseById.get(row.exerciseId);
      if (!listed) {
        routineExercisesMissing += 1;
        continue;
      }
      entries.push({
        name: listed.name,
        hints: hintsFor(listed, unknownMuscles),
        targetSets: Math.max(1, whole(row.targetSets) ?? 1),
        targetRepMin: whole(row.targetRepMin),
        targetRepMax: whole(row.targetRepMax),
        targetRpe:
          row.targetRpe !== undefined && row.targetRpe >= 1 && row.targetRpe <= 10
            ? row.targetRpe
            : undefined,
        targetRir:
          row.targetRir !== undefined && row.targetRir >= 0 && row.targetRir <= 10
            ? row.targetRir
            : undefined,
        restSeconds: whole(row.restSeconds) ?? 120,
        defaultSetType: (oneOf<SetType>(
          ["warmup", "working", "drop", "failure"],
          row.defaultSetType,
        ) ?? "working") as SetType,
        includeWarmup: row.includeWarmup,
        notes: row.notes,
        superset: row.supersetGroup,
      });
    }
    templates.push({
      key: template.id,
      name: template.name,
      notes: template.notes,
      isArchived: template.isArchived,
      exercises: entries,
    });
  }

  const measurements: ParsedMeasurement[] = [];
  let measurementsSkipped = 0;
  for (const row of data.measurements) {
    const metric = oneOf<MeasurementMetric>(METRICS, row.metric);
    const valueWhole = whole(row.value);
    if (!metric || valueWhole === undefined || valueWhole <= 0) {
      measurementsSkipped += 1;
      continue;
    }
    measurements.push({
      metric,
      value: valueWhole,
      displayUnit: row.displayUnit,
      recordedAt: new Date(Date.parse(row.recordedAt)).toISOString(),
      localDate:
        row.localDate && /^\d{4}-\d{2}-\d{2}$/.test(row.localDate)
          ? row.localDate
          : row.recordedAt.slice(0, 10),
      note: row.note,
    });
  }

  const notes: string[] = [];
  if (unfinished > 0)
    warn(`${unfinished} session${unfinished === 1 ? " was" : "s were"} not finished and left out.`);
  if (unfinishedSets > 0)
    warn(
      `${unfinishedSets} set${unfinishedSets === 1 ? " was" : "s were"} planned but never completed and left out.`,
    );
  if (emptyBlocks > 0)
    warn(
      `${emptyBlocks} exercise${emptyBlocks === 1 ? " had" : "s had"} no completed sets and left out.`,
    );
  if (adjusted > 0)
    warn(
      `${adjusted} set${adjusted === 1 ? " had" : "s had"} a value that was not a whole number, rounded to one.`,
    );
  if (routineExercisesMissing > 0)
    warn(
      `${routineExercisesMissing} routine exercise${routineExercisesMissing === 1 ? " pointed" : "s pointed"} at an exercise missing from the file and left out.`,
    );
  if (measurementsSkipped > 0)
    warn(
      `${measurementsSkipped} measurement${measurementsSkipped === 1 ? " was" : "s were"} not a positive value of a known kind and left out.`,
    );
  if (unknownMuscles.size > 0)
    warn(
      `Muscle groups this app does not use were not carried over (${[...unknownMuscles].slice(0, 6).join(", ")}). Those exercises are unmapped.`,
    );
  const skippedKinds = [
    data.settings ? "settings" : "",
    data.barProfiles.length ? "bars" : "",
    data.plateInventories.length ? "plates" : "",
  ].filter(Boolean);
  if (skippedKinds.length > 0)
    notes.push(`Not imported: ${skippedKinds.join(", ")}. Set those up in this app.`);

  return {
    ok: true,
    analysis: {
      header: [],
      mapping: {},
      unmappedColumns: [],
      missingRequired: [],
      workouts,
      templates,
      measurements,
      issues,
      totalRows: data.workoutSets.length,
      skippedRows: unfinishedSets,
    },
    notes,
  };
}
