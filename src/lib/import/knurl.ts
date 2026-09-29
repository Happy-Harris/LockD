import { z } from "zod";
import type {
  Equipment,
  MeasurementMetric,
  MovementPattern,
  MuscleGroup,
  SetType,
  TrackingType,
} from "@/domain/types";
import {
  fingerprintSession,
  type ExerciseHints,
  type IssueDraft,
  type ParsedExercise,
  type ParsedMeasurement,
  type ParsedSetRow,
  type ParsedTemplate,
  type ParsedWorkout,
} from "./engine";
import {
  oneOf,
  parseJsonInput,
  refusalFrom,
  wallClock,
  whole,
  type ForeignReadResult,
} from "./foreign";
import { localStampOf } from "./parse";

/**
 * Reads a vault export from a sister app that logs in its own vocabulary (`brand: "knurl-os"`,
 * schema version 1). Same rule as every importer: what the file says is carried, and where the
 * two vocabularies do not line up the difference is stated, not smoothed over.
 *
 * Differences handled here, all of them named in the summary the lifter reads:
 *  - Weights are kilograms as decimals and distances metres as decimals; they become whole grams
 *    and whole metres.
 *  - Muscle groups are finer or different in places. Names that are the same or a plain renaming
 *    map directly (`quadriceps` → `quads`, `abdominals` → `core`); a group this app does not split
 *    (three delts, upper back and spinal erectors) is mapped to the group that contains it and the
 *    summary says so.
 *  - Movement patterns `push` and `pull` cannot be told apart as horizontal or vertical, so the
 *    exercise gets no pattern from the file (the placeholder every unclassified exercise has) and
 *    the summary says so. Nothing is guessed.
 *  - Girths recorded as one value for both sides (`arms`, `thighs`, `calves`) stay one value with
 *    no side; they are never split into left and right.
 *  - The session's time-zone offset already uses this log's sign and is carried as it is.
 */

export const KNURL_SOURCE = { id: "knurl-json", label: "a backup from another app" } as const;

const SUPPORTED_VERSION = 1;
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
  equipmentType: z.string().max(40),
  movementPattern: z.string().max(40),
  trackingType: z.string().max(40),
});

const templateSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  notes: text.default(""),
  isArchived: z.boolean().default(false),
});

const templateExerciseSchema = z.object({
  id,
  templateId: id,
  exerciseId: id,
  order: number,
  supersetId: z.string().max(100).nullable().default(null),
  targetSets: number,
  repMin: number.optional(),
  repMax: number.optional(),
  targetRpe: number.nullable().default(null),
  targetRir: number.nullable().default(null),
  restSeconds: number.default(120),
  includeWarmup: z.boolean().default(false),
  notes: text.default(""),
});

const workoutSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  status: z.string().max(20),
  startedAt: stamp,
  completedAt: stamp.nullable().default(null),
  durationSeconds: number.nullable().default(null),
  timezoneOffsetMinutes: number.default(0),
  notes: text.default(""),
});

const workoutExerciseSchema = z.object({
  id,
  workoutId: id,
  exerciseId: id,
  order: number,
  supersetId: z.string().max(100).nullable().default(null),
  snapshotName: z.string().min(1).max(200),
  snapshotPrimary: z.string().max(40),
  snapshotSecondary: z.array(z.string().max(40)).max(20).default([]),
  snapshotEquipment: z.string().max(40),
  snapshotPattern: z.string().max(40),
  snapshotTracking: z.string().max(40),
  restSeconds: number.default(120),
  notes: text.default(""),
});

const workoutSetSchema = z.object({
  id,
  workoutExerciseId: id,
  setIndex: number,
  classification: z.string().max(20),
  weightKg: number.nullable().default(null),
  reps: number.nullable().default(null),
  durationSeconds: number.nullable().default(null),
  distanceMeters: number.nullable().default(null),
  rpe: number.nullable().default(null),
  rir: number.nullable().default(null),
  isCompleted: z.boolean(),
});

