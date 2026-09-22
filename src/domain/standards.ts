import { toGrams } from "./units";

export type StrengthBand = "untrained" | "novice" | "intermediate" | "advanced" | "elite";

export interface StrengthStandard {
  exerciseId: string;
  name: string;
  /** e1RM thresholds in grams at a 80 kg reference bodyweight. */
  bandsG: Record<StrengthBand, number>;
}

const REF_BODYWEIGHT_G = toGrams(80, "kg");

const BANDS: StrengthBand[] = ["untrained", "novice", "intermediate", "advanced", "elite"];

function kg(values: [number, number, number, number, number]): Record<StrengthBand, number> {
  return {
    untrained: toGrams(values[0], "kg"),
    novice: toGrams(values[1], "kg"),
    intermediate: toGrams(values[2], "kg"),
    advanced: toGrams(values[3], "kg"),
    elite: toGrams(values[4], "kg"),
  };
}

/** Absolute male-ish e1RM bands, scaled by bodyweight / 80 kg when a weight is on file. */
export const STRENGTH_STANDARDS: StrengthStandard[] = [
  { exerciseId: "seed-back-squat", name: "Back Squat", bandsG: kg([50, 80, 125, 170, 220]) },
  { exerciseId: "seed-front-squat", name: "Front Squat", bandsG: kg([40, 65, 100, 140, 180]) },
  { exerciseId: "seed-conventional-deadlift", name: "Conventional Deadlift", bandsG: kg([60, 100, 150, 205, 260]) },
  { exerciseId: "seed-sumo-deadlift", name: "Sumo Deadlift", bandsG: kg([60, 100, 150, 205, 260]) },
  { exerciseId: "seed-bench-press", name: "Bench Press", bandsG: kg([40, 60, 90, 125, 160]) },
  { exerciseId: "seed-incline-bench-press", name: "Incline Bench Press", bandsG: kg([35, 50, 75, 105, 135]) },
  { exerciseId: "seed-overhead-press", name: "Overhead Press", bandsG: kg([25, 40, 60, 85, 110]) },
  { exerciseId: "seed-barbell-row", name: "Barbell Row", bandsG: kg([40, 60, 90, 120, 150]) },
  { exerciseId: "seed-romanian-deadlift", name: "Romanian Deadlift", bandsG: kg([50, 80, 120, 160, 200]) },
];

export function scaleStandard(standard: StrengthStandard, bodyweightG?: number): Record<StrengthBand, number> {
  const factor = bodyweightG && bodyweightG > 0 ? bodyweightG / REF_BODYWEIGHT_G : 1;
  return {
    untrained: Math.round(standard.bandsG.untrained * factor),
    novice: Math.round(standard.bandsG.novice * factor),
    intermediate: Math.round(standard.bandsG.intermediate * factor),
    advanced: Math.round(standard.bandsG.advanced * factor),
    elite: Math.round(standard.bandsG.elite * factor),
  };
}

export function classifyE1rm(
  e1rmG: number,
  standard: StrengthStandard,
  bodyweightG?: number,
): { band: StrengthBand; next?: StrengthBand; progress: number } {
  const bands = scaleStandard(standard, bodyweightG);
  let band: StrengthBand = "untrained";
  for (const name of BANDS) {
    if (e1rmG >= bands[name]) band = name;
  }
  const index = BANDS.indexOf(band);
  const next = BANDS[index + 1];
  const floor = bands[band];
  const ceil = next ? bands[next] : floor * 1.12;
  const progress = ceil === floor ? 1 : Math.min(1, Math.max(0, (e1rmG - floor) / (ceil - floor)));
  return { band, next, progress };
}

export function findStandard(exerciseId: string): StrengthStandard | undefined {
  return STRENGTH_STANDARDS.find((row) => row.exerciseId === exerciseId);
}

export function bandLabel(band: StrengthBand): string {
  return band.charAt(0).toUpperCase() + band.slice(1);
}
