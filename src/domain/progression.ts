import { roundGramsToIncrement } from "./units";
import { bestOneRepMax } from "./oneRepMax";
import type { OneRepMaxFormula, WorkoutSet } from "./types";

/**
 * Progression Engine v1 — per-exercise guidance, derived on read.
 *
 * Rules (founder-decided):
 *  - Double progression: fill the prescribed rep range at the current weight, then add
 *    load and reset to the bottom of the range. Without a rep range, the honest fallback
 *    is simply "beat last session's rep count" at the same weight — no invented range.
 *  - Progress / stall state reuses the exact rule as `trainingFlags.stallFlags`: best
 *    e1RM across at least `STALL_MIN_SESSIONS` sessions in the trailing `STALL_WINDOW_DAYS`
 *    local days, compared against the same-count prior window. Flat or down is a stall.
 *    This module is the single source of truth for that comparison; `trainingFlags`
 *    adapts its own data shape and calls into it rather than recomputing the rule.
 *
 * Non-guarantees (v1, deliberately out of scope):
 *  - Not coaching advice. A target here is a concrete number to try to beat, not a
 *    prescription informed by fatigue, RPE trend, recovery, or injury history.
 *  - No plate-aware rounding. `roundGramsToIncrement` rounds to the nearest (or given
 *    mode's) multiple of `incrementG`; it does not check that a barbell + available
 *    plates can actually build that number, and it can round in a direction that isn't
 *    buildable with a fixed plate set. That's a v2 concern (see `warmup.ts`'s
 *    plate-aware ramp for the pattern once this needs it).
 *  - No deload / back-off week suggestions, no fatigue modelling, no RPE drift.
 */

/** Best-e1RM stall comparison, mirrored from the existing Weekly Verdict change flags. */
export const STALL_WINDOW_DAYS = 28;
export const STALL_MIN_SESSIONS = 3;

export const PROGRESSION_CLAIM_ID = "progression-double-progression" as const;

/**
 * One past session's completed sets for a single exercise. Sessions passed to the
 * functions in this module are expected **newest-first** (index 0 = most recent),
 * matching `repository.getSetHistoryForExercise`. The stall comparison re-derives its
 * own ordering from `localDate` internally, so it tolerates either order; the double
 * progression target reads only `sessions[0]`, so newest-first is load-bearing there.
 */
export interface ExerciseSession {
  /** Local calendar date, YYYY-MM-DD. */
  localDate: string;
  sets: readonly WorkoutSet[];
}

export type ProgressionState = "progressing" | "stalled" | "insufficient_data";

export interface StallComparison {
  state: ProgressionState;
  /** Completed sessions for this lift in the trailing `STALL_WINDOW_DAYS` local days. */
  sessionsInWindow: number;
  /** Best valid e1RM in the trailing window, in grams. Null when no set produced one. */
  bestE1rmInWindowG: number | null;
  /** Best valid e1RM in the prior equal-count window, in grams. Null when unavailable. */
  comparisonBestE1rmG: number | null;
  comparisonSource: "prior_equal_window" | null;
}

/** Completed, non-warm-up sets with a positive load and rep count. */
function loadedWorkingSets(sets: readonly WorkoutSet[]): WorkoutSet[] {
  return sets.filter(
    (set) =>
      set.isCompleted && set.setType !== "warmup" && (set.weightG ?? 0) > 0 && (set.reps ?? 0) > 0,
  );
}

function bestE1rmForSessions(
  sessions: readonly ExerciseSession[],
  formula: OneRepMaxFormula,
): number | null {
  const sets = sessions.flatMap((session) => session.sets);
  return bestOneRepMax(sets, formula, { includeWarmups: false })?.value ?? null;
}

/**
 * The one definition of "stalled" for a single lift. Filters `sessions` into the
 * trailing window `[windowStartDate, windowEndDate]` (inclusive, local dates) and the
 * prior sessions before it, then compares best e1RM across equal session counts.
 *
 * Returns `'insufficient_data'` both when there are fewer than `minSessions` in the
 * window and when a comparable prior window doesn't exist or produces no valid e1RM —
 * callers that need to tell those cases apart for copy can re-check `sessionsInWindow`
 * against `minSessions` themselves; both are honest "not enough to call it" outcomes.
 */
export function computeStallComparison(
  sessions: readonly ExerciseSession[],
  formula: OneRepMaxFormula,
  windowStartDate: string,
  windowEndDate: string,
  minSessions: number = STALL_MIN_SESSIONS,
): StallComparison {
  const windowSessions = sessions.filter(
    (session) => session.localDate >= windowStartDate && session.localDate <= windowEndDate,
  );
  const sessionsInWindow = windowSessions.length;

  if (sessionsInWindow < minSessions) {
    return {
      state: "insufficient_data",
      sessionsInWindow,
      bestE1rmInWindowG: bestE1rmForSessions(windowSessions, formula),
      comparisonBestE1rmG: null,
      comparisonSource: null,
    };
  }

  const bestE1rmInWindowG = bestE1rmForSessions(windowSessions, formula);
  const priorSessions = sessions
    .filter((session) => session.localDate < windowStartDate)
    .sort((a, b) => a.localDate.localeCompare(b.localDate));

  let comparisonBestE1rmG: number | null = null;
  let comparisonSource: StallComparison["comparisonSource"] = null;
  if (priorSessions.length >= sessionsInWindow) {
    const equalPriorSessions = priorSessions.slice(-sessionsInWindow);
    comparisonBestE1rmG = bestE1rmForSessions(equalPriorSessions, formula);
    comparisonSource = "prior_equal_window";
  }

  if (bestE1rmInWindowG === null || comparisonBestE1rmG === null) {
    return {
      state: "insufficient_data",
      sessionsInWindow,
      bestE1rmInWindowG,
      comparisonBestE1rmG,
      comparisonSource,
    };
  }

  const stalled = bestE1rmInWindowG <= comparisonBestE1rmG;
  return {
    state: stalled ? "stalled" : "progressing",
    sessionsInWindow,
    bestE1rmInWindowG,
    comparisonBestE1rmG,
    comparisonSource,
  };
}

