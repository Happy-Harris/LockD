import type { PlateDenomination } from "@/domain/types";

/**
 * Sets how many physical plates of one weight the lifter owns. Zero (or less) removes the
 * denomination, so it stops being offered. The list stays heaviest first, and a weight that is
 * not a positive whole number of grams is ignored rather than stored.
 */
export function withPlateCount(
  plates: readonly PlateDenomination[],
  weightG: number,
  count: number,
): PlateDenomination[] {
  if (!Number.isInteger(weightG) || weightG <= 0) return [...plates];
  const rest = plates.filter((plate) => plate.weightG !== weightG);
  const whole = Math.floor(count);
  if (!Number.isFinite(whole) || whole <= 0) return rest;
  return [...rest, { weightG, count: whole }].sort((a, b) => b.weightG - a.weightG);
}

/** An odd plate cannot be loaded on both sides, so the loadable pairs are floor(count / 2). */
export const usablePairs = (plate: PlateDenomination) => Math.floor(plate.count / 2);
