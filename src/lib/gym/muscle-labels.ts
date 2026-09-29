import type { MuscleSetInsight } from "@/domain/analytics/muscleSets";

export function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function stateLabel(row: Pick<MuscleSetInsight, "state">): string {
  if (row.state === "in_range") return "In range";
  if (row.state === "below") return "Below";
  if (row.state === "above") return "Above";
  if (row.state === "unmapped") return "Unmapped";
  return "Target not set";
}
