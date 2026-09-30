export type UUID = string;
export type ISODateTime = string;
export type ISODate = string;

export type UnitSystem = "metric" | "imperial";
export type WeekStartDay = "saturday" | "sunday" | "monday";

export type MuscleGroup =
  | "unmapped"
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "traps"
  | "lats"
  | "adductors"
  | "abductors"
  | "neck"
  | "full body"
  | "cardio";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "smith machine"
  | "plate"
  | "other";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "horizontal push"
  | "vertical push"
  | "horizontal pull"
  | "vertical pull"
  | "lunge"
  | "carry"
  | "isolation"
  | "core"
  | "conditioning";

export type TrackingType =
  | "weight_reps"
  | "reps_only"
  | "duration"
  | "distance_duration"
  | "assisted_weight";

export interface MuscleTargetBand {
  min: number;
  max: number;
}

export type PersonalMuscleTargets = Partial<Record<MuscleGroup, MuscleTargetBand>>;

export interface Exercise {
  id: UUID;
  name: string;
  primaryMuscleGroup: MuscleGroup;
  secondaryMuscleGroups: MuscleGroup[];
  equipment: Equipment;
  movementPattern: MovementPattern;
  trackingType: TrackingType;
  incrementG?: number;
  unilateral?: boolean;
  isCustom: boolean;
  isArchived: boolean;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type SetType = "warmup" | "working" | "drop" | "failure";
export type GrindFeel = "easy" | "normal" | "grind";

export interface TemplateExercise {
  id: UUID;
  templateId: UUID;
  exerciseId: UUID;
  order: number;
  targetSets: number;
  targetRepMin?: number;
  targetRepMax?: number;
  targetRpe?: number;
  /** Reps in reserve the routine asks for. Used when `intensityMode` is `rir`. */
  targetRir?: number;
  restSeconds: number;
  defaultSetType: SetType;
  includeWarmup: boolean;
  notes?: string;
  supersetGroup?: string;
}

export interface Template {
  id: UUID;
  name: string;
  notes?: string;
  order: number;
  isArchived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface WorkoutSet {
  id: UUID;
  workoutExerciseId: UUID;
  workoutId: UUID;
  order: number;
  setType: SetType;
  weightG?: number;
  reps?: number;
  rpe?: number;
  /** Reps in reserve. Stored as entered; 0 = nothing left. */
  rir?: number;
  durationSeconds?: number;
  distanceM?: number;
  isCompleted: boolean;
  completedAt?: ISODateTime;
  notes?: string;
  grind?: GrindFeel;
  clipId?: UUID;
  /** Undefined = bilateral row (unchanged meaning). Set for unilateral exercises. */
  side?: "left" | "right";
  /** UI-lookup-only key linking the left and right row of one set number. Never indexed. */
  pairId?: string;
}

export interface WorkoutExercise {
  id: UUID;
  workoutId: UUID;
  exerciseId: UUID;
  order: number;
  exerciseNameSnapshot: string;
  primaryMuscleGroupSnapshot: MuscleGroup;
  secondaryMuscleGroupsSnapshot: MuscleGroup[];
  equipmentSnapshot: Equipment;
  trackingTypeSnapshot: TrackingType;
  restSeconds: number;
  notes?: string;
  supersetGroup?: string;  /** Snapshotted when the exercise is added, so a mid-workout edit can't change how it logs. */
  unilateralSnapshot?: boolean;
}

export type WorkoutStatus = "active" | "completed" | "discarded";

export interface Workout {
  id: UUID;
  templateId?: UUID;
  programId?: UUID;
  programWeek?: number;
  name: string;
  status: WorkoutStatus;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  localDate: ISODate;
  /**
   * Raw `Date.getTimezoneOffset()` at the start of the session: positive WEST of UTC, so UTC+1 is
   * -60 and UTC-5 is 300. This is a live identifier of the log format and never changes sign.
   * Strong-Pro stored the opposite sign; importers must negate it. `utcOffsetMinutes()` in
   * time.ts is the positive-east value and must not be written here.
   */
  tzOffsetMinutes: number;
  pausedSeconds: number;
  notes?: string;
  beatWorkoutId?: UUID;
  /** Stable fingerprint of the source rows when imported, used to skip duplicates on re-import. */
  importFingerprint?: string;
  importJobId?: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type MeasurementMetric =
  | "bodyweight"
  | "neck"
  | "shoulders"
  | "chest"
  | "waist"
  | "hips"
  | "arm_left"
  | "arm_right"
  | "thigh_left"
  | "thigh_right"
  | "calf_left"
  | "calf_right"
  /** Girths a source recorded without saying which side. Never split into left and right. */
  | "arms"
  | "thighs"
  | "calves";

/** Where a reading came from when it did not come from the lifter's own hand. Absent means manual. */
export type HealthSource = "apple_health" | "health_connect";

export interface BodyMeasurement {
  id: UUID;
  metric: MeasurementMetric;
  value: number;
  displayUnit: "kg" | "lb" | "cm" | "in";
  recordedAt: ISODateTime;
  localDate: ISODate;
  note?: string;
  /** Set on rows read from a health store. Absent means the lifter typed it. */
  source?: HealthSource;
  /** The health store's own id for the sample, used to read it only once. */
  sourceId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type HealthKind = "sleep" | "hrv";
/** Apple Health reports SDNN and Health Connect reports RMSSD. They are different measures and are never merged. */
export type HrvMethod = "sdnn" | "rmssd";

/**
 * One reading from Apple Health or Health Connect that is neither mass nor length (Opp 10). Raw, with its
 * source; every median and count is derived on read.
 */
export interface HealthSample {
  id: UUID;
  kind: HealthKind;
  /** HRV only. */
  method?: HrvMethod;
  /** Sleep: whole seconds asleep in one night. HRV: whole milliseconds. */
  value: number;
  startAt: ISODateTime;
  endAt: ISODateTime;
  /** Sleep: the date the night ended. HRV: the date of the reading. */
  localDate: ISODate;
  source: HealthSource;
  sourceId: string;
  createdAt: ISODateTime;
}

export interface PlateDenomination {
  weightG: number;
  count: number;
}

export interface PlateInventory {
  id: UUID;
  name: string;
  unit: "kg" | "lb";
  plates: PlateDenomination[];
  isDefault: boolean;
}

export interface BarProfile {
  id: UUID;
  name: string;
  weightG: number;
  collarWeightG: number;
  isDefault: boolean;
}

export type OneRepMaxFormula = "epley" | "brzycki";
export type IntensityMode = "rpe" | "rir" | "none";
export type ThemeMode = "light" | "dark" | "system";
/** Retired (plan D9: Oxide is the one accent). Still stored and backed up so old backups load; nothing reads it. */
export type AccentTheme = "stamp" | "ember" | "glacier" | "moss";
export type GoalLens = "powerbuilding" | "hypertrophy" | "strength" | "calisthenics" | "hybrid" | "general";
export type PresentationMode = "loud" | "calm";
export type ProgressionRuleKind = "double_progression" | "linear" | "hold" | "percent_deload";

export interface ProgressionRule {
  kind: ProgressionRuleKind;
  incrementG?: number;
  deloadPercent?: number;
}

export interface Program {
  id: UUID;
  name: string;
  notes?: string;
  lens: GoalLens;
  weekCount: number;
  currentWeek: number;
  currentSessionOrder: number;
  isActive: boolean;
  isArchived: boolean;
  origin: "pack" | "custom" | "duplicated";
  packId?: string;
  /** Set when the last session of the last week is finished. Restarting the block clears it. */
  completedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProgramWeek {
  id: UUID;
  programId: UUID;
  weekNumber: number;
  isDeload: boolean;
  notes?: string;
}

export interface ProgramSession {
  id: UUID;
  programId: UUID;
  name: string;
  order: number;
  dayIndex: number;
}

export interface ProgramExercise {
  id: UUID;
  programSessionId: UUID;
  exerciseId: UUID;
  order: number;
  targetSets: number;
  targetRepMin?: number;
  targetRepMax?: number;
  targetRpe?: number;
  restSeconds: number;
  includeWarmup: boolean;
  substitutionOf?: UUID;
  rule: ProgressionRule;
  notes?: string;
  /**
   * Set when a program file named an exercise this library does not have. The row is kept with the name the
   * file gave it, so nothing disappears silently (plan I-33); it is skipped when a session starts, and is picked
   * up by name if the exercise is added to the library later.
   */
  unresolvedName?: string;
}

export interface EraName {
  startDate: ISODate;
  name: string;
}

export interface MachineSetup {
  exerciseId: UUID;
  gymName?: string;
  seat?: string;
  lever?: string;
  handle?: string;
  pin?: string;
  stackNote?: string;
  notes?: string;
  updatedAt: ISODateTime;
}

export interface ExerciseLesson {
  id: UUID;
  exerciseId: UUID;
  text: string;
  pinnedAt: ISODateTime;
  workoutId?: UUID;
}

export interface NamedPr {
  id: UUID;
  exerciseId: UUID;
  workoutId: UUID;
  note: string;
  namedAt: ISODateTime;
}

export interface ClipMeta {
  id: UUID;
  setId: UUID;
  workoutId: UUID;
  exerciseId: UUID;
  exerciseName: string;
  createdAt: ISODateTime;
  localDate: ISODate;
  mimeType: string;
  durationMs?: number;
}

/** Opp 8: the share of the last working load a lift restarts at after a layoff, by the break's length. Whole percents. */
export interface ComebackRule {
  /** 14 to 27 days away. */
  shortPct: number;
  /** 28 to 55 days away. */
  midPct: number;
  /** 56 or more days away. */
  longPct: number;
}

export interface AppSettings {
  unitSystem: UnitSystem;
  oneRepMaxFormula: OneRepMaxFormula;
  intensityMode: IntensityMode;
  weekStartDay: WeekStartDay;
  quickIncrementG: number;
  defaultRestSeconds: number;
  restTimerAutoStart: boolean;
  restTimerSound: boolean;
  excludeWarmupsFromAnalytics: boolean;
  secondaryMuscleCredit: number;
  /** Optional per-muscle weekly set targets. Missing entries use the research default. */
  personalMuscleTargets?: PersonalMuscleTargets;
  /** Rest after a warm-up set, in seconds. Missing or 0 means no timer after warm-ups. */
  warmupRestSeconds?: number;
  /** Missing means off. */
  restTimerVibrate?: boolean;
  /** Missing means off. */
  restTimerNotification?: boolean;
  /** Missing means the default rule (90, 80, 70). */
  comebackRule?: ComebackRule;
  goalLiftIds: UUID[];
  defaultBarProfileId: UUID;
  defaultPlateInventoryId: UUID;
  themeMode: ThemeMode;
  accentTheme: AccentTheme;
  goalLens: GoalLens;
  presentationMode: PresentationMode;
  activeProgramId?: UUID;
  onboardingCompletedAt?: ISODateTime;
  /** Health context (Opp 10), native build only. Missing means everything off. */
  health?: HealthSettings;
  demoLoaded: boolean;
}

/** Which health types Lock'd reads, and whether the Chronicle shows them. All off until the lifter turns them on. */
export interface HealthSettings {
  bodyweight?: boolean;
  sleep?: boolean;
  hrv?: boolean;
  overlays?: boolean;
}

export type ImportJobStatus = "pending" | "completed" | "failed" | "cancelled";

/** Where an import came from. Provisional until the importers land (plan PR 7). */
export type ImportSource = "strong-csv" | "hevy-csv" | "generic-csv" | "repforge-json" | "knurl-json";

export interface ImportJob {
  id: UUID;
  source: ImportSource;
  fileName: string;
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
  status: ImportJobStatus;
  workoutsImported: number;
  setsImported: number;
  exercisesCreated: number;
  rowsSkipped: number;
  /** Non-sensitive, human-readable summary lines. */
  messages: string[];
}

export interface ImportIssue {
  id: UUID;
  jobId: UUID;
  row: number;
  severity: "warning" | "error";
  message: string;
}

export interface TimerState {
  workoutId?: UUID;
  setId?: UUID;
  startedAt: ISODateTime;
  endsAt: ISODateTime;
  durationSeconds: number;
  isRunning: boolean;
  label?: string;
  /** What this lifter usually rests on this exercise, when it differs from `durationSeconds`. Offered, not applied. */
  suggestedSeconds?: number;
}

export interface WorkoutDetail {
  workout: Workout;
  exercises: Array<{
    exercise: WorkoutExercise;
    sets: WorkoutSet[];
  }>;
  templateExercises?: TemplateExercise[];
}

export const BACKUP_FORMAT = "lockd-backup";
export const BACKUP_VERSION = 3;
export const PROGRAM_FORMAT = "lockd-program";
export const PROGRAM_FILE_VERSION = 1;

export interface LockdBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: ISODateTime;
  exercises: Exercise[];
  templates: Template[];
  templateExercises: TemplateExercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  workoutSets: WorkoutSet[];
  measurements: BodyMeasurement[];
  plates: PlateInventory[];
  bars: BarProfile[];
  settings: AppSettings;
  programs?: Program[];
  programWeeks?: ProgramWeek[];
  programSessions?: ProgramSession[];
  programExercises?: ProgramExercise[];
  eraNames?: EraName[];
  machineSetups?: MachineSetup[];
  lessons?: ExerciseLesson[];
  namedPrs?: NamedPr[];
  clips?: ClipMeta[];
  /** Read from Apple Health or Health Connect. On this device and in backups only; never in the cloud vault. */
  healthSamples?: HealthSample[];
  /**
   * Device-only preferences (text size). Restored only when present, so an older backup never
   * resets a choice this device made. Never part of settings or the cloud vault.
   */
  device?: { textSize?: "standard" | "comfortable" | "large" };
}

export interface ProgramFile {
  format: typeof PROGRAM_FORMAT;
  version: typeof PROGRAM_FILE_VERSION;
  exportedAt: ISODateTime;
  program: Omit<Program, "id" | "isActive" | "currentWeek" | "currentSessionOrder" | "createdAt" | "updatedAt">;
  weeks: Array<Omit<ProgramWeek, "id" | "programId">>;
  sessions: Array<
    Omit<ProgramSession, "id" | "programId"> & {
      exercises: Array<Omit<ProgramExercise, "id" | "programSessionId"> & { exerciseName: string }>;
    }
  >;
}
