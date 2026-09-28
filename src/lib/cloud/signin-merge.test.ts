import { describe, expect, it, vi } from "vitest";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { defaultSettings } from "@/lib/gym/store";
import type { CloudGym } from "./types";
import { applyRemoteVault, mergeCloudGym, normalizeCloudGym, planSignInSync } from "./signin-merge";

function emptyGym(overrides: Partial<CloudGym> = {}): CloudGym {
  return {
    exercises: [],
    templates: [],
    templateExercises: [],
    workouts: [],
    workoutExercises: [],
    workoutSets: [],
    measurements: [],
    plates: [],
    bars: [],
    settings: defaultSettings(),
    labLast: null,
    programs: [],
    programWeeks: [],
    programSessions: [],
    programExercises: [],
    eraNames: [],
    machineSetups: [],
    lessons: [],
    namedPrs: [],
    clips: [],
    ...overrides,
  };
}

function session(id: string, date: string, status: Workout["status"] = "completed") {
  const workout: Workout = {
    id,
    name: `Session ${id}`,
    status,
    startedAt: `${date}T18:00:00.000Z`,
    localDate: date,
    tzOffsetMinutes: 0,
    pausedSeconds: 0,
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T19:00:00.000Z`,
  };
  const block: WorkoutExercise = {
    id: `${id}-we`,
    workoutId: id,
    exerciseId: "seed-bench-press",
    order: 0,
    exerciseNameSnapshot: "Bench Press",
    primaryMuscleGroupSnapshot: "chest",
    secondaryMuscleGroupsSnapshot: [],
    equipmentSnapshot: "barbell",
    trackingTypeSnapshot: "weight_reps",
    restSeconds: 120,
  };
  const set: WorkoutSet = {
    id: `${id}-s1`,
    workoutExerciseId: block.id,
    workoutId: id,
    order: 0,
    setType: "working",
    weightG: 100_000,
    reps: 5,
    isCompleted: status === "completed",
  };
  return { workouts: [workout], workoutExercises: [block], workoutSets: [set] };
}

function withSessions(...parts: Array<ReturnType<typeof session>>): Partial<CloudGym> {
  return {
    workouts: parts.flatMap((p) => p.workouts),
    workoutExercises: parts.flatMap((p) => p.workoutExercises),
    workoutSets: parts.flatMap((p) => p.workoutSets),
  };
}

const onboarded = { ...defaultSettings(), onboardingCompletedAt: "2026-09-01T00:00:00.000Z" };

describe("planSignInSync", () => {
  it("never replaces local sessions with an onboarded-but-empty cloud vault", () => {
    const local = emptyGym(withSessions(session("a", "2026-09-01"), session("b", "2026-09-03")));
    const remote = emptyGym({ settings: onboarded });
    expect(planSignInSync(local, remote)).toBe("push-local");
  });

  it("pushes local when there is no cloud vault yet", () => {
    const local = emptyGym({ ...withSessions(session("a", "2026-09-01")), settings: onboarded });
    expect(planSignInSync(local, null)).toBe("push-local");
  });

  it("takes the cloud copy when this device has no sessions", () => {
    const local = emptyGym({ settings: onboarded });
    const remote = emptyGym(withSessions(session("r", "2026-08-01")));
    expect(planSignInSync(local, remote)).toBe("use-remote");
  });

  it("merges when both sides have sessions", () => {
    const local = emptyGym(withSessions(session("a", "2026-09-01")));
    const remote = emptyGym(withSessions(session("r", "2026-08-01")));
    expect(planSignInSync(local, remote)).toBe("merge");
  });

  it("counts an in-progress workout on this device as local history", () => {
    const local = emptyGym(withSessions(session("live", "2026-09-28", "active")));
    const remote = emptyGym(withSessions(session("r", "2026-08-01")));
    expect(planSignInSync(local, remote)).toBe("merge");
  });

  it("does nothing when neither side has anything", () => {
    expect(planSignInSync(emptyGym(), null)).toBe("nothing");
  });
});

describe("mergeCloudGym", () => {
  it("keeps every session from both sides, with their exercises and sets", () => {
    const local = emptyGym(withSessions(session("a", "2026-09-01"), session("live", "2026-09-28", "active")));
    const remote = emptyGym(withSessions(session("r", "2026-08-01")));
    const { merged, summary } = mergeCloudGym(local, remote);
    expect(merged.workouts.map((w) => w.id).sort()).toEqual(["a", "live", "r"]);
    expect(merged.workoutExercises).toHaveLength(3);
    expect(merged.workoutSets).toHaveLength(3);
    expect(summary.sessionsFromThisDevice).toBe(2);
  });

  it("keeps the cloud row when both sides have the same id, and never duplicates", () => {
    const shared = session("s", "2026-09-01");
    const local = emptyGym(withSessions(shared));
    const remoteVersion = { ...shared, workouts: [{ ...shared.workouts[0]!, notes: "cloud" }] };
    const remote = emptyGym(withSessions(remoteVersion));
    const { merged, summary } = mergeCloudGym(local, remote);
    expect(merged.workouts).toHaveLength(1);
    expect(merged.workouts[0]!.notes).toBe("cloud");
    expect(merged.workoutSets).toHaveLength(1);
    expect(summary.sessionsFromThisDevice).toBe(0);
  });

  it("keeps this device's onboarding when the cloud copy lacks it", () => {
    const local = emptyGym({ settings: onboarded });
    const remote = emptyGym();
    expect(mergeCloudGym(local, remote).merged.settings.onboardingCompletedAt).toBe(onboarded.onboardingCompletedAt);
  });
});

describe("applyRemoteVault", () => {
  it("takes the safety backup before changing anything, and applies the merge", async () => {
    const local = emptyGym(withSessions(session("a", "2026-09-01")));
    const remote = emptyGym(withSessions(session("r", "2026-08-01")));
    const calls: string[] = [];
    const takeBackup = vi.fn(async () => {
      calls.push("backup");
    });
    const apply = vi.fn((gym: CloudGym) => {
      calls.push(`apply:${gym.workouts.length}`);
    });
    const push = vi.fn(async () => {
      calls.push("push");
    });
    const result = await applyRemoteVault({ local, remote, takeBackup, apply, push });
    expect(calls).toEqual(["backup", "apply:2", "push"]);
    expect(result.plan).toBe("merge");
  });

  it("does not apply anything if the backup fails", async () => {
    const local = emptyGym(withSessions(session("a", "2026-09-01")));
    const remote = emptyGym(withSessions(session("r", "2026-08-01")));
    const apply = vi.fn();
    await expect(
      applyRemoteVault({
        local,
        remote,
        takeBackup: async () => {
          throw new Error("quota");
        },
        apply,
        push: vi.fn(),
      }),
    ).rejects.toThrow("quota");
    expect(apply).not.toHaveBeenCalled();
  });

  it("pushes local without touching it when the cloud vault is empty", async () => {
    const local = emptyGym(withSessions(session("a", "2026-09-01")));
    const remote = emptyGym({ settings: onboarded });
    const apply = vi.fn();
    const push = vi.fn(async () => undefined);
    const takeBackup = vi.fn(async () => undefined);
    await applyRemoteVault({ local, remote, takeBackup, apply, push });
    expect(apply).not.toHaveBeenCalled();
    expect(takeBackup).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(local);
  });
});

describe("normalizeCloudGym", () => {
  it("fills collections an older vault never had", () => {
    const old = { ...withSessions(session("a", "2026-01-01")), settings: onboarded } as unknown as CloudGym;
    const gym = normalizeCloudGym(old);
    expect(gym.programs).toEqual([]);
    expect(gym.clips).toEqual([]);
    expect(gym.labLast).toBeNull();
    expect(gym.workouts).toHaveLength(1);
  });
});
