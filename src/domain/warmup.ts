import { calculatePlates, reachableTotals } from "./plateCalculator";
import type { PlateDenomination } from "./types";
import { roundGramsToIncrement } from "./units";

/**
 * Warm-up ramp generator.
 *
 * Generated ramps are a convenience for loading the bar, **not medical or coaching advice**.
 *
 * Barbell ramps round each prescribed percentage to a load that is actually buildable from
 * the selected bar and plate inventory (via the plate calculator's reachable totals).
 * Non-barbell work rounds to a configurable equipment increment instead — dumbbells and
 * machines have fixed steps and no plate maths.
 *
 * Guarantees enforced by `generateWarmup`:
 *  - loads are non-decreasing (monotonic),
 *  - equal rounded loads are de-duplicated,
 *  - no warm-up load ever exceeds the working weight,
 *  - if the empty bar already exceeds a prescribed percentage, that step collapses into
 *    the bar set instead of prescribing an impossible sub-bar load.
 */

export interface WarmupStep {
  /** Fraction of the working weight this step was generated from (0–1). */
  percent: number;
  /** Rounded, buildable load in grams. */
  weightG: number;
  reps: number;
  /** True when the step is the bare bar. */
  isBar: boolean;
}

export interface BarbellWarmupInput {
  kind: "barbell";
  workingWeightG: number;
  barWeightG: number;
  collarWeightG?: number;
  plates: readonly PlateDenomination[];
  setCount: 3 | 4 | 5;
}

export interface IncrementWarmupInput {
  kind: "increment";
  workingWeightG: number;
  /** Smallest load step available (e.g. 2.5 kg dumbbells, 5 lb machine stack). */
  incrementG: number;
  /** Lightest load available; loads below this are dropped. */
  minimumG?: number;
  setCount: 3 | 4 | 5;
}

export type WarmupInput = BarbellWarmupInput | IncrementWarmupInput;

/** Percentage ladders by set count. Reps drop as the load climbs. */
const LADDERS: Record<3 | 4 | 5, Array<{ percent: number; reps: number }>> = {
  3: [
    { percent: 0.5, reps: 5 },
    { percent: 0.7, reps: 3 },
    { percent: 0.85, reps: 2 },
  ],
  4: [
    { percent: 0.4, reps: 8 },
    { percent: 0.55, reps: 5 },
    { percent: 0.7, reps: 3 },
    { percent: 0.85, reps: 2 },
  ],
  5: [
    { percent: 0.4, reps: 8 },
    { percent: 0.5, reps: 5 },
    { percent: 0.7, reps: 3 },
    { percent: 0.85, reps: 2 },
    { percent: 0.9, reps: 1 },
  ],
};

/** Below this multiple of the bar there is nothing meaningful to ramp through. */
const BAR_RAMP_THRESHOLD = 1.25;

export function generateWarmup(input: WarmupInput): WarmupStep[] {
  const working = Math.round(input.workingWeightG);
  if (!Number.isFinite(working) || working <= 0) return [];

  const ladder = LADDERS[input.setCount] ?? LADDERS[4];
  const steps: WarmupStep[] = [];

  if (input.kind === "barbell") {
    const barWeightG = Math.max(0, Math.round(input.barWeightG));
    const collarWeightG = Math.max(0, Math.round(input.collarWeightG ?? 0));
    const base = barWeightG + collarWeightG * 2;

    if (working <= base) {
      // The working load is the bar itself (or lighter) — one bar set is the whole ramp.
      return base > 0 ? [{ percent: 1, weightG: base, reps: 10, isBar: true }] : [];
    }

    // The empty bar is always the first warm-up set when the working weight justifies it.
    if (base > 0) {
      steps.push({
        percent: base / working,
        weightG: base,
        reps: working >= base * 2 ? 10 : 8,
        isBar: true,
      });
    }

    if (working < base * BAR_RAMP_THRESHOLD) return dedupe(steps, working);

    const totals = reachableTotals({ barWeightG, collarWeightG, plates: input.plates }, working);

    for (const rung of ladder) {
      const target = working * rung.percent;
      if (target <= base) continue;
      const weightG = nearestBuildable(totals, target, working, base, {
        barWeightG,
        collarWeightG,
        plates: input.plates,
      });
      if (weightG === null) continue;
      steps.push({ percent: rung.percent, weightG, reps: rung.reps, isBar: weightG === base });
    }

    return dedupe(steps, working);
  }

  const increment = Math.max(1, Math.round(input.incrementG));
  const minimum = Math.max(0, Math.round(input.minimumG ?? increment));
  for (const rung of ladder) {
    const rounded = roundGramsToIncrement(working * rung.percent, increment, "nearest");
    if (rounded < minimum) continue;
    if (rounded <= 0) continue;
    steps.push({
      percent: rung.percent,
      weightG: Math.min(rounded, working),
      reps: rung.reps,
      isBar: false,
    });
  }
  return dedupe(steps, working);
}

/**
 * Pick the buildable total closest to `target` without exceeding the working weight.
 * Falls back to the plate calculator when the reachable-total table was truncated.
 */
function nearestBuildable(
  totals: readonly number[],
  target: number,
  workingG: number,
  base: number,
  plateInput: { barWeightG: number; collarWeightG: number; plates: readonly PlateDenomination[] },
): number | null {
  let best: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const total of totals) {
    if (total < base || total > workingG) continue;
    const delta = Math.abs(total - target);
    // On a tie prefer the lighter load: warm-ups should never creep upward.
    if (delta < bestDelta || (delta === bestDelta && best !== null && total < best)) {
      best = total;
      bestDelta = delta;
    }
  }
  if (best !== null) return best;

  const fallback = calculatePlates({ ...plateInput, targetTotalG: Math.round(target) });
  if (fallback.achievedTotalG > workingG) return null;
  return fallback.achievedTotalG;
}

/** Enforce monotonic, de-duplicated loads that never exceed the working weight. */
function dedupe(steps: readonly WarmupStep[], workingG: number): WarmupStep[] {
  const result: WarmupStep[] = [];
  let previous = -1;
  for (const step of steps) {
    const weightG = Math.min(step.weightG, workingG);
    if (weightG <= 0) continue;
    if (weightG <= previous) continue; // strictly increasing: drops duplicates and regressions
    if (weightG >= workingG && result.length > 0) continue; // never prescribe the working set itself
    result.push({ ...step, weightG });
    previous = weightG;
  }
  return result;
}
