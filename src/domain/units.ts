import type { UnitSystem } from "./types";

export const GRAMS_PER_KG = 1000;
export const GRAMS_PER_LB = 453.59237;
export const MM_PER_CM = 10;
export const MM_PER_INCH = 25.4;

export type WeightUnit = "kg" | "lb";
export type LengthUnit = "cm" | "in";

export function weightUnitFor(system: UnitSystem): WeightUnit {
  return system === "metric" ? "kg" : "lb";
}

export function lengthUnitFor(system: UnitSystem): LengthUnit {
  return system === "metric" ? "cm" : "in";
}

export function toGrams(value: number, unit: WeightUnit): number {
  if (!Number.isFinite(value)) return 0;
  const grams = unit === "kg" ? value * GRAMS_PER_KG : value * GRAMS_PER_LB;
  return Math.round(grams);
}

export function fromGrams(grams: number, unit: WeightUnit): number {
  if (!Number.isFinite(grams)) return 0;
  return unit === "kg" ? grams / GRAMS_PER_KG : grams / GRAMS_PER_LB;
}

export function formatWeight(grams: number, unit: WeightUnit, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 2;
  const value = fromGrams(grams, unit);
  const rounded = roundTo(value, decimals);
  return trimNumber(rounded);
}

export function formatWeightWithUnit(grams: number, unit: WeightUnit): string {
  return `${formatWeight(grams, unit)} ${unit}`;
}

export function toMillimetres(value: number, unit: LengthUnit): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(unit === "cm" ? value * MM_PER_CM : value * MM_PER_INCH);
}

export function fromMillimetres(mm: number, unit: LengthUnit): number {
  if (!Number.isFinite(mm)) return 0;
  return unit === "cm" ? mm / MM_PER_CM : mm / MM_PER_INCH;
}

export function formatLength(mm: number, unit: LengthUnit, decimals = 1): string {
  return trimNumber(roundTo(fromMillimetres(mm, unit), decimals));
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value || 1)) * factor) / factor;
}

const groupedNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 6,
  useGrouping: true,
});

export function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Object.is(value, -0)) return "0";
  return groupedNumberFormatter.format(parseFloat(value.toFixed(6)));
}

const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return countFormatter.format(Math.round(value));
}

export function formatCompactNumber(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits,
  }).format(value);
}

export function roundGramsToIncrement(
  grams: number,
  incrementG: number,
  mode: "nearest" | "down" | "up" = "nearest",
): number {
  if (incrementG <= 0) return Math.round(grams);
  const ratio = grams / incrementG;
  const steps =
    mode === "down" ? Math.floor(ratio + 1e-9) : mode === "up" ? Math.ceil(ratio - 1e-9) : Math.round(ratio);
  return Math.round(steps * incrementG);
}

export function defaultQuickIncrementG(system: UnitSystem): number {
  return system === "metric" ? toGrams(2.5, "kg") : toGrams(5, "lb");
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDurationLong(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function formatDistance(metres: number, system: UnitSystem): string {
  if (system === "metric") {
    return metres >= 1000 ? `${trimNumber(roundTo(metres / 1000, 2))} km` : `${Math.round(metres)} m`;
  }
  const miles = metres / 1609.344;
  return miles >= 0.1
    ? `${trimNumber(roundTo(miles, 2))} mi`
    : `${Math.round(metres * 1.09361)} yd`;
}

export function parseWeightInput(raw: string, unit: WeightUnit): number | undefined {
  const cleaned = raw.replace(",", ".").trim();
  if (!cleaned) return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return toGrams(value, unit);
}
