import { elapsedSeconds } from "@/domain/time";
import type { SessionSlice } from "./analytics";
import { hardSetCount } from "@/domain/volume";
import { toGrams, type WeightUnit } from "@/domain/units";

export interface SearchHit {
  workoutId: string;
  name: string;
  date: string;
  why: string;
}

function minutesOf(slice: SessionSlice): number {
  return Math.round(elapsedSeconds(slice.workout.startedAt, slice.workout.endedAt, slice.workout.pausedSeconds) / 60);
}

/**
 * "above 100" means 100 in the lifter's display unit; "above 225 lb" or "above 100 kg" names its own and wins.
 */
export function searchSessions(query: string, slices: SessionSlice[], unit: WeightUnit = "kg"): SearchHit[] {
  const raw = query.trim().toLowerCase();
  if (raw.length < 2) return [];
  const above = raw.match(/above\s+(\d+(?:\.\d+)?)\s*(kg|lbs?)?\b/);
  const under = raw.match(/under\s+(\d+)\s*(min|minute)/);
  const rpeMatch = raw.match(/rpe\s*(\d+(?:\.\d+)?)/);
  const aboveUnit: WeightUnit = above?.[2] ? (above[2].startsWith("lb") ? "lb" : "kg") : unit;
  const minWeightG = above ? toGrams(Number(above[1]), aboveUnit) : null;
  const maxMin = under ? Number(under[1]) : null;
  const minRpe = rpeMatch ? Number(rpeMatch[1]) : null;
  const terms = raw
    .replace(/above\s+\d+(?:\.\d+)?\s*(kg|lbs?)?\b/g, "")
    .replace(/under\s+\d+\s*(min|minutes?)/g, "")
    .replace(/rpe\s*\d+(?:\.\d+)?/g, "")
    .replace(/\bkg\b|\blb\b|\bworkouts?\b|\bdays?\b|\bsessions?\b|\bwhere\b|\bwith\b/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const hits: SearchHit[] = [];
  for (const slice of [...slices].reverse()) {
    const hay = `${slice.workout.name} ${slice.exercises.map((row) => row.exerciseNameSnapshot).join(" ")}`.toLowerCase();
    if (terms.length && !terms.every((term) => hay.includes(term))) continue;
    const reasons: string[] = [];
    if (minWeightG != null) {
      const heavy = slice.sets.some((set) => (set.weightG ?? 0) >= minWeightG && set.isCompleted);
      if (!heavy) continue;
      reasons.push(`a set ≥ ${above![1]} ${aboveUnit}`);
    }
    if (maxMin != null) {
      if (minutesOf(slice) > maxMin) continue;
      reasons.push(`${minutesOf(slice)} min`);
    }
    if (minRpe != null) {
      const hot = slice.sets.some((set) => (set.rpe ?? 0) >= minRpe && set.isCompleted);
      if (!hot) continue;
      reasons.push(`RPE ${minRpe}+`);
    }
    if (!reasons.length) reasons.push(`${hardSetCount(slice.sets)} hard sets`);
    hits.push({
      workoutId: slice.workout.id,
      name: slice.workout.name,
      date: slice.workout.localDate,
      why: reasons.join(" · "),
    });
    if (hits.length >= 20) break;
  }
  return hits;
}
