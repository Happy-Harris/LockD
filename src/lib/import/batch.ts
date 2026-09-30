import { uuid } from "@/domain/ids";
import type {
  BodyMeasurement,
  Exercise,
  ImportIssue,
  ImportJob,
  ImportSource,
  Template,
  TemplateExercise,
  UUID,
  Workout,
  WorkoutDetail,
  WorkoutExercise,
  WorkoutSet,
} from "@/domain/types";
import {
  exerciseMatcher,
  exerciseNameKey,
  fingerprintSession,
  normaliseExerciseName,
  type ExerciseHints,
  type ImportAnalysis,
  type ParsedExercise,
  type SourceProfile,
} from "./engine";

/** Everything an import will add, ready to apply in one step. Building it writes nothing. */
export interface ImportBatch {
  job: ImportJob;
  newExercises: Exercise[];
  workouts: WorkoutDetail[];
  /** Backups only: routines and measurements that are new to this log. */
  templates: Template[];
  templateExercises: TemplateExercise[];
  measurements: BodyMeasurement[];
  issues: ImportIssue[];
  duplicatesSkipped: number;
  /** Routines with the name of one already here, and measurements already recorded. */
  templatesSkipped: number;
  measurementsSkipped: number;
}

export interface BuildBatchOptions {
  source: Pick<SourceProfile, "id" | "label">;
  fileName: string;
  /** The library as it is now. Names are matched against it before any exercise is created. */
  existingExercises: readonly Exercise[];
  /** Fingerprints of sessions already in the log: those sessions are skipped. */
  existingFingerprints: ReadonlySet<string>;
  /** Routines and measurements already here, so a backup does not add them twice. */
  existingTemplates?: readonly Template[];
  existingMeasurements?: readonly BodyMeasurement[];
  /** Import a session even when its fingerprint is already in the log. */
  allowDuplicates?: boolean;
  /** Import only these sessions (the preview's selection). */
  selectedKeys?: ReadonlySet<string>;
  /**
   * "Same exercise" decisions a person confirmed, keyed by `exerciseNameKey(name in the file)`.
   * Checked before the exact-name match. A name that is not here and is not an exact match becomes a
   * new exercise: nothing is merged that nobody confirmed.
   */
  nameOverrides?: ReadonlyMap<string, UUID>;
  now?: () => Date;
  newId?: () => string;
}

/** Whether a set's values say how it was tracked: load and reps, distance, time, or reps alone. */
function inferTrackingType(sets: ParsedExercise["sets"]): Exercise["trackingType"] {
  const has = (pick: (set: ParsedExercise["sets"][number]) => number | undefined) =>
    sets.some((set) => (pick(set) ?? 0) > 0);
  if (has((set) => set.weightG)) return "weight_reps";
  if (has((set) => set.distanceM)) return "distance_duration";
  if (has((set) => set.durationSeconds) && !has((set) => set.reps)) return "duration";
  return "reps_only";
}

