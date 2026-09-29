import type { MuscleGroup, SetType, TrackingType, WorkoutExercise, WorkoutSet } from "./types";

/**
 * Volume / tonnage rules (mirrored in the in-app help text):
 *
 *  - **External-load volume** = weight x reps, summed over eligible completed sets.
 *  - Eligible sets are completed sets of `weight_reps` exercises with a positive load and
 *    at least one rep. Warm-ups are excluded unless the caller opts in.
 *  - `reps_only` (bodyweight), `duration`, and `distance_duration` exercises carry **no**
 *    external load, so they contribute 0 tonnage. They are counted separately as
 *    `repsOnlySets` / `durationSeconds` / `distanceM` rather than silently inflating volume.
 *  - `assisted_weight` sets record the assistance, not the load lifted, so they are
 *    excluded from tonnage entirely and reported as `assistedSets`.
 *  - Muscle attribution is a *different* measure: the primary muscle receives 1.0 of a
 *    set's volume and each secondary muscle a configurable fraction (default 0.5). The sum
 *    of attributed volume therefore exceeds total tonnage by design — it is always
 *    labelled "attributed volume", never tonnage, and it never feeds the overall total.
 *
 * Three different set counts exist on purpose; know which one you are calling:
 *
 *  | Measure                  | Counts                                  | Used for                        |
 *  |--------------------------|-----------------------------------------|---------------------------------|
 *  | `hardSetCount`           | completed `working` sets only           | verdict direction, eras, the "Hard sets" on a receipt |
 *  | `completedSetCount`      | every completed non-warm-up set         | the "Sets" a lifter counts, in history |
 *  | `countsForVolume`        | working + drop + failure (not warm-up) | recovery, `attributeMuscleVolume` |
 *  | tonnage (`totalsForGroups`) | every completed non-warm-up `weight_reps` set, drop and failure included | tonnage |
 *
 * Strong-Pro makes the same split in code (docs/analytics.md there is inconsistent about it).
 * Decided: history's plain "Sets" counts everything a lifter did after warming up
 * (`completedSetCount`), while the verdict, eras and the receipt's "Hard sets" stay working-only.
 * A count is never shown under a label that promises more than it counts.
 */

export const DEFAULT_SECONDARY_CREDIT = 0.5;

export interface VolumeOptions {
  includeWarmups?: boolean;
}

export interface VolumeTotals {
  /** Total external load moved, in gram-reps (grams x reps). */
  volumeG: number;
  completedSets: number;
  totalReps: number;
  repsOnlySets: number;
  assistedSets: number;
  durationSeconds: number;
  distanceM: number;
}

export function emptyTotals(): VolumeTotals {
  return {
    volumeG: 0,
    completedSets: 0,
    totalReps: 0,
    repsOnlySets: 0,
    assistedSets: 0,
    durationSeconds: 0,
    distanceM: 0,
  };
}

export function isVolumeEligible(
  set: WorkoutSet,
  trackingType: TrackingType,
  options: VolumeOptions = {},
): boolean {
  if (!set.isCompleted) return false;
  if (!options.includeWarmups && set.setType === "warmup") return false;
  if (trackingType !== "weight_reps") return false;
  return (set.weightG ?? 0) > 0 && (set.reps ?? 0) > 0;
}

/** Volume contributed by a single set, in gram-reps. Returns 0 for ineligible sets. */
export function setVolumeG(
  set: WorkoutSet,
  trackingType: TrackingType,
  options: VolumeOptions = {},
): number {
  if (!isVolumeEligible(set, trackingType, options)) return 0;
  return (set.weightG ?? 0) * (set.reps ?? 0);
}

export function accumulate(
  totals: VolumeTotals,
  set: WorkoutSet,
  trackingType: TrackingType,
  options: VolumeOptions = {},
): VolumeTotals {
  if (!set.isCompleted) return totals;
  if (!options.includeWarmups && set.setType === "warmup") return totals;

  totals.completedSets += 1;
  totals.totalReps += set.reps ?? 0;
  totals.durationSeconds += set.durationSeconds ?? 0;
  totals.distanceM += set.distanceM ?? 0;

  if (trackingType === "assisted_weight") {
    totals.assistedSets += 1;
    return totals;
  }
  if (trackingType === "reps_only") {
    totals.repsOnlySets += 1;
    return totals;
  }
  totals.volumeG += setVolumeG(set, trackingType, options);
  return totals;
}

export interface ExerciseSetGroup {
  exercise: Pick<
    WorkoutExercise,
    | "exerciseId"
    | "trackingTypeSnapshot"
    | "primaryMuscleGroupSnapshot"
    | "secondaryMuscleGroupsSnapshot"
    | "exerciseNameSnapshot"
  >;
  sets: readonly WorkoutSet[];
}

