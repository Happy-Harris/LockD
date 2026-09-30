import { localDateToOrdinal } from "@/domain/time";
import type { OneRepMaxFormula } from "@/domain/types";
import type { WeightUnit } from "@/domain/units";
import { hardSetCount } from "@/domain/volume";
import { computeRecords, sliceSessions, type SessionSlice } from "@/lib/gym/analytics";
import { buildChronicle, type Chronicle } from "@/lib/gym/chronicle";
import { summariseChronicle, type ChronicleSummary } from "@/lib/gym/chronicle-summary";
import { seedExercises } from "@/lib/gym/seed";
import { applyImportBatch, buildImportBatch } from "@/lib/import/batch";
import { analyseCsv, type ImportAnalysis, type SourceProfile } from "@/lib/import/engine";
import { GENERIC_PROFILE } from "@/lib/import/generic";
import { HEVY_PROFILE } from "@/lib/import/hevy";
import { STRONG_PROFILE } from "@/lib/import/strong";

/**
 * Opp 2, the web receipt: someone drops an export on the site and reads their training life back
 * without an account. Everything here runs on the device. The file is read into a throwaway log
 * (seed exercises plus the file), never the lifter's own store, and nothing is sent anywhere.
 * "Continue in Lock'd" hands the same analysis to the guest store's normal import.
 */

/** Read in this order; the first that finds a date and an exercise column wins. */
const PROFILES: SourceProfile[] = [STRONG_PROFILE, HEVY_PROFILE, GENERIC_PROFILE];

/** The receipt names this many lifts, the ones logged in the most sessions. */
export const RECEIPT_TOP_LIFTS = 3;

export type ReadExport =
  | { ok: true; analysis: ImportAnalysis; source: SourceProfile }
  | { ok: false; errors: string[] };

/**
 * Reads a Strong, Hevy or plain CSV export. `unit` is the lifter's choice for a file whose header
 * does not say kg or lb; a header that says wins.
 */
export function readExport(text: string, unit: WeightUnit = "kg"): ReadExport {
  if (!text.trim()) return { ok: false, errors: ["That file is empty."] };
  for (const profile of PROFILES) {
    const analysis = analyseCsv(text, profile, { unit });
    if (analysis.missingRequired.length === 0 && analysis.workouts.length > 0) {
      return { ok: true, analysis, source: profile };
    }
  }
  return {
    ok: false,
    errors: [
      "No date and exercise columns were found, so no sessions could be read.",
      "Strong and Hevy exports read as they are. For another spreadsheet, open Lock’d and use Import, where you choose the columns.",
    ],
  };
}

/** The file as sessions, in a log of its own: seed exercises plus the file, nothing else. */
export function previewSlices(
  analysis: ImportAnalysis,
  source: Pick<SourceProfile, "id" | "label">,
  fileName: string,
): SessionSlice[] {
  const exercises = seedExercises(new Date().toISOString());
  const batch = buildImportBatch(analysis, {
    source,
    fileName,
    existingExercises: exercises,
    existingFingerprints: new Set(),
    existingTemplates: [],
    existingMeasurements: [],
  });
  const log = applyImportBatch(
    { exercises, workouts: [], workoutExercises: [], workoutSets: [] },
    batch,
  );
  return sliceSessions(log.workouts, log.workoutExercises, log.workoutSets);
}

export interface ReceiptLift {
  name: string;
  sessions: number;
  /** Best estimated one-rep max, and the set it came from. */
  e1rmG: number;
  weightG: number;
  reps: number;
  date: string;
}

export interface LifetimeReceipt {
  firstDate: string;
  lastDate: string;
  sessions: number;
  hardSets: number;
  lifts: number;
  /** Every calendar year from the first session to the last, empty years included. */
  years: Array<{ year: number; sessions: number }>;
  /** The year or years with the most sessions; a tie names them all. */
  busiestYears: { years: number[]; sessions: number };
  longestGap?: { days: number; from: string; to: string };
  /** Read off the Chronicle, so the receipt and the Chronicle count the same eras and layoffs. */
  chronicle: ChronicleSummary;
  /** The most-logged lifts that have a weight and reps to estimate from. */
  topLifts: ReceiptLift[];
  formula: OneRepMaxFormula;
}

/** The whole record on one receipt. Undefined when there are no sessions. */
export function buildLifetimeReceipt(
  slices: SessionSlice[],
  chronicle: Chronicle,
  formula: OneRepMaxFormula,
): LifetimeReceipt | undefined {
  const summary = summariseChronicle(chronicle);
  if (slices.length === 0 || !summary) return undefined;
  const dates = slices.map((slice) => slice.workout.localDate).sort();
  const firstDate = dates[0]!;
  const lastDate = dates[dates.length - 1]!;

  const perYear = new Map<number, number>();
  for (const date of dates) {
    const year = Number(date.slice(0, 4));
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
  }
  const years: LifetimeReceipt["years"] = [];
  for (let year = Number(firstDate.slice(0, 4)); year <= Number(lastDate.slice(0, 4)); year += 1) {
    years.push({ year, sessions: perYear.get(year) ?? 0 });
  }
  const most = Math.max(...years.map((row) => row.sessions));
  const busiestYears = {
    years: years.filter((row) => row.sessions === most).map((row) => row.year),
    sessions: most,
  };

  let longestGap: LifetimeReceipt["longestGap"];
  for (let i = 1; i < dates.length; i += 1) {
    const days = localDateToOrdinal(dates[i]!) - localDateToOrdinal(dates[i - 1]!);
    if (days > (longestGap?.days ?? 0)) longestGap = { days, from: dates[i - 1]!, to: dates[i]! };
  }

  const sessionsPerLift = new Map<string, number>();
  for (const slice of slices) {
    for (const id of new Set(slice.exercises.map((row) => row.exerciseId))) {
      sessionsPerLift.set(id, (sessionsPerLift.get(id) ?? 0) + 1);
    }
  }
  const topLifts = computeRecords(slices, formula, true)
    .filter((row) => row.kind === "e1rm" && row.weightG !== undefined && row.reps !== undefined)
    .map((row) => ({
      name: row.exerciseName,
      sessions: sessionsPerLift.get(row.exerciseId) ?? 0,
      e1rmG: row.value,
      weightG: row.weightG!,
      reps: row.reps!,
      date: row.date,
    }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
    .slice(0, RECEIPT_TOP_LIFTS);

  return {
    firstDate,
    lastDate,
    sessions: slices.length,
    hardSets: slices.reduce((sum, slice) => sum + hardSetCount(slice.sets), 0),
    lifts: sessionsPerLift.size,
    years,
    busiestYears,
    longestGap,
    chronicle: summary,
    topLifts,
    formula,
  };
}

/** File text to receipt, in one step: what the page shows. */
export function receiptFromExport(
  text: string,
  fileName: string,
  unit: WeightUnit = "kg",
  formula: OneRepMaxFormula = "epley",
):
  | { ok: true; receipt: LifetimeReceipt; analysis: ImportAnalysis; source: SourceProfile }
  | { ok: false; errors: string[] } {
  const read = readExport(text, unit);
  if (!read.ok) return read;
  const slices = previewSlices(read.analysis, read.source, fileName);
  const receipt = buildLifetimeReceipt(slices, buildChronicle(slices, formula, [], []), formula);
  if (!receipt) return { ok: false, errors: ["The file has no completed sessions to read."] };
  return { ok: true, receipt, analysis: read.analysis, source: read.source };
}
