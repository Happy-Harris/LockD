import { describe, expect, it } from "vitest";
import { bestOneRepMax } from "./oneRepMax";
import { e1rmExclusion, e1rmProvenance } from "./provenance";
import type { WorkoutSet } from "./types";

const set = (order: number, over: Partial<WorkoutSet>): WorkoutSet => ({
  id: `s${order}`,
  workoutId: "w",
  workoutExerciseId: "b",
  order,
  setType: "working",
  weightG: 100_000,
  reps: 5,
  isCompleted: true,
  ...over,
});

const sets: WorkoutSet[] = [
  set(0, { setType: "warmup", weightG: 60_000, reps: 5 }),
  set(1, { weightG: 100_000, reps: 5 }),
  set(2, { weightG: 105_000, reps: 3 }),
  set(3, { weightG: 80_000, reps: 15 }),
  set(4, { weightG: 0, reps: 10 }),
  set(5, { weightG: 110_000, reps: 0 }),
  set(6, { weightG: 120_000, reps: 3, isCompleted: false }),
];

describe("the working behind an estimated 1RM (Opp 4)", () => {
  it("names why each set gives no estimate", () => {
    expect(sets.map((row) => e1rmExclusion(row) ?? "used")).toEqual([
      "warmup",
      "used",
      "used",
      "too_many_reps",
      "no_load",
      "no_reps",
      "not_completed",
    ]);
    expect(e1rmExclusion(sets[0]!, { includeWarmups: true })).toBeUndefined();
  });

  it("accounts for every set, used or left out, and agrees with bestOneRepMax", () => {
    for (const formula of ["epley", "brzycki"] as const) {
      const provenance = e1rmProvenance(sets, formula);
      expect(provenance.used.length + provenance.excluded.length).toBe(sets.length);
      const best = bestOneRepMax(sets, formula);
      expect(provenance.best?.value).toBe(best?.value);
      expect(provenance.best?.set.id).toBe(best?.set.id);
      expect(provenance.used.map((row) => row.set.id)).toEqual(["s1", "s2"]);
    }
  });

  it("states the formula it used", () => {
    const provenance = e1rmProvenance(sets, "epley");
    expect(provenance.formulaLabel).toBe("Epley");
    expect(provenance.expression).toBe("weight × (1 + reps / 30)");
    // 105 kg × 3 by Epley is 115.5 kg, above 100 kg × 5 (116.67 kg)? No: 100 × 5 wins.
    expect(provenance.best?.set.id).toBe("s1");
    expect(provenance.used.find((row) => row.set.id === "s1")?.valueG).toBe(116_667);
  });

  it("with nothing usable there is no estimate, and every set says why", () => {
    const provenance = e1rmProvenance([sets[0]!, sets[3]!], "epley");
    expect(provenance.best).toBeNull();
    expect(provenance.excluded.map((row) => row.reason)).toEqual(["warmup", "too_many_reps"]);
  });
});
