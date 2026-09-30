import { describe, expect, it } from "vitest";
import { localDateToOrdinal } from "@/domain/time";
import type { SessionSlice } from "./analytics";
import { buildChronicle, eraForDate } from "./chronicle";

/**
 * Plan I-18 / O2: era boundaries and tones are read against the lifter's own training, not against 42 / 38 / 28 sets a
 * week. Synthetic logs, one session a week or more, so each rule is visible on its own.
 */
function iso(ordinal: number): string {
  return new Date(ordinal * 86_400_000).toISOString().slice(0, 10);
}

/** A log of `plan` stretches (two sessions a week), with `gapWeeks` of nothing before a stretch and a load that climbs `climbG` grams a week. */
function log(
  plan: Array<{ weeks: number; sets: number; gapWeeks?: number; climbG?: number }>,
  load = 100_000,
): SessionSlice[] {
  const slices: SessionSlice[] = [];
  let ord = localDateToOrdinal("2025-01-06");
  let n = 0;
  for (const stretch of plan) {
    ord += (stretch.gapWeeks ?? 0) * 7;
    for (let week = 0; week < stretch.weeks; week += 1) {
      for (let session = 0; session < 2; session += 1) {
        const date = iso(ord + week * 7 + session * 3);
        const id = `w${n}`;
        const setCount = Math.round(stretch.sets / 2);
        slices.push({
          workout: {
            id,
            name: "Session",
            status: "completed",
            localDate: date,
            startedAt: `${date}T12:00:00.000Z`,
            endedAt: `${date}T13:00:00.000Z`,
            createdAt: `${date}T12:00:00.000Z`,
            updatedAt: `${date}T13:00:00.000Z`,
            tzOffsetMinutes: 0,
            pausedSeconds: 0,
          },
          exercises: [
            {
              id: `e${n}`,
              workoutId: id,
              exerciseId: "bench",
              order: 0,
              restSeconds: 120,
              exerciseNameSnapshot: "Bench",
            },
          ],
          sets: Array.from({ length: setCount }, (_, order) => ({
            id: `s${n}-${order}`,
            workoutId: id,
            workoutExerciseId: `e${n}`,
            order,
            setType: "working",
            weightG: load + Math.round((stretch.climbG ?? 0) * week),
            reps: 5,
            isCompleted: true,
          })),
        } as unknown as SessionSlice);
        n += 1;
      }
    }
    ord += stretch.weeks * 7;
  }
  return slices;
}

const goals = ["bench"];
const eras = (slices: SessionSlice[], names: Array<{ startDate: string; name: string }> = []) =>
  buildChronicle(slices, "epley", goals, names).eras;

