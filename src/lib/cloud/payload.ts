import type { BodyMeasurement } from "@/domain/types";
import type { GymData } from "@/lib/gym/store";
import type { CloudGym, SharePayload, ShareReceiptPayload } from "./types";

/**
 * A reading that came from a health app stays on the device (owner's decision, 2026-09-30): it is tagged with its source
 * and left out of the vault. A typed entry has no source and syncs as before.
 */
export function isDeviceOnlyMeasurement(row: Pick<BodyMeasurement, "source">): boolean {
  return row.source !== undefined;
}

export function cloudGymFromState(state: GymData): CloudGym {
  return {
    exercises: state.exercises,
    templates: state.templates,
    templateExercises: state.templateExercises,
    workouts: state.workouts,
    workoutExercises: state.workoutExercises,
    workoutSets: state.workoutSets,
    measurements: state.measurements.filter((row) => !isDeviceOnlyMeasurement(row)),
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

/**
 * What a public read returns. Receipts published before gap 2 carried the workout's private notes, which no receipt
 * shows; they never leave the server again (migration 0005 also removes them from stored rows).
 */
export function publicSharePayload(payload: SharePayload): SharePayload {
  if (payload.kind !== "receipt" || !("notes" in payload)) return payload;
  const { notes: _notes, ...rest } = payload as ShareReceiptPayload & { notes?: unknown };
  return rest;
}
