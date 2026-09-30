import { localDateOf } from "@/domain/time";
import type { WeekStartDay } from "@/domain/types";
import type { VerdictLens } from "./lens";
import {
  computeStallComparison,
  STALL_MIN_SESSIONS,
  STALL_WINDOW_DAYS,
  type ExerciseSession,
} from "@/domain/progression";
import type { AnalyticsOptions, LoggedEntry } from "./compute";
import {
  selectTrainingBaseline,
  shiftLocalDate,
  startOfTrainingWeekDate,
  weekWindow,
} from "./trainingWeeks";
import { resolveGoalLifts, weeklyVerdict, type DirectionBand } from "./weeklyVerdict";

export { STALL_MIN_SESSIONS, STALL_WINDOW_DAYS };
export const DELOAD_CLAIM_ID = "weekly-verdict-deload-shape" as const;
export const SPIKE_CLAIM_ID = "weekly-verdict-spike-flag" as const;
export const STALL_CLAIM_ID = "training-stall-flag" as const;

export type FlagActivity = "active" | "inactive" | "partial";

export interface DeloadFlag {
  id: "deload";
  status: FlagActivity;
  label: "Deload";
  subjectStartDate: string;
  subjectEndDate: string;
  subjectHardSets: number;
  baselineHardSetsMean: number;
  subjectSessions: number;
  baselineSessionsMean: number;
  sessionFloor: number;
  claimId: typeof DELOAD_CLAIM_ID;
  receipt: string;
}

export interface SpikeFlag {
  id: "spike";
  status: FlagActivity;
  label: "Spike";
  subjectStartDate: string;
  subjectEndDate: string;
  directionBand: DirectionBand | null;
  changePercent: number | null;
  watchoutId: string | null;
  claimId: typeof SPIKE_CLAIM_ID;
  receipt: string;
}

export interface StallFlag {
  id: "stall";
  status: FlagActivity;
  label: string;
  liftId: string;
  liftName: string;
  windowStartDate: string;
  windowEndDate: string;
  sessionsInWindow: number;
  bestE1rmInWindowG: number | null;
  comparisonBestE1rmG: number | null;
  comparisonSource: "prior_equal_window" | null;
  /** First and last date of the prior sessions compared, when there were any (Opp 4). */
  comparisonStartDate: string | null;
  comparisonEndDate: string | null;
  claimId: typeof STALL_CLAIM_ID;
  receipt: string;
}

export interface TrainingFlags {
  deload: DeloadFlag;
  spike: SpikeFlag;
  stalls: StallFlag[];
  /** Active flags only (stall Partial is not active). */
  active: Array<DeloadFlag | SpikeFlag | StallFlag>;
  /** A rule could not make an honest active / inactive call from the available data. */
  hasPartial: boolean;
}

function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPercent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function sessionsForLift(entries: readonly LoggedEntry[], liftId: string): LoggedEntry[][] {
  const byWorkout = new Map<string, LoggedEntry[]>();
  for (const entry of entries) {
    if (entry.exercise.exerciseId !== liftId) continue;
    const session = byWorkout.get(entry.workout.id);
    if (session) session.push(entry);
    else byWorkout.set(entry.workout.id, [entry]);
  }
  return [...byWorkout.values()].sort((a, b) =>
    a[0]!.workout.localDate.localeCompare(b[0]!.workout.localDate),
  );
}

