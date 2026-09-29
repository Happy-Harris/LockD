import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildChronicle } from "./chronicle";
import { detectPrsForWorkout, sliceSessions } from "./analytics";
import { buildDemoLog } from "./demo";
import { seedExerciseId, seedExercises } from "./seed";

const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/domain/ids", () => ({ uuid: () => `fixture-${++ids.next}` }));
beforeEach(() => {
  ids.next = 0;
});

const reference = new Date(2026, 8, 28, 12);
const library = seedExercises("2026-09-28T12:00:00.000Z");
const goals = [seedExerciseId("Bench Press"), seedExerciseId("Back Squat")];

function sample() {
  const log = buildDemoLog(library, reference);
  const slices = sliceSessions(log.workouts, log.workoutExercises, log.workoutSets);
  return { log, slices };
}

describe("personal records — first exposure", () => {
  it("the first session on file for a lift is the baseline, not a PR", () => {
    const { slices } = sample();
    const first = slices[0]!;
    const hits = detectPrsForWorkout(first.workout.id, slices, "epley");
    expect(hits).toEqual([]);
  });

  it("only lifts with an earlier session can be flagged", () => {
    const { slices } = sample();
    const seen = new Set<string>();
    for (const slice of slices) {
      const hits = detectPrsForWorkout(slice.workout.id, slices, "epley");
      for (const hit of hits) expect(seen.has(hit.exerciseId)).toBe(true);
      for (const exercise of slice.exercises) seen.add(exercise.exerciseId);
    }
  });

  it("the Chronicle's PR runs are built from the same rule", () => {
    const { log, slices } = sample();
    const chronicle = buildChronicle(slices, "epley", goals, log.eraNames);
    const runs = chronicle.events.filter((row) => row.kind === "pr_run");
    expect(runs.map((row) => ({ id: row.id, count: row.magnitude }))).toMatchSnapshot();
  });
});
