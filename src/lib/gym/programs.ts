import { uuid } from "@/domain/ids";
import type {
  Exercise,
  GoalLens,
  Program,
  ProgramExercise,
  ProgramFile,
  ProgramSession,
  ProgramWeek,
  ProgressionRule,
} from "@/domain/types";
import { PROGRAM_FILE_VERSION, PROGRAM_FORMAT } from "@/domain/types";
import { seedExerciseId } from "./seed";
import { stepDownG, stepUpG, type LoadSnap } from "@/domain/progression";
import type { ProgressionCall } from "./progression";

export interface ProgramPackExercise {
  exerciseName: string;
  targetSets: number;
  targetRepMin?: number;
  targetRepMax?: number;
  restSeconds: number;
  includeWarmup?: boolean;
  rule: ProgressionRule;
}

export interface ProgramPack {
  id: string;
  name: string;
  notes: string;
  lens: GoalLens;
  weeks: Array<{ weekNumber: number; isDeload: boolean; notes?: string }>;
  sessions: Array<{
    name: string;
    order: number;
    dayIndex: number;
    exercises: ProgramPackExercise[];
  }>;
}

const LINEAR: ProgressionRule = { kind: "linear", incrementG: 2500 };
const DOUBLE: ProgressionRule = { kind: "double_progression", incrementG: 2500 };
const HOLD: ProgressionRule = { kind: "hold" };

function lift(
  exerciseName: string,
  targetSets: number,
  min: number,
  max: number,
  rest: number,
  rule: ProgressionRule,
  warmup = false,
): ProgramPackExercise {
  return {
    exerciseName,
    targetSets,
    targetRepMin: min,
    targetRepMax: max,
    restSeconds: rest,
    includeWarmup: warmup,
    rule,
  };
}

export const PROGRAM_PACKS: ProgramPack[] = [
  {
    id: "pack-linear-strength-8",
    name: "Linear Strength 8",
    notes: "Three heavy days. Add a small increment each week. Week 8 is a deload.",
    lens: "strength",
    weeks: Array.from({ length: 8 }, (_, i) => ({
      weekNumber: i + 1,
      isDeload: i === 7,
      notes: i === 7 ? "About 85% of the working loads. Same lifts, fewer sets." : undefined,
    })),
    sessions: [
      {
        name: "Squat emphasis",
        order: 0,
        dayIndex: 0,
        exercises: [
          lift("Back Squat", 5, 4, 6, 180, LINEAR, true),
          lift("Bench Press", 4, 4, 6, 150, LINEAR, true),
          lift("Barbell Row", 4, 6, 8, 120, LINEAR),
          lift("Hanging Leg Raise", 3, 8, 12, 60, HOLD),
        ],
      },
      {
        name: "Press emphasis",
        order: 1,
        dayIndex: 2,
        exercises: [
          lift("Overhead Press", 5, 4, 6, 150, LINEAR, true),
          lift("Front Squat", 3, 5, 8, 150, LINEAR),
          lift("Pull-Up", 4, 5, 8, 120, DOUBLE),
          lift("Cable Triceps Pushdown", 3, 10, 12, 60, DOUBLE),
        ],
      },
      {
        name: "Hinge emphasis",
        order: 2,
        dayIndex: 4,
        exercises: [
          lift("Conventional Deadlift", 4, 3, 5, 210, LINEAR, true),
          lift("Incline Bench Press", 4, 6, 8, 120, LINEAR),
          lift("Lat Pulldown", 3, 8, 10, 90, DOUBLE),
          lift("Barbell Curl", 3, 8, 12, 60, DOUBLE),
        ],
      },
    ],
  },
  {
    id: "pack-hypertrophy-6",
    name: "Hypertrophy Block 6",
    notes: "Push / pull / legs. Double progression on everything. Week 6 deloads.",
    lens: "hypertrophy",
    weeks: Array.from({ length: 6 }, (_, i) => ({
      weekNumber: i + 1,
      isDeload: i === 5,
    })),
    sessions: [
      {
        name: "Push volume",
        order: 0,
        dayIndex: 0,
        exercises: [
          lift("Bench Press", 4, 8, 12, 120, DOUBLE, true),
          lift("Overhead Press", 3, 8, 12, 90, DOUBLE),
          lift("Incline Dumbbell Press", 3, 10, 12, 90, DOUBLE),
          lift("Lateral Raise", 3, 12, 15, 60, DOUBLE),
          lift("Cable Triceps Pushdown", 3, 12, 15, 60, DOUBLE),
        ],
      },
      {
        name: "Pull volume",
        order: 1,
        dayIndex: 2,
        exercises: [
          lift("Lat Pulldown", 4, 8, 12, 90, DOUBLE),
          lift("Seated Cable Row", 4, 8, 12, 90, DOUBLE),
          lift("Face Pull", 3, 12, 15, 60, DOUBLE),
          lift("Barbell Curl", 3, 10, 12, 60, DOUBLE),
          lift("Pull-Up", 3, 6, 10, 90, DOUBLE),
        ],
      },
      {
        name: "Leg volume",
        order: 2,
        dayIndex: 4,
        exercises: [
          lift("Back Squat", 4, 8, 12, 150, DOUBLE, true),
          lift("Romanian Deadlift", 3, 8, 12, 120, DOUBLE),
          lift("Leg Press", 3, 12, 15, 90, DOUBLE),
          lift("Leg Extension", 3, 12, 15, 60, DOUBLE),
          lift("Standing Calf Raise", 4, 10, 15, 60, DOUBLE),
        ],
      },
    ],
  },
  {
    id: "pack-comeback-4",
    name: "Comeback 4",
    notes: "Short rebuild after a layoff. Conservative loads, no heroics, week 4 is light.",
    lens: "general",
    weeks: Array.from({ length: 4 }, (_, i) => ({
      weekNumber: i + 1,
      isDeload: i === 3,
    })),
    sessions: [
      {
        name: "Full body A",
        order: 0,
        dayIndex: 0,
        exercises: [
          lift("Back Squat", 3, 5, 8, 150, LINEAR, true),
          lift("Bench Press", 3, 5, 8, 120, LINEAR, true),
          lift("Barbell Row", 3, 8, 10, 90, DOUBLE),
        ],
      },
      {
        name: "Full body B",
        order: 1,
        dayIndex: 3,
        exercises: [
          lift("Romanian Deadlift", 3, 6, 8, 150, LINEAR, true),
          lift("Overhead Press", 3, 6, 8, 120, LINEAR),
          lift("Lat Pulldown", 3, 8, 12, 90, DOUBLE),
          lift("Hanging Leg Raise", 3, 8, 12, 60, HOLD),
        ],
      },
    ],
  },
];

