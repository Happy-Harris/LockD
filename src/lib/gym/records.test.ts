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

describe("personal records — current behaviour, including the first-exposure defect", () => {
  it("BUG: the first session on file reports a PR for every lift in it", () => {
    const { slices } = sample();
    const first = slices[0]!;
    const hits = detectPrsForWorkout(first.workout.id, slices, "epley");
    expect(hits).toHaveLength(4); // BUG (I-12): nothing earlier exists to beat, yet each lift is flagged.
    expect(hits.map((row) => row.exerciseName)).toMatchSnapshot();
  });

  it("pins the Chronicle's PR runs, which count those first stamps", () => {
    const { log, slices } = sample();
    const chronicle = buildChronicle(slices, "epley", goals, log.eraNames);
    const runs = chronicle.events.filter((row) => row.kind === "pr_run");
    expect(runs.map((row) => ({ id: row.id, count: row.magnitude }))).toMatchSnapshot();
  });
});
