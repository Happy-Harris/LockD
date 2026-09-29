import type {
  Equipment,
  MeasurementMetric,
  MovementPattern,
  MuscleGroup,
  SetType,
  TrackingType,
} from "./types";

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "chest",
  "back",
  "lats",
  "traps",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "adductors",
  "abductors",
  "core",
  "neck",
  "full body",
  "cardio",
];

export const HEATMAP_MUSCLES: MuscleGroup[] = [
  "chest",
  "lats",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "traps",
];

export const EQUIPMENT: Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "smith machine",
  "plate",
  "other",
];

export const MOVEMENT_PATTERNS: MovementPattern[] = [
  "squat",
  "hinge",
  "horizontal push",
  "vertical push",
  "horizontal pull",
  "vertical pull",
  "lunge",
  "carry",
  "isolation",
  "core",
  "conditioning",
];

export const TRACKING_TYPES: Array<{ value: TrackingType; label: string; hint: string }> = [
  { value: "weight_reps", label: "Weight & reps", hint: "Barbell, dumbbell and machine work." },
  { value: "reps_only", label: "Reps only", hint: "Bodyweight work such as pull-ups." },
  { value: "duration", label: "Duration", hint: "Timed holds such as planks." },
  { value: "distance_duration", label: "Distance & time", hint: "Rowing, running, carries." },
  { value: "assisted_weight", label: "Assisted", hint: "Assistance load; excluded from tonnage." },
];

export const SET_TYPES: Array<{ value: SetType; label: string; short: string }> = [
  { value: "warmup", label: "Warm-up", short: "WU" },
  { value: "working", label: "Working", short: "WK" },
  { value: "drop", label: "Drop set", short: "DS" },
  { value: "failure", label: "To failure", short: "F" },
];

export const MEASUREMENT_METRICS: Array<{
  value: MeasurementMetric;
  label: string;
  kind: "mass" | "length";
}> = [
  { value: "bodyweight", label: "Body weight", kind: "mass" },
  { value: "neck", label: "Neck", kind: "length" },
  { value: "shoulders", label: "Shoulders", kind: "length" },
  { value: "chest", label: "Chest", kind: "length" },
  { value: "waist", label: "Waist", kind: "length" },
  { value: "hips", label: "Hips", kind: "length" },
  { value: "arm_left", label: "Left arm", kind: "length" },
  { value: "arm_right", label: "Right arm", kind: "length" },
  { value: "thigh_left", label: "Left thigh", kind: "length" },
  { value: "thigh_right", label: "Right thigh", kind: "length" },
  { value: "calf_left", label: "Left calf", kind: "length" },
  { value: "calf_right", label: "Right calf", kind: "length" },
  { value: "arms", label: "Arms (side not recorded)", kind: "length" },
  { value: "thighs", label: "Thighs (side not recorded)", kind: "length" },
  { value: "calves", label: "Calves (side not recorded)", kind: "length" },
];

export function metricLabel(metric: MeasurementMetric): string {
  return MEASUREMENT_METRICS.find((entry) => entry.value === metric)?.label ?? metric;
}

export function metricKind(metric: MeasurementMetric): "mass" | "length" {
  return metric === "bodyweight" ? "mass" : "length";
}

export function titleCase(value: string): string {
  return value.replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

export function setTypeLabel(setType: SetType): string {
  return SET_TYPES.find((entry) => entry.value === setType)?.label ?? setType;
}

export function trackingLabel(tracking: TrackingType): string {
  return TRACKING_TYPES.find((entry) => entry.value === tracking)?.label ?? tracking;
}

export function usesWeight(tracking: TrackingType): boolean {
  return tracking === "weight_reps" || tracking === "assisted_weight";
}

export function usesReps(tracking: TrackingType): boolean {
  return tracking === "weight_reps" || tracking === "reps_only" || tracking === "assisted_weight";
}

export function usesDuration(tracking: TrackingType): boolean {
  return tracking === "duration" || tracking === "distance_duration";
}

export function usesDistance(tracking: TrackingType): boolean {
  return tracking === "distance_duration";
}
