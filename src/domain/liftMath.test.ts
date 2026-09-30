import { describe, expect, it } from "vitest";
import { estimateFromSet } from "@/lib/gym/analytics";
import { estimateMax, effectiveReps, parseDecimal, percentTable, rirFromRpe, roundToLoadable, targetLoad } from "./liftMath";
import { e1rmExact, MAX_E1RM_REPS } from "./oneRepMax";
import type { OneRepMaxFormula } from "./types";
import { GRAMS_PER_LB } from "./units";

const FORMULAS: OneRepMaxFormula[] = ["epley", "brzycki"];
const REPS = Array.from({ length: MAX_E1RM_REPS }, (_, i) => i + 1);

const value = (result: ReturnType<typeof estimateMax>) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("Lift Math: the spec's hand-checked vectors", () => {
  it("basic e1RM: 100 kg × 5 at RIR 0 is 116.67 kg (Epley) and 112.50 kg (Brzycki)", () => {
    expect(value(estimateMax({ load: 100, reps: 5, formula: "epley" }))).toBeCloseTo(116.67, 2);
    expect(value(estimateMax({ load: 100, reps: 5, formula: "brzycki" }))).toBeCloseTo(112.5, 6);
  });

  it("target load: 8 reps at RIR 2 (r = 10) on 2.5 kg steps", () => {
    const epley = value(targetLoad({ oneRm: 116.67, reps: 8, rir: 2, formula: "epley" }));
    expect(epley).toBeCloseTo(87.5, 2);
    expect(roundToLoadable(epley, 2.5)).toBe(87.5);
    const brzycki = value(targetLoad({ oneRm: 112.5, reps: 8, rir: 2, formula: "brzycki" }));
    expect(brzycki).toBeCloseTo(84.38, 2);
    expect(roundToLoadable(brzycki, 2.5)).toBe(85);
  });

  it("source RIR in pounds: 225 lb × 3 at RIR 1 (r = 4) is 255.0 lb and 245.45 lb, marked RIR-adjusted", () => {
    const e = estimateMax({ load: 225, reps: 3, rir: 1, formula: "epley" });
    expect(value(e)).toBeCloseTo(255, 6);
    expect(e.ok && e.rirAdjusted && e.effectiveReps).toBe(4);
    expect(value(estimateMax({ load: 225, reps: 3, rir: 1, formula: "brzycki" }))).toBeCloseTo(245.45, 2);
  });

  it("target in pounds: 1RM 255 lb, 5 reps at RIR 2 (r = 7), 5 lb steps: 206.76 → 205 lb", () => {
    const load = value(targetLoad({ oneRm: 255, reps: 5, rir: 2, formula: "epley" }));
    expect(load).toBeCloseTo(206.76, 2);
    expect(roundToLoadable(load, 5)).toBe(205);
  });

  it("one rep is the load, for both formulas", () => {
    for (const formula of FORMULAS) {
      expect(value(estimateMax({ load: 140, reps: 1, formula }))).toBe(140);
      expect(value(targetLoad({ oneRm: 140, reps: 1, formula }))).toBe(140);
    }
  });

  it("round trip: 100 kg × 5 → e1RM → 5 reps at RIR 0 is 100.00 kg", () => {
    const max = value(estimateMax({ load: 100, reps: 5, formula: "epley" }));
    expect(value(targetLoad({ oneRm: max, reps: 5, formula: "epley" }))).toBeCloseTo(100, 10);
  });

  it("a tie rounds down: 83.75 kg on 2.5 kg steps is 82.5 kg", () => {
    expect(roundToLoadable(value(targetLoad({ oneRm: 83.75, reps: 1, formula: "epley" })), 2.5)).toBe(82.5);
  });

  it("over the cap: 10 reps at RIR 3 (r = 13) gives no number", () => {
    for (const formula of FORMULAS) {
      expect(estimateMax({ load: 100, reps: 10, rir: 3, formula })).toEqual({ ok: false, error: "over_cap" });
      expect(targetLoad({ oneRm: 100, reps: 10, rir: 3, formula })).toEqual({ ok: false, error: "over_cap" });
    }
  });
});

