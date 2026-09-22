import type { OneRepMaxFormula, WorkoutSet } from "./types";

export const MAX_E1RM_REPS = 12;

export function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export function brzycki(weight: number, reps: number): number {
  return (weight * 36) / (37 - reps);
}

export interface OneRepMaxResult {
  value: number;
  formulaUsed: OneRepMaxFormula;
  fellBack: boolean;
}

export function estimateOneRepMax(
  weight: number,
  reps: number,
  formula: OneRepMaxFormula,
): OneRepMaxResult | null {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if (weight <= 0 || reps <= 0) return null;
  const wholeReps = Math.floor(reps);
  if (wholeReps < 1) return null;
  if (wholeReps > MAX_E1RM_REPS) return null;
  if (wholeReps === 1) return { value: Math.round(weight), formulaUsed: formula, fellBack: false };

  if (formula === "brzycki") {
    return {
      value: Math.round(brzycki(weight, wholeReps)),
      formulaUsed: "brzycki",
      fellBack: false,
    };
  }

  return { value: Math.round(epley(weight, wholeReps)), formulaUsed: "epley", fellBack: false };
}

export interface BestOneRepMax extends OneRepMaxResult {
  set: WorkoutSet;
}

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
