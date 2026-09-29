import { reachableTotals } from "@/domain/plateCalculator";
import type { LoadSnap } from "@/domain/progression";
import type { AppSettings, BarProfile, Exercise, PlateInventory } from "@/domain/types";

/**
 * Rounds a barbell load to a total the lifter's bar and plates can make. Only barbell exercises get
 * one; everything else rounds to the increment grid. With no bar or no plates on file there is
 * nothing to build against, so it returns undefined and the grid is used.
 *
 * Totals are worked out lazily and cached in 100 kg steps, so progressing a whole routine does one
 * or two plate searches, not one per set.
 */
export function barbellSnap(
  exercise: Pick<Exercise, "equipment"> | undefined,
  bars: readonly BarProfile[],
  plates: readonly PlateInventory[],
  settings: Pick<AppSettings, "defaultBarProfileId" | "defaultPlateInventoryId">,
): LoadSnap | undefined {
  if (exercise?.equipment !== "barbell") return undefined;
  const bar = bars.find((row) => row.id === settings.defaultBarProfileId) ?? bars[0];
  const inventory = plates.find((row) => row.id === settings.defaultPlateInventoryId) ?? plates[0];
  if (!bar || !inventory || inventory.plates.length === 0) return undefined;

  const cache = new Map<number, number[]>();
  const totalsFor = (grams: number): number[] => {
    const ceiling = Math.ceil((Math.max(grams, 0) + 50_000) / 100_000) * 100_000;
    let totals = cache.get(ceiling);
    if (!totals) {
      totals = reachableTotals(
        { barWeightG: bar.weightG, collarWeightG: bar.collarWeightG, plates: inventory.plates },
        ceiling,
      );
      cache.set(ceiling, totals);
    }
    return totals;
  };

  return (grams, mode) => {
    const totals = totalsFor(grams);
    if (totals.length === 0 || grams < totals[0]!) return Math.round(grams);
    let below = totals[0]!;
    let above: number | undefined;
    for (const total of totals) {
      if (total <= grams) below = total;
      else {
        above = total;
        break;
      }
    }
    if (mode === "down") return below;
    if (mode === "up") return firstAtLeast(totals, grams) ?? Math.round(grams);
    if (above === undefined) return below;
    return grams - below <= above - grams ? below : above;
  };
}

function firstAtLeast(totals: readonly number[], grams: number): number | undefined {
  return totals.find((total) => total >= grams);
}