export interface InstalledProgram {
  program: Program;
  weeks: ProgramWeek[];
  sessions: ProgramSession[];
  exercises: ProgramExercise[];
}

export function installPack(pack: ProgramPack, stamp: string): InstalledProgram {
  const programId = uuid();
  const program: Program = {
    id: programId,
    name: pack.name,
    notes: pack.notes,
    lens: pack.lens,
    weekCount: pack.weeks.length,
    currentWeek: 1,
    currentSessionOrder: 0,
    isActive: true,
    isArchived: false,
    origin: "pack",
    packId: pack.id,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const weeks: ProgramWeek[] = pack.weeks.map((week) => ({
    id: uuid(),
    programId,
    weekNumber: week.weekNumber,
    isDeload: week.isDeload,
    notes: week.notes,
  }));
  const sessions: ProgramSession[] = [];
  const exercises: ProgramExercise[] = [];
  for (const session of pack.sessions) {
    const sessionId = uuid();
    sessions.push({
      id: sessionId,
      programId,
      name: session.name,
      order: session.order,
      dayIndex: session.dayIndex,
    });
    session.exercises.forEach((entry, index) => {
      exercises.push({
        id: uuid(),
        programSessionId: sessionId,
        exerciseId: seedExerciseId(entry.exerciseName),
        order: index,
        targetSets: entry.targetSets,
        targetRepMin: entry.targetRepMin,
        targetRepMax: entry.targetRepMax,
        restSeconds: entry.restSeconds,
        includeWarmup: entry.includeWarmup ?? false,
        rule: entry.rule,
      });
    });
  }
  return { program, weeks, sessions, exercises };
}

export function duplicateInstalled(
  source: InstalledProgram,
  stamp: string,
): InstalledProgram {
  const programId = uuid();
  const sessionMap = new Map<string, string>();
  const program: Program = {
    ...source.program,
    id: programId,
    name: `${source.program.name} (copy)`,
    currentWeek: 1,
    currentSessionOrder: 0,
    isActive: false,
    origin: "duplicated",
    createdAt: stamp,
    updatedAt: stamp,
  };
  const weeks = source.weeks.map((week) => ({ ...week, id: uuid(), programId }));
  const sessions = source.sessions.map((session) => {
    const id = uuid();
    sessionMap.set(session.id, id);
    return { ...session, id, programId };
  });
  const exercises = source.exercises.map((exercise) => ({
    ...exercise,
    id: uuid(),
    programSessionId: sessionMap.get(exercise.programSessionId) ?? uuid(),
  }));
  return { program, weeks, sessions, exercises };
}

export function exportProgramFile(
  installed: InstalledProgram,
  library: Exercise[],
): ProgramFile {
  const names = new Map(library.map((row) => [row.id, row.name]));
  return {
    format: PROGRAM_FORMAT,
    version: PROGRAM_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    program: {
      name: installed.program.name,
      notes: installed.program.notes,
      lens: installed.program.lens,
      weekCount: installed.program.weekCount,
      isArchived: false,
      origin: "custom",
      packId: installed.program.packId,
    },
    weeks: installed.weeks.map((week) => ({
      weekNumber: week.weekNumber,
      isDeload: week.isDeload,
      notes: week.notes,
    })),
    sessions: installed.sessions.map((session) => ({
      name: session.name,
      order: session.order,
      dayIndex: session.dayIndex,
      exercises: installed.exercises
        .filter((row) => row.programSessionId === session.id)
        .sort((a, b) => a.order - b.order)
        .map((row) => ({
          exerciseId: row.exerciseId,
          exerciseName: names.get(row.exerciseId) ?? row.unresolvedName ?? row.exerciseId,
          order: row.order,
          targetSets: row.targetSets,
          targetRepMin: row.targetRepMin,
          targetRepMax: row.targetRepMax,
          targetRpe: row.targetRpe,
          restSeconds: row.restSeconds,
          includeWarmup: row.includeWarmup,
          substitutionOf: row.substitutionOf,
          rule: row.rule,
          notes: row.notes,
        })),
    })),
  };
}

export function importProgramFile(file: ProgramFile, stamp: string, library: Exercise[]): InstalledProgram {
  const byName = new Map(library.map((row) => [row.name.toLowerCase(), row.id]));
  const programId = uuid();
  const program: Program = {
    id: programId,
    name: file.program.name,
    notes: file.program.notes,
    lens: file.program.lens,
    weekCount: file.weeks.length || file.program.weekCount,
    currentWeek: 1,
    currentSessionOrder: 0,
    isActive: false,
    isArchived: false,
    origin: "custom",
    createdAt: stamp,
    updatedAt: stamp,
  };
  const weeks: ProgramWeek[] = file.weeks.map((week) => ({
    id: uuid(),
    programId,
    weekNumber: week.weekNumber,
    isDeload: week.isDeload,
    notes: week.notes,
  }));
  const sessions: ProgramSession[] = [];
  const exercises: ProgramExercise[] = [];
  for (const session of file.sessions) {
    const sessionId = uuid();
    sessions.push({
      id: sessionId,
      programId,
      name: session.name,
      order: session.order,
      dayIndex: session.dayIndex,
    });
    session.exercises.forEach((entry, index) => {
      const byNameId = byName.get(entry.exerciseName.toLowerCase());
      const resolved = byNameId ?? entry.exerciseId;
      // Neither the name nor the file's id is in this library: keep the name so the row is not anonymous.
      const unresolved = !byNameId && !library.some((row) => row.id === entry.exerciseId);
      exercises.push({
        id: uuid(),
        programSessionId: sessionId,
        exerciseId: resolved,
        ...(unresolved ? { unresolvedName: entry.exerciseName } : {}),
        order: entry.order ?? index,
        targetSets: entry.targetSets,
        targetRepMin: entry.targetRepMin,
        targetRepMax: entry.targetRepMax,
        targetRpe: entry.targetRpe,
        restSeconds: entry.restSeconds,
        includeWarmup: entry.includeWarmup,
        substitutionOf: entry.substitutionOf,
        rule: entry.rule,
        notes: entry.notes,
      });
    });
  }
  return { program, weeks, sessions, exercises };
}

export function applyProgramLoad(opts: {
  rule: ProgressionRule;
  weekNumber: number;
  isDeload: boolean;
  suggestion?: ProgressionCall;
  previousWeightG?: number;
  previousReps?: number;
  baseSets: number;
  /** Rounds a load to one that can be built (barbell work with the lifter's plates). */
  snap?: LoadSnap;
}): { weightG?: number; reps?: number; sets: number } {
  const { rule, isDeload, suggestion, previousWeightG, previousReps, baseSets, snap } = opts;
  let weightG = suggestion?.suggestedWeightG ?? previousWeightG;
  const reps = suggestion?.suggestedReps ?? previousReps;
  const sets = isDeload ? Math.max(2, baseSets - 1) : baseSets;
  const increment = rule.incrementG ?? 2500;

  // A `linear` program says "add one increment each week". It applies when the last session went
  // to plan. If the lifter missed the target (the engine calls a drop or an easier week), the
  // engine's lighter suggestion stands: a program that added load after a failed session would be
  // the "advances on a schedule regardless of performance" it should not be. (This rule used to
  // run only when there was no suggestion, which is never when there is history, so it never ran.)
  const wentToPlan =
    !suggestion ||
    (suggestion.missStreak === 0 &&
      suggestion.action !== "deload" &&
      suggestion.action !== "easier_week");
  // Step from the heaviest working load of the last session, not from a warm-up set.
  const lastLoadG = suggestion?.lastWeightG ?? previousWeightG;
  if (rule.kind === "linear" && !isDeload && lastLoadG && wentToPlan) {
    weightG = stepUpG(lastLoadG, increment, snap);
  }
  // A `hold` rule keeps the last load on ordinary weeks even when the engine would add load. The engine's lighter call after
  // a miss still stands, and a deload week still deloads.
  if (rule.kind === "hold" && !isDeload && lastLoadG && wentToPlan) {
    weightG = lastLoadG;
  }
  if (isDeload && weightG) {
    const pct = rule.deloadPercent ?? 0.85;
    weightG = stepDownG(weightG, pct, increment, snap);
  }
  return { weightG, reps, sets };
}

export function nextProgramSession(
  program: Program,
  sessions: ProgramSession[],
): ProgramSession | undefined {
  const ordered = sessions.filter((row) => row.programId === program.id).sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return undefined;
  return ordered[program.currentSessionOrder % ordered.length];
}

/** True when finishing the next session ends the block: the last session of the last week. */
export function finishesProgram(program: Program, sessionCount: number): boolean {
  return sessionCount > 0 && program.currentWeek >= program.weekCount && program.currentSessionOrder + 1 >= sessionCount;
}

export function advanceProgramPointer(program: Program, sessionCount: number): Pick<Program, "currentWeek" | "currentSessionOrder"> {
  if (sessionCount <= 0) return { currentWeek: program.currentWeek, currentSessionOrder: 0 };
  const nextOrder = program.currentSessionOrder + 1;
  if (nextOrder >= sessionCount) {
    return {
      currentSessionOrder: 0,
      currentWeek: Math.min(program.weekCount, program.currentWeek + 1),
    };
  }
  return { currentSessionOrder: nextOrder, currentWeek: program.currentWeek };
}

/**
 * The library exercise a program row means: by id, or, for a row imported with a name this library did not have,
 * by that name if it has since been added.
 */
export function resolveProgramExercise(row: ProgramExercise, library: readonly Exercise[]): Exercise | undefined {
  const byId = library.find((exercise) => exercise.id === row.exerciseId);
  if (byId) return byId;
  if (!row.unresolvedName) return undefined;
  const wanted = row.unresolvedName.toLowerCase();
  return library.find((exercise) => exercise.name.toLowerCase() === wanted);
}

/** The program rows that cannot be started, with the name to show for each. Never a raw id when a name is known. */
export function unresolvedProgramRows(
  rows: readonly ProgramExercise[],
  library: readonly Exercise[],
): Array<{ row: ProgramExercise; name: string }> {
  return rows
    .filter((row) => !resolveProgramExercise(row, library))
    .map((row) => ({ row, name: row.unresolvedName ?? row.exerciseId }));
}

