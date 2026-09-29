import type { AppSettings, SetType } from "@/domain/types";

/** A learned rest is only offered when it differs from the chosen rest by at least this much. */
export const REST_SUGGESTION_MIN_DIFF_SECONDS = 15;

/**
 * How long to rest after a set. The lifter's own choice wins: the routine's rest for that exercise, else the
 * default they set (both are snapshotted into `exerciseRestSeconds` when the exercise joins the workout).
 * Warm-ups only rest when the lifter set a separate warm-up rest; null means no timer.
 */
export function restSecondsAfter(
  setType: SetType,
  exerciseRestSeconds: number,
  settings: Pick<AppSettings, "warmupRestSeconds">,
): number | null {
  if (setType === "warmup") {
    const warmup = settings.warmupRestSeconds ?? 0;
    return warmup > 0 ? warmup : null;
  }
  return exerciseRestSeconds > 0 ? exerciseRestSeconds : null;
}

/** The rest this lifter actually takes, offered as a labelled suggestion, never applied on its own. */
export function restSuggestion(
  learnedSeconds: number | null,
  chosenSeconds: number,
): number | undefined {
  if (learnedSeconds == null) return undefined;
  return Math.abs(learnedSeconds - chosenSeconds) >= REST_SUGGESTION_MIN_DIFF_SECONDS
    ? learnedSeconds
    : undefined;
}
