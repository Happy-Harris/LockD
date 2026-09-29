import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import { uuid } from "@/domain/ids";
import { nowParts } from "@/domain/time";
import type {
  AppSettings,
  BarProfile,
  BodyMeasurement,
  ClipMeta,
  EraName,
  Exercise,
  ExerciseLesson,
  LockdBackup,
  MachineSetup,
  MeasurementMetric,
  NamedPr,
  PlateInventory,
  Program,
  ProgramExercise,
  ProgramFile,
  ProgramSession,
  ProgramWeek,
  SetType,
  Template,
  TemplateExercise,
  TimerState,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@/domain/types";
import { BACKUP_FORMAT, BACKUP_VERSION, PROGRAM_FORMAT } from "@/domain/types";
import type { CloudGym } from "@/lib/cloud/types";
import { defaultQuickIncrementG, weightUnitFor } from "@/domain/units";
import { detectPrsForWorkout, previousSetsForExercise, sliceSessions, type PersonalRecord } from "./analytics";
import { applyImportBatch, buildImportBatch, storedFingerprints } from "@/lib/import/batch";
import type { ImportAnalysis, SourceProfile } from "@/lib/import/engine";
import { analyseHevyCsv, HEVY_PROFILE } from "@/lib/import/hevy";
import { applyClassification, type Classification } from "@/lib/import/classify";
import { parseJsonInput } from "@/lib/import/foreign";
import { isKnurlVault, KNURL_SOURCE, readKnurlVault } from "@/lib/import/knurl";
import { readRepforgeBackup, REPFORGE_SOURCE } from "@/lib/import/repforge";
import { analyseStrongCsv, STRONG_PROFILE } from "@/lib/import/strong";
import { buildDemoLog, emptyStarterPack } from "./demo";
import {
  advanceProgramPointer,
  applyProgramLoad,
  duplicateInstalled,
  exportProgramFile,
  importProgramFile,
  installPack,
  nextProgramSession,
  PROGRAM_PACKS,
  type InstalledProgram,
} from "./programs";
import { progressExercise } from "./progression";
import { seedBarProfiles, seedExercises, seedPlateInventories } from "./seed";
import { generateWarmup } from "@/domain/warmup";
import { restPersonalitySeconds, learnedRestSeconds } from "./dna";
import { deleteClipBlob } from "./vault";
import { defaultSettings } from "./settings";
import { switchableStorage } from "@/lib/storage/backend";
import {
  migratePersisted,
  PERSIST_KEY,
  PERSIST_VERSION,
  persistedSlice,
  type PersistedSlice,
} from "@/lib/storage/persisted";

export { defaultSettings };

export interface LabNote {
  askedAt: string;
  text: string;
}

export interface GymData {
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
  restTimer: TimerState | null;
  labLast: LabNote | null;
  programs: Program[];
  programWeeks: ProgramWeek[];
  programSessions: ProgramSession[];
  programExercises: ProgramExercise[];
  eraNames: EraName[];
  machineSetups: MachineSetup[];
  lessons: ExerciseLesson[];
  namedPrs: NamedPr[];
  clips: ClipMeta[];
}

/** What an import did. Every importer returns it. */
export interface ImportSummary {
  workouts: number;
  sets: number;
  skipped: number;
  /** Sessions already in the log, left out. */
  duplicates: number;
  issues: string[];
  /** Exercises created with no muscle group: the lifter still has to classify these. */
  unmatched: string[];
  /** Backups only. */
  routines: number;
  /** Routines whose name is already used here, so they were left out. */
  routinesSkipped: number;
  measurements: number;
  measurementsSkipped: number;
  /** What the file held and what was not imported. */
  notes: string[];
}

export interface PreparedImport {
  analysis: ImportAnalysis;
  source: Pick<SourceProfile, "id" | "label">;
  fileName: string;
  selectedKeys: ReadonlySet<string>;
  allowDuplicates: boolean;
  nameOverrides: ReadonlyMap<string, string>;
  notes?: string[];
}

export type ImportOutcome =
  | { ok: true; summary: ImportSummary }
  | { ok: false; errors: string[] };

interface GymActions {
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  completeOnboarding: (opts: { loadDemo: boolean; unitSystem: AppSettings["unitSystem"] }) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  startEmptyWorkout: (name?: string) => string;
  startFromTemplate: (templateId: string) => string;
  startFromProgramSession: (programId: string, sessionId?: string) => string;
  repeatLastWorkout: () => string | undefined;
  startBeatWorkout: (sourceWorkoutId: string) => string | undefined;
  resumeActiveWorkoutId: () => string | undefined;
  addExerciseToWorkout: (workoutId: string, exerciseId: string) => void;
  removeExerciseFromWorkout: (workoutExerciseId: string) => void;
  swapExercise: (workoutExerciseId: string, exerciseId: string) => void;
  addSet: (workoutExerciseId: string, setType?: SetType) => void;
  updateSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  nudgeSetWeight: (setId: string, deltaG: number) => void;
  nudgeSetReps: (setId: string, delta: number) => void;
  completeSet: (setId: string) => PersonalRecord[];
  uncompleteSet: (setId: string) => void;
  deleteSet: (setId: string) => void;
  /** Undo for deleteSet: puts the row back unchanged, unless its exercise was removed meanwhile. */
  restoreSet: (set: WorkoutSet) => void;
  finishWorkout: (workoutId: string, notes?: string) => PersonalRecord[];
  discardWorkout: (workoutId: string) => void;
  updateWorkout: (workoutId: string, patch: Partial<Workout>) => void;
  saveTemplateFromWorkout: (workoutId: string, name: string) => string;
  upsertTemplate: (template: Template, exercises: TemplateExercise[]) => void;
  deleteTemplate: (templateId: string) => void;
  addCustomExercise: (exercise: Omit<Exercise, "id" | "createdAt" | "updatedAt" | "isCustom" | "isArchived">) => string;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  addMeasurement: (metric: MeasurementMetric, value: number, displayUnit: BodyMeasurement["displayUnit"]) => void;
  deleteMeasurement: (id: string) => void;
  startRestTimer: (seconds: number, workoutId?: string, setId?: string, label?: string) => void;
  adjustRestTimer: (deltaSeconds: number) => void;
  stopRestTimer: () => void;
  installProgramPack: (packId: string) => string | undefined;
  duplicateProgram: (programId: string) => string | undefined;
  setActiveProgram: (programId: string | undefined) => void;
  substituteProgramExercise: (programExerciseId: string, exerciseId: string) => void;
  updateProgram: (programId: string, patch: Partial<Program>) => void;
  deleteProgram: (programId: string) => void;
  exportProgram: (programId: string) => ProgramFile | undefined;
  importProgram: (file: ProgramFile) => string;
  renameEra: (startDate: string, name: string) => void;
  upsertMachineSetup: (setup: Omit<MachineSetup, "updatedAt"> & { updatedAt?: string }) => void;
  pinLesson: (exerciseId: string, text: string, workoutId?: string) => void;
  deleteLesson: (id: string) => void;
  namePr: (exerciseId: string, workoutId: string, note: string) => void;
  attachClip: (meta: ClipMeta) => void;
  detachClip: (clipId: string) => void;
  ensureWarmups: (workoutExerciseId: string) => void;
  exportBackup: () => LockdBackup;
  importBackup: (backup: LockdBackup, mode: "replace" | "merge") => void;
  importStrongCsv: (csv: string, fileName?: string) => ImportSummary;
  importHevyCsv: (csv: string, fileName?: string) => ImportSummary;
  /** The wizard's last step: applies an analysed file with the person's choices. */
  importPrepared: (args: PreparedImport) => ImportSummary;
  /** Bulk Classify: fills in only exercises that are still unmapped. Returns how many changed. */
  classifyExercises: (items: Classification[]) => number;
  /** A backup file written by a sister app. Adds what is new; never replaces anything. */
  importOtherAppBackup: (text: string, fileName?: string) => ImportOutcome;
  setLabLast: (text: string) => void;
  resetAll: () => void;
  loadDemo: () => void;
  replaceFromCloud: (payload: CloudGym) => void;
}

export type GymState = GymData & GymActions;

export function freshData(): GymData {
  const stamp = new Date().toISOString();
  return {
    exercises: seedExercises(stamp),
    templates: [],
    templateExercises: [],
    workouts: [],
    workoutExercises: [],
    workoutSets: [],
    measurements: [],
    plates: seedPlateInventories(),
    bars: seedBarProfiles(),
    settings: defaultSettings(),
    restTimer: null,
    labLast: null,
    programs: [],
    programWeeks: [],
    programSessions: [],
    programExercises: [],
    eraNames: [],
    machineSetups: [],
    lessons: [],
    namedPrs: [],
    clips: [],
  };
}

function snapshotExercise(exercise: Exercise, workoutId: string, order: number, restSeconds: number): WorkoutExercise {
  return {
    id: uuid(),
    workoutId,
    exerciseId: exercise.id,
    order,
    exerciseNameSnapshot: exercise.name,
    primaryMuscleGroupSnapshot: exercise.primaryMuscleGroup,
    secondaryMuscleGroupsSnapshot: exercise.secondaryMuscleGroups,
    equipmentSnapshot: exercise.equipment,
    trackingTypeSnapshot: exercise.trackingType,
    restSeconds,
  };
}

function cloneWorkout(
  state: GymData,
  sourceId: string,
  asBeat: boolean,
): { workout: Workout; workoutExercises: WorkoutExercise[]; workoutSets: WorkoutSet[] } | undefined {
  const last = state.workouts.find((row) => row.id === sourceId);
  if (!last) return undefined;
  const parts = nowParts();
  const workout: Workout = {
    id: uuid(),
    templateId: last.templateId,
    programId: last.programId,
    programWeek: last.programWeek,
    name: asBeat ? `Beat ${last.name}` : last.name,
    status: "active",
    startedAt: parts.iso,
    localDate: parts.localDate,
    tzOffsetMinutes: parts.tzOffsetMinutes,
    pausedSeconds: 0,
    beatWorkoutId: asBeat ? last.id : last.beatWorkoutId,
    createdAt: parts.iso,
    updatedAt: parts.iso,
  };
  const oldBlocks = state.workoutExercises
    .filter((row) => row.workoutId === last.id)
    .sort((a, b) => a.order - b.order);
  const workoutExercises: WorkoutExercise[] = [];
  const workoutSets: WorkoutSet[] = [];
  for (const block of oldBlocks) {
    const we: WorkoutExercise = { ...block, id: uuid(), workoutId: workout.id };
    workoutExercises.push(we);
    const sets = state.workoutSets
      .filter((set) => set.workoutExerciseId === block.id)
      .sort((a, b) => a.order - b.order);
    for (const set of sets) {
      workoutSets.push({
        ...set,
        id: uuid(),
        workoutExerciseId: we.id,
        workoutId: workout.id,
        isCompleted: false,
        completedAt: undefined,
        clipId: undefined,
      });
    }
  }
  return { workout, workoutExercises, workoutSets };
}

function applyInstalled(state: GymData, installed: InstalledProgram, activate: boolean): Partial<GymData> {
  const programs = [
    ...state.programs.map((row) => (activate ? { ...row, isActive: false } : row)),
    { ...installed.program, isActive: activate },
  ];
  return {
    programs,
    programWeeks: [...state.programWeeks, ...installed.weeks],
    programSessions: [...state.programSessions, ...installed.sessions],
    programExercises: [...state.programExercises, ...installed.exercises],
    settings: activate ? { ...state.settings, activeProgramId: installed.program.id } : state.settings,
  };
}

/** Reads a CSV with the common pipeline and adds what is new. Sessions already in the log are left out. */
function runImport(
  state: GymState,
  set: (partial: Partial<GymState>) => void,
  args: {
    analysis: ImportAnalysis;
    source: Pick<SourceProfile, "id" | "label">;
    fileName: string;
    notes?: string[];
    /** The wizard's choices; the one-step imports leave these out. */
    selectedKeys?: ReadonlySet<string>;
    allowDuplicates?: boolean;
    nameOverrides?: ReadonlyMap<string, string>;
  },
): ImportSummary {
  const batch = buildImportBatch(args.analysis, {
    source: args.source,
    fileName: args.fileName,
    existingExercises: state.exercises,
    existingFingerprints: storedFingerprints(state),
    existingTemplates: state.templates,
    existingMeasurements: state.measurements,
    selectedKeys: args.selectedKeys,
    allowDuplicates: args.allowDuplicates,
    nameOverrides: args.nameOverrides,
  });
  const addsAnything =
    batch.workouts.length > 0 ||
    batch.templates.length > 0 ||
    batch.measurements.length > 0 ||
    batch.newExercises.length > 0;
  if (addsAnything) set(applyImportBatch(state, batch));
  return {
    workouts: batch.workouts.length,
    sets: batch.job.setsImported,
    skipped: args.analysis.skippedRows,
    duplicates: batch.duplicatesSkipped,
    issues: batch.issues.slice(0, 40).map((issue) => issue.message),
    // Only exercises with no muscle group need the lifter to classify them.
    unmatched: batch.newExercises
      .filter((exercise) => exercise.primaryMuscleGroup === "unmapped")
      .map((exercise) => exercise.name),
    routines: batch.templates.length,
    routinesSkipped: batch.templatesSkipped,
    measurements: batch.measurements.length,
    measurementsSkipped: batch.measurementsSkipped,
    notes: args.notes ?? [],
  };
}

export const useGym = create<GymState>()(
  persist(
    (set, get) => ({
      ...freshData(),
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),

      completeOnboarding: ({ loadDemo, unitSystem }) => {
        const stamp = new Date().toISOString();
        if (loadDemo) {
          const demo = buildDemoLog(get().exercises);
          set({
            templates: demo.templates,
            templateExercises: demo.templateExercises,
            workouts: demo.workouts,
            workoutExercises: demo.workoutExercises,
            workoutSets: demo.workoutSets,
            measurements: demo.measurements,
            programs: demo.programs,
            programWeeks: demo.programWeeks,
            programSessions: demo.programSessions,
            programExercises: demo.programExercises,
            eraNames: demo.eraNames,
            settings: {
              ...get().settings,
              unitSystem,
              quickIncrementG: defaultQuickIncrementG(unitSystem),
              onboardingCompletedAt: stamp,
              demoLoaded: true,
              goalLens: "powerbuilding",
              activeProgramId: demo.programs[0]?.id,
              defaultBarProfileId: unitSystem === "metric" ? "seed-bar-olympic-kg" : "seed-bar-olympic-lb",
              defaultPlateInventoryId: unitSystem === "metric" ? "seed-plates-kg" : "seed-plates-lb",
            },
          });
          return;
        }
        const pack = emptyStarterPack(stamp);
        set({
          templates: pack.templates,
          templateExercises: pack.templateExercises,
          workouts: [],
          workoutExercises: [],
          workoutSets: [],
          measurements: [],
          programs: [],
          programWeeks: [],
          programSessions: [],
          programExercises: [],
          eraNames: [],
          settings: {
            ...get().settings,
            unitSystem,
            quickIncrementG: defaultQuickIncrementG(unitSystem),
            onboardingCompletedAt: stamp,
            demoLoaded: false,
          },
        });
      },

      updateSettings: (patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...patch,
            quickIncrementG:
              patch.unitSystem && !patch.quickIncrementG
                ? defaultQuickIncrementG(patch.unitSystem)
                : (patch.quickIncrementG ?? state.settings.quickIncrementG),
          },
        })),

      startEmptyWorkout: (name) => {
        const parts = nowParts();
        const workout: Workout = {
          id: uuid(),
          name: name?.trim() || "Empty session",
          status: "active",
          startedAt: parts.iso,
          localDate: parts.localDate,
          tzOffsetMinutes: parts.tzOffsetMinutes,
          pausedSeconds: 0,
          createdAt: parts.iso,
          updatedAt: parts.iso,
        };
        set((state) => ({ workouts: [...state.workouts, workout] }));
        return workout.id;
      },

      startFromTemplate: (templateId) => {
        const state = get();
        const template = state.templates.find((row) => row.id === templateId);
        if (!template) return get().startEmptyWorkout();
        const parts = nowParts();
        const workout: Workout = {
          id: uuid(),
          templateId,
          name: template.name,
          status: "active",
          startedAt: parts.iso,
          localDate: parts.localDate,
          tzOffsetMinutes: parts.tzOffsetMinutes,
          pausedSeconds: 0,
          createdAt: parts.iso,
          updatedAt: parts.iso,
        };
        const tEx = state.templateExercises
          .filter((row) => row.templateId === templateId)
          .sort((a, b) => a.order - b.order);
        const slices = sliceSessions(state.workouts, state.workoutExercises, state.workoutSets);
        const workoutExercises: WorkoutExercise[] = [];
        const workoutSets: WorkoutSet[] = [];
        tEx.forEach((row) => {
          const exercise = state.exercises.find((item) => item.id === row.exerciseId);
          if (!exercise) return;
          const we = snapshotExercise(exercise, workout.id, row.order, row.restSeconds);
          workoutExercises.push(we);
          const previous = previousSetsForExercise(exercise.id, slices);
          const call = progressExercise({
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            trackingType: exercise.trackingType,
            incrementG: exercise.incrementG ?? state.settings.quickIncrementG,
            targetRepMin: row.targetRepMin,
            targetRepMax: row.targetRepMax,
            targetSets: row.targetSets,
            slices,
            formula: state.settings.oneRepMaxFormula,
            excludeWarmups: state.settings.excludeWarmupsFromAnalytics,
          });
          const count = Math.max(row.targetSets, 1);
          for (let i = 0; i < count; i += 1) {
            const prior = previous[i] ?? previous[previous.length - 1];
            workoutSets.push({
              id: uuid(),
              workoutExerciseId: we.id,
              workoutId: workout.id,
              order: i,
              setType: i === 0 && row.includeWarmup ? "warmup" : row.defaultSetType,
              weightG: call.suggestedWeightG ?? prior?.weightG,
              reps: call.suggestedReps ?? prior?.reps,
              rpe: prior?.rpe,
              isCompleted: false,
            });
          }
        });
        set({
          workouts: [...state.workouts, workout],
          workoutExercises: [...state.workoutExercises, ...workoutExercises],
          workoutSets: [...state.workoutSets, ...workoutSets],
        });
        return workout.id;
      },

      startFromProgramSession: (programId, sessionId) => {
        const state = get();
        const program = state.programs.find((row) => row.id === programId);
        if (!program) return get().startEmptyWorkout();
        const sessions = state.programSessions.filter((row) => row.programId === programId).sort((a, b) => a.order - b.order);
        const session = sessionId
          ? sessions.find((row) => row.id === sessionId)
          : nextProgramSession(program, sessions);
        if (!session) return get().startEmptyWorkout(program.name);
        const week = state.programWeeks.find(
          (row) => row.programId === programId && row.weekNumber === program.currentWeek,
        );
        const isDeload = week?.isDeload ?? false;
        const parts = nowParts();
        const workout: Workout = {
          id: uuid(),
          programId,
          programWeek: program.currentWeek,
          name: isDeload ? `${session.name} · deload` : `${session.name} · W${program.currentWeek}`,
          status: "active",
          startedAt: parts.iso,
          localDate: parts.localDate,
          tzOffsetMinutes: parts.tzOffsetMinutes,
          pausedSeconds: 0,
          createdAt: parts.iso,
          updatedAt: parts.iso,
        };
        const slices = sliceSessions(state.workouts, state.workoutExercises, state.workoutSets);
        const rows = state.programExercises
          .filter((row) => row.programSessionId === session.id)
          .sort((a, b) => a.order - b.order);
        const workoutExercises: WorkoutExercise[] = [];
        const workoutSets: WorkoutSet[] = [];
        rows.forEach((row) => {
          const exercise = state.exercises.find((item) => item.id === row.exerciseId);
          if (!exercise) return;
          const we = snapshotExercise(exercise, workout.id, row.order, row.restSeconds);
          workoutExercises.push(we);
          const previous = previousSetsForExercise(exercise.id, slices);
          const call = progressExercise({
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            trackingType: exercise.trackingType,
            incrementG: row.rule.incrementG ?? exercise.incrementG ?? state.settings.quickIncrementG,
            targetRepMin: row.targetRepMin,
            targetRepMax: row.targetRepMax,
            targetSets: row.targetSets,
            slices,
            formula: state.settings.oneRepMaxFormula,
            excludeWarmups: state.settings.excludeWarmupsFromAnalytics,
          });
          const applied = applyProgramLoad({
            rule: row.rule,
            weekNumber: program.currentWeek,
            isDeload,
            suggestion: call,
            previousWeightG: previous[0]?.weightG,
            previousReps: previous[0]?.reps,
            baseSets: row.targetSets,
          });
          const count = Math.max(applied.sets, 1);
          for (let i = 0; i < count; i += 1) {
            const prior = previous[i] ?? previous[previous.length - 1];
            workoutSets.push({
              id: uuid(),
              workoutExerciseId: we.id,
              workoutId: workout.id,
              order: i,
              setType: i === 0 && row.includeWarmup ? "warmup" : "working",
              weightG: applied.weightG ?? prior?.weightG,
              reps: applied.reps ?? prior?.reps,
              rpe: prior?.rpe,
              isCompleted: false,
            });
          }
        });
        set({
          workouts: [...state.workouts, workout],
          workoutExercises: [...state.workoutExercises, ...workoutExercises],
          workoutSets: [...state.workoutSets, ...workoutSets],
        });
        return workout.id;
      },

      repeatLastWorkout: () => {
        const state = get();
        const last = [...state.workouts]
          .filter((row) => row.status === "completed")
          .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
          .at(-1);
        if (!last) return undefined;
        const cloned = cloneWorkout(state, last.id, false);
        if (!cloned) return undefined;
        set({
          workouts: [...state.workouts, cloned.workout],
          workoutExercises: [...state.workoutExercises, ...cloned.workoutExercises],
          workoutSets: [...state.workoutSets, ...cloned.workoutSets],
        });
        return cloned.workout.id;
      },

      startBeatWorkout: (sourceWorkoutId) => {
        const state = get();
        const cloned = cloneWorkout(state, sourceWorkoutId, true);
        if (!cloned) return undefined;
        set({
          workouts: [...state.workouts, cloned.workout],
          workoutExercises: [...state.workoutExercises, ...cloned.workoutExercises],
          workoutSets: [...state.workoutSets, ...cloned.workoutSets],
        });
        return cloned.workout.id;
      },

      resumeActiveWorkoutId: () => get().workouts.find((workout) => workout.status === "active")?.id,

      addExerciseToWorkout: (workoutId, exerciseId) => {
        const state = get();
        const exercise = state.exercises.find((row) => row.id === exerciseId);
        if (!exercise) return;
        const existing = state.workoutExercises.filter((row) => row.workoutId === workoutId);
        const we = snapshotExercise(exercise, workoutId, existing.length, state.settings.defaultRestSeconds);
        const previous = previousSetsForExercise(
          exercise.id,
          sliceSessions(state.workouts, state.workoutExercises, state.workoutSets),
        );
        const sets: WorkoutSet[] = [0, 1, 2].map((order) => ({
          id: uuid(),
          workoutExerciseId: we.id,
          workoutId,
          order,
          setType: "working" as const,
          weightG: previous[order]?.weightG ?? previous[0]?.weightG,
          reps: previous[order]?.reps ?? previous[0]?.reps,
          rpe: previous[order]?.rpe,
          isCompleted: false,
        }));
        set({
          workoutExercises: [...state.workoutExercises, we],
          workoutSets: [...state.workoutSets, ...sets],
        });
      },

      removeExerciseFromWorkout: (workoutExerciseId) =>
        set((state) => ({
          workoutExercises: state.workoutExercises.filter((row) => row.id !== workoutExerciseId),
          workoutSets: state.workoutSets.filter((row) => row.workoutExerciseId !== workoutExerciseId),
        })),

      swapExercise: (workoutExerciseId, exerciseId) => {
        const state = get();
        const current = state.workoutExercises.find((row) => row.id === workoutExerciseId);
        const exercise = state.exercises.find((row) => row.id === exerciseId);
        if (!current || !exercise) return;
        const previous = previousSetsForExercise(
          exercise.id,
          sliceSessions(state.workouts, state.workoutExercises, state.workoutSets),
        );
        set({
          workoutExercises: state.workoutExercises.map((row) =>
            row.id === workoutExerciseId
              ? {
                  ...row,
                  exerciseId: exercise.id,
                  exerciseNameSnapshot: exercise.name,
                  primaryMuscleGroupSnapshot: exercise.primaryMuscleGroup,
                  secondaryMuscleGroupsSnapshot: exercise.secondaryMuscleGroups,
                  equipmentSnapshot: exercise.equipment,
                  trackingTypeSnapshot: exercise.trackingType,
                }
              : row,
          ),
          workoutSets: state.workoutSets.map((set) => {
            if (set.workoutExerciseId !== workoutExerciseId || set.isCompleted) return set;
            const prior = previous[set.order] ?? previous[0];
            return { ...set, weightG: prior?.weightG ?? set.weightG, reps: prior?.reps ?? set.reps };
          }),
        });
      },

      addSet: (workoutExerciseId, setType = "working") => {
        const state = get();
        const existing = state.workoutSets.filter((row) => row.workoutExerciseId === workoutExerciseId);
        const last = existing[existing.length - 1];
        const we = state.workoutExercises.find((row) => row.id === workoutExerciseId);
        if (!we) return;
        const next: WorkoutSet = {
          id: uuid(),
          workoutExerciseId,
          workoutId: we.workoutId,
          order: existing.length,
          setType,
          weightG: last?.weightG,
          reps: last?.reps,
          rpe: last?.rpe,
          isCompleted: false,
        };
        set({ workoutSets: [...state.workoutSets, next] });
      },

      updateSet: (setId, patch) =>
        set((state) => ({
          workoutSets: state.workoutSets.map((row) => (row.id === setId ? { ...row, ...patch } : row)),
        })),

      nudgeSetWeight: (setId, deltaG) =>
        set((state) => ({
          workoutSets: state.workoutSets.map((row) => {
            if (row.id !== setId) return row;
            const next = Math.max(0, (row.weightG ?? 0) + deltaG);
            return { ...row, weightG: next };
          }),
        })),

      nudgeSetReps: (setId, delta) =>
        set((state) => ({
          workoutSets: state.workoutSets.map((row) => {
            if (row.id !== setId) return row;
            const next = Math.max(0, (row.reps ?? 0) + delta);
            return { ...row, reps: next };
          }),
        })),

      completeSet: (setId) => {
        const stamp = new Date().toISOString();
        set((state) => ({
          workoutSets: state.workoutSets.map((row) =>
            row.id === setId ? { ...row, isCompleted: true, completedAt: stamp } : row,
          ),
        }));
        const state = get();
        const setRow = state.workoutSets.find((row) => row.id === setId);
        if (!setRow) return [];
        const we = state.workoutExercises.find((row) => row.id === setRow.workoutExerciseId);
        const slices = sliceSessions(state.workouts, state.workoutExercises, state.workoutSets);
        if (state.settings.restTimerAutoStart && we && setRow.setType !== "warmup") {
          const exercise = state.exercises.find((row) => row.id === we.exerciseId);
          const learned = exercise ? learnedRestSeconds(exercise.id, slices) : null;
          const seconds = exercise
            ? restPersonalitySeconds(exercise, learned) || we.restSeconds
            : we.restSeconds;
          get().startRestTimer(seconds, setRow.workoutId, setId, we.exerciseNameSnapshot);
        }
        return detectPrsForWorkout(setRow.workoutId, slices, state.settings.oneRepMaxFormula);
      },

      uncompleteSet: (setId) =>
        set((state) => ({
          workoutSets: state.workoutSets.map((row) =>
            row.id === setId ? { ...row, isCompleted: false, completedAt: undefined } : row,
          ),
        })),

      deleteSet: (setId) =>
        set((state) => ({ workoutSets: state.workoutSets.filter((row) => row.id !== setId) })),

      restoreSet: (row) =>
        set((state) => {
          if (state.workoutSets.some((item) => item.id === row.id)) return {};
          if (!state.workoutExercises.some((item) => item.id === row.workoutExerciseId)) return {};
          return { workoutSets: [...state.workoutSets, row] };
        }),

      finishWorkout: (workoutId, notes) => {
        const stamp = new Date().toISOString();
        set((state) => {
          const workout = state.workouts.find((row) => row.id === workoutId);
          let programs = state.programs;
          if (workout?.programId) {
            const program = state.programs.find((row) => row.id === workout.programId);
            if (program) {
              const count = state.programSessions.filter((row) => row.programId === program.id).length;
              const next = advanceProgramPointer(program, count);
              programs = state.programs.map((row) =>
                row.id === program.id ? { ...row, ...next, updatedAt: stamp } : row,
              );
            }
          }
          return {
            workouts: state.workouts.map((row) =>
              row.id === workoutId
                ? { ...row, status: "completed" as const, endedAt: stamp, notes: notes ?? row.notes, updatedAt: stamp }
                : row,
            ),
            programs,
            restTimer: state.restTimer?.workoutId === workoutId ? null : state.restTimer,
          };
        });
        const state = get();
        const slices = sliceSessions(state.workouts, state.workoutExercises, state.workoutSets);
        return detectPrsForWorkout(workoutId, slices, state.settings.oneRepMaxFormula);
      },

      discardWorkout: (workoutId) =>
        set((state) => ({
          workouts: state.workouts.filter((row) => row.id !== workoutId),
          workoutExercises: state.workoutExercises.filter((row) => row.workoutId !== workoutId),
          workoutSets: state.workoutSets.filter((row) => row.workoutId !== workoutId),
          restTimer: state.restTimer?.workoutId === workoutId ? null : state.restTimer,
        })),

      updateWorkout: (workoutId, patch) =>
        set((state) => ({
          workouts: state.workouts.map((row) =>
            row.id === workoutId ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row,
          ),
        })),

      saveTemplateFromWorkout: (workoutId, name) => {
        const state = get();
        const exercises = state.workoutExercises
          .filter((row) => row.workoutId === workoutId)
          .sort((a, b) => a.order - b.order);
        const stamp = new Date().toISOString();
        const templateId = uuid();
        const template: Template = {
          id: templateId,
          name: name.trim() || "Routine",
          order: state.templates.length,
          isArchived: false,
          createdAt: stamp,
          updatedAt: stamp,
        };
        const tEx: TemplateExercise[] = exercises.map((row, index) => {
          const sets = state.workoutSets.filter((set) => set.workoutExerciseId === row.id);
          return {
            id: uuid(),
            templateId,
            exerciseId: row.exerciseId,
            order: index,
            targetSets: Math.max(sets.filter((set) => set.setType !== "warmup").length, 3),
            restSeconds: row.restSeconds,
            defaultSetType: "working",
            includeWarmup: sets.some((set) => set.setType === "warmup"),
          };
        });
        set({
          templates: [...state.templates, template],
          templateExercises: [...state.templateExercises, ...tEx],
        });
        return templateId;
      },

      upsertTemplate: (template, exercises) =>
        set((state) => ({
          templates: state.templates.some((row) => row.id === template.id)
            ? state.templates.map((row) => (row.id === template.id ? template : row))
            : [...state.templates, template],
          templateExercises: [
            ...state.templateExercises.filter((row) => row.templateId !== template.id),
            ...exercises,
          ],
        })),

      deleteTemplate: (templateId) =>
        set((state) => ({
          templates: state.templates.filter((row) => row.id !== templateId),
          templateExercises: state.templateExercises.filter((row) => row.templateId !== templateId),
        })),

      addCustomExercise: (exercise) => {
        const stamp = new Date().toISOString();
        const id = uuid();
        const row: Exercise = {
          ...exercise,
          id,
          isCustom: true,
          isArchived: false,
          createdAt: stamp,
          updatedAt: stamp,
        };
        set((state) => ({ exercises: [...state.exercises, row] }));
        return id;
      },

      updateExercise: (id, patch) =>
        set((state) => ({
          exercises: state.exercises.map((row) =>
            row.id === id ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row,
          ),
        })),

      addMeasurement: (metric, value, displayUnit) => {
        const parts = nowParts();
        const row: BodyMeasurement = {
          id: uuid(),
          metric,
          value,
          displayUnit,
          recordedAt: parts.iso,
          localDate: parts.localDate,
          createdAt: parts.iso,
          updatedAt: parts.iso,
        };
        set((state) => ({ measurements: [...state.measurements, row] }));
      },

      deleteMeasurement: (id) =>
        set((state) => ({ measurements: state.measurements.filter((row) => row.id !== id) })),

      startRestTimer: (seconds, workoutId, setId, label) => {
        const started = new Date();
        const ends = new Date(started.getTime() + seconds * 1000);
        set({
          restTimer: {
            workoutId,
            setId,
            startedAt: started.toISOString(),
            endsAt: ends.toISOString(),
            durationSeconds: seconds,
            isRunning: true,
            label,
          },
        });
      },

      adjustRestTimer: (deltaSeconds) => {
        const timer = get().restTimer;
        if (!timer) return;
        const remaining = Math.max(0, Math.ceil((Date.parse(timer.endsAt) - Date.now()) / 1000) + deltaSeconds);
        if (remaining <= 0) {
          set({ restTimer: { ...timer, endsAt: new Date().toISOString(), durationSeconds: 0, isRunning: false } });
          return;
        }
        get().startRestTimer(remaining, timer.workoutId, timer.setId, timer.label);
      },

      stopRestTimer: () => set({ restTimer: null }),

      installProgramPack: (packId) => {
        const pack = PROGRAM_PACKS.find((row) => row.id === packId);
        if (!pack) return undefined;
        const installed = installPack(pack, new Date().toISOString());
        set((state) => applyInstalled(state, installed, true) as GymData);
        return installed.program.id;
      },

      duplicateProgram: (programId) => {
        const state = get();
        const program = state.programs.find((row) => row.id === programId);
        if (!program) return undefined;
        const installed = duplicateInstalled(
          {
            program,
            weeks: state.programWeeks.filter((row) => row.programId === programId),
            sessions: state.programSessions.filter((row) => row.programId === programId),
            exercises: state.programExercises.filter((row) =>
              state.programSessions.some((session) => session.programId === programId && session.id === row.programSessionId),
            ),
          },
          new Date().toISOString(),
        );
        set((current) => applyInstalled(current, installed, false) as GymData);
        return installed.program.id;
      },

      setActiveProgram: (programId) =>
        set((state) => ({
          programs: state.programs.map((row) => ({ ...row, isActive: row.id === programId })),
          settings: { ...state.settings, activeProgramId: programId },
        })),

      substituteProgramExercise: (programExerciseId, exerciseId) =>
        set((state) => ({
          programExercises: state.programExercises.map((row) =>
            row.id === programExerciseId
              ? { ...row, substitutionOf: row.substitutionOf ?? row.exerciseId, exerciseId }
              : row,
          ),
        })),

      updateProgram: (programId, patch) =>
        set((state) => ({
          programs: state.programs.map((row) =>
            row.id === programId ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row,
          ),
        })),

      deleteProgram: (programId) =>
        set((state) => {
          const sessionIds = new Set(
            state.programSessions.filter((row) => row.programId === programId).map((row) => row.id),
          );
          return {
            programs: state.programs.filter((row) => row.id !== programId),
            programWeeks: state.programWeeks.filter((row) => row.programId !== programId),
            programSessions: state.programSessions.filter((row) => row.programId !== programId),
            programExercises: state.programExercises.filter((row) => !sessionIds.has(row.programSessionId)),
            settings:
              state.settings.activeProgramId === programId
                ? { ...state.settings, activeProgramId: undefined }
                : state.settings,
          };
        }),

      exportProgram: (programId) => {
        const state = get();
        const program = state.programs.find((row) => row.id === programId);
        if (!program) return undefined;
        return exportProgramFile(
          {
            program,
            weeks: state.programWeeks.filter((row) => row.programId === programId),
            sessions: state.programSessions.filter((row) => row.programId === programId),
            exercises: state.programExercises.filter((row) =>
              state.programSessions.some((session) => session.programId === programId && session.id === row.programSessionId),
            ),
          },
          state.exercises,
        );
      },

      importProgram: (file) => {
        if (file.format !== PROGRAM_FORMAT) throw new Error("Not a Lock’d program file.");
        const installed = importProgramFile(file, new Date().toISOString(), get().exercises);
        set((state) => applyInstalled(state, installed, false) as GymData);
        return installed.program.id;
      },

      renameEra: (startDate, name) =>
        set((state) => {
          const existing = state.eraNames.some((row) => row.startDate === startDate);
          return {
            eraNames: existing
              ? state.eraNames.map((row) => (row.startDate === startDate ? { startDate, name } : row))
              : [...state.eraNames, { startDate, name }],
          };
        }),

      upsertMachineSetup: (setup) =>
        set((state) => {
          const row: MachineSetup = { ...setup, updatedAt: new Date().toISOString() };
          const exists = state.machineSetups.some((item) => item.exerciseId === row.exerciseId);
          return {
            machineSetups: exists
              ? state.machineSetups.map((item) => (item.exerciseId === row.exerciseId ? { ...item, ...row } : item))
              : [...state.machineSetups, row],
          };
        }),

      pinLesson: (exerciseId, text, workoutId) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const row: ExerciseLesson = {
          id: uuid(),
          exerciseId,
          text: trimmed,
          pinnedAt: new Date().toISOString(),
          workoutId,
        };
        set((state) => ({ lessons: [...state.lessons, row] }));
      },

      deleteLesson: (id) => set((state) => ({ lessons: state.lessons.filter((row) => row.id !== id) })),

      namePr: (exerciseId, workoutId, note) => {
        const trimmed = note.trim();
        if (!trimmed) return;
        const row: NamedPr = {
          id: uuid(),
          exerciseId,
          workoutId,
          note: trimmed,
          namedAt: new Date().toISOString(),
        };
        set((state) => ({ namedPrs: [...state.namedPrs, row] }));
      },

      attachClip: (meta) =>
        set((state) => ({
          clips: [...state.clips.filter((row) => row.setId !== meta.setId), meta],
          workoutSets: state.workoutSets.map((row) => (row.id === meta.setId ? { ...row, clipId: meta.id } : row)),
        })),

      detachClip: (clipId) => {
        void deleteClipBlob(clipId);
        set((state) => ({
          clips: state.clips.filter((row) => row.id !== clipId),
          workoutSets: state.workoutSets.map((row) => (row.clipId === clipId ? { ...row, clipId: undefined } : row)),
        }));
      },

      ensureWarmups: (workoutExerciseId) => {
        const state = get();
        const we = state.workoutExercises.find((row) => row.id === workoutExerciseId);
        if (!we) return;
        const existing = state.workoutSets
          .filter((set) => set.workoutExerciseId === workoutExerciseId)
          .sort((a, b) => a.order - b.order);
        if (existing.some((set) => set.setType === "warmup")) return;
        const working = existing.find((set) => set.setType === "working" && (set.weightG ?? 0) > 0);
        if (!working?.weightG) return;
        const bar = state.bars.find((row) => row.id === state.settings.defaultBarProfileId) ?? state.bars[0];
        const plates = state.plates.find((row) => row.id === state.settings.defaultPlateInventoryId) ?? state.plates[0];
        const exercise = state.exercises.find((row) => row.id === we.exerciseId);
        const steps =
          exercise?.equipment === "barbell" && bar && plates
            ? generateWarmup({
                kind: "barbell",
                workingWeightG: working.weightG,
                barWeightG: bar.weightG,
                collarWeightG: bar.collarWeightG,
                plates: plates.plates,
                setCount: 4,
              })
            : generateWarmup({
                kind: "increment",
                workingWeightG: working.weightG,
                incrementG: exercise?.incrementG ?? state.settings.quickIncrementG,
                setCount: 3,
              });
        if (steps.length === 0) return;
        const warmups: WorkoutSet[] = steps.map((step, index) => ({
          id: uuid(),
          workoutExerciseId,
          workoutId: we.workoutId,
          order: index,
          setType: "warmup" as const,
          weightG: step.weightG,
          reps: step.reps,
          isCompleted: false,
        }));
        const shifted = existing.map((set, index) => ({ ...set, order: warmups.length + index }));
        set({
          workoutSets: [
            ...state.workoutSets.filter((set) => set.workoutExerciseId !== workoutExerciseId),
            ...warmups,
            ...shifted,
          ],
        });
      },

      exportBackup: () => {
        const state = get();
        return {
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
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
          programs: state.programs,
          programWeeks: state.programWeeks,
          programSessions: state.programSessions,
          programExercises: state.programExercises,
          eraNames: state.eraNames,
          machineSetups: state.machineSetups,
          lessons: state.lessons,
          namedPrs: state.namedPrs,
          clips: state.clips,
        };
      },

      importBackup: (backup, mode) => {
        if (backup.format !== BACKUP_FORMAT) throw new Error("Not a Lock’d backup file.");
        if (mode === "replace") {
          set({
            exercises: backup.exercises,
            templates: backup.templates,
            templateExercises: backup.templateExercises,
            workouts: backup.workouts,
            workoutExercises: backup.workoutExercises,
            workoutSets: backup.workoutSets,
            measurements: backup.measurements,
            plates: backup.plates.length ? backup.plates : seedPlateInventories(),
            bars: backup.bars.length ? backup.bars : seedBarProfiles(),
            settings: { ...defaultSettings(), ...backup.settings },
            programs: backup.programs ?? [],
            programWeeks: backup.programWeeks ?? [],
            programSessions: backup.programSessions ?? [],
            programExercises: backup.programExercises ?? [],
            eraNames: backup.eraNames ?? [],
            machineSetups: backup.machineSetups ?? [],
            lessons: backup.lessons ?? [],
            namedPrs: backup.namedPrs ?? [],
            clips: backup.clips ?? [],
          });
          return;
        }
        set((state) => {
          const ids = {
            exercises: new Set(state.exercises.map((row) => row.id)),
            templates: new Set(state.templates.map((row) => row.id)),
            workouts: new Set(state.workouts.map((row) => row.id)),
            measurements: new Set(state.measurements.map((row) => row.id)),
            programs: new Set(state.programs.map((row) => row.id)),
          };
          return {
            exercises: [...state.exercises, ...backup.exercises.filter((row) => !ids.exercises.has(row.id))],
            templates: [...state.templates, ...backup.templates.filter((row) => !ids.templates.has(row.id))],
            templateExercises: [
              ...state.templateExercises,
              ...backup.templateExercises.filter((row) => !state.templateExercises.some((x) => x.id === row.id)),
            ],
            workouts: [...state.workouts, ...backup.workouts.filter((row) => !ids.workouts.has(row.id))],
            workoutExercises: [
              ...state.workoutExercises,
              ...backup.workoutExercises.filter((row) => !state.workoutExercises.some((x) => x.id === row.id)),
            ],
            workoutSets: [
              ...state.workoutSets,
              ...backup.workoutSets.filter((row) => !state.workoutSets.some((x) => x.id === row.id)),
            ],
            measurements: [
              ...state.measurements,
              ...backup.measurements.filter((row) => !ids.measurements.has(row.id)),
            ],
            programs: [...state.programs, ...(backup.programs ?? []).filter((row) => !ids.programs.has(row.id))],
            programWeeks: [
              ...state.programWeeks,
              ...(backup.programWeeks ?? []).filter((row) => !state.programWeeks.some((x) => x.id === row.id)),
            ],
            programSessions: [
              ...state.programSessions,
              ...(backup.programSessions ?? []).filter((row) => !state.programSessions.some((x) => x.id === row.id)),
            ],
            programExercises: [
              ...state.programExercises,
              ...(backup.programExercises ?? []).filter((row) => !state.programExercises.some((x) => x.id === row.id)),
            ],
            machineSetups: [
              ...state.machineSetups,
              ...(backup.machineSetups ?? []).filter(
                (row) => !state.machineSetups.some((item) => item.exerciseId === row.exerciseId),
              ),
            ],
            lessons: [...state.lessons, ...(backup.lessons ?? []).filter((row) => !state.lessons.some((item) => item.id === row.id))],
            namedPrs: [
              ...state.namedPrs,
              ...(backup.namedPrs ?? []).filter((row) => !state.namedPrs.some((item) => item.id === row.id)),
            ],
            clips: [...state.clips, ...(backup.clips ?? []).filter((row) => !state.clips.some((item) => item.id === row.id))],
          };
        });
      },

      importStrongCsv: (csv, fileName = "strong.csv") => {
        const state = get();
        return runImport(state, set, {
          analysis: analyseStrongCsv(csv, { unit: weightUnitFor(state.settings.unitSystem) }),
          source: STRONG_PROFILE,
          fileName,
        });
      },

      importHevyCsv: (csv, fileName = "hevy.csv") => {
        const state = get();
        return runImport(state, set, {
          analysis: analyseHevyCsv(csv, { unit: weightUnitFor(state.settings.unitSystem) }),
          source: HEVY_PROFILE,
          fileName,
        });
      },

      importPrepared: (args) => runImport(get(), set, args),

      classifyExercises: (items) => {
        const state = get();
        const result = applyClassification(state, items, new Date().toISOString());
        if (result.changed > 0) {
          set({ exercises: result.exercises, workoutExercises: result.workoutExercises });
        }
        return result.changed;
      },

      importOtherAppBackup: (text, fileName = "backup.json") => {
        const json = parseJsonInput(text);
        if (!json.ok) return json;
        const knurl = isKnurlVault(json.value);
        const result = knurl ? readKnurlVault(json.value) : readRepforgeBackup(json.value);
        if (!result.ok) return result;
        return {
          ok: true,
          summary: runImport(get(), set, {
            analysis: result.analysis,
            source: knurl ? KNURL_SOURCE : REPFORGE_SOURCE,
            fileName,
            notes: result.notes,
          }),
        };
      },

      setLabLast: (text) => set({ labLast: { askedAt: new Date().toISOString(), text } }),

      resetAll: () => set({ ...freshData(), hydrated: true }),

      loadDemo: () => {
        const demo = buildDemoLog(get().exercises);
        set({
          templates: demo.templates,
          templateExercises: demo.templateExercises,
          workouts: demo.workouts,
          workoutExercises: demo.workoutExercises,
          workoutSets: demo.workoutSets,
          measurements: demo.measurements,
          programs: demo.programs,
          programWeeks: demo.programWeeks,
          programSessions: demo.programSessions,
          programExercises: demo.programExercises,
          eraNames: demo.eraNames,
          settings: {
            ...get().settings,
            demoLoaded: true,
            activeProgramId: demo.programs[0]?.id,
            onboardingCompletedAt: get().settings.onboardingCompletedAt ?? new Date().toISOString(),
          },
        });
      },

      replaceFromCloud: (payload) => {
        set({
          exercises: payload.exercises?.length ? payload.exercises : get().exercises,
          templates: payload.templates ?? [],
          templateExercises: payload.templateExercises ?? [],
          workouts: payload.workouts ?? [],
          workoutExercises: payload.workoutExercises ?? [],
          workoutSets: payload.workoutSets ?? [],
          measurements: payload.measurements ?? [],
          plates: payload.plates?.length ? payload.plates : get().plates,
          bars: payload.bars?.length ? payload.bars : get().bars,
          settings: {
            ...defaultSettings(),
            ...payload.settings,
            onboardingCompletedAt:
              payload.settings?.onboardingCompletedAt ??
              (payload.workouts?.some((row) => row.status === "completed")
                ? new Date().toISOString()
                : get().settings.onboardingCompletedAt),
          },
          labLast: payload.labLast ?? null,
          programs: payload.programs ?? [],
          programWeeks: payload.programWeeks ?? [],
          programSessions: payload.programSessions ?? [],
          programExercises: payload.programExercises ?? [],
          eraNames: payload.eraNames ?? [],
          machineSetups: payload.machineSetups ?? [],
          lessons: payload.lessons ?? [],
          namedPrs: payload.namedPrs ?? [],
          clips: payload.clips ?? [],
        });
      },
    }),
    {
      name: PERSIST_KEY,
      version: PERSIST_VERSION,
      skipHydration: true,
      storage: switchableStorage as PersistStorage<PersistedSlice>,
      migrate: (persisted, version) => migratePersisted(persisted, version),
      partialize: (state) => persistedSlice(state),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export function useGymHydration() {
  return useGym((state) => state.hydrated);
}
