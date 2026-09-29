import type { OneRepMaxFormula, WorkoutSet } from "./types";

/**
 * Estimated one-rep-max.
 *
 * Inclusion rules (mirrored in the in-app help text, see features/analytics/help.ts):
 *  - Only completed sets count.
 *  - Warm-up sets are excluded unless the caller explicitly opts in.
 *  - A set needs a positive load and at least 1 rep; zero-load and bodyweight-only
 *    sets produce no estimate rather than a misleading 0.
 *  - Estimates only use sets of 12 reps or fewer. Higher-rep sets are useful training
 *    data, but they are too noisy to present as a trustworthy strength estimate.
 *  - Both formulas return the estimate in the same canonical unit as the input (grams).
 */

export const MAX_E1RM_REPS = 12;

/** Epley: weight * (1 + reps / 30). Exact at 1 rep. */
export function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/** Brzycki: weight * 36 / (37 - reps). Undefined at reps >= 37. */
export function brzycki(weight: number, reps: number): number {
  return (weight * 36) / (37 - reps);
}

export interface OneRepMaxResult {
  /** Estimated 1RM in the same unit as the input weight (grams), rounded to a whole gram. */
  value: number;
  formulaUsed: OneRepMaxFormula;
  /** True when the requested formula could not be applied and Epley was substituted. */
  fellBack: boolean;
}

/**
 * The one definition of "estimated 1RM" for a set, **unrounded** and in the unit of the input.
 * Returns `null` when the set cannot produce a meaningful estimate (no load, no reps, or more
 * than {@link MAX_E1RM_REPS} reps). At exactly one rep the load itself is the 1RM: Epley alone
 * would say load × 1.033.
 *
 * Analytics round this to a whole gram through {@link estimateOneRepMax}; Lift Math rounds it
 * in the unit the lifter typed. Both call this function, so they can never disagree.
 */
export function e1rmExact(weight: number, reps: number, formula: OneRepMaxFormula): number | null {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if (weight <= 0 || reps <= 0) return null;
  const wholeReps = Math.floor(reps);
  if (wholeReps < 1) return null;
  if (wholeReps > MAX_E1RM_REPS) return null;
  if (wholeReps === 1) return weight;
  return formula === "brzycki" ? brzycki(weight, wholeReps) : epley(weight, wholeReps);
}

/**
 * Estimate a 1RM rounded to a whole gram, returning `null` when the set cannot produce a
 * meaningful estimate. See {@link e1rmExact} for the rules.
 */
export function estimateOneRepMax(
  weight: number,
  reps: number,
  formula: OneRepMaxFormula,
): OneRepMaxResult | null {
  const exact = e1rmExact(weight, reps, formula);
  if (exact === null) return null;
  const single = Math.floor(reps) === 1;
  return {
    value: Math.round(exact),
    formulaUsed: single ? formula : formula === "brzycki" ? "brzycki" : "epley",
    fellBack: false,
  };
}

export interface BestOneRepMax extends OneRepMaxResult {
  set: WorkoutSet;
}

/**
 * Best estimated 1RM across a group of sets, carrying the source set so the chart can
 * show "84 kg — from 100 kg x 5 (Epley)" behind a plotted point.
 */
export function bestOneRepMax(
  sets: readonly WorkoutSet[],
  formula: OneRepMaxFormula,
  options: { includeWarmups?: boolean } = {},
): BestOneRepMax | null {
  let best: BestOneRepMax | null = null;
  for (const set of sets) {
    if (!set.isCompleted) continue;
    if (!options.includeWarmups && set.setType === "warmup") continue;
    const estimate = estimateOneRepMax(set.weightG ?? 0, set.reps ?? 0, formula);
    if (!estimate) continue;
    if (!best || estimate.value > best.value) best = { ...estimate, set };
  }
  return best;
}

export const FORMULA_LABEL: Record<OneRepMaxFormula, string> = {
  epley: "Epley",
  brzycki: "Brzycki",
};

export const FORMULA_EXPRESSION: Record<OneRepMaxFormula, string> = {
  epley: "weight × (1 + reps / 30)",
  brzycki: "weight × 36 / (37 − reps)",
};
