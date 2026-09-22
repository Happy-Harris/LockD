import { bestOneRepMax } from "@/domain/oneRepMax";
import type { BodyMeasurement, OneRepMaxFormula } from "@/domain/types";
import { hardSetCount } from "@/domain/volume";
import { weeklySeries, type SessionSlice } from "./analytics";
import { collectExposures, typicalExposuresToProgress, type ProgressionCall } from "./progression";

export interface RelativeLift {
  exerciseId: string;
  name: string;
  e1rmG: number;
  bodyweightG: number;
  ratio: number;
}

export interface SideDelta {
  metric: string;
  left: number;
  right: number;
  deltaPct: number;
}

export interface IntelligenceReport {
  hitRate: number;
  hitRatePrior: number;
  easierWeek: boolean;
  insights: string[];
  exposuresToProgress: Array<{ exerciseId: string; name: string; typical: number }>;
  fatigue: Array<{ name: string; note: string }>;
  volumeResponse: string;
  restNote: string;
  rpeDrift: { previous: number; recent: number; note: string } | null;
  leftRight: SideDelta[];
  relative: RelativeLift[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function restSecondsBetween(sets: Array<{ completedAt?: string }>): number[] {
  const times = sets
    .map((set) => (set.completedAt ? Date.parse(set.completedAt) : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const gap = (times[i]! - times[i - 1]!) / 1000;
    if (gap >= 20 && gap <= 600) gaps.push(gap);
  }
  return gaps;
}

export function buildIntelligence(opts: {
  slices: SessionSlice[];
  formula: OneRepMaxFormula;
  goalIds: string[];
  measurements: BodyMeasurement[];
  calls: ProgressionCall[];
  weekStartDay: "saturday" | "sunday" | "monday";
}): IntelligenceReport {
  const { slices, formula, goalIds, measurements, calls } = opts;
  const insights: string[] = [];
  const recent = slices.slice(-12);
  const prior = slices.slice(-24, -12);

  const recentHits = calls.length ? mean(calls.map((call) => call.hitRate)) : 0;
  let priorHits = 0;
  if (prior.length && goalIds.length) {
    const rates: number[] = [];
    for (const id of goalIds) {
      const exposures = collectExposures(id, prior, formula, true);
      if (!exposures.length) continue;
      rates.push(exposures.filter((row) => row.hit).length / exposures.length);
    }
    priorHits = mean(rates);
  }

  const exposuresToProgress: IntelligenceReport["exposuresToProgress"] = [];
  for (const call of calls) {
    const exposures = collectExposures(call.exerciseId, slices, formula, true);
    const typical = typicalExposuresToProgress(exposures);
    if (typical) {
      exposuresToProgress.push({ exerciseId: call.exerciseId, name: call.exerciseName, typical });
      if (call.exposuresAtLoad >= typical && call.action === "add_load") {
        insights.push(`${call.exerciseName}: you usually progress after ${typical} exposures at a load. This is that session.`);
      }
    }
  }

  const fatigue: IntelligenceReport["fatigue"] = [];
  for (const call of calls.slice(0, 6)) {
    const exposures = collectExposures(call.exerciseId, slices, formula, true);
    if (exposures.length < 6) continue;
    const byGap: Array<{ gap: number; e1rm: number }> = [];
    for (let i = 1; i < exposures.length; i += 1) {
      const prev = slices.find((slice) => slice.workout.id === exposures[i - 1]!.workoutId);
      const curr = slices.find((slice) => slice.workout.id === exposures[i]!.workoutId);
      if (!prev || !curr) continue;
      const gapHours =
        (Date.parse(curr.workout.startedAt) - Date.parse(prev.workout.startedAt)) / 3_600_000;
      byGap.push({ gap: gapHours, e1rm: exposures[i]!.bestE1rm });
    }
    const tight = byGap.filter((row) => row.gap < 72);
    const roomy = byGap.filter((row) => row.gap >= 96);
    if (tight.length >= 3 && roomy.length >= 3) {
      const tightMean = mean(tight.map((row) => row.e1rm));
      const roomyMean = mean(roomy.map((row) => row.e1rm));
      if (roomyMean > 0 && tightMean < roomyMean * 0.97) {
        const note = `${call.exerciseName} is usually stronger with 4+ days since the last exposure.`;
        fatigue.push({ name: call.exerciseName, note });
        insights.push(note);
      }
    }
  }

  const weeks = weeklySeries(slices, opts.weekStartDay);
  let volumeResponse = "Not enough weeks to read volume against progress.";
  if (weeks.length >= 6 && goalIds[0]) {
    const pairs: Array<{ volume: number; next: number }> = [];
    const series = collectExposures(goalIds[0], slices, formula, true);
    for (let i = 0; i < weeks.length - 1; i += 1) {
      const week = weeks[i]!;
      const nextWeek = weeks[i + 1]!;
      const here = series.filter((row) => row.date >= week.weekStart && row.date < nextWeek.weekStart);
      const there = series.filter((row) => row.date >= nextWeek.weekStart);
      if (!here.length || !there.length) continue;
      pairs.push({ volume: week.hardSets, next: there[0]!.bestE1rm - here[here.length - 1]!.bestE1rm });
    }
    if (pairs.length >= 4) {
      const high = pairs.filter((row) => row.volume >= mean(pairs.map((item) => item.volume)));
      const low = pairs.filter((row) => row.volume < mean(pairs.map((item) => item.volume)));
      const highDelta = mean(high.map((row) => row.next));
      const lowDelta = mean(low.map((row) => row.next));
      if (highDelta > lowDelta) {
        volumeResponse = "Higher-volume weeks have been followed by better estimated 1RM on the main lift.";
      } else if (lowDelta > highDelta) {
        volumeResponse = "The main lift has tended to move more after quieter volume weeks.";
      } else {
        volumeResponse = "Volume and next-week progress are roughly flat against each other.";
      }
      insights.push(volumeResponse);
    }
  }

  let restNote = "Rest times are inferred from set timestamps when they exist.";
  const restHits: number[] = [];
  const restMisses: number[] = [];
  for (const slice of recent) {
    for (const exercise of slice.exercises) {
      const sets = slice.sets
        .filter((set) => set.workoutExerciseId === exercise.id && set.isCompleted && set.setType !== "warmup")
        .sort((a, b) => a.order - b.order);
      const gaps = restSecondsBetween(sets);
      if (!gaps.length) continue;
      const avg = mean(gaps);
      const hit = sets.every((set) => (set.reps ?? 0) >= (sets[0]?.reps ?? 0));
      if (hit) restHits.push(avg);
      else restMisses.push(avg);
    }
  }
  if (restHits.length >= 4 && restMisses.length >= 3) {
    const hitRest = mean(restHits);
    const missRest = mean(restMisses);
    if (hitRest > missRest + 15) {
      restNote = `Hits cluster around ${Math.round(hitRest)}s rest. Misses are closer to ${Math.round(missRest)}s.`;
      insights.push(restNote);
    } else {
      restNote = "Rest length is not clearly separating hits from misses.";
    }
  }

  const rpesRecent = recent.flatMap((slice) =>
    slice.sets.filter((set) => set.isCompleted && set.rpe != null && set.setType !== "warmup").map((set) => set.rpe!),
  );
  const rpesPrior = prior.flatMap((slice) =>
    slice.sets.filter((set) => set.isCompleted && set.rpe != null && set.setType !== "warmup").map((set) => set.rpe!),
  );
  let rpeDrift: IntelligenceReport["rpeDrift"] = null;
  if (rpesRecent.length >= 8 && rpesPrior.length >= 8) {
    const recentR = mean(rpesRecent);
    const priorR = mean(rpesPrior);
    const note =
      recentR > priorR + 0.3
        ? `RPE has drifted up (${priorR.toFixed(1)} → ${recentR.toFixed(1)}). Same loads are costing more.`
        : recentR < priorR - 0.3
          ? `RPE has drifted down (${priorR.toFixed(1)} → ${recentR.toFixed(1)}). Work is feeling cheaper.`
          : `RPE is holding around ${recentR.toFixed(1)}.`;
    rpeDrift = { previous: priorR, recent: recentR, note };
    insights.push(note);
  }

  const latestBy = (metric: BodyMeasurement["metric"]) =>
    [...measurements].reverse().find((row) => row.metric === metric);
  const pairs: Array<[BodyMeasurement["metric"], BodyMeasurement["metric"], string]> = [
    ["arm_left", "arm_right", "Arms"],
    ["thigh_left", "thigh_right", "Thighs"],
    ["calf_left", "calf_right", "Calves"],
  ];
  const leftRight: SideDelta[] = [];
  for (const [leftKey, rightKey, label] of pairs) {
    const left = latestBy(leftKey);
    const right = latestBy(rightKey);
    if (!left || !right || left.value <= 0) continue;
    const deltaPct = ((right.value - left.value) / left.value) * 100;
    if (Math.abs(deltaPct) >= 2) {
      leftRight.push({ metric: label, left: left.value, right: right.value, deltaPct });
      insights.push(
        `${label}: ${deltaPct > 0 ? "right" : "left"} is ${Math.abs(deltaPct).toFixed(1)}% larger on the latest measurement.`,
      );
    }
  }

  const body = [...measurements].reverse().find((row) => row.metric === "bodyweight");
  const relative: RelativeLift[] = [];
  if (body && body.value > 0) {
    for (const id of goalIds) {
      const last = [...slices].reverse().find((slice) => slice.exercises.some((row) => row.exerciseId === id));
      if (!last) continue;
      const row = last.exercises.find((item) => item.exerciseId === id)!;
      const sets = last.sets.filter((set) => set.workoutExerciseId === row.id);
      const best = bestOneRepMax(sets, formula);
      if (!best) continue;
      relative.push({
        exerciseId: id,
        name: row.exerciseNameSnapshot,
        e1rmG: best.value,
        bodyweightG: body.value,
        ratio: best.value / body.value,
      });
    }
  }

  const easierWeek = calls.filter((call) => call.action === "easier_week" || call.action === "deload").length >= 2;
  if (easierWeek) insights.unshift("The progression engine wants an easier week. Trust the misses, not the ego.");
  if (recentHits > 0) {
    insights.push(`Progression hit-rate on tracked lifts is ${Math.round(recentHits * 100)}%.`);
  }
  if (slices.length) {
    const lastHard = hardSetCount(slices[slices.length - 1]!.sets);
    insights.push(`Last session: ${lastHard} hard sets in ${slices[slices.length - 1]!.workout.name}.`);
  }

  return {
    hitRate: recentHits,
    hitRatePrior: priorHits,
    easierWeek,
    insights: insights.slice(0, 8),
    exposuresToProgress,
    fatigue,
    volumeResponse,
    restNote,
    rpeDrift,
    leftRight,
    relative,
  };
}
