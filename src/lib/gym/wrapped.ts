import { localDateToOrdinal } from "@/domain/time";
import type { BodyMeasurement, OneRepMaxFormula } from "@/domain/types";
import type { WeightUnit } from "@/domain/units";
import { hardSetCount } from "@/domain/volume";
import { computeRecords, type SessionSlice } from "./analytics";
import type { TrainingEra } from "./chronicle";
import { detectMilestones } from "./moments";

export interface YearReceipt {
  year: number;
  sessions: number;
  hardSets: number;
  uniqueLifts: number;
  longestLayoffDays: number;
  topLift?: { name: string; e1rmG: number };
  firsts: string[];
  eras: string[];
  busiestMonth: string;
  comeback?: string;
  bodyDelta?: { from: number; to: number };
}

export function availableYears(slices: SessionSlice[]): number[] {
  const years = new Set(slices.map((slice) => Number(slice.workout.localDate.slice(0, 4))));
  return [...years].sort((a, b) => b - a);
}

export function buildYearReceipt(
  year: number,
  slices: SessionSlice[],
  eras: TrainingEra[],
  measurements: BodyMeasurement[],
  formula: OneRepMaxFormula,
  unit: WeightUnit = "kg",
): YearReceipt {
  const inYear = slices.filter((slice) => slice.workout.localDate.startsWith(String(year)));
  const hardSets = inYear.reduce((sum, slice) => sum + hardSetCount(slice.sets), 0);
  const lifts = new Set(inYear.flatMap((slice) => slice.exercises.map((row) => row.exerciseId)));
  let longest = 0;
  for (let i = 1; i < inYear.length; i += 1) {
    const days =
      localDateToOrdinal(inYear[i]!.workout.localDate) - localDateToOrdinal(inYear[i - 1]!.workout.localDate);
    longest = Math.max(longest, days);
  }
  const records = computeRecords(inYear, formula, true).filter((row) => row.kind === "e1rm");
  const top = records[0];
  const firsts = detectMilestones(inYear, unit).map((moment) => moment.title);
  const eraNames = eras.filter((era) => era.startDate.startsWith(String(year)) || era.endDate.startsWith(String(year))).map((era) => era.name);
  const months = new Map<string, number>();
  for (const slice of inYear) {
    const key = slice.workout.localDate.slice(0, 7);
    months.set(key, (months.get(key) ?? 0) + 1);
  }
  const busiest = [...months.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `${year}-01`;
  const comeback = inYear.find((slice, index) => {
    if (index === 0) return false;
    return localDateToOrdinal(slice.workout.localDate) - localDateToOrdinal(inYear[index - 1]!.workout.localDate) >= 14;
  });
  const body = measurements.filter((row) => row.metric === "bodyweight" && row.localDate.startsWith(String(year)));
  const bodyDelta =
    body.length >= 2
      ? { from: body[0]!.value, to: body[body.length - 1]!.value }
      : undefined;

  return {
    year,
    sessions: inYear.length,
    hardSets,
    uniqueLifts: lifts.size,
    longestLayoffDays: longest,
    topLift: top ? { name: top.exerciseName, e1rmG: top.value } : undefined,
    firsts,
    eras: [...new Set(eraNames)],
    busiestMonth: busiest,
    comeback: comeback?.workout.localDate,
    bodyDelta,
  };
}
