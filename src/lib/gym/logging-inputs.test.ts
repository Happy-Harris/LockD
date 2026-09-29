import { beforeEach, describe, expect, it } from "vitest";
import { formatWeightInput, parseRepsInput, parseWeightInput } from "@/domain/units";
import { useGym } from "./store";

describe("editable weight input (I-27)", () => {
  it("is never digit-grouped, so 1000 reads back as 1000", () => {
    expect(formatWeightInput(1_000_000, "kg")).toBe("1000");
    expect(parseWeightInput(formatWeightInput(1_000_000, "kg"), "kg")).toBe(1_000_000);
  });

  it("keeps two decimals and trims trailing zeros", () => {
    expect(formatWeightInput(102_500, "kg")).toBe("102.5");
    expect(formatWeightInput(60_000, "lb")).toBe("132.28");
    expect(formatWeightInput(0, "kg")).toBe("0");
  });

  it("round-trips a typed comma decimal", () => {
    expect(parseWeightInput("102,5", "kg")).toBe(102_500);
  });
});

describe("typed reps (I-28)", () => {
  it("clearing the field clears the value instead of storing 0", () => {
    expect(parseRepsInput("")).toBeUndefined();
    expect(parseRepsInput("   ")).toBeUndefined();
    expect(parseRepsInput("abc")).toBeUndefined();
  });

  it("reads a typed number, including an explicit 0", () => {
    expect(parseRepsInput("8")).toBe(8);
    expect(parseRepsInput("0")).toBe(0);
    expect(parseRepsInput("-3")).toBeUndefined();
  });
});

describe("starting from a routine with a warm-up (I-30)", () => {
  beforeEach(() => useGym.getState().resetAll());

  it("gives the warm-up row no working weight, and working rows keep theirs", () => {
    const gym = useGym.getState();
    gym.completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    const first = gym.startEmptyWorkout("History");
    gym.addExerciseToWorkout(first, "seed-bench-press");
    const seeded = useGym.getState().workoutSets.filter((set) => set.workoutId === first);
    useGym.getState().updateSet(seeded[0]!.id, { weightG: 80_000, reps: 5, setType: "working" });
    useGym.getState().completeSet(seeded[0]!.id);
    useGym.getState().finishWorkout(first);

    const stamp = new Date().toISOString();
    useGym
      .getState()
      .upsertTemplate(
        {
          id: "t-warm",
          name: "Warm",
          order: 0,
          isArchived: false,
          createdAt: stamp,
          updatedAt: stamp,
        },
        [
          {
            id: "te-warm",
            templateId: "t-warm",
            exerciseId: "seed-bench-press",
            order: 0,
            targetSets: 3,
            targetRepMin: 5,
            targetRepMax: 8,
            restSeconds: 120,
            defaultSetType: "working",
            includeWarmup: true,
          },
        ],
      );
    const workoutId = useGym.getState().startFromTemplate("t-warm");
    const sets = useGym
      .getState()
      .workoutSets.filter((set) => set.workoutId === workoutId)
      .sort((a, b) => a.order - b.order);
    expect(sets[0]!.setType).toBe("warmup");
    expect(sets[0]!.weightG).toBeUndefined();
    expect(sets[1]!.setType).toBe("working");
    expect(sets[1]!.weightG).toBeGreaterThan(0);
  });
});
