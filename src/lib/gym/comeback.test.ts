import { describe, expect, it } from "vitest";
import type { SessionSlice } from "./analytics";
import {
  comebackPercent,
  currentComeback,
  DEFAULT_COMEBACK_RULE,
  recordChancesDuringComeback,
  reEntryLoadG,
  type ComebackState,
} from "./comeback";
import { applyProgramLoad } from "./programs";
import { progressExercise } from "./progression";

/**
 * Opp 8 (plan addendum A-7, owner defaults DA-3): after a layoff each lift restarts from its last
 * working load before the break, 90 / 80 / 70 % by the break's length, rounded down to a buildable
 * load. A stated rule, not a prediction.
 */
const session = (date: string, kg: number, reps = 5, lift = "bench"): SessionSlice =>
  ({
    workout: { id: `w-${date}-${lift}`, name: "Session", status: "completed", localDate: date, startedAt: `${date}T10:00:00Z` },
    exercises: [{ id: `e-${date}-${lift}`, exerciseId: lift, exerciseNameSnapshot: lift }],
    sets: [
      { id: `s-${date}-${lift}`, workoutExerciseId: `e-${date}-${lift}`, setType: "working", weightG: kg * 1000, reps, isCompleted: true, order: 0 },
    ],
  }) as unknown as SessionSlice;

describe("the rule", () => {
  it("takes 90, 80 or 70 % by how long the break was, and nothing under a layoff", () => {
    expect(comebackPercent(13)).toBeUndefined();
    expect([14, 27, 28, 55, 56, 400].map((days) => comebackPercent(days))).toEqual([90, 90, 80, 80, 70, 70]);
  });

  it("follows the lifter's own percentages", () => {
    const rule = { shortPct: 95, midPct: 85, longPct: 60 };
    expect([20, 40, 90].map((days) => comebackPercent(days, rule))).toEqual([95, 85, 60]);
  });

  it("rounds down to a load that can be built, and never above the last load", () => {
    expect(reEntryLoadG(100_000, 80, 2500)).toBe(80_000);
    // 102.5 kg × 90 % = 92.25 kg, rounded down to 90 kg on a 2.5 kg grid (never up to 92.5).
    expect(reEntryLoadG(102_500, 90, 2500)).toBe(90_000);
    // With plates: whatever the snap can build at or below the target.
    expect(reEntryLoadG(100_000, 70, 2500, (grams, mode) => (mode === "down" ? Math.floor(grams / 5000) * 5000 : grams))).toBe(70_000);
    expect(reEntryLoadG(100_000, 100, 2500)).toBe(100_000);
  });
});

describe("the next target after a layoff", () => {
  const log = [session("2026-01-05", 95), session("2026-01-08", 97.5), session("2026-01-12", 100, 5)];
  const call = (today?: string, extra: Partial<Parameters<typeof progressExercise>[0]> = {}) =>
    progressExercise({
      exerciseId: "bench",
      exerciseName: "Bench",
      trackingType: "weight_reps",
      incrementG: 2500,
      slices: log,
      formula: "epley",
      excludeWarmups: true,
      today,
      ...extra,
    });

  it("restarts from the last working load, cut by the rule, reps at the bottom of the range", () => {
    const back = call("2026-02-20", { targetRepMin: 6, targetRepMax: 8 });
    expect(back.action).toBe("re_entry");
    expect(back.suggestedWeightG).toBe(80_000);
    expect(back.suggestedReps).toBe(6);
    expect(back.why).toContain("39 days since your last session of this lift, on 2026-01-12");
    expect(back.why).toContain("not a prediction: 80%");
    expect(back.why).toContain("Change the rule in Settings");
  });

  it("keeps the last session's reps when there is no range", () => {
    expect(call("2026-01-30").suggestedReps).toBe(5);
    expect(call("2026-01-30").suggestedWeightG).toBe(90_000);
  });

  it("uses the lifter's rule when they changed it", () => {
    expect(call("2026-04-30", { comebackRule: { ...DEFAULT_COMEBACK_RULE, longPct: 60 } }).suggestedWeightG).toBe(60_000);
  });

  it("is the ordinary engine inside a layoff's length, and with no date given", () => {
    expect(call("2026-01-25").action).not.toBe("re_entry");
    expect(call(undefined).action).toBe(call("2026-01-13").action);
  });

  it("a program's weekly add and its deload week do not stack on the comeback load", () => {
    const suggestion = call("2026-02-20");
    const load = (kind: "linear" | "hold", isDeload: boolean) =>
      applyProgramLoad({ rule: { kind, incrementG: 2500 }, weekNumber: 3, isDeload, suggestion, baseSets: 3 }).weightG;
    expect(load("linear", false)).toBe(80_000);
    expect(load("hold", false)).toBe(80_000);
    expect(load("linear", true)).toBe(80_000);
  });
});

