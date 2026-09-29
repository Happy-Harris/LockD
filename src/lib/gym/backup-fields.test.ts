import { beforeEach, describe, expect, it } from "vitest";
import type { LockdBackup } from "@/domain/types";
import oldBackup from "@/test/fixtures/backup/lockd-backup-v3-before-type-union.json";
import { useGym } from "./store";

beforeEach(() => useGym.getState().resetAll());

describe("backup round trip and the widened domain types (plan PR 4f)", () => {
  it("an old-format backup, written before the new optional fields existed, still loads unchanged", () => {
    const backup = oldBackup as unknown as LockdBackup;
    useGym.getState().importBackup(backup, "replace");
    const state = useGym.getState();
    expect(state.workouts).toEqual(backup.workouts);
    expect(state.workoutSets).toEqual(backup.workoutSets);
    expect(state.workouts[0]!.tzOffsetMinutes).toBe(300);
    expect(state.settings.intensityMode).toBe("rpe");
    expect(state.settings.restTimerVibrate).toBeUndefined();
    expect(state.settings.warmupRestSeconds).toBeUndefined();
    expect(state.settings.personalMuscleTargets).toBeUndefined();
  });

  it("the new optional fields survive import and export", () => {
    const base = oldBackup as unknown as LockdBackup;
    const backup: LockdBackup = {
      ...base,
      workouts: [{ ...base.workouts[0]!, importFingerprint: "fp-1", importJobId: "job-1" }],
      workoutExercises: [{ ...base.workoutExercises[0]!, unilateralSnapshot: true }],
      workoutSets: [
        { ...base.workoutSets[0]!, rir: 2, side: "left", pairId: "pair-1" },
        { ...base.workoutSets[0]!, id: "s-right", side: "right", pairId: "pair-1" },
      ],
      settings: {
        ...base.settings,
        intensityMode: "rir",
        restTimerVibrate: true,
        restTimerNotification: false,
        warmupRestSeconds: 30,
        personalMuscleTargets: { chest: { min: 10, max: 16 } },
      },
    };
    useGym.getState().importBackup(backup, "replace");
    const out = useGym.getState().exportBackup();
    expect(out.workouts).toEqual(backup.workouts);
    expect(out.workoutExercises).toEqual(backup.workoutExercises);
    expect(out.workoutSets).toEqual(backup.workoutSets);
    expect(out.settings).toMatchObject(backup.settings);
  });
});