const measurementSchema = z.object({
  id,
  metric: z.string().max(40),
  valueCanonical: number,
  measuredAt: stamp,
  notes: text.default(""),
});

const fileSchema = z.object({
  brand: z.literal("knurl-os"),
  schemaVersion: z.number().int().min(1),
  exercises: rows(exerciseSchema).default([]),
  templates: rows(templateSchema).default([]),
  templateExercises: rows(templateExerciseSchema).default([]),
  workouts: rows(workoutSchema).default([]),
  workoutExercises: rows(workoutExerciseSchema).default([]),
  workoutSets: rows(workoutSetSchema).default([]),
  bodyMeasurements: rows(measurementSchema).default([]),
  equipmentProfile: z.unknown().optional(),
  prefs: z
    .object({ units: z.enum(["kg", "lb"]).default("kg") })
    .partial()
    .optional(),
});

export function isKnurlVault(value: unknown): boolean {
  return (
    !!value && typeof value === "object" && (value as { brand?: unknown }).brand === "knurl-os"
  );
}

/** Where the two muscle vocabularies differ, and what each source group becomes here. */
const MUSCLE_MAP: Record<string, MuscleGroup> = {
  quadriceps: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  adductors: "adductors",
  chest: "chest",
  lats: "lats",
  upper_back: "back",
  traps: "traps",
  spinal_erectors: "back",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  abdominals: "core",
  obliques: "core",
  neck: "neck",
};
/** The source groups that this app holds inside a wider group. */
const MERGED_MUSCLES = new Set([
  "upper_back",
  "spinal_erectors",
  "front_delts",
  "side_delts",
  "rear_delts",
  "obliques",
]);

const EQUIPMENT_MAP: Record<string, Equipment> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  cable: "cable",
  machine: "machine",
  bodyweight: "bodyweight",
  specialty_bar: "barbell",
};

/** `push` and `pull` are absent on purpose: horizontal or vertical is not in the file. */
const PATTERN_MAP: Record<string, MovementPattern> = {
  squat: "squat",
  hinge: "hinge",
  carry: "carry",
  isolation: "isolation",
};

const TRACKING_MAP: Record<string, TrackingType> = {
  weight_reps: "weight_reps",
  reps_only: "reps_only",
  duration: "duration",
  distance_time: "distance_duration",
};

const METRIC_MAP: Record<string, MeasurementMetric> = {
  bodyweight: "bodyweight",
  arms: "arms",
  chest: "chest",
  waist: "waist",
  hips: "hips",
  thighs: "thighs",
  calves: "calves",
  shoulders: "shoulders",
  neck: "neck",
};

interface Seen {
  merged: Set<string>;
  unknownMuscles: Set<string>;
  specialtyBar: boolean;
  noPattern: boolean;
}

function hintsFor(
  source: {
    primary: string;
    secondary: string[];
    equipment: string;
    pattern: string;
    tracking: string;
  },
  seen: Seen,
): ExerciseHints | undefined {
  const hints: ExerciseHints = {};
  const mapMuscle = (value: string): MuscleGroup | undefined => {
    const mapped = MUSCLE_MAP[value];
    if (!mapped) {
      seen.unknownMuscles.add(value);
      return undefined;
    }
    if (MERGED_MUSCLES.has(value)) seen.merged.add(value);
    return mapped;
  };
  const primary = mapMuscle(source.primary);
  if (primary) {
    hints.primaryMuscleGroup = primary;
    hints.secondaryMuscleGroups = [
      ...new Set(
        source.secondary
          .map(mapMuscle)
          .filter((value): value is MuscleGroup => value !== undefined && value !== primary),
      ),
    ];
  }
  const equipment = EQUIPMENT_MAP[source.equipment];
  if (equipment) {
    hints.equipment = equipment;
    if (source.equipment === "specialty_bar") seen.specialtyBar = true;
  }
  const pattern = PATTERN_MAP[source.pattern];
  if (pattern) hints.movementPattern = pattern;
  else if (source.pattern) seen.noPattern = true;
  const tracking = TRACKING_MAP[source.tracking];
  if (tracking) hints.trackingType = tracking;
  return Object.keys(hints).length > 0 ? hints : undefined;
}

