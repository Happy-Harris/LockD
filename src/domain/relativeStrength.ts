import type { BodyMeasurement } from "./types";

/**
 * A lift's estimated 1RM as a multiple of body weight, as a plain number with the two records it
 * came from. There are no bands here ("novice", "elite"): no published table is behind them, so
 * none is shown. Body weight is the latest measurement **on or before** the day of the lift, so a
 * later change of weight never rewrites an old lift.
 */
export interface RelativeStrength {
  /** e1RM ÷ body weight, unrounded. */
  ratio: number;
  e1rmG: number;
  e1rmDate: string;
  bodyweightG: number;
  bodyweightDate: string;
}

export function relativeStrength(
  e1rmG: number,
  e1rmDate: string,
  measurements: readonly BodyMeasurement[],
): RelativeStrength | null {
  if (!(e1rmG > 0)) return null;
  let pick: BodyMeasurement | undefined;
  for (const row of measurements) {
    if (row.metric !== "bodyweight" || !(row.value > 0) || row.localDate > e1rmDate) continue;
    if (
      !pick ||
      row.localDate > pick.localDate ||
      (row.localDate === pick.localDate && row.recordedAt > pick.recordedAt)
    ) {
      pick = row;
    }
  }
  if (!pick) return null;
  return {
    ratio: e1rmG / pick.value,
    e1rmG,
    e1rmDate,
    bodyweightG: pick.value,
    bodyweightDate: pick.localDate,
  };
}

/** `1.42×`. Two decimals, so a real change of a few percent is visible. */
export function formatRatio(ratio: number): string {
  return `${(Math.round(ratio * 100) / 100).toFixed(2)}×`;
}
