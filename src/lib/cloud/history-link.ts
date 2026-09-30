import type { SetType } from "@/domain/types";
import {
  formatDistance,
  formatDuration,
  formatWeightWithUnit,
  weightUnitFor,
  type WeightUnit,
} from "@/domain/units";
import type { CloudGym } from "./types";

/**
 * Opp 9: a read-only link to the lifter's training history for a coach or partner (plan addendum § 4 row 9).
 * Unguessable, revocable, scoped to history, no locker. The page reads the synced vault when it is opened, so it
 * stays current, and shows only what is below: completed sessions with their completed sets. It never carries the
 * lifter's name, handle, bio, notes, body measurements, clips, programs, settings or Lab notes.
 */

/** 32 random bytes, base64url: 43 characters, 256 bits. */
export const HISTORY_TOKEN_BYTES = 32;
export const HISTORY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Engineering cap, not a product rule: how many live links one lifter can hold. */
export const MAX_HISTORY_LINKS = 10;
/** Sessions per page on the read-only page. */
export const HISTORY_PAGE_SIZE = 30;
export const MAX_LINK_LABEL_LENGTH = 60;

export function newHistoryToken(): string {
  const bytes = new Uint8Array(HISTORY_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type HistorySet = {
  type: SetType;
  weightG?: number;
  reps?: number;
  rpe?: number;
  rir?: number;
  durationSeconds?: number;
  distanceM?: number;
  side?: "left" | "right";
};

export type HistorySession = {
  date: string;
  name: string;
  /** Seconds from start to end, less pauses; absent when the session has no end time. */
  durationSec?: number;
  exercises: Array<{ name: string; sets: HistorySet[] }>;
};

export type HistoryView = {
  unit: WeightUnit;
  totalSessions: number;
  firstDate?: string;
  lastDate?: string;
  offset: number;
  sessions: HistorySession[];
};

function durationOf(startedAt: string, endedAt: string | undefined, paused: number): number | undefined {
  if (!endedAt) return undefined;
  const seconds = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000) - (paused || 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** The read-only projection of a vault: completed sessions, newest first, one page at a time. */
export function historyView(vault: CloudGym, offset = 0, pageSize = HISTORY_PAGE_SIZE): HistoryView {
  const completed = vault.workouts
    .filter((workout) => workout.status === "completed")
    .sort((a, b) => b.localDate.localeCompare(a.localDate) || b.startedAt.localeCompare(a.startedAt));
  const start = Math.max(0, Math.floor(offset));
  const page = completed.slice(start, start + pageSize);
  const ids = new Set(page.map((workout) => workout.id));
  const exercisesByWorkout = new Map<string, CloudGym["workoutExercises"]>();
  for (const row of vault.workoutExercises) {
    if (!ids.has(row.workoutId)) continue;
    exercisesByWorkout.set(row.workoutId, [...(exercisesByWorkout.get(row.workoutId) ?? []), row]);
  }
  const setsByExercise = new Map<string, CloudGym["workoutSets"]>();
  for (const set of vault.workoutSets) {
    if (!ids.has(set.workoutId) || !set.isCompleted) continue;
    setsByExercise.set(set.workoutExerciseId, [...(setsByExercise.get(set.workoutExerciseId) ?? []), set]);
  }
  const sessions = page.map((workout) => ({
    date: workout.localDate,
    name: workout.name,
    durationSec: durationOf(workout.startedAt, workout.endedAt, workout.pausedSeconds),
    exercises: (exercisesByWorkout.get(workout.id) ?? [])
      .sort((a, b) => a.order - b.order)
      .map((exercise) => ({
        name: exercise.exerciseNameSnapshot,
        sets: (setsByExercise.get(exercise.id) ?? [])
          .sort((a, b) => a.order - b.order)
          .map((set) => {
            const row: HistorySet = { type: set.setType };
            if (set.weightG != null) row.weightG = set.weightG;
            if (set.reps != null) row.reps = set.reps;
            if (set.rpe != null) row.rpe = set.rpe;
            if (set.rir != null) row.rir = set.rir;
            if (set.durationSeconds != null) row.durationSeconds = set.durationSeconds;
            if (set.distanceM != null) row.distanceM = set.distanceM;
            if (set.side) row.side = set.side;
            return row;
          }),
      }))
      .filter((exercise) => exercise.sets.length > 0),
  }));
  return {
    unit: weightUnitFor(vault.settings?.unitSystem ?? "metric"),
    totalSessions: completed.length,
    firstDate: completed[completed.length - 1]?.localDate,
    lastDate: completed[0]?.localDate,
    offset: start,
    sessions,
  };
}

const TYPE_LABEL: Partial<Record<HistorySet["type"], string>> = { warmup: "W", drop: "D", failure: "F" };

/** One set as it was logged: load × reps, or reps, time or distance; nothing derived. */
export function setLabel(set: HistorySet, unit: WeightUnit): string {
  const parts: string[] = [];
  if (set.weightG != null && set.weightG > 0) {
    parts.push(set.reps != null ? `${formatWeightWithUnit(set.weightG, unit)} × ${set.reps}` : formatWeightWithUnit(set.weightG, unit));
  } else if (set.reps != null) {
    parts.push(`${set.reps} reps`);
  }
  if (set.distanceM != null) parts.push(formatDistance(set.distanceM, unit === "lb" ? "imperial" : "metric"));
  if (set.durationSeconds != null) parts.push(formatDuration(set.durationSeconds));
  if (set.rpe != null) parts.push(`RPE ${set.rpe}`);
  else if (set.rir != null) parts.push(`${set.rir} RIR`);
  const text = parts.join(", ") || "—";
  const side = set.side ? ` (${set.side === "left" ? "L" : "R"})` : "";
  const type = TYPE_LABEL[set.type];
  return `${type ? `${type} ` : ""}${text}${side}`;
}
