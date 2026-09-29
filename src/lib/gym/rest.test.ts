import { beforeEach, describe, expect, it } from "vitest";
import { restSecondsAfter, restSuggestion } from "./rest";
import { useGym } from "./store";

describe("restSecondsAfter (I-21)", () => {
  it("uses the exercise's rest (routine rest or the user's default), not a built-in guess", () => {
    expect(restSecondsAfter("working", 90, {})).toBe(90);
    expect(restSecondsAfter("failure", 150, {})).toBe(150);
  });

  it("gives warm-ups no timer unless a warm-up rest is set", () => {
    expect(restSecondsAfter("warmup", 180, {})).toBeNull();
    expect(restSecondsAfter("warmup", 180, { warmupRestSeconds: 0 })).toBeNull();
    expect(restSecondsAfter("warmup", 180, { warmupRestSeconds: 30 })).toBe(30);
  });
});

describe("restSuggestion", () => {
  it("offers a learned rest only when it differs enough from the chosen one", () => {
    expect(restSuggestion(null, 120)).toBeUndefined();
    expect(restSuggestion(120, 120)).toBeUndefined();
    expect(restSuggestion(130, 120)).toBeUndefined();
    expect(restSuggestion(150, 120)).toBe(150);
    expect(restSuggestion(90, 120)).toBe(90);
  });
});

describe("completing a set starts the right rest", () => {
  beforeEach(() => useGym.getState().resetAll());

  function twoSets(setTypes: ["warmup" | "working", "warmup" | "working"]) {
    const gym = useGym.getState();
    gym.completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    const workoutId = gym.startEmptyWorkout("Rest");
    gym.addExerciseToWorkout(workoutId, "seed-bench-press");
    const sets = useGym
      .getState()
      .workoutSets.filter((set) => set.workoutId === workoutId)
      .sort((a, b) => a.order - b.order);
    useGym.getState().updateSet(sets[0]!.id, { setType: setTypes[0], weightG: 40_000, reps: 5 });
    useGym.getState().updateSet(sets[1]!.id, { setType: setTypes[1], weightG: 60_000, reps: 5 });
    return sets;
  }

  it("a working set rests for the exercise's rest, whatever the built-in defaults would say", () => {
    const sets = twoSets(["working", "working"]);
    const we = useGym.getState().workoutExercises[0]!;
    expect(we.restSeconds).toBe(useGym.getState().settings.defaultRestSeconds);
    useGym.getState().completeSet(sets[1]!.id);
    expect(useGym.getState().restTimer?.durationSeconds).toBe(we.restSeconds);
  });

  it("a warm-up set starts no timer by default, and the warm-up rest once set", () => {
    const sets = twoSets(["warmup", "working"]);
    useGym.getState().completeSet(sets[0]!.id);
    expect(useGym.getState().restTimer).toBeNull();
    useGym.getState().updateSettings({ warmupRestSeconds: 30 });
    useGym.getState().uncompleteSet(sets[0]!.id);
    useGym.getState().completeSet(sets[0]!.id);
    expect(useGym.getState().restTimer?.durationSeconds).toBe(30);
  });
});
