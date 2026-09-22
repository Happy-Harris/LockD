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
  durationSeconds?: number;
  distanceM?: number;
  isCompleted: boolean;
  completedAt?: ISODateTime;
  notes?: string;
  grind?: GrindFeel;
  clipId?: UUID;
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
  supersetGroup?: string;
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
  tzOffsetMinutes: number;
  pausedSeconds: number;
  notes?: string;
  beatWorkoutId?: UUID;
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
  | "calf_right";

export interface BodyMeasurement {
  id: UUID;
  metric: MeasurementMetric;
  value: number;
  displayUnit: "kg" | "lb" | "cm" | "in";
  recordedAt: ISODateTime;
  localDate: ISODate;
  note?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
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
export type IntensityMode = "rpe" | "none";
export type ThemeMode = "light" | "dark" | "system";
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
  goalLiftIds: UUID[];
  defaultBarProfileId: UUID;
  defaultPlateInventoryId: UUID;
  themeMode: ThemeMode;
  accentTheme: AccentTheme;
  goalLens: GoalLens;
  presentationMode: PresentationMode;
  activeProgramId?: UUID;
  onboardingCompletedAt?: ISODateTime;
  demoLoaded: boolean;
}

export interface TimerState {
  workoutId?: UUID;
  setId?: UUID;
  startedAt: ISODateTime;
  endsAt: ISODateTime;
  durationSeconds: number;
  isRunning: boolean;
  label?: string;
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