/** Prescribed rep range from a linked Routine's `TemplateExercise`, in reps. */
export interface RepRange {
  repMin: number;
  repMax: number;
}

export type ProgressionReason = "increase_load" | "increase_reps" | "beat_last_session";

/**
 * How each reason is described in a receipt. A exhaustive record rather than a ternary so
 * that adding a reason is a compile error here, instead of silently inheriting whichever
 * phrase happened to be on the fallback branch.
 */
const REASON_PHRASE: Record<ProgressionReason, string> = {
  increase_load: "add load, reset reps",
  increase_reps: "same weight, more reps",
  beat_last_session: "same weight, more reps",
};

export interface ProgressionTarget {
  /** Target load for the next session, in grams. */
  targetWeightG: number;
  /** Target rep count for the next session. */
  targetReps: number;
  reason: ProgressionReason;
}

export interface ProgressionSuggestion {
  target: ProgressionTarget;
  state: ProgressionState;
  claimId: typeof PROGRESSION_CLAIM_ID;
  receipt: string;
}

/**
 * The next load up from `currentG`, snapped to the increment grid.
 *
 * Snapping down first and then adding one step, rather than rounding `currentG + incrementG`
 * to nearest, guarantees two things for any input: the result is always a clean multiple of
 * `incrementG` (so it's a load the user can actually select), and it is always strictly
 * greater than `currentG`. Rounding to nearest satisfies neither when `currentG` is off the
 * grid — which happens with imported history and odd fixed-weight equipment.
 */
function nextLoadG(currentG: number, incrementG: number): number {
  return roundGramsToIncrement(currentG, incrementG, "down") + incrementG;
}

/** Local-date-only day arithmetic (domain modules can't import the feature-layer helper). */
function shiftLocalDateDomain(value: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  const dayMs = 86_400_000;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d)) + days * dayMs;
  const date = new Date(time);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * What to beat next session for a single exercise, plus whether it's progressing or
 * stalled and why. Returns `null` when there is no honest answer to give: no history,
 * the most recent session has no completed working set with both a load and reps
 * (bodyweight, duration-only, or distance work), or the increment is not positive.
 */
export function suggestProgression(
  sessions: readonly ExerciseSession[],
  formula: OneRepMaxFormula,
  incrementG: number,
  options: { repRange?: RepRange; referenceLocalDate?: string } = {},
): ProgressionSuggestion | null {
  if (sessions.length === 0) return null;
  if (!Number.isFinite(incrementG) || incrementG <= 0) return null;

  const lastSession = sessions[0]!;
  const workingSets = loadedWorkingSets(lastSession.sets);
  if (workingSets.length === 0) return null;

  // The heaviest working set, not the last one: on a top-set-then-back-off session
  // (100 x 5, then 80 x 8, 80 x 8) the last set is the lightest, and targeting that would
  // quietly progress the back-off work while ignoring the set the lifter actually cares
  // about. For straight sets and ascending ramps the heaviest set is also the last, so
  // this only differs where it matters.
  const topWorkingWeightG = Math.max(...workingSets.map((set) => set.weightG!));
  const setsAtWeight = workingSets.filter((set) => set.weightG === topWorkingWeightG);
  const repsAtWeight = setsAtWeight.map((set) => set.reps!);
  const minRepsAtWeight = Math.min(...repsAtWeight);
  const maxRepsAtWeight = Math.max(...repsAtWeight);

  let target: ProgressionTarget;
  if (options.repRange) {
    const { repMin, repMax } = options.repRange;
    const filledRange = minRepsAtWeight >= repMax;
    target = filledRange
      ? {
          targetWeightG: nextLoadG(topWorkingWeightG, incrementG),
          targetReps: repMin,
          reason: "increase_load",
        }
      : {
          targetWeightG: topWorkingWeightG,
          targetReps: Math.max(repMax, maxRepsAtWeight + 1),
          reason: "increase_reps",
        };
  } else {
    target = {
      targetWeightG: topWorkingWeightG,
      targetReps: maxRepsAtWeight + 1,
      reason: "beat_last_session",
    };
  }

  const referenceLocalDate = options.referenceLocalDate ?? lastSession.localDate;
  const windowEndDate = referenceLocalDate;
  const windowStartDate = shiftLocalDateDomain(referenceLocalDate, -(STALL_WINDOW_DAYS - 1));
  const comparison = computeStallComparison(sessions, formula, windowStartDate, windowEndDate);

  const receipt =
    comparison.state === "insufficient_data"
      ? `${comparison.sessionsInWindow} session${comparison.sessionsInWindow === 1 ? "" : "s"} in the trailing ${STALL_WINDOW_DAYS} local days (need ${STALL_MIN_SESSIONS} plus a comparable prior window) — target is last session's numbers to beat, not a trend call.`
      : comparison.state === "stalled"
        ? `Best e1RM in the trailing ${STALL_WINDOW_DAYS} days is flat or down vs the prior equal-count window (${comparison.sessionsInWindow} sessions) — stalled. Next target: ${REASON_PHRASE[target.reason]}.`
        : `Best e1RM in the trailing ${STALL_WINDOW_DAYS} days improved vs the prior equal-count window (${comparison.sessionsInWindow} sessions) — progressing. Next target: ${REASON_PHRASE[target.reason]}.`;

  return {
    target,
    state: comparison.state,
    claimId: PROGRESSION_CLAIM_ID,
    receipt,
  };
}
