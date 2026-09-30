import { brzycki, e1rmExact, epley, MAX_E1RM_REPS } from "./oneRepMax";
import type { OneRepMaxFormula } from "./types";

/**
 * Lift Math (owner's spec, Appendix A; plan addendum § 6 items 2 and 8, A-5). Pure maths behind the
 * calculator: an estimated 1RM from a set, and the load for a target set from a 1RM. It works in the unit
 * the lifter typed and never round-trips through grams. Whole effective reps go through `e1rmExact`, the
 * same core analytics use, so Lift Math and the log can never disagree about a set.
 *
 * Effective reps r = reps + RIR, 1 ≤ r ≤ 12. RIR can come from RPE (RIR = 10 − RPE), in the half steps the
 * log allows, so r can be a half: the formulas are continuous and take it as it is. At r = 1 the load is
 * the 1RM for both formulas.
 */

export type LiftMathError = "empty" | "invalid_load" | "invalid_reps" | "invalid_rir" | "over_cap";

export type LiftMathResult =
  | {
      ok: true;
      /** Unrounded, in the unit the lifter entered. */
      value: number;
      effectiveReps: number;
      formula: OneRepMaxFormula;
      /** True when RIR above 0 was added: the result is not the analytics e1RM of that set. */
      rirAdjusted: boolean;
    }
  | { ok: false; error: LiftMathError };

/** Parses a typed number, a decimal comma included ("102,5"). undefined when blank, null when not a number. */
export function parseDecimal(raw: string): number | null | undefined {
  const cleaned = raw.trim().replace(",", ".");
  if (!cleaned) return undefined;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** RIR from an RPE the lifter logged: RPE 8 is 2 reps in reserve. */
export const rirFromRpe = (rpe: number): number => 10 - rpe;

const isHalfStep = (value: number) => Number.isInteger(value * 2);

/** reps + RIR, or the reason it can't be used. Reps are whole; RIR is whole or a half, never negative. */
export function effectiveReps(
  reps: number | undefined,
  rir: number | undefined = 0,
): { ok: true; value: number } | { ok: false; error: LiftMathError } {
  if (reps === undefined) return { ok: false, error: "empty" };
  if (!Number.isInteger(reps) || reps < 1) return { ok: false, error: "invalid_reps" };
  if (!Number.isFinite(rir) || rir < 0 || !isHalfStep(rir)) return { ok: false, error: "invalid_rir" };
  const value = reps + rir;
  if (value > MAX_E1RM_REPS) return { ok: false, error: "over_cap" };
  return { ok: true, value };
}

/** The 1RM at r effective reps. Whole r uses the shared core, so it matches analytics exactly. */
function oneRmAt(load: number, r: number, formula: OneRepMaxFormula): number {
  if (Number.isInteger(r)) return e1rmExact(load, r, formula)!;
  return formula === "brzycki" ? brzycki(load, r) : epley(load, r);
}

/** Estimated 1RM from a set: load × reps, with the RIR on that set (default 0). */
export function estimateMax(input: {
  load: number | undefined;
  reps: number | undefined;
  rir?: number;
  formula: OneRepMaxFormula;
}): LiftMathResult {
  const { load, reps, rir = 0, formula } = input;
  if (load === undefined) return { ok: false, error: "empty" };
  if (!Number.isFinite(load) || load <= 0) return { ok: false, error: "invalid_load" };
  const r = effectiveReps(reps, rir);
  if (!r.ok) return r;
  return { ok: true, value: oneRmAt(load, r.value, formula), effectiveReps: r.value, formula, rirAdjusted: rir > 0 };
}

/** The load for a target of reps at an RIR, from a 1RM: the inverse of {@link estimateMax}. */
export function targetLoad(input: {
  oneRm: number | undefined;
  reps: number | undefined;
  rir?: number;
  formula: OneRepMaxFormula;
}): LiftMathResult {
  const { oneRm, reps, rir = 0, formula } = input;
  if (oneRm === undefined) return { ok: false, error: "empty" };
  if (!Number.isFinite(oneRm) || oneRm <= 0) return { ok: false, error: "invalid_load" };
  const r = effectiveReps(reps, rir);
  if (!r.ok) return r;
  const value =
    r.value === 1 ? oneRm : formula === "brzycki" ? (oneRm * (37 - r.value)) / 36 : oneRm / (1 + r.value / 30);
  return { ok: true, value, effectiveReps: r.value, formula, rirAdjusted: rir > 0 };
}

/**
 * The nearest loadable weight on a step (2.5 kg, 5 lb), ties rounded down so a target never goes above
 * what the estimate supports. Works in integer hundredths, so floating-point noise (87.50000000000001)
 * never moves a result.
 */
export function roundToLoadable(value: number, step: number): number {
  const v = Math.round(value * 100);
  const s = Math.round(step * 100);
  if (!(s > 0)) return v / 100;
  const lower = Math.floor(v / s);
  const rest = v - lower * s;
  const steps = rest * 2 > s ? lower + 1 : lower;
  return (steps * s) / 100;
}

/** Percentages of a 1RM with the loadable weight for each; no reps column (spec: below ~70 % the formulas stop covering it). */
export function percentTable(
  oneRm: number,
  step: number,
  percents: readonly number[] = [100, 95, 90, 85, 80, 75, 70, 65, 60],
): Array<{ percent: number; load: number }> {
  return percents.map((percent) => ({ percent, load: roundToLoadable((oneRm * percent) / 100, step) }));
}
