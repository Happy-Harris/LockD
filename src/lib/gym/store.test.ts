import { beforeEach, describe, expect, it } from "vitest";
import { useGym } from "./store";

/** Store actions touched by the critical fixes. Runs in Node: persist has no storage and is a no-op. */
function startWithOneExercise() {
  const state = useGym.getState();
  state.resetAll();
  state.completeOnboarding({ loadDemo: false, unitSystem: "metric" });
  const workoutId = useGym.getState().startEmptyWorkout("Test");
  useGym.getState().addExerciseToWorkout(workoutId, "seed-bench-press");
  const sets = useGym.getState().workoutSets.filter((set) => set.workoutId === workoutId);
  return { workoutId, sets };
}

describe("restoreSet (undo for set delete)", () => {
  beforeEach(() => useGym.getState().resetAll());

  it("puts a deleted set back exactly as it was", () => {
    const { workoutId, sets } = startWithOneExercise();
    const target = { ...sets[1]!, weightG: 60_000, reps: 5 };
    useGym.getState().updateSet(target.id, { weightG: 60_000, reps: 5 });
    useGym.getState().deleteSet(target.id);
    expect(useGym.getState().workoutSets.some((set) => set.id === target.id)).toBe(false);

    useGym.getState().restoreSet(target);
    const restored = useGym.getState().workoutSets.find((set) => set.id === target.id);
    expect(restored).toEqual(target);
    const orders = useGym
      .getState()
      .workoutSets.filter((set) => set.workoutId === workoutId)
      .sort((a, b) => a.order - b.order)
      .map((set) => set.id);
    expect(orders).toEqual(sets.map((set) => set.id));
  });

  it("does not duplicate a set that is already present", () => {
    const { sets } = startWithOneExercise();
    useGym.getState().restoreSet(sets[0]!);
    expect(useGym.getState().workoutSets.filter((set) => set.id === sets[0]!.id)).toHaveLength(1);
  });

  it("does not restore into an exercise that was removed", () => {
    const { sets } = startWithOneExercise();
    const set = sets[0]!;
    useGym.getState().removeExerciseFromWorkout(set.workoutExerciseId);
    useGym.getState().restoreSet(set);
    expect(useGym.getState().workoutSets.some((row) => row.id === set.id)).toBe(false);
  });
});