export function deloadFlag(
  entries: readonly LoggedEntry[],
  options: AnalyticsOptions,
  weekStart: WeekStartDay = "monday",
  reference: Date = new Date(),
  goalLiftIds?: readonly string[],
  goalLens: VerdictLens = "build",
): DeloadFlag {
  const verdict = weeklyVerdict(entries, options, weekStart, reference, goalLiftIds, goalLens);
  const subjectHardSets = verdict.subject.metrics.hardSets;
  const baselineHardSetsMean = verdict.baseline.metrics.hardSets;
  const subjectSessions = verdict.subject.metrics.sessions;
  const baselineSessionsMean = verdict.baseline.metrics.sessions;
  const sessionFloor = Math.round(baselineSessionsMean);
  const active = verdict.state === "deload";
  const partial = verdict.state === "not_enough_history" || verdict.state === "welcome_back";
  const readsAsIntensityBlock = active && goalLens === "strength" && verdict.intensityHeld === true;
  const receipt = partial
    ? `Subject week ${verdict.subject.startDate} → ${verdict.subject.endDate}: deload check is partial while Weekly Verdict is ${verdict.state.replaceAll("_", " ")}.`
    : active
      ? readsAsIntensityBlock
        ? `Subject week ${verdict.subject.startDate} → ${verdict.subject.endDate}: ${subjectHardSets} hard sets (< 60% of baseline mean ${formatSets(baselineHardSetsMean)}) with ${subjectSessions} sessions (≥ floor ${sessionFloor}); goal-lift e1RM held or rose. Receipt: intensity block, not a deload.`
        : `Subject week ${verdict.subject.startDate} → ${verdict.subject.endDate}: ${subjectHardSets} hard sets (< 60% of baseline mean ${formatSets(baselineHardSetsMean)}) with ${subjectSessions} sessions (≥ floor ${sessionFloor}). Receipt: deload-shaped week.`
      : `Subject week ${verdict.subject.startDate} → ${verdict.subject.endDate}: not deload-shaped (${subjectHardSets} hard sets vs baseline mean ${formatSets(baselineHardSetsMean)}; ${subjectSessions} sessions vs floor ${sessionFloor}).`;

  return {
    id: "deload",
    status: partial ? "partial" : active ? "active" : "inactive",
    label: "Deload",
    subjectStartDate: verdict.subject.startDate,
    subjectEndDate: verdict.subject.endDate,
    subjectHardSets,
    baselineHardSetsMean,
    subjectSessions,
    baselineSessionsMean,
    sessionFloor,
    claimId: DELOAD_CLAIM_ID,
    receipt,
  };
}

export function spikeFlag(
  entries: readonly LoggedEntry[],
  options: AnalyticsOptions,
  weekStart: WeekStartDay = "monday",
  reference: Date = new Date(),
  goalLiftIds?: readonly string[],
  goalLens: VerdictLens = "build",
): SpikeFlag {
  const verdict = weeklyVerdict(entries, options, weekStart, reference, goalLiftIds, goalLens);
  const band = verdict.direction?.band ?? null;
  const changePercent = verdict.direction?.changePercent ?? null;
  const watchoutId = verdict.watchout?.id ?? null;
  const active = band === "big_jump" || watchoutId === "watchout_big_jump";
  const partial = verdict.state === "not_enough_history" || verdict.state === "welcome_back";
  const receipt = partial
    ? `Subject week ${verdict.subject.startDate} → ${verdict.subject.endDate}: spike check is partial while Weekly Verdict is ${verdict.state.replaceAll("_", " ")}.`
    : active
      ? `Subject week ${verdict.subject.startDate} → ${verdict.subject.endDate}: hard sets ${changePercent != null ? formatPercent(changePercent) : "up"} vs baseline — big jump.`
      : `Subject week ${verdict.subject.startDate} → ${verdict.subject.endDate}: no big-jump spike${
          band
            ? ` (direction ${band.replaceAll("_", " ")})`
            : " (no direction band on this verdict state)"
        }.`;

  return {
    id: "spike",
    status: partial ? "partial" : active ? "active" : "inactive",
    label: "Spike",
    subjectStartDate: verdict.subject.startDate,
    subjectEndDate: verdict.subject.endDate,
    directionBand: band,
    changePercent,
    watchoutId,
    claimId: SPIKE_CLAIM_ID,
    receipt,
  };
}

