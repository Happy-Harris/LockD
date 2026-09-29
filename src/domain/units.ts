import type { UnitSystem } from "./types";

/**
 * Unit conversion. Mass is stored canonically in grams and length in millimetres so that
 * repeated kg <-> lb round trips never drift: only the display layer sees fractional units.
 */

export const GRAMS_PER_KG = 1000;
/** International avoirdupois pound. */
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

/** Convert a display weight to canonical grams, rounded to the nearest gram. */
export function toGrams(value: number, unit: WeightUnit): number {
  if (!Number.isFinite(value)) return 0;
  const grams = unit === "kg" ? value * GRAMS_PER_KG : value * GRAMS_PER_LB;
  return Math.round(grams);
}

/** Convert canonical grams to a display weight (unrounded). */
export function fromGrams(grams: number, unit: WeightUnit): number {
  if (!Number.isFinite(grams)) return 0;
  return unit === "kg" ? grams / GRAMS_PER_KG : grams / GRAMS_PER_LB;
}

/**
 * Display weight rounded for humans: 2 decimals max, trailing zeros trimmed.
 * 2.5 kg stays "2.5"; 45 lb stays "45"; 60 kg shown in lb becomes "132.28".
 */
export function formatWeight(
  grams: number,
  unit: WeightUnit,
  opts?: { decimals?: number },
): string {
  const decimals = opts?.decimals ?? 2;
  const value = fromGrams(grams, unit);
  const rounded = roundTo(value, decimals);
  return trimNumber(rounded);
}

/**
 * Display weight for an editable input: no digit grouping, so "1000" is never shown as "1,000" and read back
 * as 1 (or 1.000 as 1 in de-DE). Same rounding as formatWeight.
 */
export function formatWeightInput(grams: number, unit: WeightUnit): string {
  const value = roundTo(fromGrams(grams, unit), 2);
  return Object.is(value, -0) || !Number.isFinite(value) ? "0" : String(value);
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
  // Epsilon nudge keeps values such as 1.005 from rounding down due to float representation.
  return Math.round((value + Number.EPSILON * Math.sign(value || 1)) * factor) / factor;
}

/** Locale-aware grouping (1,234.5) shared by every place a rounded number is displayed. */
const groupedNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 6,
  useGrouping: true,
});

export function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Object.is(value, -0)) return "0";
  // toFixed(6) first strips float artefacts (e.g. 1.0000000001) before grouping.
  return groupedNumberFormatter.format(parseFloat(value.toFixed(6)));
}

/** Locale-formatted whole-number count (sets, reps, workouts) — e.g. "13,319". */
const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return countFormatter.format(Math.round(value));
}

/** Compact display for large analytics values, e.g. 5,160,000 -> 5.16M. */
export function formatCompactNumber(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits,
  }).format(value);
}

/** Round canonical grams to the nearest multiple of `incrementG` (used for equipment steps). */
export function roundGramsToIncrement(
  grams: number,
  incrementG: number,
  mode: "nearest" | "down" | "up" = "nearest",
): number {
  if (incrementG <= 0) return Math.round(grams);
  const ratio = grams / incrementG;
  const steps =
    mode === "down"
      ? Math.floor(ratio + 1e-9)
      : mode === "up"
        ? Math.ceil(ratio - 1e-9)
        : Math.round(ratio);
  return Math.round(steps * incrementG);
}

/**
 * An estimate (an estimated 1RM) rounded to a step people can act on: half a kilogram, or a whole
 * pound. An estimate is not a measurement, so it is never shown to the gram.
 */
export function roundEstimateG(grams: number, unit: WeightUnit): number {
  return roundGramsToIncrement(grams, unit === "kg" ? GRAMS_PER_KG / 2 : GRAMS_PER_LB);
}

/** Default quick-adjust step: 2.5 kg for metric, 5 lb for imperial. */
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
    return metres >= 1000
      ? `${trimNumber(roundTo(metres / 1000, 2))} km`
      : `${Math.round(metres)} m`;
  }
  const miles = metres / 1609.344;
  return miles >= 0.1
    ? `${trimNumber(roundTo(miles, 2))} mi`
    : `${Math.round(metres * 1.09361)} yd`;
}

/** Parse typed reps: blank or invalid is undefined (not 0), so clearing the field clears the value. */
export function parseRepsInput(raw: string): number | undefined {
  const cleaned = raw.trim();
  if (!cleaned) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Parse a typed weight ("102.5", "102,5") into canonical grams; undefined for blank or invalid input. */
export function parseWeightInput(raw: string, unit: WeightUnit): number | undefined {
  const cleaned = raw.replace(",", ".").trim();
  if (!cleaned) return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return toGrams(value, unit);
}