describe("era detection reads the lifter's own training", () => {
  it("a steady 20-set lifter is not 'The Grind' for ever: no volume regime, one ordinary era", () => {
    const result = eras(log([{ weeks: 40, sets: 20 }]));
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Foundation");
  });

  it("splits where weekly volume doubles, and calls the second stretch Volume", () => {
    const slices = log([
      { weeks: 20, sets: 20 },
      { weeks: 20, sets: 40 },
    ]);
    const result = eras(slices);
    expect(result).toHaveLength(2);
    expect(result[1]!.tone).toBe("volume");
    expect(result[1]!.name.startsWith("Volume")).toBe(true);
    expect(result.reduce((sum, era) => sum + era.sessions, 0)).toBe(slices.length);
  });

  it("the same doubling reads the same at 10 and 20 sets a week as at 20 and 40", () => {
    const small = eras(
      log([
        { weeks: 20, sets: 10 },
        { weeks: 20, sets: 20 },
      ]),
    );
    expect(small).toHaveLength(2);
    expect(small[1]!.tone).toBe("volume");
  });

  it("splits where volume halves, and reads the lighter stretch as a rebuild", () => {
    const result = eras(
      log([
        { weeks: 20, sets: 40 },
        { weeks: 20, sets: 20 },
      ]),
    );
    expect(result).toHaveLength(2);
    expect(result[1]!.tone).toBe("rebuild");
  });

  it("does not split on a small change, or on a stretch too short to judge", () => {
    expect(
      eras(
        log([
          { weeks: 20, sets: 20 },
          { weeks: 20, sets: 23 },
        ]),
      ),
    ).toHaveLength(1);
    expect(
      eras(
        log([
          { weeks: 8, sets: 20 },
          { weeks: 3, sets: 60 },
        ]),
      ),
    ).toHaveLength(1);
  });

  it("finds several regimes in a long history", () => {
    const result = eras(
      log([
        { weeks: 16, sets: 20 },
        { weeks: 16, sets: 40 },
        { weeks: 16, sets: 20 },
      ]),
    );
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("a layoff still starts a new era, called The Return", () => {
    const result = eras(
      log([
        { weeks: 12, sets: 20 },
        { weeks: 12, sets: 20, gapWeeks: 6 },
      ]),
    );
    expect(result).toHaveLength(2);
    expect(result[1]!.name).toBe("The Return");
  });

  it("gives two eras that would share a name different names", () => {
    const result = eras(
      log([
        { weeks: 16, sets: 20 },
        { weeks: 16, sets: 20, gapWeeks: 4 },
        { weeks: 16, sets: 20, gapWeeks: 4 },
      ]),
    );
    const names = result.map((era) => era.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("names still label an era, and never move a boundary", () => {
    const slices = log([
      { weeks: 20, sets: 20 },
      { weeks: 20, sets: 40 },
    ]);
    const detected = eras(slices);
    const renamed = eras(slices, [{ startDate: detected[1]!.startDate, name: "My bulk" }]);
    expect(renamed.map((era) => era.startDate)).toEqual(detected.map((era) => era.startDate));
    expect(renamed[1]!.name).toBe("My bulk");
    expect(renamed[0]!.name).toBe(detected[0]!.name);
    for (const slice of slices) expect(eraForDate(renamed, slice.workout.localDate)).toBeDefined();
  });

  it("splits on a change in PR rate even when volume is flat (a run of stamps after a flat stretch)", () => {
    const flat = eras(
      log([
        { weeks: 16, sets: 20 },
        { weeks: 16, sets: 20, climbG: 2500 },
      ]),
    );
    expect(flat.length).toBe(2);
    const steady = eras(log([{ weeks: 32, sets: 20 }]));
    expect(steady).toHaveLength(1);
  });
});

describe("a single session between two layoffs (owner, 2026-09-30)", () => {
  // Ten weeks, a four-week layoff, one week back, another four-week layoff, ten more weeks.
  const plan = [
    { weeks: 10, sets: 20 },
    { weeks: 1, sets: 20, gapWeeks: 4 },
    { weeks: 10, sets: 20, gapWeeks: 4 },
  ];
  const withOneSessionBack = () => log(plan).filter((_, i) => i !== 21);

  it("stays its own stretch, named a Brief Return, with every session still counted", () => {
    const slices = withOneSessionBack();
    const result = eras(slices);
    expect(result.map((era) => [era.name, era.tone, era.sessions])).toEqual([
      ["Foundation", "foundation", 20],
      ["Brief Return", "brief", 1],
      ["The Return", "comeback", 20],
    ]);
    expect(result.reduce((sum, era) => sum + era.sessions, 0)).toBe(slices.length);
    // Both layoffs are still on the record.
    expect(buildChronicle(slices, "epley", goals).events.filter((e) => e.kind === "layoff")).toHaveLength(2);
  });

  it("two sessions back is an ordinary era", () => {
    expect(eras(log(plan)).map((era) => era.name)).toEqual([
      "Foundation",
      "The Return",
      "The Return · 2",
    ]);
  });

  it("one session after the last layoff is a comeback in progress, not a brief return", () => {
    const slices = log(plan.slice(0, 2)).filter((_, i) => i !== 21);
    expect(eras(slices).at(-1)).toMatchObject({ name: "The Return", tone: "comeback", sessions: 1 });
  });

  it("a name the lifter gave it still wins", () => {
    const slices = withOneSessionBack();
    const start = slices[20]!.workout.localDate;
    expect(eras(slices, [{ startDate: start, name: "Wedding week" }])[1]).toMatchObject({
      name: "Wedding week",
      autoName: "Brief Return",
    });
  });
});
