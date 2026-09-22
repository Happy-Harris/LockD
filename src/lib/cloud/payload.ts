import type { GymData } from "@/lib/gym/store";
import type { CloudGym } from "./types";

export function cloudGymFromState(state: GymData): CloudGym {
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
  };
}

export function vaultHasLog(payload: CloudGym): boolean {
  return payload.workouts.some((row) => row.status === "completed") || Boolean(payload.settings.onboardingCompletedAt);
}

export function asJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

export function slugHandle(name: string, fallback = "lifter"): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  return cleaned || fallback;
}
