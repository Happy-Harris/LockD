import type { SetType } from "@/domain/types";
import {
  analyseCsv,
  type AnalyseOptions,
  type ImportAnalysis,
  type SetInterpretation,
  type SourceProfile,
} from "./engine";

/**
 * Strong's CSV export. The file is the one a lifter exports from the Strong app themselves. Column
 * names have varied across versions and languages, so headers are matched against a list of known
 * spellings, and anything unmatched can be mapped by hand. "Strong" is named only as the source.
 */

/** Set-type words across the exports seen so far. */
export function setTypeFromWord(word: string): { type: SetType; unsupported?: string } {
  const value = word.trim().toLowerCase();
  if (!value || value === "normal" || value === "working" || value === "work")
    return { type: "working" };
  if (value.includes("warm")) return { type: "warmup" };
  if (value.includes("fail")) return { type: "failure" };
  if (value.includes("drop")) return { type: "drop" };
  return { type: "working", unsupported: word.trim() };
}

function interpretStrongSet(setOrder: string, setType: string): SetInterpretation {
  // Strong writes a number for a normal set, W, F or D for a warm-up, failure or drop set, and
  // puts other rows (a rest timer, say) in the same column.
  if (setOrder && !/^\d+$/.test(setOrder)) {
    const letter = setOrder.toLowerCase();
    if (letter === "w" || letter.startsWith("warm")) return { kind: "set", type: "warmup" };
    if (letter === "f") return { kind: "set", type: "failure" };
    if (letter === "d") return { kind: "set", type: "drop" };
    return { kind: "skip", reason: `Skipped a row that is not a set ("${setOrder}").` };
  }
  return { kind: "set", ...setTypeFromWord(setType) };
}

export const STRONG_PROFILE: SourceProfile = {
  id: "strong-csv",
  label: "a Strong CSV",
  aliases: {
    date: ["date", "workout_date", "start_time", "datum", "fecha"],
    endTime: [],
    workoutName: ["workout_name", "workout", "name", "training", "entrenamiento"],
    duration: ["duration", "workout_duration", "dauer"],
    exerciseName: ["exercise_name", "exercise", "ubung", "ejercicio"],
    setOrder: ["set_order", "set", "set_number", "set_index"],
    weight: ["weight", "weight_kg", "weight_lbs", "weight_lb", "gewicht", "peso"],
    reps: ["reps", "repetitions", "wiederholungen", "repeticiones"],
    distance: ["distance", "distance_m", "distance_km", "distance_miles"],
    seconds: ["seconds", "time", "duration_seconds"],
    rpe: ["rpe", "rate_of_perceived_exertion"],
    setNotes: ["notes", "set_notes", "note"],
    workoutNotes: ["workout_notes", "session_notes"],
    exerciseNotes: ["exercise_notes"],
    superset: ["superset", "superset_group", "superset_id"],
    setType: ["set_type", "type"],
  },
  required: ["date", "exerciseName"],
  interpretSet: interpretStrongSet,
};

export function analyseStrongCsv(text: string, options: AnalyseOptions = {}): ImportAnalysis {
  return analyseCsv(text, STRONG_PROFILE, options);
}
