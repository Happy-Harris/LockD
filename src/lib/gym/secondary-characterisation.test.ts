import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyE1rm, findStandard, scaleStandard } from "@/domain/standards";
import { buildWeeklyVerdict, computeRecords, sliceSessions } from "./analytics";
import { buildDemoLog } from "./demo";
import { buildIntelligence } from "./intelligence";
import { classifyVolume, landmarkLabel } from "./landmarks";
import { buildMoments } from "./moments";
import { milestoneQueue, nearMisses, rmTable } from "./queue";
import { classifyHours, freshnessLabel, muscleRecovery } from "./recovery";
import { seedExerciseId, seedExercises } from "./seed";
import { buildYearReceipt } from "./wrapped";
import { buildChronicle } from "./chronicle";
import { progressExercise } from "./progression";

const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/domain/ids", () => ({ uuid: () => `fixture-${++ids.next}` }));
beforeEach(() => { ids.next = 0; });

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
  it("pins the no-data recovery state and day-granularity thresholds", () => {
    const empty = muscleRecovery([], reference);
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((row) => row.hours === null && row.state === "fresh")).toBe(true);
    expect(freshnessLabel(empty[0]!.state)).toBe("Fresh"); // BUG: no work reads as fresh.
    const trained = muscleRecovery(sample().slices.slice(-1), reference);
    expect(trained).toMatchSnapshot();
    expect([null, 0, 23, 24, 47, 48, 71, 72].map(classifyHours))
      .toEqual(["fresh", "loaded", "loaded", "recovering", "recovering", "ready", "ready", "fresh"]);
  });

  it("pins unsourced volume bands and missing-landmark fallback", () => {
    expect([0, 7, 8, 15, 16, 21, 22, 23].map((n) => classifyVolume("chest", n)))
      .toEqual(["below", "below", "mev", "mev", "mav", "mav", "mrv", "over"]);
    expect(classifyVolume("forearms", 0)).toBe("mev"); // BUG: no landmark still says MEV.
    expect(landmarkLabel(classifyVolume("forearms", 0))).toBe("MEV");
  });

  it("pins current bodyweight-scaled strength bands, including missing bodyweight", () => {
    const standard = findStandard(bench.id)!;
    expect({ unscaled: scaleStandard(standard), scaledAt100kg: scaleStandard(standard, 100_000),
      absent: classifyE1rm(100_000, standard), at100kg: classifyE1rm(100_000, standard, 100_000) })
      .toMatchSnapshot();
  });

  it("pins RM table, milestone queue and near misses from the same dated log", () => {
    const { slices } = sample();
    const opts = { slices, formula: "epley" as const, excludeWarmups: true, incrementG: 2500, unit: "kg" as const };
    expect({
      benchRm: rmTable(bench.id, slices, true),
      queue: milestoneQueue({ ...opts, exercises: library, goalIds: goals }),
      misses: nearMisses({ ...opts, slice: slices.at(-1)! }),
    }).toMatchSnapshot();
  });

  it("pins intelligence and the app's current weekly verdict from the dated demo", () => {
    const { log, slices } = sample();
    const calls = goals.map((id) => {
      const exercise = library.find((row) => row.id === id)!;
      return progressExercise({ exerciseId: id, exerciseName: exercise.name,
        trackingType: exercise.trackingType, incrementG: 2500, targetRepMin: 6,
        targetRepMax: 10, targetSets: 3, slices, formula: "epley", excludeWarmups: true });
    });
    expect(buildIntelligence({ slices, formula: "epley", goalIds: goals, measurements: log.measurements,
      calls, weekStartDay: "monday" })).toMatchSnapshot("intelligence");
    expect(buildWeeklyVerdict(slices, "monday", reference)).toMatchSnapshot("weekly verdict");
    expect(buildWeeklyVerdict([], "monday", reference)).toMatchSnapshot("no history");
  });

  it("pins earned moments and year receipt without assuming a future date", () => {
    const { log, slices } = sample();
    const era = buildChronicle(slices, "epley", goals, log.eraNames).eras;
    const records = computeRecords(slices, "epley", true);
    const moments = buildMoments(slices, records, era, log.measurements);
    expect(moments).toMatchSnapshot("moments");
    expect(buildYearReceipt(2026, slices, era, log.measurements, "epley")).toMatchSnapshot("2026 receipt");
    expect(buildYearReceipt(2030, slices, era, log.measurements, "epley")).toMatchSnapshot("empty year");
  });
});
