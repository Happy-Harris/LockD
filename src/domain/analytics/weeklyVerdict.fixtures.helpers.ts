import type { SetType, WeekStartDay, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import type { AnalyticsOptions, LoggedEntry } from "./compute";
import type { DirectionBand, WeeklyVerdictState } from "./weeklyVerdict";

export const GOLDEN_OPTIONS: AnalyticsOptions = {
  formula: "epley",
  includeWarmups: false,
  secondaryCredit: 0.5,
};

export type FixtureGroup =
  | "eligibility"
  | "windows"
  | "pulse"
  | "direction"
  | "standout_watchout"
  | "special_states"
  | "data_changes";

export interface VerdictFixture {
  name: string;
  group: FixtureGroup;
  weekStart: WeekStartDay;
  reference: string;
  entries: LoggedEntry[];
  expected: {
    state: WeeklyVerdictState;
    directionBand?: DirectionBand | null;
    subjectStart?: string;
    subjectHardSets?: number;
    baselineWeeks?: number;
    pulseNull?: boolean;
    pulseCurrentHardSets?: number;
    pulseBaselineHardSets?: number;
    standoutId?: string;
    watchoutId?: string;
    /** Guard: pulse must never equal a full-week subject comparison pattern. */
    neverPartialVsFull?: true;
  };
}

interface EntryOptions {
  exerciseId?: string;
  exerciseName?: string;
  hardSets?: number;
  warmups?: number;
  drops?: number;
  failures?: number;
  weightG?: number;
  reps?: number;
  startedAt?: string;
}

export function fixtureEntry(
  localDate: string,
  id: string,
  config: EntryOptions = {},
): LoggedEntry {
  const startedAt = config.startedAt ?? `${localDate}T10:00:00.000Z`;
  const workout: Workout = {
    id: `workout-${id}`,
    name: "Session",
    status: "completed",
    startedAt,
    endedAt: startedAt,
    localDate,
    tzOffsetMinutes: 0,
    pausedSeconds: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  const exercise: WorkoutExercise = {
    id: `exercise-${id}`,
    workoutId: workout.id,
    exerciseId: config.exerciseId ?? "bench",
    order: 0,
    exerciseNameSnapshot: config.exerciseName ?? "Bench Press",
    primaryMuscleGroupSnapshot: "chest",
    secondaryMuscleGroupsSnapshot: ["triceps"],
    equipmentSnapshot: "barbell",
    trackingTypeSnapshot: "weight_reps",
    restSeconds: 120,
  };

  const sets: WorkoutSet[] = [];
  const add = (count: number, setType: SetType) => {
    for (let index = 0; index < count; index += 1) {
      sets.push({
        id: `set-${id}-${setType}-${index}`,
        workoutId: workout.id,
        workoutExerciseId: exercise.id,
        order: sets.length,
        setType,
        weightG: config.weightG ?? 100_000,
        reps: config.reps ?? 5,
        isCompleted: true,
        completedAt: startedAt,
      });
    }
  };

  add(config.hardSets ?? 1, "working");
  add(config.warmups ?? 0, "warmup");
  add(config.drops ?? 0, "drop");
  add(config.failures ?? 0, "failure");
  return { workout, exercise, sets };
}

/** Four Monday-anchored baseline weeks ending before subject week of 2026-09-07. */
export function mondayBaseline(hardSets = 10): LoggedEntry[] {
  return [
    fixtureEntry("2026-08-10", "b1", { hardSets }),
    fixtureEntry("2026-08-17", "b2", { hardSets }),
    fixtureEntry("2026-08-24", "b3", { hardSets }),
    fixtureEntry("2026-08-31", "b4", { hardSets }),
  ];
}

export function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
