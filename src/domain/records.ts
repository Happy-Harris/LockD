import { estimateOneRepMax } from "./oneRepMax";
import type { OneRepMaxFormula, UUID, WorkoutSet } from "./types";

/**
 * Personal records.
 *
 * PRs are always **derived** from stored sets, never treated as the source of truth: any
 * edit to history (including an import or a restore) simply re-runs this module. Records
 * consider completed, non-warm-up sets with a positive load.
 *
 * Tracked record kinds per exercise:
 *  - `weight`  — heaviest completed set.
 *  - `oneRm`   — highest estimated 1RM under the active formula.
 *  - `volume`  — highest single-set volume (weight x reps).
 *  - `reps@N`  — heaviest weight lifted for at least N reps, for the brackets below.
 *
 * A lift's first time on file is its baseline, never a record (Lock'd fix I-12; Strong-Pro
 * flagged it). `findNewRecords` therefore flags nothing for a lift with no earlier history.
 */

export const REP_BRACKETS = [1, 2, 3, 5, 8, 10, 12, 15, 20] as const;
export type RepBracket = (typeof REP_BRACKETS)[number];

export interface SetWithContext extends WorkoutSet {
  exerciseId: UUID;
  performedAt: string;
}

export interface ExerciseRecords {
  exerciseId: UUID;
  heaviestSet?: SetWithContext;
  bestOneRmG?: number;
  bestOneRmSet?: SetWithContext;
  bestSetVolumeG?: number;
  bestVolumeSet?: SetWithContext;
  /** Heaviest load achieved for at least N reps. */
  repMaxes: Map<RepBracket, { weightG: number; set: SetWithContext }>;
}

export function computeExerciseRecords(
  sets: readonly SetWithContext[],
  formula: OneRepMaxFormula,
): Map<UUID, ExerciseRecords> {
  const byExercise = new Map<UUID, ExerciseRecords>();

  for (const set of sets) {
    if (!set.isCompleted) continue;
    if (set.setType === "warmup") continue;
    const weightG = set.weightG ?? 0;
    const reps = set.reps ?? 0;
    if (weightG <= 0 || reps <= 0) continue;

    const record =
      byExercise.get(set.exerciseId) ??
      ({ exerciseId: set.exerciseId, repMaxes: new Map() } as ExerciseRecords);

    if (!record.heaviestSet || weightG > (record.heaviestSet.weightG ?? 0)) {
      record.heaviestSet = set;
    }

    const estimate = estimateOneRepMax(weightG, reps, formula);
    if (estimate && (record.bestOneRmG === undefined || estimate.value > record.bestOneRmG)) {
      record.bestOneRmG = estimate.value;
      record.bestOneRmSet = set;
    }

    const volume = weightG * reps;
    if (record.bestSetVolumeG === undefined || volume > record.bestSetVolumeG) {
      record.bestSetVolumeG = volume;
      record.bestVolumeSet = set;
    }

    for (const bracket of REP_BRACKETS) {
      if (reps < bracket) continue;
      const existing = record.repMaxes.get(bracket);
      if (!existing || weightG > existing.weightG) {
        record.repMaxes.set(bracket, { weightG, set });
      }
    }

    byExercise.set(set.exerciseId, record);
  }

  return byExercise;
}

export type PrKind = "weight" | "oneRm" | "volume" | "reps";

export interface PrFlag {
  setId: UUID;
  exerciseId: UUID;
  kinds: PrKind[];
}

/**
 * Flags the sets in `candidates` that beat everything in `history`.
 * Used to badge the workout summary — derived at read time, never persisted as truth.
 */
export function findNewRecords(
  history: readonly SetWithContext[],
  candidates: readonly SetWithContext[],
  formula: OneRepMaxFormula,
): PrFlag[] {
  const baseline = computeExerciseRecords(history, formula);
  const flags: PrFlag[] = [];

  // Sort so that earlier sets set the bar for later sets within the same session.
  const ordered = [...candidates].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const running = new Map<
    UUID,
    { weightG: number; oneRmG: number; volumeG: number; repMaxG: Map<RepBracket, number> }
  >();

  for (const set of ordered) {
    if (!set.isCompleted || set.setType === "warmup") continue;
    const weightG = set.weightG ?? 0;
    const reps = set.reps ?? 0;
    if (weightG <= 0 || reps <= 0) continue;

    // First time on file is the baseline, not a record: there is nothing earlier to beat.
    const base = baseline.get(set.exerciseId);
    if (!base) continue;
    const live = running.get(set.exerciseId) ?? {
      weightG: 0,
      oneRmG: 0,
      volumeG: 0,
      repMaxG: new Map<RepBracket, number>(),
    };
    const kinds: PrKind[] = [];

    const bestWeight = Math.max(base.heaviestSet?.weightG ?? 0, live.weightG);
    if (weightG > bestWeight) kinds.push("weight");

    const estimate = estimateOneRepMax(weightG, reps, formula);
    const bestOneRm = Math.max(base.bestOneRmG ?? 0, live.oneRmG);
    if (estimate && estimate.value > bestOneRm) kinds.push("oneRm");

    const volume = weightG * reps;
    const bestVolume = Math.max(base.bestSetVolumeG ?? 0, live.volumeG);
    if (volume > bestVolume) kinds.push("volume");

    const bracket = [...REP_BRACKETS].reverse().find((value) => reps >= value);
    if (bracket) {
      const existing = Math.max(
        base.repMaxes.get(bracket)?.weightG ?? 0,
        live.repMaxG.get(bracket) ?? 0,
      );
      if (weightG > existing && !kinds.includes("weight")) kinds.push("reps");
    }

    for (const value of REP_BRACKETS) {
      if (reps >= value) live.repMaxG.set(value, Math.max(live.repMaxG.get(value) ?? 0, weightG));
    }
    running.set(set.exerciseId, {
      repMaxG: live.repMaxG,
      weightG: Math.max(bestWeight, weightG),
      oneRmG: Math.max(bestOneRm, estimate?.value ?? 0),
      volumeG: Math.max(bestVolume, volume),
    });

    if (kinds.length > 0) flags.push({ setId: set.id, exerciseId: set.exerciseId, kinds });
  }

  return flags;
}

export const PR_LABEL: Record<PrKind, string> = {
  weight: "Heaviest weight",
  oneRm: "Best estimated 1RM",
  volume: "Best set volume",
  reps: "Rep record",
};
