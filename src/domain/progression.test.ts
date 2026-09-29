import { describe, expect, it } from "vitest";
import {
  computeStallComparison,
  STALL_MIN_SESSIONS,
  STALL_WINDOW_DAYS,
  suggestProgression,
  type ExerciseSession,
} from "./progression";
import { roundGramsToIncrement } from "./units";
import type { WorkoutSet } from "./types";

const kg = (value: number) => Math.round(value * 1000);

const set = (partial: Partial<WorkoutSet>): WorkoutSet => ({
  id: partial.id ?? "set",
  workoutId: "w",
  workoutExerciseId: "we",
  order: partial.order ?? 0,
  setType: "working",
  isCompleted: true,
  ...partial,
});

/** One session's working sets, all at the same weight unless overridden per-set. */
function session(localDate: string, sets: WorkoutSet[]): ExerciseSession {
  return { localDate, sets };
}

/** N straight sets of `reps` at `weightKg`, ordered 0..N-1. */
function straightSets(weightKg: number, reps: number, count = 3): WorkoutSet[] {
  return Array.from({ length: count }, (_, index) =>
    set({ id: `s${index}`, order: index, weightG: kg(weightKg), reps }),
  );
}

describe("suggestProgression: rep range filled", () => {
  it("adds load and resets to the bottom of the range when every set hits the top", () => {
    const sessions: ExerciseSession[] = [session("2026-09-15", straightSets(100, 12))];
    const result = suggestProgression(sessions, "epley", kg(2.5), {
      repRange: { repMin: 8, repMax: 12 },
    });

    expect(result).not.toBeNull();
    expect(result!.target).toEqual({
      targetWeightG: roundGramsToIncrement(kg(100) + kg(2.5), kg(2.5)),
      targetReps: 8,
      reason: "increase_load",
    });
  });

  it("steps an off-grid load to the next grid point up rather than overshooting", () => {
    // 101.3 kg is off the 2.5 kg grid. Rounding (101.3 + 2.5) to nearest would land on
    // 105 kg — a 3.7 kg jump the lifter never asked for, and a target they are likely to
    // miss. The next grid point up is 102.5. Undershooting self-corrects next session;
    // overshooting fails the session.
    const sessions: ExerciseSession[] = [session("2026-09-15", straightSets(101.3, 10, 1))];
    const result = suggestProgression(sessions, "epley", kg(2.5), {
      repRange: { repMin: 6, repMax: 10 },
    });

    expect(result!.target.targetWeightG).toBe(kg(102.5));
    expect(result!.target.targetWeightG).toBeGreaterThan(kg(101.3));
    // Always a clean multiple of the increment, not a fractional carry-over.
    expect(result!.target.targetWeightG % kg(2.5)).toBe(0);
  });
});

describe("suggestProgression: rep range not filled", () => {
  it("holds the weight and asks for more reps, at least +1 over last session", () => {
    const sessions: ExerciseSession[] = [session("2026-09-15", straightSets(100, 9))];
    const result = suggestProgression(sessions, "epley", kg(2.5), {
      repRange: { repMin: 8, repMax: 12 },
    });

    expect(result!.target).toEqual({
      targetWeightG: kg(100),
      targetReps: 12,
      reason: "increase_reps",
    });
  });

  it("targets at least +1 over last session even if that exceeds repMax", () => {
    const sets = [
      set({ id: "a", order: 0, weightG: kg(100), reps: 13 }),
      set({ id: "b", order: 1, weightG: kg(100), reps: 8 }),
    ];
    const sessions: ExerciseSession[] = [session("2026-09-15", sets)];
    const result = suggestProgression(sessions, "epley", kg(2.5), {
      repRange: { repMin: 8, repMax: 12 },
    });

    expect(result!.target.reason).toBe("increase_reps");
    expect(result!.target.targetReps).toBe(14);
  });
});

describe("suggestProgression: no rep range", () => {
  it("holds the weight and asks to beat last session’s rep count", () => {
    const sessions: ExerciseSession[] = [session("2026-09-15", straightSets(100, 8))];
    const result = suggestProgression(sessions, "epley", kg(2.5));

    expect(result!.target).toEqual({
      targetWeightG: kg(100),
      targetReps: 9,
      reason: "beat_last_session",
    });
  });

  it("uses the best set at the last working weight when sets differ", () => {
    const sets = [
      set({ id: "a", order: 0, weightG: kg(100), reps: 6 }),
      set({ id: "b", order: 1, weightG: kg(100), reps: 8 }),
    ];
    const sessions: ExerciseSession[] = [session("2026-09-15", sets)];
    const result = suggestProgression(sessions, "epley", kg(2.5));

    expect(result!.target.targetReps).toBe(9);
  });
});

