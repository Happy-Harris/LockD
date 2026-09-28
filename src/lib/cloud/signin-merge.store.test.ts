import { describe, expect, it, vi } from "vitest";
import { useGym } from "@/lib/gym/store";
import { cloudGymFromState } from "./payload";
import { applyRemoteVault } from "./signin-merge";

/**
 * The data-loss path found in the Phase 1 spot-check, replayed through the real store:
 * a phone onboarded with "Start empty" (cloud vault: settings only) and a laptop with a year
 * of sessions. Before the fix, signing in on the laptop took it from 137 sessions to 0.
 */
describe("sign-in with a real store", () => {
  const completed = () => useGym.getState().workouts.filter((w) => w.status === "completed").length;

  it("keeps this device's sessions when the cloud vault is onboarded but empty", async () => {
    useGym.getState().resetAll();
    useGym.getState().completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    const remote = cloudGymFromState(useGym.getState());

    useGym.getState().loadDemo();
    const before = completed();
    expect(before).toBeGreaterThan(100);

    const push = vi.fn(async () => undefined);
    await applyRemoteVault({
      local: cloudGymFromState(useGym.getState()),
      remote,
      takeBackup: async () => undefined,
      apply: (gym) => useGym.getState().replaceFromCloud(gym),
      push,
    });
    expect(completed()).toBe(before);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("merges when the cloud vault has its own sessions", async () => {
    useGym.getState().resetAll();
    useGym.getState().completeOnboarding({ loadDemo: true, unitSystem: "metric" });
    const remote = cloudGymFromState(useGym.getState());
    const remoteCount = completed();

    useGym.getState().resetAll();
    useGym.getState().completeOnboarding({ loadDemo: false, unitSystem: "metric" });
    const id = useGym.getState().startEmptyWorkout("Laptop session");
    useGym.getState().finishWorkout(id);

    await applyRemoteVault({
      local: cloudGymFromState(useGym.getState()),
      remote,
      takeBackup: async () => undefined,
      apply: (gym) => useGym.getState().replaceFromCloud(gym),
      push: async () => undefined,
    });
    expect(completed()).toBe(remoteCount + 1);
    expect(useGym.getState().workouts.some((w) => w.name === "Laptop session")).toBe(true);
  });
});
