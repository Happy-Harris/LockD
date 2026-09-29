import { beforeEach, describe, expect, it } from "vitest";
import { parseBackup } from "@/lib/backup/schema";
import { applyProgramLoad, PROGRAM_PACKS } from "./programs";
import { useGym } from "./store";

/**
 * Plan I-41: a program never said it was finished. After the last session of the last week the pointer sat on the last
 * week for ever, and the next session offered was that week's first one again.
 */
beforeEach(() => useGym.getState().resetAll());

function runBlock(finishes: number) {
  const id = useGym.getState().installProgramPack(PROGRAM_PACKS[0]!.id)!;
  const sessions = useGym.getState().programSessions.filter((row) => row.programId === id).length;
  const weeks = useGym.getState().programs.find((row) => row.id === id)!.weekCount;
  for (let i = 0; i < finishes; i += 1) {
    const workoutId = useGym.getState().startFromProgramSession(id);
    useGym.getState().finishWorkout(workoutId);
  }
  return {
    id,
    sessions,
    weeks,
    program: () => useGym.getState().programs.find((row) => row.id === id)!,
  };
}

describe("a finished program says so (plan I-41)", () => {
  it("is not complete before the last session, and complete after it", () => {
    const start = runBlock(0);
    const total = start.sessions * start.weeks;
    const almost = runBlock(total - 1);
    expect(almost.program().completedAt).toBeUndefined();
    useGym.getState().resetAll();
    const done = runBlock(total);
    expect(done.program().completedAt).toBeDefined();
    expect(done.program()).toMatchObject({ currentWeek: done.weeks, currentSessionOrder: 0 });
  });

  it("does not restamp when a session is run again after the block is over", () => {
    const start = runBlock(0);
    const done = runBlock(start.sessions * start.weeks);
    const first = done.program().completedAt;
    const workoutId = useGym.getState().startFromProgramSession(done.id);
    useGym.getState().finishWorkout(workoutId);
    expect(done.program().completedAt).toBe(first);
  });

  it("restarting goes back to week 1, session 1, clears the mark and keeps the history", () => {
    const start = runBlock(0);
    const done = runBlock(start.sessions * start.weeks);
    const workouts = useGym.getState().workouts.length;
    useGym.getState().restartProgram(done.id);
    expect(done.program()).toMatchObject({ currentWeek: 1, currentSessionOrder: 0 });
    expect("completedAt" in done.program()).toBe(false);
    expect(useGym.getState().workouts).toHaveLength(workouts);
  });

  it("a completed program survives a backup round trip, and one without the field still loads", () => {
    const start = runBlock(0);
    const done = runBlock(start.sessions * start.weeks);
    const backup = JSON.parse(JSON.stringify(useGym.getState().exportBackup()));
    expect(parseBackup(backup).ok).toBe(true);
    const stamp = done.program().completedAt;
    useGym.getState().resetAll();
    useGym.getState().importBackup(backup, "replace");
    expect(done.program().completedAt).toBe(stamp);
    const old = JSON.parse(JSON.stringify(backup));
    for (const row of old.programs) delete row.completedAt;
    expect(parseBackup(old).ok).toBe(true);
  });
});

describe("the hold rule holds (plan I-41)", () => {
  const call = (over: object) =>
    ({
      suggestedWeightG: 102_500,
      lastWeightG: 100_000,
      missStreak: 0,
      action: "add_load",
      ...over,
    }) as never;
  const load = (kind: "hold" | "double_progression", suggestion: never, isDeload = false) =>
    applyProgramLoad({
      rule: { kind, incrementG: 2500 },
      weekNumber: 2,
      isDeload,
      suggestion,
      baseSets: 3,
    }).weightG;

  it("keeps the last load where a double progression rule would add", () => {
    expect(load("double_progression", call({}))).toBe(102_500);
    expect(load("hold", call({}))).toBe(100_000);
  });

  it("still takes the engine's lighter call after a miss, and still deloads on a deload week", () => {
    expect(load("hold", call({ suggestedWeightG: 95_000, missStreak: 2, action: "deload" }))).toBe(
      95_000,
    );
    expect(load("hold", call({}), true)!).toBeLessThan(100_000);
  });
});