describe("suggestProgression: null cases", () => {
  it("returns null with no session history", () => {
    expect(suggestProgression([], "epley", kg(2.5))).toBeNull();
  });

  it("returns null when the last session has no completed sets", () => {
    const sessions: ExerciseSession[] = [
      session("2026-09-15", [set({ weightG: kg(100), reps: 8, isCompleted: false })]),
    ];
    expect(suggestProgression(sessions, "epley", kg(2.5))).toBeNull();
  });

  it("returns null when the last session is warm-ups only", () => {
    const sessions: ExerciseSession[] = [
      session("2026-09-15", [set({ setType: "warmup", weightG: kg(100), reps: 8 })]),
    ];
    expect(suggestProgression(sessions, "epley", kg(2.5))).toBeNull();
  });

  it("returns null for bodyweight-only work (no load)", () => {
    const sessions: ExerciseSession[] = [session("2026-09-15", [set({ reps: 12 })])];
    expect(suggestProgression(sessions, "epley", kg(2.5))).toBeNull();
  });

  it("returns null for duration-only work (no reps)", () => {
    const sessions: ExerciseSession[] = [session("2026-09-15", [set({ durationSeconds: 60 })])];
    expect(suggestProgression(sessions, "epley", kg(2.5))).toBeNull();
  });

  it("returns null when the increment is not positive", () => {
    const sessions: ExerciseSession[] = [session("2026-09-15", straightSets(100, 8))];
    expect(suggestProgression(sessions, "epley", 0)).toBeNull();
    expect(suggestProgression(sessions, "epley", -100)).toBeNull();
  });
});

describe("suggestProgression: state and receipt", () => {
  function threeSessions(weights: number[], reps: number): ExerciseSession[] {
    const dates = ["2026-08-24", "2026-09-01", "2026-09-10"];
    return dates
      .map((localDate, index) => session(localDate, straightSets(weights[index]!, reps, 1)))
      .reverse(); // newest-first
  }

  function priorSessions(weights: number[], reps: number): ExerciseSession[] {
    const dates = ["2026-07-20", "2026-07-27", "2026-08-03"];
    return dates
      .map((localDate, index) => session(localDate, straightSets(weights[index]!, reps, 1)))
      .reverse();
  }

  it("is progressing when best e1RM in the window beats the prior equal-count window", () => {
    const window = threeSessions([100, 100, 110], 5);
    const prior = priorSessions([90, 90, 90], 5);
    const sessions = [...window, ...prior];

    const result = suggestProgression(sessions, "epley", kg(2.5), {
      referenceLocalDate: "2026-09-10",
    });

    expect(result!.state).toBe("progressing");
    expect(result!.receipt.toLowerCase()).toContain("improved");
  });

  it("is stalled when best e1RM in the window is flat vs the prior equal-count window", () => {
    const window = threeSessions([100, 100, 100], 5);
    const prior = priorSessions([100, 100, 100], 5);
    const sessions = [...window, ...prior];

    const result = suggestProgression(sessions, "epley", kg(2.5), {
      referenceLocalDate: "2026-09-10",
    });

    expect(result!.state).toBe("stalled");
    expect(result!.receipt.toLowerCase()).toContain("flat or down");
  });

  it("is insufficient_data with fewer than STALL_MIN_SESSIONS in the window", () => {
    const sessions: ExerciseSession[] = [session("2026-09-10", straightSets(100, 8))];
    const result = suggestProgression(sessions, "epley", kg(2.5), {
      referenceLocalDate: "2026-09-10",
    });

    expect(result!.state).toBe("insufficient_data");
  });

  it("is insufficient_data with no comparable prior window", () => {
    const window = threeSessions([100, 100, 100], 5);
    const result = suggestProgression(window, "epley", kg(2.5), {
      referenceLocalDate: "2026-09-10",
    });

    expect(result!.state).toBe("insufficient_data");
  });

  it("carries the progression claim id", () => {
    const sessions: ExerciseSession[] = [session("2026-09-10", straightSets(100, 8))];
    const result = suggestProgression(sessions, "epley", kg(2.5));
    expect(result!.claimId).toBe("progression-double-progression");
  });
});

