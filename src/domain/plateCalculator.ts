import type { PlateDenomination } from "./types";

export interface PlateCalculatorInput {
  targetTotalG: number;
  barWeightG: number;
  collarWeightG?: number;
  plates: readonly PlateDenomination[];
}

export interface PlateStackItem {
  weightG: number;
  countPerSide: number;
}

export type PlateResultStatus =
  | "exact"
  | "closest_lower"
  | "bar_only"
  | "below_bar"
  | "no_plates"
  | "invalid";

export interface PlateCalculatorResult {
  status: PlateResultStatus;
  perSide: PlateStackItem[];
  achievedTotalG: number;
  differenceG: number;
  totalPlates: number;
  barWeightG: number;
  collarWeightG: number;
  message: string;
}

interface Denomination {
  weightG: number;
  pairs: number;
}

interface DpEntry {
  plateCount: number;
  counts: number[];
}

const MAX_REACHABLE_SUMS = 250_000;
const MATCH_TOLERANCE_G = 2;

export function calculatePlates(input: PlateCalculatorInput): PlateCalculatorResult {
  const barWeightG = Math.max(0, Math.round(input.barWeightG || 0));
  const collarWeightG = Math.max(0, Math.round(input.collarWeightG ?? 0));
  const targetTotalG = Math.round(input.targetTotalG);
  const base = barWeightG + collarWeightG * 2;

  if (!Number.isFinite(targetTotalG) || targetTotalG < 0) {
    return barOnlyResult("invalid", "Enter a target weight of zero or more.", barWeightG, collarWeightG, base, 0);
  }

  if (targetTotalG < base) {
    return barOnlyResult(
      "below_bar",
      collarWeightG > 0
        ? "Target is below the bar plus collars — the lightest possible load is the bare bar with collars."
        : "Target is below the bar — the lightest possible load is the bare bar.",
      barWeightG,
      collarWeightG,
      base,
      base - targetTotalG,
    );
  }

  const remainder = targetTotalG - base;
  if (remainder === 0) {
    return barOnlyResult("bar_only", "No plates needed — that is the bar.", barWeightG, collarWeightG, base, 0);
  }

  const denominations = normalisePlates(input.plates);
  if (denominations.length === 0) {
    return barOnlyResult(
      "no_plates",
      "No usable plate pairs in the selected inventory — plates load in pairs, so a lone plate cannot be used.",
      barWeightG,
      collarWeightG,
      base,
      base - targetTotalG,
    );
  }

  const targetPerSide = Math.floor(remainder / 2);
  const searchLimit = targetPerSide + MATCH_TOLERANCE_G;
  const reachable = solve(searchLimit, denominations);
  const chosenSum = reachable.has(targetPerSide) ? targetPerSide : bestBelow(reachable, searchLimit);

  if (chosenSum === null || chosenSum === 0) {
    return barOnlyResult(
      "closest_lower",
      "No combination of the available plates fits under this target — the closest load is the bare bar.",
      barWeightG,
      collarWeightG,
      base,
      base - targetTotalG,
    );
  }

  const entry = reachable.get(chosenSum)!;
  const perSide: PlateStackItem[] = [];
  entry.counts.forEach((countPerSide, index) => {
    const denomination = denominations[index];
    if (!denomination || countPerSide <= 0) return;
    perSide.push({ weightG: denomination.weightG, countPerSide });
  });

  const achievedTotalG = base + chosenSum * 2;
  const differenceG = achievedTotalG - targetTotalG;
  const isExact = Math.abs(differenceG) <= MATCH_TOLERANCE_G * 2;

  return {
    status: isExact ? "exact" : "closest_lower",
    perSide,
    achievedTotalG,
    differenceG,
    totalPlates: entry.plateCount * 2,
    barWeightG,
    collarWeightG,
    message: isExact ? "Exact match." : "Closest achievable load below the target with this inventory.",
  };
}

function barOnlyResult(
  status: PlateResultStatus,
  message: string,
  barWeightG: number,
  collarWeightG: number,
  base: number,
  differenceG: number,
): PlateCalculatorResult {
  return {
    status,
    perSide: [],
    achievedTotalG: base,
    differenceG,
    totalPlates: 0,
    barWeightG,
    collarWeightG,
    message,
  };
}

function normalisePlates(plates: readonly PlateDenomination[]): Denomination[] {
  const merged = new Map<number, number>();
  for (const plate of plates) {
    const weightG = Math.round(plate.weightG);
    if (!Number.isFinite(weightG) || weightG <= 0) continue;
    const count = Number.isFinite(plate.count) ? Math.max(0, Math.floor(plate.count)) : 0;
    merged.set(weightG, (merged.get(weightG) ?? 0) + count);
  }
  return [...merged.entries()]
    .map(([weightG, count]) => ({ weightG, pairs: Math.floor(count / 2) }))
    .filter((denomination) => denomination.pairs > 0)
    .sort((a, b) => b.weightG - a.weightG);
}

function solve(limit: number, denominations: readonly Denomination[]): Map<number, DpEntry> {
  const size = denominations.length;
  const best = new Map<number, DpEntry>();
  best.set(0, { plateCount: 0, counts: new Array<number>(size).fill(0) });
  if (limit <= 0) return best;

  for (let index = 0; index < size; index += 1) {
    const denomination = denominations[index]!;
    const snapshot = [...best.entries()];
    for (const [sum, entry] of snapshot) {
      let nextSum = sum;
      for (let used = 1; used <= denomination.pairs; used += 1) {
        nextSum += denomination.weightG;
        if (nextSum > limit) break;
        const counts = [...entry.counts];
        counts[index] = used;
        const candidate: DpEntry = { plateCount: entry.plateCount + used, counts };
        const incumbent = best.get(nextSum);
        if (!incumbent || isBetter(candidate, incumbent)) best.set(nextSum, candidate);
      }
    }
    if (best.size > MAX_REACHABLE_SUMS) break;
  }

  return best;
}

function isBetter(candidate: DpEntry, incumbent: DpEntry): boolean {
  if (candidate.plateCount !== incumbent.plateCount) {
    return candidate.plateCount < incumbent.plateCount;
  }
  for (let i = 0; i < candidate.counts.length; i += 1) {
    const a = candidate.counts[i] ?? 0;
    const b = incumbent.counts[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

function bestBelow(reachable: Map<number, DpEntry>, target: number): number | null {
  let best: number | null = null;
  for (const sum of reachable.keys()) {
    if (sum > target) continue;
    if (best === null || sum > best) best = sum;
  }
  return best;
}

export function reachableTotals(input: Omit<PlateCalculatorInput, "targetTotalG">, maxG: number): number[] {
  const barWeightG = Math.max(0, Math.round(input.barWeightG || 0));
  const collarWeightG = Math.max(0, Math.round(input.collarWeightG ?? 0));
  const base = barWeightG + collarWeightG * 2;
  const denominations = normalisePlates(input.plates);
  const limit = Math.max(0, Math.floor((maxG - base) / 2));
  const reachable = solve(limit, denominations);
  return [...reachable.keys()].map((sum) => base + sum * 2).sort((a, b) => a - b);
}
