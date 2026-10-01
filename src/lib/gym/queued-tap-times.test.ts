import { beforeEach, describe, expect, it } from "vitest";
import { useGym } from "./store";

// A tap that waited in a native inbox is applied later but must be recorded when it was made.
describe("a queued tap keeps the time it was tapped", () => {
  beforeEach(() => useGym.getState().resetAll());

  function startOneSet() {
    const gym = useGym.getState();
    gym.completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    const id = gym.startEmptyWorkout("Today");
    gym.addExerciseToWorkout(id, "seed-bench-press");
    const row = useGym.getState().workoutSets.find((set) => set.workoutId === id)!;
    useGym.getState().updateSet(row.id, { weightG: 80_000, reps: 5, setType: "working" });
    return row.id;
  }

  it("stamps the set and starts the rest at the tap time", () => {
    const setId = startOneSet();
    const tapped = Date.now() - 90_000;
    useGym.getState().completeSet(setId, tapped);
    const done = useGym.getState().workoutSets.find((set) => set.id === setId)!;
    expect(done.completedAt).toBe(new Date(tapped).toISOString());
    const timer = useGym.getState().restTimer;
    expect(timer?.startedAt).toBe(new Date(tapped).toISOString());
    expect(Date.parse(timer!.endsAt)).toBe(tapped + timer!.durationSeconds * 1000);
  });

  it("without a time behaves as before: now", () => {
    const setId = startOneSet();
    const before = Date.now();
    useGym.getState().completeSet(setId);
    const stamp = Date.parse(useGym.getState().workoutSets.find((set) => set.id === setId)!.completedAt!);
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(Date.now());
  });

  it("applies a queued rest adjustment from the tap time, not from now", () => {
    const setId = startOneSet();
    const tapped = Date.now() - 30_000;
    useGym.getState().completeSet(setId, tapped);
    const before = useGym.getState().restTimer!;
    const tapAdjust = tapped + 10_000;
    useGym.getState().adjustRestTimer(15, tapAdjust);
    const after = useGym.getState().restTimer!;
    // Remaining at the tap was (original end - tap time), plus 15 s, counted from the tap.
    const remaining = Math.ceil((Date.parse(before.endsAt) - tapAdjust) / 1000) + 15;
    expect(Date.parse(after.endsAt)).toBe(tapAdjust + remaining * 1000);
    expect(after.startedAt).toBe(new Date(tapAdjust).toISOString());
  });
});