describe("computeStallComparison", () => {
  it("reports insufficient_data below the session minimum", () => {
    const sessions: ExerciseSession[] = [
      { localDate: "2026-09-01", sets: straightSets(100, 5, 1) },
    ];
    const result = computeStallComparison(sessions, "epley", "2026-08-14", "2026-09-10");
    expect(result.state).toBe("insufficient_data");
    expect(result.sessionsInWindow).toBe(1);
    expect(result.sessionsInWindow).toBeLessThan(STALL_MIN_SESSIONS);
  });

  it("is order-independent for the input session array", () => {
    const sessions: ExerciseSession[] = [
      { localDate: "2026-09-10", sets: straightSets(100, 5, 1) },
      { localDate: "2026-09-01", sets: straightSets(100, 5, 1) },
      { localDate: "2026-08-24", sets: straightSets(100, 5, 1) },
      { localDate: "2026-08-03", sets: straightSets(90, 5, 1) },
      { localDate: "2026-07-27", sets: straightSets(90, 5, 1) },
      { localDate: "2026-07-20", sets: straightSets(90, 5, 1) },
    ];
    const forward = computeStallComparison(sessions, "epley", "2026-08-14", "2026-09-10");
    const shuffled = computeStallComparison(
      [...sessions].reverse(),
      "epley",
      "2026-08-14",
      "2026-09-10",
    );
    expect(forward).toEqual(shuffled);
  });

  it("uses STALL_WINDOW_DAYS-sized windows by default in the receipts above", () => {
    expect(STALL_WINDOW_DAYS).toBe(28);
    expect(STALL_MIN_SESSIONS).toBe(3);
  });
});

describe("which set the target is built from", () => {
  it("progresses the top set, not the last set, on a top-set-then-back-off session", () => {
    // 100 x 5 (the set the lifter cares about), then lighter back-off work. Reading the
    // last set by order would quietly target beating 80 kg and abandon the top set.
    const sessions: ExerciseSession[] = [
      session("2026-09-10", [
        set({ id: "top", order: 0, weightG: kg(100), reps: 5 }),
        set({ id: "back1", order: 1, weightG: kg(80), reps: 8 }),
        set({ id: "back2", order: 2, weightG: kg(80), reps: 8 }),
      ]),
    ];

    const result = suggestProgression(sessions, "epley", kg(2.5), {
      repRange: { repMin: 5, repMax: 5 },
    });

    expect(result).not.toBeNull();
    expect(result!.target.reason).toBe("increase_load");
    expect(result!.target.targetWeightG).toBe(kg(102.5));
  });

  it("targets the top of an ascending ramp, where heaviest and last agree", () => {
    const sessions: ExerciseSession[] = [
      session("2026-09-10", [
        set({ id: "a", order: 0, weightG: kg(60), reps: 8 }),
        set({ id: "b", order: 1, weightG: kg(80), reps: 6 }),
        set({ id: "c", order: 2, weightG: kg(100), reps: 5 }),
      ]),
    ];

    const result = suggestProgression(sessions, "epley", kg(2.5), {
      repRange: { repMin: 5, repMax: 5 },
    });

    expect(result!.target.reason).toBe("increase_load");
    expect(result!.target.targetWeightG).toBe(kg(102.5));
  });

  it("is unchanged by the fix for straight sets, where top and last are the same set", () => {
    const sessions: ExerciseSession[] = [session("2026-09-10", straightSets(100, 8, 3))];

    const result = suggestProgression(sessions, "epley", kg(2.5), {
      repRange: { repMin: 5, repMax: 8 },
    });

    expect(result!.target.targetWeightG).toBe(kg(102.5));
    expect(result!.target.targetReps).toBe(5);
  });
});

describe("load stepping stays on the increment grid", () => {
  it("adds exactly one increment when the current load is already on the grid", () => {
    const sessions: ExerciseSession[] = [session("2026-09-10", straightSets(100, 8, 3))];
    const result = suggestProgression(sessions, "epley", kg(2.5), {
      repRange: { repMin: 8, repMax: 8 },
    });
    expect(result!.target.targetWeightG).toBe(kg(102.5));
  });

  it("snaps an off-grid load onto the grid and still increases it", () => {
    // 61 kg with a 2.5 kg step: imported history and odd fixed-weight kit land here.
    const sessions: ExerciseSession[] = [session("2026-09-10", straightSets(61, 8, 3))];
    const increment = kg(2.5);

    const result = suggestProgression(sessions, "epley", increment, {
      repRange: { repMin: 8, repMax: 8 },
    });

    const target = result!.target.targetWeightG;
    expect(target).toBeGreaterThan(kg(61));
    expect(roundGramsToIncrement(target, increment)).toBe(target);
    expect(target).toBe(kg(62.5));
  });
});
