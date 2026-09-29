import { beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyVerdict, weeklyVerdictCopy } from "@/domain/analytics/weeklyVerdict";
import { computeRecords, sliceSessions } from "./analytics";
import { loggedEntriesOf } from "./entries";
import { buildDemoLog } from "./demo";
import { buildIntelligence } from "./intelligence";
import { buildMoments } from "./moments";
import { milestoneQueue, nearMisses, rmTable } from "./queue";
import { lastTrainedLabel, muscleLastTrained } from "./recovery";
import { seedExerciseId, seedExercises } from "./seed";
import { buildYearReceipt } from "./wrapped";
import { buildChronicle } from "./chronicle";
import { progressExercise } from "./progression";

const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/domain/ids", () => ({ uuid: () => `fixture-${++ids.next}` }));
beforeEach(() => {
  ids.next = 0;
});

const reference = new Date(2026, 8, 28, 12);
const library = seedExercises("2026-09-28T12:00:00.000Z");
const bench = library.find((row) => row.id === seedExerciseId("Bench Press"))!;
const goals = [bench.id, seedExerciseId("Back Squat")];
function sample() {
  const log = buildDemoLog(library, reference);
  const slices = sliceSessions(log.workouts, log.workoutExercises, log.workoutSets);
  return { log, slices };
}

describe("secondary engine characterisation — current outcomes, including known defects", () => {
  it("pins when each muscle was last trained on the dated demo, and that no data says so", () => {
    const empty = muscleLastTrained([], reference);
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((row) => row.daysAgo === null && row.lastDate === undefined)).toBe(true);
    expect(lastTrainedLabel(empty[0]!.daysAgo)).toBe("No sets logged");
    expect(muscleLastTrained(sample().slices.slice(-1), reference)).toMatchSnapshot();
  });

  it("pins RM table, milestone queue and near misses from the same dated log", () => {
    const { slices } = sample();
    const opts = {
      slices,
      formula: "epley" as const,
      excludeWarmups: true,
      incrementG: 2500,
      unit: "kg" as const,
    };
    expect({
      benchRm: rmTable(bench.id, slices, true),
      queue: milestoneQueue({ ...opts, exercises: library, goalIds: goals }),
      misses: nearMisses({ ...opts, slice: slices.at(-1)! }),
    }).toMatchSnapshot();
  });

  it("pins intelligence and the weekly verdict from the dated demo", () => {
    const { log, slices } = sample();
    const calls = goals.map((id) => {
      const exercise = library.find((row) => row.id === id)!;
      return progressExercise({
        exerciseId: id,
        exerciseName: exercise.name,
        trackingType: exercise.trackingType,
        incrementG: 2500,
        targetRepMin: 6,
        targetRepMax: 10,
        targetSets: 3,
        slices,
        formula: "epley",
        excludeWarmups: true,
      });
    });
    expect(
      buildIntelligence({
        slices,
        formula: "epley",
        goalIds: goals,
        measurements: log.measurements,
        calls,
        weekStartDay: "monday",
      }),
    ).toMatchSnapshot("intelligence");
    const options = { formula: "epley" as const, includeWarmups: false, secondaryCredit: 0.5 };
    const verdict = weeklyVerdict(loggedEntriesOf(slices), options, "monday", reference);
    // The figures and the words, not the log rows the verdict was built from.
    expect({
      state: verdict.state,
      subject: verdict.subject,
      baseline: {
        metrics: verdict.baseline.metrics,
        weeks: verdict.baseline.weeks.map((week) => ({
          start: week.startDate,
          end: week.endDate,
          sessions: week.sessionCount,
        })),
      },
      direction: verdict.direction,
      standout: verdict.standout,
      watchout: verdict.watchout,
      pulse: verdict.pulse,
      goalLifts: verdict.goalLifts.map((lift) => lift.name),
      words: weeklyVerdictCopy(verdict, "kg", null, "build").lines.map((line) => line.plain),
    }).toMatchSnapshot("weekly verdict");
    const empty = weeklyVerdict([], options, "monday", reference);
    expect({
      state: empty.state,
      direction: empty.direction,
      words: weeklyVerdictCopy(empty, "kg", null, "build").lines.map((line) => line.plain),
    }).toMatchSnapshot("no history");
  });

  it("pins earned moments and year receipt without assuming a future date", () => {
    const { log, slices } = sample();
    const era = buildChronicle(slices, "epley", goals, log.eraNames).eras;
    const records = computeRecords(slices, "epley", true);
    const moments = buildMoments(slices, records, era, log.measurements);
    expect(moments).toMatchSnapshot("moments");
    expect(buildYearReceipt(2026, slices, era, log.measurements, "epley")).toMatchSnapshot(
      "2026 receipt",
    );
    expect(buildYearReceipt(2030, slices, era, log.measurements, "epley")).toMatchSnapshot(
      "empty year",
    );
  });
});
