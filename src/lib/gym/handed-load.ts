import { formatWeightInput, parseWeightInput, type WeightUnit } from "@/domain/units";

/**
 * A load handed to the plate calculator or the warm-up generator in the address, by Lift Math. Shown in the
 * lifter's unit: typed as is when the units match, converted when they don't. Nothing is stored.
 */
export function handedLoad(search: { load?: string; unit?: WeightUnit }, unit: WeightUnit): string | undefined {
  if (!search.load) return undefined;
  const from = search.unit ?? unit;
  const grams = parseWeightInput(search.load, from);
  if (grams === undefined || grams <= 0) return undefined;
  return from === unit ? search.load.replace(",", ".") : formatWeightInput(grams, unit);
}
