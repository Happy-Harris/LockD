import { estimateOneRepMax } from "@/domain/oneRepMax";
import type { Exercise, OneRepMaxFormula } from "@/domain/types";
import type { SessionSlice } from "./analytics";
import { collectExposures } from "./progression";

export type ProgressionPersonality = "reps" | "load" | "mixed";

export interface LiftDna {
  exerciseId: string;
  name: string;
  exposures: number;
  strongestReps: number | null;
  strongestRange: string | null;
  typicalProgressionG: number | null;
  personality: ProgressionPersonality;
  personalityWhy: string;
  bestWeekday: string | null;
  rpeDrift: number | null;
  exposuresBeforeJump: number | null;
  peakDate?: string;
  peakE1rmG?: number;
  learnedRestSeconds: number | null;
  notes: string[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(y!, (m ?? 1) - 1, d).getDay()] ?? "—";
}

function restGaps(sets: Array<{ completedAt?: string }>): number[] {
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

export function learnedRestSeconds(exerciseId: string, slices: SessionSlice[]): number | null {
  const gaps: number[] = [];
  for (const slice of slices) {
    const row = slice.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!row) continue;
    const sets = slice.sets
      .filter((set) => set.workoutExerciseId === row.id && set.isCompleted && set.setType !== "warmup")
      .sort((a, b) => a.order - b.order);
    gaps.push(...restGaps(sets));
  }
  if (gaps.length < 4) return null;
  return Math.round(mean(gaps) / 15) * 15;
}

export function restPersonalitySeconds(exercise: Pick<Exercise, "equipment" | "movementPattern">, learned?: number | null) {
  if (learned && learned >= 45) return learned;
  if (exercise.movementPattern === "isolation" || exercise.movementPattern === "core") return 75;
  if (exercise.equipment === "barbell" && ["squat", "hinge", "horizontal push", "vertical pull"].includes(exercise.movementPattern)) {
    return 180;
  }
  if (exercise.equipment === "barbell") return 150;
  return 120;
}

