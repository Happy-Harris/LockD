import { beforeEach, describe, expect, it } from "vitest";
import { PROGRAM_PACKS } from "./programs";
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

describe("finishing the last session of the last week (current behaviour)", () => {
  it("parks on the last week, with no sign that the block is finished", () => {
    const start = runBlock(0);
    const done = runBlock(start.sessions * start.weeks);
    expect(done.program()).toMatchObject({ currentWeek: done.weeks, currentSessionOrder: 0 });
    expect("completedAt" in done.program()).toBe(false);
  });

  it("keeps offering the last week's first session after the block is over", () => {
    const start = runBlock(0);
    const done = runBlock(start.sessions * start.weeks + 1);
    expect(done.program()).toMatchObject({ currentWeek: done.weeks });
  });
});
