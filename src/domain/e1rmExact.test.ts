import { describe, expect, it } from "vitest";
import { estimateFromSet } from "@/lib/gym/analytics";
import { bestOneRepMax, e1rmExact, estimateOneRepMax, MAX_E1RM_REPS } from "./oneRepMax";
import type { OneRepMaxFormula, WorkoutSet } from "./types";

const FORMULAS: OneRepMaxFormula[] = ["epley", "brzycki"];
const REPS = Array.from({ length: MAX_E1RM_REPS }, (_, i) => i + 1);
const LOADS_G = [1, 2_500, 40_000, 100_000, 116_667, 225_000, 453_592];

function set(weightG: number, reps: number): WorkoutSet {
  return {
    id: "s",
    workoutExerciseId: "we",
    workoutId: "w",
    order: 0,
    setType: "working",
    weightG,
    reps,
    isCompleted: true,
  };
}

describe("e1rmExact: hand-checked vectors (units are whatever the caller passes)", () => {
  it("Epley 100 kg × 5 = 116.67 kg", () => {
    expect(e1rmExact(100, 5, "epley")).toBeCloseTo(116.6667, 4);
  });

  it("Brzycki 100 kg × 5 = 112.50 kg", () => {
    expect(e1rmExact(100, 5, "brzycki")).toBeCloseTo(112.5, 6);
  });

  it("effective reps 4 (225 lb × 3 at RIR 1): Epley 255.0 lb, Brzycki 245.45 lb", () => {
    expect(e1rmExact(225, 4, "epley")).toBeCloseTo(255, 6);
    expect(e1rmExact(225, 4, "brzycki")).toBeCloseTo(245.4545, 4);
  });

  it("a single rep is the load itself, exactly, for both formulas", () => {
    for (const formula of FORMULAS) expect(e1rmExact(140, 1, formula)).toBe(140);
  });

  it("gives no number past the rep cap, or without a usable load or rep count", () => {
    for (const formula of FORMULAS) {
      expect(e1rmExact(100, MAX_E1RM_REPS + 1, formula)).toBeNull();
      expect(e1rmExact(0, 5, formula)).toBeNull();
      expect(e1rmExact(-10, 5, formula)).toBeNull();
      expect(e1rmExact(100, 0, formula)).toBeNull();
      expect(e1rmExact(Number.NaN, 5, formula)).toBeNull();
      expect(e1rmExact(100, Number.POSITIVE_INFINITY, formula)).toBeNull();
    }
  });

  it("is not rounded: the rounded wrapper is the only place a value is rounded", () => {
    expect(e1rmExact(100_001, 5, "epley")).not.toBe(Math.round(e1rmExact(100_001, 5, "epley")!));
  });
});

describe("analytics and the shared core agree", () => {
  it.each(FORMULAS)(
    "%s: rounded estimate equals the rounded core for every rep count 1–12",
    (formula) => {
      for (const reps of REPS) {
        for (const weightG of LOADS_G) {
          const exact = e1rmExact(weightG, reps, formula)!;
          const rounded = Math.round(exact);
          expect(estimateOneRepMax(weightG, reps, formula)?.value, `${weightG} g × ${reps}`).toBe(
            rounded,
          );
          expect(estimateFromSet(weightG, reps, formula), `${weightG} g × ${reps}`).toBe(rounded);
          expect(
            bestOneRepMax([set(weightG, reps)], formula)?.value,
            `${weightG} g × ${reps}`,
          ).toBe(rounded);
        }
      }
    },
  );

  it("agree on 'no estimate' past the cap", () => {
    for (const formula of FORMULAS) {
      expect(estimateOneRepMax(100_000, MAX_E1RM_REPS + 1, formula)).toBeNull();
      expect(estimateFromSet(100_000, MAX_E1RM_REPS + 1, formula)).toBeNull();
      expect(bestOneRepMax([set(100_000, MAX_E1RM_REPS + 1)], formula)).toBeNull();
    }
  });

  it("keeps the wrapper's reported formula exactly as before the split", () => {
    expect(estimateOneRepMax(100_000, 5, "brzycki")).toEqual({
      value: 112_500,
      formulaUsed: "brzycki",
      fellBack: false,
    });
    expect(estimateOneRepMax(100_000, 5, "epley")).toEqual({
      value: 116_667,
      formulaUsed: "epley",
      fellBack: false,
    });
    expect(estimateOneRepMax(100_000, 1, "brzycki")).toEqual({
      value: 100_000,
      formulaUsed: "brzycki",
      fellBack: false,
    });
  });
});
