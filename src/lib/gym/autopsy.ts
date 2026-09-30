import type { OneRepMaxFormula } from "@/domain/types";
import { formatLocalDate } from "@/domain/time";
import { hardSetCount } from "@/domain/volume";
import type { SessionSlice } from "./analytics";
import { STALL_WINDOW_DAYS } from "@/domain/progression";
import { collectExposures, type ProgressionCall } from "./progression";

export type AutopsyCode =
  | "missed_reps"
  | "flat_e1rm"
  | "falling_volume"
  | "rising_rpe"
  | "inconsistent_frequency"
  | "high_workload";

/**
 * Lowers the first letter so a title reads inside a sentence, and leaves the rest alone. Lowercasing the
 * whole title turned "1RM" into "1rm" and "RPE" into "rpe" (plan I-25).
 */
export function lowerFirst(title: string): string {
  return title.charAt(0).toLowerCase() + title.slice(1);
}

export interface AutopsyFinding {
  code: AutopsyCode;
  title: string;
  detail: string;
  evidence: string;
}

export interface PlateauAutopsy {
  exerciseId: string;
  name: string;
  stalled: boolean;
  stallSessions: number;
  headline: string;
  findings: AutopsyFinding[];
}

/** How far the average top load may move between the two windows and still be called "similar" (5%). */
export const SIMILAR_LOAD_TOLERANCE = 0.05;

/**
 * True only when both windows have logged loads and their averages are within SIMILAR_LOAD_TOLERANCE. The copy says
 * "at similar loads" only when this holds; with bodyweight or missing loads it stays silent (never a guess).
 */
export function loadsSimilar(
  recent: Array<{ bestWeightG: number }>,
  prior: Array<{ bestWeightG: number }>,
): boolean {
  const a = recent.map((row) => row.bestWeightG).filter((value) => value > 0);
  const b = prior.map((row) => row.bestWeightG).filter((value) => value > 0);
  if (a.length === 0 || b.length === 0) return false;
  const before = mean(b);
  return Math.abs(mean(a) - before) / before <= SIMILAR_LOAD_TOLERANCE;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function autopsyLift(
  call: ProgressionCall,
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
  excludeWarmups: boolean,
): PlateauAutopsy {
  const exposures = collectExposures(call.exerciseId, slices, formula, excludeWarmups);
  const recent = exposures.slice(-6);
  const prior = exposures.slice(-12, -6);
  const findings: AutopsyFinding[] = [];
  const stalled = call.stallSessions >= 3 || call.missStreak >= 2 || call.action === "easier_week" || call.action === "deload";

  if (call.missStreak >= 2) {
    const dates = recent
      .slice(-call.missStreak)
      .map((row) => formatLocalDate(row.date))
      .join(" · ");
    findings.push({
      code: "missed_reps",
      title: "Missed reps",
      detail: `Target missed on the last ${call.missStreak} exposures.`,
      evidence: dates || "Recent sessions missed the prescribed range.",
    });
  }

  if (call.stallSessions >= 3 && recent.length >= 3) {
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;
    findings.push({
      code: "flat_e1rm",
      title: "Flat estimated 1RM",
      detail: `Best estimated 1RM over the last ${STALL_WINDOW_DAYS} days is flat or down against the sessions before them (${call.stallSessions} sessions).`,
      evidence: `${formatLocalDate(first.date)} → ${formatLocalDate(last.date)} held around the same estimate.`,
    });
  }

  const similar = loadsSimilar(recent, prior);
  const recentVol: number[] = [];
  const priorVol: number[] = [];
  for (const slice of slices) {
    const row = slice.exercises.find((exercise) => exercise.exerciseId === call.exerciseId);
    if (!row) continue;
    const sets = slice.sets.filter((set) => set.workoutExerciseId === row.id);
    const hard = hardSetCount(sets);
    if (recent.some((item) => item.workoutId === slice.workout.id)) recentVol.push(hard);
    if (prior.some((item) => item.workoutId === slice.workout.id)) priorVol.push(hard);
  }
  if (recentVol.length >= 3 && priorVol.length >= 3 && mean(recentVol) < mean(priorVol) * 0.85) {
    findings.push({
      code: "falling_volume",
      title: "Falling volume",
      detail: `Hard sets dropped from ${mean(priorVol).toFixed(1)} to ${mean(recentVol).toFixed(1)} per exposure.`,
      evidence: similar ? "Fewer credited sets while the load stayed put." : "Fewer credited sets.",
    });
  }

  const recentRpe = recent.map((row) => row.avgRpe).filter((value): value is number => value != null);
  const priorRpe = prior.map((row) => row.avgRpe).filter((value): value is number => value != null);
  if (recentRpe.length >= 3 && priorRpe.length >= 2 && mean(recentRpe) > mean(priorRpe) + 0.4) {
    findings.push({
      code: "rising_rpe",
      title: "Rising RPE",
      detail: `RPE ${mean(priorRpe).toFixed(1)} → ${mean(recentRpe).toFixed(1)}${similar ? " at similar loads" : ""}.`,
      evidence: recent
        .filter((row) => row.avgRpe != null)
        .slice(-3)
        .map((row) => `${formatLocalDate(row.date)} RPE ${row.avgRpe!.toFixed(1)}`)
        .join(" · "),
    });
  }

  if (recent.length >= 4) {
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i += 1) {
      const a = Date.parse(recent[i - 1]!.date);
      const b = Date.parse(recent[i]!.date);
      gaps.push((b - a) / 86_400_000);
    }
    const spread = Math.max(...gaps) - Math.min(...gaps);
    if (spread >= 8) {
      findings.push({
        code: "inconsistent_frequency",
        title: "Inconsistent frequency",
        detail: `Gaps between exposures range ${Math.round(Math.min(...gaps))}–${Math.round(Math.max(...gaps))} days.`,
        evidence: recent.map((row) => formatLocalDate(row.date)).join(" → "),
      });
    }
  }

  const lastFour = slices.slice(-4);
  const lastFourHard = lastFour.reduce((sum, slice) => sum + hardSetCount(slice.sets), 0);
  const priorFour = slices.slice(-8, -4);
  const priorFourHard = priorFour.reduce((sum, slice) => sum + hardSetCount(slice.sets), 0);
  if (lastFour.length === 4 && priorFour.length === 4 && lastFourHard > priorFourHard * 1.2 && call.stallSessions >= 2) {
    findings.push({
      code: "high_workload",
      title: "High recent workload",
      detail: `Last four sessions: ${lastFourHard} hard sets vs ${priorFourHard} before that.`,
      evidence: "The stall sits on top of a busier block, not a quiet one.",
    });
  }

  const headline = !stalled
    ? `${call.exerciseName} is still moving. No autopsy needed.`
    : findings.length === 0
      ? `${call.exerciseName} is stalled, but the log does not show a clean pattern yet.`
      : `${call.exerciseName}: ${findings.map((row) => lowerFirst(row.title)).join(", ")}.`;

  return {
    exerciseId: call.exerciseId,
    name: call.exerciseName,
    stalled,
    stallSessions: call.stallSessions,
    headline,
    findings,
  };
}

export function autopsyBoard(
  calls: ProgressionCall[],
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
  excludeWarmups: boolean,
): PlateauAutopsy[] {
  return calls
    .map((call) => autopsyLift(call, slices, formula, excludeWarmups))
    .filter((row) => row.stalled || row.findings.length > 0);
}
