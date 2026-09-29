import type { SetType } from "@/domain/types";
import {
  analyseCsv,
  type AnalyseOptions,
  type ImportAnalysis,
  type SetInterpretation,
  type SourceProfile,
} from "./engine";

/**
 * A CSV exported from Hevy. The column layout comes from two synthetic sample files; Hevy's help
 * article on exporting does not publish a full schema, so this is checked against those samples
 * only and has not been validated against a real export. "Hevy" is named only as the source.
 *
 * Columns: title, start_time, end_time, description, exercise_title, superset_id, exercise_notes,
 * set_index, set_type, weight_kg or weight_lbs, reps, distance_km or distance_miles,
 * duration_seconds, rpe.
 */

/** The set types Hevy writes, each mapped on purpose. Anything else is reported, not guessed. */
const SET_TYPES: Record<string, SetType> = {
  normal: "working",
  warmup: "warmup",
  failure: "failure",
  dropset: "drop",
};

function interpretHevySet(_setIndex: string, setType: string): SetInterpretation {
  const word = setType.trim().toLowerCase();
  // A blank type is a normal set: the column is empty, not unsupported.
  if (!word) return { kind: "set", type: "working" };
  const mapped = SET_TYPES[word];
  if (mapped) return { kind: "set", type: mapped };
  return { kind: "set", type: "working", unsupported: setType.trim() };
}

export const HEVY_PROFILE: SourceProfile = {
  id: "hevy-csv",
  label: "a Hevy CSV",
  aliases: {
    date: ["start_time"],
    endTime: ["end_time"],
    workoutName: ["title"],
    duration: [],
    exerciseName: ["exercise_title"],
    setOrder: ["set_index"],
    weight: ["weight_kg", "weight_lbs"],
    reps: ["reps"],
    distance: ["distance_km", "distance_miles"],
    seconds: ["duration_seconds"],
    rpe: ["rpe"],
    setNotes: [],
    workoutNotes: ["description"],
    exerciseNotes: ["exercise_notes"],
    superset: ["superset_id"],
    setType: ["set_type"],
  },
  required: ["date", "exerciseName"],
  zeroWeightIsMissing: true,
  interpretSet: interpretHevySet,
};

export function analyseHevyCsv(text: string, options: AnalyseOptions = {}): ImportAnalysis {
  return analyseCsv(text, HEVY_PROFILE, options);
}
