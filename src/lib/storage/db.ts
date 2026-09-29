import Dexie, { type Table } from "dexie";
import type {
  BarProfile,
  BodyMeasurement,
  EraName,
  Exercise,
  ExerciseLesson,
  MachineSetup,
  NamedPr,
  PlateInventory,
  Program,
  ProgramExercise,
  ProgramSession,
  ProgramWeek,
  Template,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  ClipMeta,
} from "@/domain/types";

/**
 * The IndexedDB database `lockd` (a live identifier: never rename it or a table).
 *
 * Version 1 held only `safetyBackups`. Version 2 adds the log tables from
 * docs/consolidation/PLAN.md § 4. Every later change is a new `version(n)` block that never
 * removes or renames a table, each with a test and an old-format fixture.
 *
 * Deviation from the plan's table: `isCustom` and `isArchived` are not indexed. They are booleans,
 * and IndexedDB cannot use a boolean as a key, so those indexes would always be empty.
 *
 * Nothing reads or writes the log tables yet: the store still persists to `localStorage`. The
 * migration and the switch-over land in the next plan PR 5 slices.
 */
export type SafetyReason = "before-cloud-sign-in" | "pre-migration" | "before-restore";

export interface SafetyBackup {
  id: string;
  createdAt: string;
  reason: SafetyReason;
  /** Completed + in-progress sessions in the copy, for the list in Settings. */
  sessions: number;
  /** The copy: a `lockd-backup` JSON document, or the raw `localStorage` string (see `format`). */
  json: string;
  /** Missing means `lockd-backup`. `raw-localstorage` is the untouched `lockd-v1` string. */
  format?: "lockd-backup" | "raw-localstorage";
}

/** One row per key: settings, the rest timer and the last Lab answer live here as documents. */
export interface KvRow {
  key: string;
  value: unknown;
}

/** Storage bookkeeping: schema version, and where the data came from (see the migration). */
export interface MetaRow {
  key: string;
  value: unknown;
}

export class LockdDatabase extends Dexie {
  safetyBackups!: Table<SafetyBackup, string>;
  exercises!: Table<Exercise, string>;
  templates!: Table<Template, string>;
  templateExercises!: Table<TemplateExercise, string>;
  workouts!: Table<Workout, string>;
  workoutExercises!: Table<WorkoutExercise, string>;
  workoutSets!: Table<WorkoutSet, string>;
  measurements!: Table<BodyMeasurement, string>;
  plates!: Table<PlateInventory, string>;
  bars!: Table<BarProfile, string>;
  programs!: Table<Program, string>;
  programWeeks!: Table<ProgramWeek, string>;
  programSessions!: Table<ProgramSession, string>;
  programExercises!: Table<ProgramExercise, string>;
  eraNames!: Table<EraName, string>;
  machineSetups!: Table<MachineSetup, string>;
  lessons!: Table<ExerciseLesson, string>;
  namedPrs!: Table<NamedPr, string>;
  clips!: Table<ClipMeta, string>;
  kv!: Table<KvRow, string>;
  meta!: Table<MetaRow, string>;
  /** Device-only values (for example text size). Never part of settings, sync or the cloud vault. */
  device!: Table<KvRow, string>;

  constructor(name = "lockd") {
    super(name);
    this.version(1).stores({ safetyBackups: "id, createdAt, reason" });
    this.version(2).stores({
      exercises: "id, name",
      templates: "id",
      templateExercises: "id, templateId, exerciseId",
      workouts: "id, status, localDate, startedAt, templateId, programId, importFingerprint",
      workoutExercises: "id, workoutId, exerciseId, [exerciseId+workoutId]",
      workoutSets: "id, workoutId, workoutExerciseId",
      measurements: "id, [metric+recordedAt]",
      plates: "id",
      bars: "id",
      programs: "id",
      programWeeks: "id, programId",
      programSessions: "id, programId",
      programExercises: "id, programSessionId",
      eraNames: "startDate",
      machineSetups: "exerciseId",
      lessons: "id, exerciseId",
      namedPrs: "id, exerciseId",
      clips: "id, setId",
      kv: "key",
      meta: "key",
      device: "key",
    });
    // Measured in Chromium with a 5-year log (15,000 sets, 4,500 exercise blocks): writing them with
    // the two indexes above took 14.4 s; with the primary key only, 2.8 s. Nothing queries by those
    // indexes (the engines read the whole log from memory), so version 3 drops them. An index can
    // be added back in a later version, which backfills it, when a query needs one.
    this.version(3).stores({
      workoutSets: "id",
      workoutExercises: "id",
    });
  }
}

let instance: LockdDatabase | null = null;

export function getLockdDb(): LockdDatabase {
  if (!instance) instance = new LockdDatabase();
  return instance;
}

/** Tests point the module at a dedicated database. */
export function setLockdDb(db: LockdDatabase | null) {
  instance = db;
}
