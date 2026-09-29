import { describe, expect, it } from "vitest";
import {
  PR_LABEL,
  REP_BRACKETS,
  computeExerciseRecords,
  findNewRecords,
  type SetWithContext,
} from "./records";

let n = 0;
function set(
  exerciseId: string,
  weightG: number,
  reps: number,
  performedAt: string,
  overrides: Partial<SetWithContext> = {},
): SetWithContext {
  n += 1;
  return {
    id: `s${n}`,
    workoutExerciseId: `we-${exerciseId}`,
    workoutId: "w",
    order: n,
    setType: "working",
    weightG,
    reps,
    isCompleted: true,
    exerciseId,
    performedAt,
    ...overrides,
  };
}

describe("computeExerciseRecords", () => {
  it("finds the heaviest set, best e1RM, best set volume and rep maxes per lift", () => {
    const rows = [
      set("bench", 100_000, 5, "2026-01-01"),
      set("bench", 110_000, 3, "2026-01-08"),
      set("bench", 80_000, 12, "2026-01-15"),
    ];
    const record = computeExerciseRecords(rows, "epley").get("bench")!;
    expect(record.heaviestSet?.weightG).toBe(110_000);
    expect(record.bestSetVolumeG).toBe(960_000);
    expect(record.repMaxes.get(3)?.weightG).toBe(110_000);
    expect(record.repMaxes.get(12)?.weightG).toBe(80_000);
    expect(record.repMaxes.get(15)).toBeUndefined();
    expect(REP_BRACKETS).toContain(12);
  });

  it("ignores warm-ups, unfinished sets and sets with no load or reps", () => {
    const rows = [
      set("bench", 200_000, 5, "2026-01-01", { setType: "warmup" }),
      set("bench", 200_000, 5, "2026-01-01", { isCompleted: false }),
      set("bench", 0, 5, "2026-01-01"),
      set("bench", 100_000, 0, "2026-01-01"),
    ];
    expect(computeExerciseRecords(rows, "epley").size).toBe(0);
  });
});

describe("findNewRecords", () => {
  const history = [set("bench", 100_000, 5, "2026-01-01")];

  it("flags a set that beats the history, with every kind it beats", () => {
    const flags = findNewRecords(history, [set("bench", 110_000, 5, "2026-02-01")], "epley");
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kinds).toEqual(expect.arrayContaining(["weight", "oneRm", "volume"]));
  });

  it("flags nothing for a set that does not beat the history", () => {
    expect(findNewRecords(history, [set("bench", 90_000, 5, "2026-02-01")], "epley")).toEqual([]);
  });

  it("earlier sets in a session set the bar for later ones, rep records included", () => {
    const first = set("bench", 110_000, 5, "2026-02-01T10:00");
    const flags = findNewRecords(
      history,
      [first, set("bench", 105_000, 5, "2026-02-01T10:05")],
      "epley",
    );
    expect(flags.map((row) => row.setId)).toEqual([first.id]);
  });

  // Lock'd fix I-12. Strong-Pro flagged the first set of a new lift as a record.
  it("a lift's first time on file is the baseline, never a record", () => {
    const flags = findNewRecords(history, [set("squat", 140_000, 5, "2026-02-01")], "epley");
    expect(flags).toEqual([]);
  });

  it("the whole first session of a lift is baseline, even when a later set is heavier", () => {
    const flags = findNewRecords(
      [],
      [set("squat", 100_000, 5, "2026-02-01T10:00"), set("squat", 120_000, 5, "2026-02-01T10:05")],
      "epley",
    );
    expect(flags).toEqual([]);
  });

  it("has a label for every kind", () => {
    expect(Object.keys(PR_LABEL).sort()).toEqual(["oneRm", "reps", "volume", "weight"]);
  });
});