const SET_TYPES: readonly SetType[] = ["warmup", "working", "drop", "failure"];

export function readKnurlVault(input: unknown): ForeignReadResult {
  const json = parseJsonInput(input);
  if (!json.ok) return json;
  const value = json.value;
  if (!isKnurlVault(value)) {
    return { ok: false, errors: ["That file is not a backup this app can read."] };
  }
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version === "number" && version > SUPPORTED_VERSION) {
    return {
      ok: false,
      errors: [
        `That backup was made by a newer version of the other app (format ${version}), which this app can’t read yet.`,
      ],
    };
  }
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) return refusalFrom(parsed.error.issues);
  const data = parsed.data;

  const issues: IssueDraft[] = [];
  const warn = (message: string) => issues.push({ row: 0, severity: "warning", message });
  const seen: Seen = {
    merged: new Set(),
    unknownMuscles: new Set(),
    specialtyBar: false,
    noPattern: false,
  };

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
  let outOfRange = 0;
  const workouts: ParsedWorkout[] = [];

  for (const workout of data.workouts) {
    if (workout.status !== "completed") {
      unfinished += 1;
      continue;
    }
    const tzRaw = workout.timezoneOffsetMinutes; // already this log's sign
    const wall = wallClock(workout.startedAt, tzRaw);

    const exercises: ParsedExercise[] = [];
    const blocks = [...(blocksByWorkout.get(workout.id) ?? [])].sort((a, b) => a.order - b.order);
    for (const block of blocks) {
      const sets: ParsedSetRow[] = [];
      const source = [...(setsByBlock.get(block.id) ?? [])].sort((a, b) => a.setIndex - b.setIndex);
      source.forEach((set, position) => {
        if (!set.isCompleted) {
          unfinishedSets += 1;
          return;
        }
        const rpe = set.rpe !== null && set.rpe >= 1 && set.rpe <= 10 ? set.rpe : undefined;
        const rir = set.rir !== null && set.rir >= 0 && set.rir <= 10 ? set.rir : undefined;
        if ((set.rpe !== null && rpe === undefined) || (set.rir !== null && rir === undefined)) {
          outOfRange += 1;
        }
        sets.push({
          rowNumber: position + 1,
          type: oneOf(SET_TYPES, set.classification) ?? "working",
          // Kilograms and metres as decimals become whole grams and whole metres.
          weightG: set.weightKg === null ? undefined : whole(set.weightKg * 1000),
          reps: set.reps === null ? undefined : whole(set.reps),
          distanceM: set.distanceMeters === null ? undefined : whole(set.distanceMeters),
          durationSeconds: set.durationSeconds === null ? undefined : whole(set.durationSeconds),
          rpe,
          rir,
        });
      });
      if (sets.length === 0) {
        emptyBlocks += 1;
        continue;
      }
      exercises.push({
        name: block.snapshotName,
        notes: block.notes || undefined,
        superset: block.supersetId ?? undefined,
        restSeconds: whole(block.restSeconds),
        hints: hintsFor(
          {
            primary: block.snapshotPrimary,
            secondary: block.snapshotSecondary,
            equipment: block.snapshotEquipment,
            pattern: block.snapshotPattern,
            tracking: block.snapshotTracking,
          },
          seen,
        ),
        sets,
      });
    }
    if (exercises.length === 0) continue;

    const started = Date.parse(workout.startedAt);
    const ended = workout.completedAt ? Date.parse(workout.completedAt) : undefined;
    const duration =
      workout.durationSeconds !== null && workout.durationSeconds > 0
        ? Math.round(workout.durationSeconds)
        : ended !== undefined && ended > started
          ? Math.round((ended - started) / 1000)
          : undefined;
    workouts.push({
      key: workout.id,
      fingerprint: fingerprintSession(wall, workout.name, exercises),
      name: workout.name,
      stamp: wall,
      localDate: wall.slice(0, 10),
      startedAt: new Date(started).toISOString(),
      durationSeconds: duration,
      notes: workout.notes || undefined,
      tzOffsetMinutes: tzRaw,
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
  for (const template of data.templates) {
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
        hints: hintsFor(
          {
            primary: listed.primaryMuscleGroup,
            secondary: listed.secondaryMuscleGroups,
            equipment: listed.equipmentType,
            pattern: listed.movementPattern,
            tracking: listed.trackingType,
          },
          seen,
        ),
        targetSets: Math.max(1, whole(row.targetSets) ?? 1),
        targetRepMin: whole(row.repMin),
        targetRepMax: whole(row.repMax),
        targetRpe:
          row.targetRpe !== null && row.targetRpe >= 1 && row.targetRpe <= 10
            ? row.targetRpe
            : undefined,
        targetRir:
          row.targetRir !== null && row.targetRir >= 0 && row.targetRir <= 10
            ? row.targetRir
            : undefined,
        restSeconds: whole(row.restSeconds) ?? 120,
        defaultSetType: "working",
        includeWarmup: row.includeWarmup,
        notes: row.notes || undefined,
        superset: row.supersetId ?? undefined,
      });
    }
    templates.push({
      key: template.id,
      name: template.name,
      notes: template.notes || undefined,
      isArchived: template.isArchived,
      exercises: entries,
    });
  }

  const imperial = data.prefs?.units === "lb";
  const measurements: ParsedMeasurement[] = [];
  let measurementsSkipped = 0;
  for (const row of data.bodyMeasurements) {
    const metric = METRIC_MAP[row.metric];
    if (!metric || !(row.valueCanonical > 0)) {
      measurementsSkipped += 1;
      continue;
    }
    // Canonical there is kilograms or centimetres as decimals; here it is grams or millimetres.
    const isMass = metric === "bodyweight";
    const value = Math.round(row.valueCanonical * (isMass ? 1000 : 10));
    if (value <= 0) {
      measurementsSkipped += 1;
      continue;
    }
    const at = new Date(Date.parse(row.measuredAt));
    measurements.push({
      metric,
      value,
      displayUnit: isMass ? (imperial ? "lb" : "kg") : imperial ? "in" : "cm",
      recordedAt: at.toISOString(),
      localDate: localStampOf(at).slice(0, 10),
      note: row.notes || undefined,
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
  if (outOfRange > 0)
    warn(
      `${outOfRange} RPE or RIR value${outOfRange === 1 ? " was" : "s were"} outside its range and left out.`,
    );
  if (routineExercisesMissing > 0)
    warn(
      `${routineExercisesMissing} routine exercise${routineExercisesMissing === 1 ? " pointed" : "s pointed"} at an exercise missing from the file and left out.`,
    );
  if (measurementsSkipped > 0)
    warn(
      `${measurementsSkipped} measurement${measurementsSkipped === 1 ? " was" : "s were"} not a positive value of a known kind and left out.`,
    );
  if (seen.merged.size > 0)
    warn(
      `This app groups some muscles more broadly than the file does (${[...seen.merged]
        .map((name) => name.replace(/_/g, " "))
        .join(", ")}): each was mapped to the wider group.`,
    );
  if (seen.unknownMuscles.size > 0)
    warn(
      `Muscle groups this app does not know were not carried over (${[...seen.unknownMuscles].slice(0, 6).join(", ")}). Those exercises are unmapped.`,
    );
  if (seen.specialtyBar) warn("Specialty-bar exercises were set to barbell.");
  if (seen.noPattern)
    warn(
      "The file does not split push and pull into horizontal and vertical, so those exercises carry the placeholder pattern “isolation”. Classify them in the library.",
    );
  const skippedKinds = [
    data.prefs ? "settings" : "",
    data.equipmentProfile ? "bars and plates" : "",
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
