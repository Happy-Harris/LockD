import type { MuscleGroup, SetType, WorkoutSet } from "./types";

export function isHardSet(set: WorkoutSet, excludeWarmups = true): boolean {
  if (!set.isCompleted) return false;
  if (excludeWarmups && set.setType === "warmup") return false;
  return true;
}

export function setTonnageG(set: WorkoutSet, excludeWarmups = true): number {
  if (!isHardSet(set, excludeWarmups)) return 0;
  if (set.setType === "warmup") return 0;
  const weight = set.weightG ?? 0;
  const reps = set.reps ?? 0;
  if (weight <= 0 || reps <= 0) return 0;
  return weight * reps;
}

export function sessionTonnageG(sets: readonly WorkoutSet[], excludeWarmups = true): number {
  return sets.reduce((sum, set) => sum + setTonnageG(set, excludeWarmups), 0);
}

export function hardSetCount(sets: readonly WorkoutSet[]): number {
  return sets.filter((set) => set.isCompleted && set.setType === "working").length;
}

export function countsForVolume(setType: SetType): boolean {
  return setType === "working" || setType === "drop" || setType === "failure";
}

export function attributeMuscleVolume(
  sets: readonly WorkoutSet[],
  primary: MuscleGroup,
  secondary: MuscleGroup[],
  secondaryCredit: number,
  excludeWarmups = true,
): Record<string, number> {
  const credit = Math.min(1, Math.max(0, secondaryCredit));
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