export function buildImportBatch(
  analysis: ImportAnalysis,
  options: BuildBatchOptions,
): ImportBatch {
  const now = (options.now?.() ?? new Date()).toISOString();
  const newId = options.newId ?? uuid;
  const jobId = newId();
  const matchExisting = exerciseMatcher(options.existingExercises);
  /** Names already resolved in this file, by `exerciseNameKey`. */
  const byName = new Map<string, Exercise>();
  const byId = new Map(options.existingExercises.map((exercise) => [exercise.id, exercise]));

  const newExercises: Exercise[] = [];
  const workouts: WorkoutDetail[] = [];
  let duplicatesSkipped = 0;
  let setsImported = 0;

  /** The exercise a name in the file stands for: one already here (exact name), or a new one. */
  const resolveExercise = (
    name: string,
    hints: ExerciseHints | undefined,
    sets: ParsedExercise["sets"],
  ): Exercise => {
    const key = exerciseNameKey(name);
    let exercise = byName.get(key) ?? matchExisting(name);
    if (!exercise) {
      const confirmed = options.nameOverrides?.get(key);
      const chosen = confirmed ? byId.get(confirmed) : undefined;
      if (chosen) {
        exercise = chosen;
        byName.set(key, chosen);
      }
    }
    if (!exercise) {
      // A source that classifies its own exercises passes its choices on. Anything it does not
      // say stays unmapped: a name with no classification in the source never gets one guessed.
      const classified = hints?.primaryMuscleGroup !== undefined;
      exercise = {
        id: newId(),
        // Kept as the file wrote it, so history reads the way the lifter logged it.
        name,
        primaryMuscleGroup: hints?.primaryMuscleGroup ?? "unmapped",
        secondaryMuscleGroups: hints?.secondaryMuscleGroups ?? [],
        equipment: hints?.equipment ?? "other",
        movementPattern: hints?.movementPattern ?? "isolation",
        trackingType: hints?.trackingType ?? inferTrackingType(sets),
        ...(hints?.unilateral !== undefined ? { unilateral: hints.unilateral } : {}),
        ...(hints?.incrementG !== undefined ? { incrementG: hints.incrementG } : {}),
        isCustom: true,
        isArchived: false,
        notes: classified
          ? `Created by an import from ${options.source.label}.`
          : `Created by an import from ${options.source.label}. Choose its muscle group and equipment to include it in muscle analytics.`,
        createdAt: now,
        updatedAt: now,
      };
      newExercises.push(exercise);
    }
    byName.set(key, exercise);
    return exercise;
  };

  for (const parsed of analysis.workouts) {
    if (options.selectedKeys && !options.selectedKeys.has(parsed.key)) continue;
    if (!options.allowDuplicates && options.existingFingerprints.has(parsed.fingerprint)) {
      duplicatesSkipped += 1;
      continue;
    }

    const workoutId = newId();
    const started = new Date(parsed.startedAt);
    const workout: Workout = {
      id: workoutId,
      name: parsed.name,
      status: "completed",
      startedAt: parsed.startedAt,
      endedAt: parsed.durationSeconds
        ? new Date(started.getTime() + parsed.durationSeconds * 1000).toISOString()
        : parsed.startedAt,
      localDate: parsed.localDate,
      // Raw `getTimezoneOffset()`: positive west of UTC. The sign is a live identifier of the log.
      tzOffsetMinutes: parsed.tzOffsetMinutes ?? started.getTimezoneOffset(),
      pausedSeconds: parsed.pausedSeconds ?? 0,
      notes: parsed.notes,
      importFingerprint: parsed.fingerprint,
      importJobId: jobId,
      createdAt: now,
      updatedAt: now,
    };

    const detail: WorkoutDetail = { workout, exercises: [] };
    parsed.exercises.forEach((entry, index) => {
      const exercise = resolveExercise(entry.name, entry.hints, entry.sets);
      const block: WorkoutExercise = {
        id: newId(),
        workoutId,
        exerciseId: exercise.id,
        order: index,
        exerciseNameSnapshot: exercise.name,
        primaryMuscleGroupSnapshot: exercise.primaryMuscleGroup,
        secondaryMuscleGroupsSnapshot: exercise.secondaryMuscleGroups,
        equipmentSnapshot: exercise.equipment,
        trackingTypeSnapshot: exercise.trackingType,
        restSeconds: entry.restSeconds ?? 120,
        notes: entry.notes,
        supersetGroup: entry.superset,
        ...(exercise.unilateral ? { unilateralSnapshot: true } : {}),
      };
      const sets: WorkoutSet[] = entry.sets.map((set, position) => ({
        id: newId(),
        workoutId,
        workoutExerciseId: block.id,
        order: position,
        setType: set.type,
        weightG: set.weightG,
        reps: set.reps,
        rpe: set.rpe,
        rir: set.rir,
        durationSeconds: set.durationSeconds,
        distanceM: set.distanceM,
        isCompleted: true,
        completedAt: parsed.startedAt,
        notes: set.notes,
        side: set.side,
        pairId: set.pairId,
      }));
      setsImported += sets.length;
      detail.exercises.push({ exercise: block, sets });
    });
    workouts.push(detail);
  }

  const templates: Template[] = [];
  const templateExercises: TemplateExercise[] = [];
  let templatesSkipped = 0;
  const templateNames = new Set(
    (options.existingTemplates ?? []).map((row) => row.name.trim().toLowerCase()),
  );
  const firstOrder = (options.existingTemplates ?? []).reduce(
    (max, row) => Math.max(max, row.order + 1),
    0,
  );
  for (const parsed of analysis.templates ?? []) {
    if (options.selectedKeys && !options.selectedKeys.has(parsed.key)) continue;
    const nameKey = parsed.name.trim().toLowerCase();
    if (templateNames.has(nameKey)) {
      templatesSkipped += 1;
      continue;
    }
    templateNames.add(nameKey);
    const template: Template = {
      id: newId(),
      name: parsed.name,
      notes: parsed.notes,
      order: firstOrder + templates.length,
      isArchived: parsed.isArchived,
      createdAt: now,
      updatedAt: now,
    };
    templates.push(template);
    parsed.exercises.forEach((entry, index) => {
      const exercise = resolveExercise(entry.name, entry.hints, []);
      templateExercises.push({
        id: newId(),
        templateId: template.id,
        exerciseId: exercise.id,
        order: index,
        targetSets: entry.targetSets,
        targetRepMin: entry.targetRepMin,
        targetRepMax: entry.targetRepMax,
        targetRpe: entry.targetRpe,
        targetRir: entry.targetRir,
        restSeconds: entry.restSeconds,
        defaultSetType: entry.defaultSetType,
        includeWarmup: entry.includeWarmup,
        notes: entry.notes,
        supersetGroup: entry.superset,
      });
    });
  }

  const measurements: BodyMeasurement[] = [];
  let measurementsSkipped = 0;
  const measurementKey = (metric: string, recordedAt: string, value: number) =>
    `${metric}|${recordedAt}|${value}`;
  const seenMeasurements = new Set(
    (options.existingMeasurements ?? []).map((row) =>
      measurementKey(row.metric, row.recordedAt, row.value),
    ),
  );
  for (const parsed of analysis.measurements ?? []) {
    const key = measurementKey(parsed.metric, parsed.recordedAt, parsed.value);
    if (seenMeasurements.has(key)) {
      measurementsSkipped += 1;
      continue;
    }
    seenMeasurements.add(key);
    measurements.push({
      id: newId(),
      metric: parsed.metric,
      value: parsed.value,
      displayUnit: parsed.displayUnit,
      recordedAt: parsed.recordedAt,
      localDate: parsed.localDate,
      note: parsed.note,
      createdAt: now,
      updatedAt: now,
    });
  }

  const source: ImportSource = options.source.id;
  const job: ImportJob = {
    id: jobId,
    source,
    fileName: options.fileName,
    startedAt: now,
    finishedAt: now,
    status: "completed",
    workoutsImported: workouts.length,
    setsImported,
    exercisesCreated: newExercises.length,
    rowsSkipped: analysis.skippedRows,
    messages: [
      `${workouts.length} session${workouts.length === 1 ? "" : "s"} imported from ${options.fileName}.`,
      `${setsImported} sets written, ${newExercises.length} new exercise${newExercises.length === 1 ? "" : "s"}.`,
      duplicatesSkipped > 0 ? `${duplicatesSkipped} already here, skipped.` : "",
      templates.length > 0
        ? `${templates.length} routine${templates.length === 1 ? "" : "s"} added.`
        : "",
      measurements.length > 0
        ? `${measurements.length} measurement${measurements.length === 1 ? "" : "s"} added.`
        : "",
    ].filter(Boolean),
  };
  const issues: ImportIssue[] = analysis.issues.map((issue) => ({ id: newId(), jobId, ...issue }));
  return {
    job,
    newExercises,
    workouts,
    templates,
    templateExercises,
    measurements,
    issues,
    duplicatesSkipped,
    templatesSkipped,
    measurementsSkipped,
  };
}