export function buildLiftDna(
  exercise: Pick<Exercise, "id" | "name">,
  slices: SessionSlice[],
  formula: OneRepMaxFormula,
  excludeWarmups: boolean,
): LiftDna {
  const exposures = collectExposures(exercise.id, slices, formula, excludeWarmups);
  const notes: string[] = [];
  if (exposures.length < 3) {
    return {
      exerciseId: exercise.id,
      name: exercise.name,
      exposures: exposures.length,
      strongestReps: null,
      strongestRange: null,
      typicalProgressionG: null,
      personality: "mixed",
      personalityWhy: "Not enough history to call a personality.",
      bestWeekday: null,
      rpeDrift: null,
      exposuresBeforeJump: null,
      learnedRestSeconds: learnedRestSeconds(exercise.id, slices),
      notes: ["Log a few more exposures and the DNA fills in."],
    };
  }

  const byReps = new Map<number, number[]>();
  for (const row of exposures) {
    for (const set of row.working) {
      if (!set.reps || !set.weightG) continue;
      const estimate = estimateOneRepMax(set.weightG, set.reps, formula);
      if (!estimate) continue;
      const list = byReps.get(set.reps) ?? [];
      list.push(estimate.value);
      byReps.set(set.reps, list);
    }
  }
  let strongestReps: number | null = null;
  let strongestMean = 0;
  for (const [reps, values] of byReps) {
    if (values.length < 2) continue;
    const avg = mean(values);
    if (avg > strongestMean) {
      strongestMean = avg;
      strongestReps = reps;
    }
  }
  const strongestRange =
    strongestReps == null
      ? null
      : strongestReps <= 3
        ? "1–3"
        : strongestReps <= 6
          ? "4–6"
          : strongestReps <= 9
            ? "7–9"
            : "10–12";
  if (strongestRange) notes.push(`Best estimated 1RMs cluster around the ${strongestRange} range.`);

  let loadJumps = 0;
  let repJumps = 0;
  const loadDeltas: number[] = [];
  for (let i = 1; i < exposures.length; i += 1) {
    const prev = exposures[i - 1]!;
    const curr = exposures[i]!;
    const loadDelta = curr.bestWeightG - prev.bestWeightG;
    const prevReps = prev.working.reduce((max, set) => Math.max(max, set.reps ?? 0), 0);
    const currReps = curr.working.reduce((max, set) => Math.max(max, set.reps ?? 0), 0);
    if (loadDelta > 80) {
      loadJumps += 1;
      loadDeltas.push(loadDelta);
    } else if (currReps > prevReps && Math.abs(loadDelta) < 80) {
      repJumps += 1;
    }
  }
  let personality: ProgressionPersonality = "mixed";
  let personalityWhy = "Load jumps and rep jumps both show up in the log.";
  if (repJumps >= loadJumps + 2) {
    personality = "reps";
    personalityWhy = "This lift usually moves by adding reps at a load before the next jump.";
  } else if (loadJumps >= repJumps + 2) {
    personality = "load";
    personalityWhy = "This lift usually answers load jumps better than grinding extra reps.";
  }
  notes.push(personalityWhy);

  const weekdayMeans = new Map<string, number[]>();
  for (const row of exposures) {
    if (!row.bestE1rm) continue;
    const day = weekdayOf(row.date);
    const list = weekdayMeans.get(day) ?? [];
    list.push(row.bestE1rm);
    weekdayMeans.set(day, list);
  }
  let bestWeekday: string | null = null;
  let bestDayMean = 0;
  for (const [day, values] of weekdayMeans) {
    if (values.length < 2) continue;
    const avg = mean(values);
    if (avg > bestDayMean) {
      bestDayMean = avg;
      bestWeekday = day;
    }
  }
  if (bestWeekday) notes.push(`Stronger estimated 1RMs tend to land on ${bestWeekday}.`);

  const rpes = exposures.map((row) => row.avgRpe).filter((value): value is number => value != null);
  const rpeDrift =
    rpes.length >= 6 ? mean(rpes.slice(-3)) - mean(rpes.slice(0, 3)) : rpes.length >= 4 ? mean(rpes.slice(-2)) - mean(rpes.slice(0, 2)) : null;
  if (rpeDrift != null && Math.abs(rpeDrift) >= 0.3) {
    notes.push(
      rpeDrift > 0
        ? `RPE has drifted up ${rpeDrift.toFixed(1)} across the file.`
        : `RPE has drifted down ${Math.abs(rpeDrift).toFixed(1)} — same work is cheaper.`,
    );
  }

  let run = 1;
  const runs: number[] = [];
  for (let i = 1; i < exposures.length; i += 1) {
    if (Math.abs(exposures[i]!.bestWeightG - exposures[i - 1]!.bestWeightG) < 80) {
      run += 1;
    } else {
      if (exposures[i]!.bestWeightG > exposures[i - 1]!.bestWeightG && run >= 2) runs.push(run);
      run = 1;
    }
  }
  const exposuresBeforeJump = runs.length >= 2 ? Math.round(mean(runs)) : runs[0] ?? null;
  if (exposuresBeforeJump) notes.push(`Typical exposures at a load before a jump: ${exposuresBeforeJump}.`);

  const peak = [...exposures].sort((a, b) => b.bestE1rm - a.bestE1rm)[0];
  const typicalProgressionG = loadDeltas.length >= 2 ? Math.round(mean(loadDeltas)) : loadDeltas[0] ?? null;

  return {
    exerciseId: exercise.id,
    name: exercise.name,
    exposures: exposures.length,
    strongestReps,
    strongestRange,
    typicalProgressionG,
    personality,
    personalityWhy,
    bestWeekday,
    rpeDrift,
    exposuresBeforeJump,
    peakDate: peak?.date,
    peakE1rmG: peak?.bestE1rm,
    learnedRestSeconds: learnedRestSeconds(exercise.id, slices),
    notes,
  };
}
