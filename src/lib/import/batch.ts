import { uuid } from "@/domain/ids";
import type {
  Exercise,
  ImportIssue,
  ImportJob,
  ImportSource,
  UUID,
  Workout,
  WorkoutDetail,
  WorkoutExercise,
  WorkoutSet,
} from "@/domain/types";
import {
  fingerprintSession,
  normaliseExerciseName,
  type ImportAnalysis,
  type ParsedExercise,
  type SourceProfile,
} from "./engine";

/** Everything an import will add, ready to apply in one step. Building it writes nothing. */
export interface ImportBatch {
  job: ImportJob;
  newExercises: Exercise[];
  workouts: WorkoutDetail[];
  issues: ImportIssue[];
  duplicatesSkipped: number;
}

export interface BuildBatchOptions {
  source: SourceProfile;
  fileName: string;
  /** The library as it is now. Names are matched against it before any exercise is created. */
  existingExercises: readonly Exercise[];
  /** Fingerprints of sessions already in the log: those sessions are skipped. */
  existingFingerprints: ReadonlySet<string>;
  /** Import a session even when its fingerprint is already in the log. */
  allowDuplicates?: boolean;
  /** Import only these sessions (the preview's selection). */
  selectedKeys?: ReadonlySet<string>;
  /**
   * "Same exercise" decisions a person confirmed, keyed by `normaliseExerciseName(name in the file)`.
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
  const byName = new Map<string, Exercise>();
  for (const exercise of options.existingExercises)
    byName.set(normaliseExerciseName(exercise.name), exercise);
  const byId = new Map(options.existingExercises.map((exercise) => [exercise.id, exercise]));

  const newExercises: Exercise[] = [];
  const workouts: WorkoutDetail[] = [];
  let duplicatesSkipped = 0;
  let setsImported = 0;

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
      tzOffsetMinutes: started.getTimezoneOffset(),
      pausedSeconds: 0,
      notes: parsed.notes,
      importFingerprint: parsed.fingerprint,
      importJobId: jobId,
      createdAt: now,
      updatedAt: now,
    };

    const detail: WorkoutDetail = { workout, exercises: [] };
    parsed.exercises.forEach((entry, index) => {
      const key = normaliseExerciseName(entry.name);
      let exercise = byName.get(key);
      if (!exercise) {
        const confirmed = options.nameOverrides?.get(key);
        const chosen = confirmed ? byId.get(confirmed) : undefined;
        if (chosen) {
          exercise = chosen;
          byName.set(key, chosen);
        }
      }
      if (!exercise) {
        exercise = {
          id: newId(),
          // Kept as the file wrote it, so history reads the way the lifter logged it.
          name: entry.name,
          primaryMuscleGroup: "unmapped",
          secondaryMuscleGroups: [],
          equipment: "other",
          movementPattern: "isolation",
          trackingType: inferTrackingType(entry.sets),
          isCustom: true,
          isArchived: false,
          notes: `Created by an import from ${options.source.label}. Choose its muscle group and equipment to include it in muscle analytics.`,
          createdAt: now,
          updatedAt: now,
        };
        byName.set(key, exercise);
        newExercises.push(exercise);
      }

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
        restSeconds: 120,
        notes: entry.notes,
        supersetGroup: entry.superset,
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
        durationSeconds: set.durationSeconds,
        distanceM: set.distanceM,
        isCompleted: true,
        completedAt: parsed.startedAt,
        notes: set.notes,
      }));
      setsImported += sets.length;
      detail.exercises.push({ exercise: block, sets });
    });
    workouts.push(detail);
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
    ].filter(Boolean),
  };
  const issues: ImportIssue[] = analysis.issues.map((issue) => ({ id: newId(), jobId, ...issue }));
  return { job, newExercises, workouts, issues, duplicatesSkipped };
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
  const exact = new Set(existing.map((exercise) => normaliseExerciseName(exercise.name)));
  const pool = existing
    .map((exercise) => ({ exercise, tokens: words(exercise.name) }))
    .filter((entry) => entry.tokens.size >= CANDIDATE_MIN_WORDS);

  const out: ExerciseCandidate[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = normaliseExerciseName(name);
    if (seen.has(key) || exact.has(key)) continue;
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
}

/** The log with a batch added. Nothing already in the log changes. */
export function applyImportBatch(slice: LogSlice, batch: ImportBatch): LogSlice {
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
  };
}