/** Totals for a workout (or any collection of exercise groups). Never double-counts a set. */
export function totalsForGroups(
  groups: readonly ExerciseSetGroup[],
  options: VolumeOptions = {},
): VolumeTotals {
  const totals = emptyTotals();
  const seen = new Set<string>();
  for (const group of groups) {
    for (const set of group.sets) {
      if (seen.has(set.id)) continue;
      seen.add(set.id);
      accumulate(totals, set, group.exercise.trackingTypeSnapshot, options);
    }
  }
  return totals;
}

export interface MuscleAttribution {
  muscle: MuscleGroup;
  /** Attributed volume in gram-reps. Not a literal tonnage — see module docs. */
  attributedVolumeG: number;
  /** Attributed number of sets using the same credit weighting. */
  attributedSets: number;
}

export function attributeVolumeByMuscle(
  groups: readonly ExerciseSetGroup[],
  options: VolumeOptions & { secondaryCredit?: number } = {},
): MuscleAttribution[] {
  const credit = clampCredit(options.secondaryCredit ?? DEFAULT_SECONDARY_CREDIT);
  const map = new Map<MuscleGroup, MuscleAttribution>();
  const add = (muscle: MuscleGroup, volume: number, sets: number) => {
    const existing = map.get(muscle) ?? { muscle, attributedVolumeG: 0, attributedSets: 0 };
    existing.attributedVolumeG += volume;
    existing.attributedSets += sets;
    map.set(muscle, existing);
  };

  const seen = new Set<string>();
  for (const group of groups) {
    const { primaryMuscleGroupSnapshot, secondaryMuscleGroupsSnapshot, trackingTypeSnapshot } =
      group.exercise;
    for (const set of group.sets) {
      if (seen.has(set.id)) continue;
      seen.add(set.id);
      if (!set.isCompleted) continue;
      if (!options.includeWarmups && set.setType === "warmup") continue;
      const volume = setVolumeG(set, trackingTypeSnapshot, options);
      add(primaryMuscleGroupSnapshot, volume, 1);
      const secondaries = new Set(
        secondaryMuscleGroupsSnapshot.filter((m) => m !== primaryMuscleGroupSnapshot),
      );
      for (const muscle of secondaries) add(muscle, volume * credit, credit);
    }
  }

  return [...map.values()].sort(
    (a, b) => b.attributedVolumeG - a.attributedVolumeG || a.muscle.localeCompare(b.muscle),
  );
}

export function clampCredit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SECONDARY_CREDIT;
  return Math.min(1, Math.max(0, value));
}

/** ISO week key (`2026-W07`) used for weekly aggregation; weeks start Monday. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = d.getUTCDay() || 7; // Sunday -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Month key (`2026-02`) used for monthly aggregation. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Completed `working` sets. Drop and failure sets are deliberately not "hard sets" here. */
export function hardSetCount(sets: readonly WorkoutSet[]): number {
  return sets.filter((set) => set.isCompleted && set.setType === "working").length;
}

/** Every completed set except warm-ups, of any tracking type: the "sets" a lifter would count. */
export function completedSetCount(sets: readonly WorkoutSet[]): number {
  return sets.filter((set) => set.isCompleted && set.setType !== "warmup").length;
}

/** Set types that add to per-muscle volume and count as training a muscle (never warm-ups). */
export function countsForVolume(setType: SetType): boolean {
  return setType === "working" || setType === "drop" || setType === "failure";
}

/**
 * Sets credited to muscles for one exercise: the primary muscle gets 1 per counted set, each
 * secondary `secondaryCredit` per set. Counts sets, not load; see the table above for which
 * set types count.
 */
export function attributeMuscleVolume(
  sets: readonly WorkoutSet[],
  primary: MuscleGroup,
  secondary: MuscleGroup[],
  secondaryCredit: number,
  excludeWarmups = true,
): Record<string, number> {
  const credit = clampCredit(secondaryCredit);
  const result: Record<string, number> = {};
  let workingSets = 0;
  for (const set of sets) {
    if (!set.isCompleted) continue;
    if (excludeWarmups && set.setType === "warmup") continue;
    if (!countsForVolume(set.setType)) continue;
    workingSets += 1;
  }
  if (workingSets === 0) return result;
  result[primary] = (result[primary] ?? 0) + workingSets;
  for (const muscle of secondary) {
    result[muscle] = (result[muscle] ?? 0) + workingSets * credit;
  }
  return result;
}
