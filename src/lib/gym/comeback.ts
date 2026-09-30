import type { LoadSnap } from "@/domain/progression";
import { localDateToOrdinal } from "@/domain/time";
import type { ComebackRule, OneRepMaxFormula } from "@/domain/types";
import { roundGramsToIncrement } from "@/domain/units";
import { detectPrsForWorkout, type PersonalRecord, type SessionSlice } from "./analytics";

/**
 * Opp 8, comeback mode (plan addendum A-7). After a layoff, the next session of each lift starts from
 * that lift's last working load before the break, cut by a percentage that depends on how long the
 * break was, and snapped down to a load that can be built. It is a rule, not a prediction: the
 * numbers are the owner's defaults (DA-3), stated in the UI and editable in Settings.
 *
 * Product heuristics, not research (catalog claim `comeback-reentry-rule`).
 */

/** A gap this long between two sessions is a layoff, as on the Chronicle. */
export const COMEBACK_LAYOFF_DAYS = 14;
/** A break of this many days or more takes the middle percentage. */
export const COMEBACK_MID_DAYS = 28;
/** A break of this many days or more takes the lowest percentage. */
export const COMEBACK_LONG_DAYS = 56;
/** Today keeps showing the comeback for this many days after the first session back. */
export const COMEBACK_WINDOW_DAYS = 56;

export const DEFAULT_COMEBACK_RULE: ComebackRule = { shortPct: 90, midPct: 80, longPct: 70 };
/** The percentages Settings offers, in steps of 5. */
export const COMEBACK_PCT_MIN = 50;
export const COMEBACK_PCT_MAX = 100;

export function daysBetween(from: string, to: string): number {
  return localDateToOrdinal(to) - localDateToOrdinal(from);
}

/** The percentage of the last working load a break of `days` takes, or undefined for no layoff. */
export function comebackPercent(days: number, rule: ComebackRule = DEFAULT_COMEBACK_RULE): number | undefined {
  if (days < COMEBACK_LAYOFF_DAYS) return undefined;
  if (days < COMEBACK_MID_DAYS) return rule.shortPct;
  if (days < COMEBACK_LONG_DAYS) return rule.midPct;
  return rule.longPct;
}

/** The band a break falls in, worded as the rule states it. */
export function comebackBand(days: number): string {
  if (days < COMEBACK_MID_DAYS) return `${COMEBACK_LAYOFF_DAYS} to ${COMEBACK_MID_DAYS - 1} days away`;
  if (days < COMEBACK_LONG_DAYS) return `${COMEBACK_MID_DAYS} to ${COMEBACK_LONG_DAYS - 1} days away`;
  return `${COMEBACK_LONG_DAYS} or more days away`;
}

/**
 * The re-entry load: `percent` of the last working load, rounded down to one the lifter can build
 * (their bar and plates for barbell work, else the increment grid). Never above the last load.
 */
export function reEntryLoadG(lastG: number, percent: number, incrementG: number, snap?: LoadSnap): number {
  const target = (lastG * percent) / 100;
  const snapped = snap ? snap(target, "down") : roundGramsToIncrement(target, incrementG, "down");
  return Math.max(0, Math.min(snapped, lastG));
}

/** The rule in one sentence, with the lifter's own numbers. */
export function comebackRuleLine(rule: ComebackRule = DEFAULT_COMEBACK_RULE): string {
  return `Rule, not a prediction: each lift restarts at ${rule.shortPct}% of its last working load after ${COMEBACK_LAYOFF_DAYS} to ${COMEBACK_MID_DAYS - 1} days away, ${rule.midPct}% after ${COMEBACK_MID_DAYS} to ${COMEBACK_LONG_DAYS - 1}, ${rule.longPct}% after ${COMEBACK_LONG_DAYS} or more, rounded down to a load you can build.`;
}

export type ComebackState =
  | {
      phase: "away";
      /** Days from the last session to today. */
      daysAway: number;
      lastDate: string;
    }
  | {
      phase: "back";
      daysAway: number;
      /** The last session before the layoff, and the first after it. */
      lastDate: string;
      returnDate: string;
      sessionsSince: number;
      /** Estimated-1RM records set since the return, against everything logged before each one. */
      prs: PersonalRecord[];
    };

/**
 * Where the lifter stands: away (no session for a layoff's length, up to today), back (the latest
 * layoff ended within COMEBACK_WINDOW_DAYS), or neither. Read from the log alone.
 */
export function currentComeback(
  slices: SessionSlice[],
  today: string,
  formula: OneRepMaxFormula,
): ComebackState | undefined {
  const last = slices[slices.length - 1];
  if (!last) return undefined;
  const sinceLast = daysBetween(last.workout.localDate, today);
  if (sinceLast >= COMEBACK_LAYOFF_DAYS) {
    return { phase: "away", daysAway: sinceLast, lastDate: last.workout.localDate };
  }
  for (let i = slices.length - 1; i >= 1; i -= 1) {
    const before = slices[i - 1]!.workout.localDate;
    const after = slices[i]!.workout.localDate;
    const gap = daysBetween(before, after);
    if (gap < COMEBACK_LAYOFF_DAYS) continue;
    if (daysBetween(after, today) >= COMEBACK_WINDOW_DAYS) return undefined;
    const since = slices.slice(i);
    const prs = since
      .flatMap((slice) =>
        detectPrsForWorkout(slice.workout.id, slices, formula).filter((row) => row.kind === "e1rm"),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      phase: "back",
      daysAway: gap,
      lastDate: before,
      returnDate: after,
      sessionsSince: since.length,
      prs,
    };
  }
  return undefined;
}