// ---------------------------------------------------------------- what is already here

interface StoredLog {
  workouts: readonly Workout[];
  workoutExercises: readonly WorkoutExercise[];
  workoutSets: readonly WorkoutSet[];
}

/** The local wall-clock time a stored session started, from its instant and its recorded offset. */
function storedStamp(workout: Workout): string {
  const local = new Date(new Date(workout.startedAt).getTime() - workout.tzOffsetMinutes * 60_000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
}

/**
 * Fingerprints of the sessions already in the log. A session imported by this pipeline carries its
 * own. For every other session one is worked out from what is stored, so a file imported before
 * fingerprints existed is still recognised. That is best effort: it matches when the session's
 * start, name and every set value are the same as the file's.
 */
export function storedFingerprints(log: StoredLog): Set<string> {
  const blocksByWorkout = new Map<string, WorkoutExercise[]>();
  for (const block of log.workoutExercises) {
    const list = blocksByWorkout.get(block.workoutId) ?? [];
    list.push(block);
    blocksByWorkout.set(block.workoutId, list);
  }
  const setsByBlock = new Map<string, WorkoutSet[]>();
  for (const set of log.workoutSets) {
    const list = setsByBlock.get(set.workoutExerciseId) ?? [];
    list.push(set);
    setsByBlock.set(set.workoutExerciseId, list);
  }

  const out = new Set<string>();
  for (const workout of log.workouts) {
    if (workout.importFingerprint) out.add(workout.importFingerprint);
    if (workout.status !== "completed") continue;
    const blocks = [...(blocksByWorkout.get(workout.id) ?? [])].sort((a, b) => a.order - b.order);
    out.add(
      fingerprintSession(
        storedStamp(workout),
        workout.name,
        blocks.map((block) => ({
          name: block.exerciseNameSnapshot,
          sets: [...(setsByBlock.get(block.id) ?? [])]
            .sort((a, b) => a.order - b.order)
            .map((set) => ({
              type: set.setType,
              weightG: set.weightG,
              reps: set.reps,
              durationSeconds: set.durationSeconds,
              distanceM: set.distanceM,
            })),
        })),
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------- near matches

/** A name from a file that is not an exact match, but reads like an exercise already here. */
export interface ExerciseCandidate {
  /** The name exactly as the file wrote it. */
  name: string;
  exercise: Exercise;
  /** Share of words the two names have in common, 0 to 1. For display only. */
  score: number;
}

const CANDIDATE_MIN_SCORE = 0.7;
/** Below this many words on a side, matching is too unreliable to suggest ("Curl" and "Curl-Up"). */
const CANDIDATE_MIN_WORDS = 2;

const words = (name: string) => {
  const normalised = normaliseExerciseName(name);
  return new Set(normalised ? normalised.split(" ") : []);
};

/**
 * For each name in a file that does not exactly match the library, the closest existing exercise it
 * might be, most often a reordering ("Bench Press - Close Grip" and "Close-Grip Bench Press"). This
 * only suggests. A person confirms each one before anything is merged.
 */
export function findExerciseCandidates(
  names: readonly string[],
  existing: readonly Exercise[],
): ExerciseCandidate[] {
  const matchExisting = exerciseMatcher(existing);
  const pool = existing
    .map((exercise) => ({ exercise, tokens: words(exercise.name) }))
    .filter((entry) => entry.tokens.size >= CANDIDATE_MIN_WORDS);

  const out: ExerciseCandidate[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = exerciseNameKey(name);
    if (seen.has(key) || matchExisting(name)) continue;
    seen.add(key);
    const tokens = words(name);
    if (tokens.size < CANDIDATE_MIN_WORDS) continue;
    let best: { exercise: Exercise; score: number } | null = null;
    for (const entry of pool) {
      let shared = 0;
      for (const token of tokens) if (entry.tokens.has(token)) shared += 1;
      const score = shared / Math.max(tokens.size, entry.tokens.size);
      if (score >= CANDIDATE_MIN_SCORE && (!best || score > best.score))
        best = { exercise: entry.exercise, score };
    }
    if (best) out.push({ name, exercise: best.exercise, score: best.score });
  }
  return out;
}

// ---------------------------------------------------------------- applying

interface LogSlice {
  exercises: Exercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  workoutSets: WorkoutSet[];
  templates?: Template[];
  templateExercises?: TemplateExercise[];
  measurements?: BodyMeasurement[];
}

/**
 * The log with a batch added. Nothing already in the log changes, and a collection the batch adds
 * nothing to comes back as the same array, so the store does not see it as changed.
 */
export function applyImportBatch(slice: LogSlice, batch: ImportBatch): Required<LogSlice> {
  return {
    exercises: [...slice.exercises, ...batch.newExercises],
    workouts: [...slice.workouts, ...batch.workouts.map((detail) => detail.workout)],
    workoutExercises: [
      ...slice.workoutExercises,
      ...batch.workouts.flatMap((detail) => detail.exercises.map((entry) => entry.exercise)),
    ],
    workoutSets: [
      ...slice.workoutSets,
      ...batch.workouts.flatMap((detail) => detail.exercises.flatMap((entry) => entry.sets)),
    ],
    templates: batch.templates.length
      ? [...(slice.templates ?? []), ...batch.templates]
      : (slice.templates ?? []),
    templateExercises: batch.templateExercises.length
      ? [...(slice.templateExercises ?? []), ...batch.templateExercises]
      : (slice.templateExercises ?? []),
    measurements: batch.measurements.length
      ? [...(slice.measurements ?? []), ...batch.measurements]
      : (slice.measurements ?? []),
  };
}
