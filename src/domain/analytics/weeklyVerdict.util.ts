import { fromGrams, type WeightUnit } from "@/domain/units";

export function formatWeight(grams: number, unit: WeightUnit): string {
  const value = fromGrams(grams, unit);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

export function plural(value: number, singular: string): string {
  return value === 1 ? singular : `${singular}s`;
}

export function formatMetric(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}