describe("where the lifter stands", () => {
  it("away: no session for a layoff's length up to today", () => {
    const log = [session("2026-01-05", 100), session("2026-01-12", 100)];
    expect(currentComeback(log, "2026-01-25", "epley")).toBeUndefined();
    expect(currentComeback(log, "2026-01-26", "epley")).toEqual({ phase: "away", daysAway: 14, lastDate: "2026-01-12" });
  });

  it("back: counts the records set since the return, never a lift's first time on file", () => {
    const log = [
      session("2025-12-01", 100),
      session("2026-01-12", 102.5),
      // 40 days away.
      session("2026-02-21", 85),
      session("2026-02-24", 90, 5, "squat"),
      session("2026-03-02", 105),
    ];
    const state = currentComeback(log, "2026-03-05", "epley");
    expect(state).toMatchObject({ phase: "back", daysAway: 40, lastDate: "2026-01-12", returnDate: "2026-02-21", sessionsSince: 3 });
    expect(state?.phase === "back" && state.prs.map((row) => [row.exerciseName, row.date])).toEqual([["bench", "2026-03-02"]]);
  });

  it("stops showing once the return is a settled stretch, and never without a layoff", () => {
    // Back on 20 January after a layoff, then every five days to 26 March.
    const steady = Array.from({ length: 14 }, (_, i) =>
      session(new Date(Date.UTC(2026, 0, 20 + i * 5)).toISOString().slice(0, 10), 90),
    );
    const log = [session("2025-12-01", 100), ...steady];
    expect(currentComeback(log, "2026-03-16", "epley")?.phase).toBe("back");
    expect(currentComeback(log, "2026-03-27", "epley")).toBeUndefined();
    expect(currentComeback([session("2026-04-01", 100), session("2026-04-08", 100)], "2026-04-10", "epley")).toBeUndefined();
    expect(currentComeback([], "2026-04-10", "epley")).toBeUndefined();
  });
});

describe("record chances during a comeback", () => {
  const rows = [
    { exerciseId: "bench", how: "+1 rep opens a new 6RM" },
    { exerciseId: "squat", how: "+2.5 kg is a new 5RM" },
  ];
  const calls = [
    { exerciseId: "bench", action: "re_entry" },
    { exerciseId: "squat", action: "progress_load" },
  ];
  const back: ComebackState = { phase: "back", daysAway: 40, lastDate: "2026-01-12", returnDate: "2026-02-21", sessionsSince: 2, prs: [] };

  it("offers none while away: every lift restarts, so no attempt at the pre-layoff load", () => {
    expect(recordChancesDuringComeback(rows, { phase: "away", daysAway: 45, lastDate: "2026-01-12" }, calls)).toEqual([]);
  });

  it("once back, drops only the lifts still restarting", () => {
    expect(recordChancesDuringComeback(rows, back, calls).map((row) => row.exerciseId)).toEqual(["squat"]);
  });

  it("leaves them alone with no comeback", () => {
    expect(recordChancesDuringComeback(rows, undefined, calls)).toEqual(rows);
  });
});