export function stallFlags(
  entries: readonly LoggedEntry[],
  options: AnalyticsOptions,
  weekStart: WeekStartDay = "monday",
  reference: Date = new Date(),
  goalLiftIds?: readonly string[],
): StallFlag[] {
  const referenceLocalDate = localDateOf(reference);
  const windowEndDate = referenceLocalDate;
  const windowStartDate = shiftLocalDate(referenceLocalDate, -(STALL_WINDOW_DAYS - 1));
  const currentWeekStart = startOfTrainingWeekDate(referenceLocalDate, weekStart);
  const subjectWindow = weekWindow(shiftLocalDate(currentWeekStart, -7));
  const baselineWeeks = selectTrainingBaseline(entries, subjectWindow.startDate, weekStart);
  const { lifts: goalLifts } = resolveGoalLifts(baselineWeeks, goalLiftIds);

  return goalLifts.map((lift) => {
    const liftSessions: ExerciseSession[] = sessionsForLift(entries, lift.id).map((session) => ({
      localDate: session[0]!.workout.localDate,
      sets: session.flatMap((entry) => entry.sets),
    }));
    const comparison = computeStallComparison(
      liftSessions,
      options.formula,
      windowStartDate,
      windowEndDate,
      STALL_MIN_SESSIONS,
    );
    const {
      sessionsInWindow,
      bestE1rmInWindowG,
      comparisonBestE1rmG,
      comparisonSource,
      comparisonStartDate,
      comparisonEndDate,
    } = comparison;
    const label = `Stall — ${lift.name}`;

    if (sessionsInWindow < STALL_MIN_SESSIONS) {
      return {
        id: "stall" as const,
        status: "partial" as const,
        label,
        liftId: lift.id,
        liftName: lift.name,
        windowStartDate,
        windowEndDate,
        sessionsInWindow,
        bestE1rmInWindowG,
        comparisonBestE1rmG: null,
        comparisonSource: null,
        comparisonStartDate: null,
        comparisonEndDate: null,
        claimId: STALL_CLAIM_ID,
        receipt: `${lift.name}: ${sessionsInWindow} completed session${
          sessionsInWindow === 1 ? "" : "s"
        } in the trailing ${STALL_WINDOW_DAYS} local days (need ${STALL_MIN_SESSIONS}). Partial — no stall claim.`,
      };
    }

    if (bestE1rmInWindowG === null || comparisonBestE1rmG === null) {
      return {
        id: "stall" as const,
        status: "partial" as const,
        label,
        liftId: lift.id,
        liftName: lift.name,
        windowStartDate,
        windowEndDate,
        sessionsInWindow,
        bestE1rmInWindowG,
        comparisonBestE1rmG,
        comparisonSource,
        comparisonStartDate,
        comparisonEndDate,
        claimId: STALL_CLAIM_ID,
        receipt: `${lift.name}: ${sessionsInWindow} sessions in the trailing ${STALL_WINDOW_DAYS} days, but e1RM comparison is incomplete. Partial — no stall claim.`,
      };
    }

    const stalled = comparison.state === "stalled";
    const receipt = stalled
      ? `${lift.name}: best e1RM over ${sessionsInWindow} sessions in the trailing ${STALL_WINDOW_DAYS} days is flat or down against the ${sessionsInWindow} sessions before them. Stall.`
      : `${lift.name}: best e1RM over ${sessionsInWindow} sessions in the trailing ${STALL_WINDOW_DAYS} days improved against the ${sessionsInWindow} sessions before them. No stall.`;

    return {
      id: "stall" as const,
      status: stalled ? ("active" as const) : ("inactive" as const),
      label,
      liftId: lift.id,
      liftName: lift.name,
      windowStartDate,
      windowEndDate,
      sessionsInWindow,
      bestE1rmInWindowG,
      comparisonBestE1rmG,
      comparisonSource,
      comparisonStartDate,
      comparisonEndDate,
      claimId: STALL_CLAIM_ID,
      receipt,
    };
  });
}

/** Recompute stall / spike / deload flags from logged entries (no Dexie table). */
export function trainingFlags(
  entries: readonly LoggedEntry[],
  options: AnalyticsOptions,
  weekStart: WeekStartDay = "monday",
  reference: Date = new Date(),
  goalLiftIds?: readonly string[],
  goalLens: VerdictLens = "build",
): TrainingFlags {
  const deload = deloadFlag(entries, options, weekStart, reference, goalLiftIds, goalLens);
  const spike = spikeFlag(entries, options, weekStart, reference, goalLiftIds, goalLens);
  const stalls = stallFlags(entries, options, weekStart, reference, goalLiftIds);
  const active = [
    ...(deload.status === "active" ? [deload] : []),
    ...(spike.status === "active" ? [spike] : []),
    ...stalls.filter((flag) => flag.status === "active"),
  ];
  const hasPartial =
    deload.status === "partial" ||
    spike.status === "partial" ||
    stalls.some((flag) => flag.status === "partial");
  return { deload, spike, stalls, active, hasPartial };
}

export const CHANGE_FLAGS_EMPTY =
  "No stall, spike, or deload flags on the current subject week / lift windows.";

export const CHANGE_FLAGS_PARTIAL =
  "Some checks need more comparable training history before they can make a call.";
