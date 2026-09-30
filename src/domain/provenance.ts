import {
  estimateOneRepMax,
  FORMULA_EXPRESSION,
  FORMULA_LABEL,
  MAX_E1RM_REPS,
  type BestOneRepMax,
} from "./oneRepMax";
import type { OneRepMaxFormula, WorkoutSet } from "./types";

/**
 * Opp 4: the working behind an estimated 1RM (plan addendum § 4 row 4). The same rules as
 * `bestOneRepMax`, but every set is accounted for: the ones that produced an estimate, and the ones
 * left out with the reason. Nothing here decides a number; it explains the one `bestOneRepMax` gives.
 */

export type ExclusionReason = "not_completed" | "warmup" | "no_load" | "no_reps" | "too_many_reps";

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  not_completed: "not completed",
  warmup: "warm-up",
  no_load: "no load",
  no_reps: "no reps",
  too_many_reps: `over ${MAX_E1RM_REPS} reps, too noisy to estimate from`,
};

/** Why a set gives no estimate, or undefined when it does. The order matches `bestOneRepMax`. */
export function e1rmExclusion(
  set: WorkoutSet,
  options: { includeWarmups?: boolean } = {},
): ExclusionReason | undefined {
  if (!set.isCompleted) return "not_completed";
  if (!options.includeWarmups && set.setType === "warmup") return "warmup";
  if (!((set.weightG ?? 0) > 0)) return "no_load";
  if (!(Math.floor(set.reps ?? 0) >= 1)) return "no_reps";
  if (Math.floor(set.reps ?? 0) > MAX_E1RM_REPS) return "too_many_reps";
  return undefined;
}

export interface E1rmProvenance {
  formula: OneRepMaxFormula;
  formulaLabel: string;
  expression: string;
  /** The best estimate and its source set; null when no set produced one. */
  best: BestOneRepMax | null;
  /** Every set that produced an estimate, in logged order, with that estimate in grams. */
  used: Array<{ set: WorkoutSet; valueG: number }>;
  /** Every set left out, in logged order, with the reason. */
  excluded: Array<{ set: WorkoutSet; reason: ExclusionReason }>;
}

export function e1rmProvenance(
  sets: readonly WorkoutSet[],
  formula: OneRepMaxFormula,
  options: { includeWarmups?: boolean } = {},
): E1rmProvenance {
  const used: E1rmProvenance["used"] = [];
  const excluded: E1rmProvenance["excluded"] = [];
  let best: BestOneRepMax | null = null;
  for (const set of [...sets].sort((a, b) => a.order - b.order)) {
    const reason = e1rmExclusion(set, options);
    const estimate = reason ? null : estimateOneRepMax(set.weightG ?? 0, set.reps ?? 0, formula);
    if (!estimate) {
      excluded.push({ set, reason: reason ?? "no_load" });
      continue;
    }
    used.push({ set, valueG: estimate.value });
    if (!best || estimate.value > best.value) best = { ...estimate, set };
  }
  return {
    formula,
    formulaLabel: FORMULA_LABEL[formula],
    expression: FORMULA_EXPRESSION[formula],
    best,
    used,
    excluded,
  };
}
