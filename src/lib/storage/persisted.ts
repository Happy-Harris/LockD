import { defaultSettings } from "@/lib/gym/settings";
import type { GymData } from "@/lib/gym/store";

/**
 * The shape and version of what the store writes to `localStorage['lockd-v1']`.
 *
 * These are live identifiers: the key, the version and the field list are the on-disk format of
 * every lifter's log today. Changing any of them is a migration with a fixture, never a cleanup.
 * They live here, apart from the store, so the coming Dexie migration (plan PR 5) can read an old
 * payload without importing the store.
 */
export const PERSIST_KEY = "lockd-v1";
export const PERSIST_VERSION = 3;

/** Every field the store persists. Actions and `hydrated` are not part of the log. */
export type PersistedSlice = Pick<
  GymData,
  | "exercises"
  | "templates"
  | "templateExercises"
  | "workouts"
  | "workoutExercises"
  | "workoutSets"
  | "measurements"
  | "plates"
  | "bars"
  | "settings"
  | "restTimer"
  | "labLast"
  | "programs"
  | "programWeeks"
  | "programSessions"
  | "programExercises"
  | "eraNames"
  | "machineSetups"
  | "lessons"
  | "namedPrs"
  | "clips"
  | "healthSamples"
>;

/** What `persist` writes for a given store state (its `partialize`). */
export function persistedSlice(state: PersistedSlice): PersistedSlice {
  return {
    exercises: state.exercises,
    templates: state.templates,
    templateExercises: state.templateExercises,
    workouts: state.workouts,
    workoutExercises: state.workoutExercises,
    workoutSets: state.workoutSets,
    measurements: state.measurements,
    plates: state.plates,
    bars: state.bars,
    settings: state.settings,
    restTimer: state.restTimer,
    labLast: state.labLast,
    programs: state.programs,
    programWeeks: state.programWeeks,
    programSessions: state.programSessions,
    programExercises: state.programExercises,
    eraNames: state.eraNames,
    machineSetups: state.machineSetups,
    lessons: state.lessons,
    namedPrs: state.namedPrs,
    clips: state.clips,
    healthSamples: state.healthSamples,
  };
}

/**
 * What the `localStorage` copy holds: the persisted slice, except that an empty `healthSamples` is left
 * out. A lifter who never read health data keeps a payload byte-for-byte in the format every earlier
 * build wrote and read, and an old payload loads unchanged (the store starts the collection empty).
 */
export function localStorageSlice(state: PersistedSlice): PersistedSlice {
  const slice = persistedSlice(state);
  if (slice.healthSamples && slice.healthSamples.length > 0) return slice;
  const { healthSamples: _empty, ...rest } = slice;
  return rest as PersistedSlice;
}

/**
 * Brings an older persisted payload up to the current shape: backfills collections and settings
 * that earlier builds never wrote. Pure, and extracted from the store unchanged, so the same
 * function can read a `localStorage` payload before it is copied into the new database.
 *
 * It is shape-tolerant on purpose: it does not read `version`, and it leaves fields it does not
 * know about alone.
 */
export function migratePersisted(persisted: unknown, _version: number): PersistedSlice {
  const state = persisted as Partial<GymData>;
  return {
    ...state,
    programs: state.programs ?? [],
    programWeeks: state.programWeeks ?? [],
    programSessions: state.programSessions ?? [],
    programExercises: state.programExercises ?? [],
    eraNames: state.eraNames ?? [],
    machineSetups: state.machineSetups ?? [],
    lessons: state.lessons ?? [],
    namedPrs: state.namedPrs ?? [],
    clips: state.clips ?? [],
    settings: { ...defaultSettings(), ...state.settings },
  } as PersistedSlice;
}