describe("Lift Math agrees with the log", () => {
  it("for every rep count 1–12 and both formulas, Lift Math's e1RM equals analytics' for the same set", () => {
    for (const formula of FORMULAS) {
      for (const reps of REPS) {
        for (const grams of [2_500, 100_000, 116_667, 225 * GRAMS_PER_LB]) {
          const lift = value(estimateMax({ load: grams, reps, formula }));
          expect(lift).toBe(e1rmExact(grams, reps, formula));
          expect(Math.round(lift)).toBe(estimateFromSet(grams, reps, formula));
        }
      }
    }
  });

  it("round trip property: load → e1RM → target at the same reps and RIR 0 returns the load before rounding", () => {
    for (const formula of FORMULAS) {
      for (const reps of REPS) {
        for (const load of [20, 62.5, 100, 137.5, 225, 405]) {
          const max = value(estimateMax({ load, reps, formula }));
          expect(value(targetLoad({ oneRm: max, reps, formula }))).toBeCloseTo(load, 9);
        }
      }
    }
  });
});

describe("inputs", () => {
  it("102,5 and 102.5 parse to the same load; blank is empty, junk is invalid", () => {
    expect(parseDecimal("102,5")).toBe(102.5);
    expect(parseDecimal(" 102.5 ")).toBe(102.5);
    expect(parseDecimal("")).toBeUndefined();
    expect(parseDecimal("1e3")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-5")).toBeNull();
  });

  it("empty, zero and nonsense never produce a number", () => {
    expect(estimateMax({ load: undefined, reps: 5, formula: "epley" })).toEqual({ ok: false, error: "empty" });
    expect(estimateMax({ load: 0, reps: 5, formula: "epley" })).toEqual({ ok: false, error: "invalid_load" });
    expect(estimateMax({ load: 100, reps: undefined, formula: "epley" })).toEqual({ ok: false, error: "empty" });
    expect(estimateMax({ load: 100, reps: 0, formula: "epley" })).toEqual({ ok: false, error: "invalid_reps" });
    expect(estimateMax({ load: 100, reps: 4.5, formula: "epley" })).toEqual({ ok: false, error: "invalid_reps" });
    expect(estimateMax({ load: 100, reps: 5, rir: -1, formula: "epley" })).toEqual({ ok: false, error: "invalid_rir" });
    expect(estimateMax({ load: 100, reps: 5, rir: 0.3, formula: "epley" })).toEqual({ ok: false, error: "invalid_rir" });
    expect(targetLoad({ oneRm: Number.NaN, reps: 5, formula: "epley" })).toEqual({ ok: false, error: "invalid_load" });
  });

  it("RPE converts to RIR in the log's half steps, and a half effective rep is taken as it is", () => {
    expect(rirFromRpe(8)).toBe(2);
    expect(rirFromRpe(8.5)).toBe(1.5);
    expect(effectiveReps(5, rirFromRpe(8.5))).toEqual({ ok: true, value: 6.5 });
    expect(value(estimateMax({ load: 100, reps: 5, rir: 1.5, formula: "epley" }))).toBeCloseTo(100 * (1 + 6.5 / 30), 10);
  });
});

describe("rounding to a loadable weight", () => {
  it("uses integer hundredths, so floating-point noise never moves the result", () => {
    expect(roundToLoadable(87.50000000000001, 2.5)).toBe(87.5);
    expect(roundToLoadable(87.49999999999999, 2.5)).toBe(87.5);
    expect(roundToLoadable(88.76, 2.5)).toBe(90);
    expect(roundToLoadable(203, 5)).toBe(205);
    expect(roundToLoadable(202.5, 5)).toBe(200);
  });

  it("the percentage table lists loads only, each rounded to the step", () => {
    expect(percentTable(100, 2.5, [100, 90, 75])).toEqual([
      { percent: 100, load: 100 },
      { percent: 90, load: 90 },
      { percent: 75, load: 75 },
    ]);
    expect(percentTable(116.67, 2.5, [85])).toEqual([{ percent: 85, load: 100 }]);
  });
});
