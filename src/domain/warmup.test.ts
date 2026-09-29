import { describe, expect, it } from "vitest";
import { generateWarmup } from "./warmup";
import { toGrams } from "./units";
import type { PlateDenomination } from "./types";

const kg = (value: number) => toGrams(value, "kg");

const gym: PlateDenomination[] = [
  { weightG: kg(25), count: 4 },
  { weightG: kg(20), count: 4 },
  { weightG: kg(15), count: 2 },
  { weightG: kg(10), count: 4 },
  { weightG: kg(5), count: 4 },
  { weightG: kg(2.5), count: 4 },
  { weightG: kg(1.25), count: 4 },
];

const barbell = (workingKg: number, setCount: 3 | 4 | 5 = 5) =>
  generateWarmup({
    kind: "barbell",
    workingWeightG: kg(workingKg),
    barWeightG: kg(20),
    plates: gym,
    setCount,
  });

describe("barbell ramps", () => {
  it("starts with the empty bar and climbs to just under the working weight", () => {
    const steps = barbell(100);
    expect(steps[0]?.isBar).toBe(true);
    expect(steps[0]?.weightG).toBe(kg(20));
    expect(steps.at(-1)!.weightG).toBeLessThan(kg(100));
  });

  it("is strictly monotonic", () => {
    for (const working of [60, 80, 100, 140, 180, 220]) {
      const steps = barbell(working);
      const loads = steps.map((step) => step.weightG);
      expect(loads).toEqual([...loads].sort((a, b) => a - b));
      expect(new Set(loads).size).toBe(loads.length);
    }
  });

  it("never prescribes a load above the working weight", () => {
    for (const working of [42.5, 60, 77.5, 100, 137.5]) {
      for (const step of barbell(working)) {
        expect(step.weightG).toBeLessThanOrEqual(kg(working));
      }
    }
  });

  it("only prescribes loads that the inventory can actually build", () => {
    const steps = barbell(100);
    for (const step of steps) {
      const plateGrams = step.weightG - kg(20);
      expect(plateGrams % 2).toBe(0); // splits evenly across two sides
      expect(plateGrams).toBeGreaterThanOrEqual(0);
    }
  });

  it("honours the requested set count as an upper bound", () => {
    expect(barbell(140, 3).length).toBeLessThanOrEqual(4); // bar + 3 rungs
    expect(barbell(140, 5).length).toBeLessThanOrEqual(6);
    expect(barbell(140, 3).length).toBeLessThan(barbell(140, 5).length);
  });

  it("collapses to a single bar set when the working weight is the bar", () => {
    const steps = barbell(20);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.isBar).toBe(true);
  });

  it("returns only the bar when the working weight barely exceeds it", () => {
    const steps = barbell(22.5);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.weightG).toBe(kg(20));
  });

  it("returns nothing for a non-positive working weight", () => {
    expect(barbell(0)).toEqual([]);
    expect(barbell(-50)).toEqual([]);
  });

  it("de-duplicates rungs that round to the same buildable load", () => {
    // A gym with only 20 kg plates forces several percentages onto the same load.
    const steps = generateWarmup({
      kind: "barbell",
      workingWeightG: kg(140),
      barWeightG: kg(20),
      plates: [{ weightG: kg(20), count: 6 }],
      setCount: 5,
    });
    const loads = steps.map((step) => step.weightG);
    expect(new Set(loads).size).toBe(loads.length);
  });

  it("accounts for collars in the bar set", () => {
    const steps = generateWarmup({
      kind: "barbell",
      workingWeightG: kg(100),
      barWeightG: kg(20),
      collarWeightG: kg(2.5),
      plates: gym,
      setCount: 4,
    });
    expect(steps[0]?.weightG).toBe(kg(25));
  });
});

describe("increment ramps (dumbbell / machine)", () => {
  it("rounds every load to the equipment increment", () => {
    const steps = generateWarmup({
      kind: "increment",
      workingWeightG: kg(40),
      incrementG: kg(2.5),
      setCount: 4,
    });
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step.weightG % kg(2.5)).toBe(0);
      expect(step.weightG).toBeLessThan(kg(40));
      expect(step.isBar).toBe(false);
    }
  });

  it("drops rungs below the lightest available load", () => {
    const steps = generateWarmup({
      kind: "increment",
      workingWeightG: kg(20),
      incrementG: kg(5),
      minimumG: kg(10),
      setCount: 5,
    });
    for (const step of steps) expect(step.weightG).toBeGreaterThanOrEqual(kg(10));
  });

  it("stays monotonic with a coarse increment", () => {
    const loads = generateWarmup({
      kind: "increment",
      workingWeightG: kg(30),
      incrementG: kg(10),
      setCount: 5,
    }).map((step) => step.weightG);
    expect(loads).toEqual([...new Set(loads)].sort((a, b) => a - b));
  });
});
