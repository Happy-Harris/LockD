import { describe, expect, it } from "vitest";
import { toGrams } from "@/domain/units";
import type { SessionSlice } from "./analytics";
import { compareSet } from "./ghost";
import { detectMilestones, milestonesFor } from "./moments";
import { searchSessions } from "./search";
import { sessionReplay } from "./replay";

/** Plan I-14: ghost deltas, session search and the milestone ladder follow the lifter's unit. */
function slice(exerciseId: string, name: string, weightG: number, reps = 5): SessionSlice {
  const date = "2026-03-01";
  return {
    workout: {
      id: "w1",
      name: "Push",
      status: "completed",
      localDate: date,
      startedAt: `${date}T12:00:00.000Z`,
      endedAt: `${date}T13:00:00.000Z`,
      createdAt: `${date}T12:00:00.000Z`,
      updatedAt: `${date}T13:00:00.000Z`,
      tzOffsetMinutes: 0,
      pausedSeconds: 0,
    },
    exercises: [
      {
        id: "e1",
        workoutId: "w1",
        exerciseId,
        order: 0,
        restSeconds: 120,
        exerciseNameSnapshot: name,
      },
    ],
    sets: [
      {
        id: "s1",
        workoutId: "w1",
        workoutExerciseId: "e1",
        order: 0,
        setType: "working",
        weightG,
        reps,
        isCompleted: true,
      },
    ],
  } as unknown as SessionSlice;
}

describe("ghost delta label", () => {
  it("is written in the display unit, and kg is unchanged", () => {
    const ghost = { weightG: toGrams(200, "lb"), reps: 5 };
    const now = { weightG: toGrams(205, "lb"), reps: 5 };
    expect(compareSet(now, ghost, "lb").label).toBe("+5 lb");
    expect(compareSet({ weightG: 102_500, reps: 5 }, { weightG: 100_000, reps: 5 }).label).toBe(
      "+2.5 kg",
    );
    expect(
      compareSet({ weightG: 97_500, reps: 5 }, { weightG: 100_000, reps: 5 }, "kg").label,
    ).toBe("−2.5 kg");
  });
});

describe("session search 'above N'", () => {
  const bench225lb = slice("seed-bench-press", "Bench Press", toGrams(225, "lb"));
  it("reads N in the display unit", () => {
    expect(searchSessions("above 200", [bench225lb], "lb")).toHaveLength(1);
    // The same 225 lb set is only 102 kg, so "above 200" in kg mode finds nothing.
    expect(searchSessions("above 200", [bench225lb], "kg")).toHaveLength(0);
  });
  it("lets the query name its own unit, which wins", () => {
    expect(searchSessions("above 100 kg", [bench225lb], "lb")).toHaveLength(1); // 102.06 kg
    expect(searchSessions("above 230 lb", [bench225lb], "kg")).toHaveLength(0);
    expect(searchSessions("above 225 lb", [bench225lb], "kg")[0]!.why).toContain("≥ 225 lb");
  });
});

describe("milestone ladder per unit system", () => {
  it("has round numbers of the unit, with the same lifts", () => {
    const kg = milestonesFor("kg")
      .filter((row) => row.kind === "weight")
      .map((row) => row.label);
    const lb = milestonesFor("lb")
      .filter((row) => row.kind === "weight")
      .map((row) => row.label);
    expect(kg).toContain("100 kg bench");
    expect(lb).toContain("225 lb bench");
    expect(lb).not.toContain("100 kg bench");
    expect(lb.every((label) => /^\d+ lb /.test(label))).toBe(true);
  });

  it("a 225 lb bench is a milestone for a lb lifter, and featured", () => {
    const hits = detectMilestones(
      [slice("seed-bench-press", "Bench Press", toGrams(225, "lb"))],
      "lb",
    );
    expect(hits.map((row) => row.title)).toEqual([
      "First 135 lb bench",
      "First 185 lb bench",
      "First 225 lb bench",
    ]);
    expect(hits.filter((row) => row.featured).map((row) => row.title)).toEqual([
      "First 225 lb bench",
    ]);
    expect(hits.at(-1)!.valueLabel).toBe("225 lb × 5");
  });

  it("the same set in kg mode stays on the kg ladder", () => {
    const hits = detectMilestones(
      [slice("seed-bench-press", "Bench Press", toGrams(225, "lb"))],
      "kg",
    );
    expect(hits.map((row) => row.title)).toEqual([
      "First 60 kg bench",
      "First 80 kg bench",
      "First 100 kg bench",
    ]);
  });
});

describe("session replay set detail", () => {
  it("shows the weight in the display unit, not 0.1 kg rounded", () => {
    const set = { ...slice("seed-bench-press", "Bench Press", toGrams(225, "lb")) };
    set.sets[0]!.completedAt = "2026-03-01T12:10:00.000Z";
    const detail = (unit: "kg" | "lb") =>
      sessionReplay(set, [], unit).find((event) => event.kind === "set")!.detail;
    expect(detail("lb")).toBe("225 × 5");
    expect(detail("kg")).toBe("102.06 × 5");
  });
});
