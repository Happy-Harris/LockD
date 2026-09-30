import { beforeEach, describe, expect, it } from "vitest";
import { localDateOf } from "@/domain/time";
import { useGym } from "./store";

/** Opp 8 on the gym floor: a routine started after a layoff is filled in at the comeback load. */
beforeEach(() => useGym.getState().resetAll());

function logBenchDaysAgo(days: number, weightG: number) {
  const gym = useGym.getState();
  const id = gym.startEmptyWorkout("Before the break");
  gym.addExerciseToWorkout(id, "seed-bench-press");
  const set = useGym.getState().workoutSets.find((row) => row.workoutId === id)!;
  useGym.getState().updateSet(set.id, { weightG, reps: 5, setType: "working" });
  useGym.getState().completeSet(set.id);
  useGym.getState().finishWorkout(id);
  const when = new Date();
  when.setDate(when.getDate() - days);
  const localDate = localDateOf(when);
  const iso = when.toISOString();
  useGym.setState((state) => ({
    workouts: state.workouts.map((row) =>
      row.id === id ? { ...row, localDate, startedAt: iso, endedAt: iso } : row,
    ),
  }));
}

function startBenchRoutine() {
  const stamp = new Date().toISOString();
  useGym
    .getState()
    .upsertTemplate(
      { id: "t-bench", name: "Bench", order: 0, isArchived: false, createdAt: stamp, updatedAt: stamp },
      [
        {
          id: "te-bench",
          templateId: "t-bench",
          exerciseId: "seed-bench-press",
          order: 0,
          targetSets: 2,
          targetRepMin: 5,
          targetRepMax: 8,
          restSeconds: 120,
          defaultSetType: "working",
          includeWarmup: false,
        },
      ],
    );
  const workoutId = useGym.getState().startFromTemplate("t-bench");
  return useGym.getState().workoutSets.filter((set) => set.workoutId === workoutId);
}

describe("starting a routine after a layoff", () => {
  it("fills the working sets at the comeback load: 80 % of 100 kg after 40 days", () => {
    useGym.getState().completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    logBenchDaysAgo(40, 100_000);
    const sets = startBenchRoutine();
    expect(sets.map((set) => set.weightG)).toEqual([80_000, 80_000]);
    expect(sets.map((set) => set.reps)).toEqual([5, 5]);
  });

  it("follows the lifter's own rule", () => {
    useGym.getState().completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    useGym.getState().updateSettings({ comebackRule: { shortPct: 90, midPct: 75, longPct: 70 } });
    logBenchDaysAgo(40, 100_000);
    expect(startBenchRoutine().map((set) => set.weightG)).toEqual([75_000, 75_000]);
  });

  it("is not used inside a layoff's length", () => {
    useGym.getState().completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    logBenchDaysAgo(5, 100_000);
    expect(startBenchRoutine()[0]!.weightG).toBeGreaterThanOrEqual(100_000);
  });
});
