import type { WorkoutSet } from "@/domain/types";
import { uuid } from "@/domain/ids";

type Side = NonNullable<WorkoutSet["side"]>;

/** One row to create when a workout exercise starts: a warm-up, a bilateral set, or one side of a pair. */
export interface SetSlot {
  isWarmup: boolean;
  side?: Side;
  pairId?: string;
  /** Which set number this is among the working sets (both sides of a pair share it). -1 for a warm-up. */
  pairIndex: number;
}

/**
 * The rows a routine asks for. `count` is the number of sets (a left+right pair is one set), so a
 * unilateral exercise gets two rows per set. A warm-up row is always a single bilateral row.
 */
export function buildSlots(count: number, includeWarmup: boolean, unilateral: boolean): SetSlot[] {
  const slots: SetSlot[] = [];
  let pairIndex = 0;
  for (let i = 0; i < count; i += 1) {
    if (i === 0 && includeWarmup) {
      slots.push({ isWarmup: true, pairIndex: -1 });
    } else if (unilateral) {
      const pairId = uuid();
      slots.push({ isWarmup: false, side: "left", pairId, pairIndex });
      slots.push({ isWarmup: false, side: "right", pairId, pairIndex });
      pairIndex += 1;
    } else {
      slots.push({ isWarmup: false, pairIndex });
      pairIndex += 1;
    }
  }
  return slots;
}

interface SidedPrior {
  side?: Side;
}

/**
 * The previous-session set that goes with a row. A sided row takes the same set number on the same
 * side, so the right side is never compared with the left. If the last session had no sides, both
 * sides take that session's set of the same number. A bilateral row keeps its position.
 */
export function priorForSlot<T extends object>(
  previous: readonly T[],
  slot: { side?: Side; pairIndex: number },
  rowIndex: number,
): T | undefined {
  const sideOf = (row: T) => (row as SidedPrior).side;
  if (slot.side) {
    const sameSide = previous.filter((row) => sideOf(row) === slot.side);
    if (sameSide.length > 0) return sameSide[slot.pairIndex] ?? sameSide[sameSide.length - 1];
    const unsided = previous.filter((row) => !sideOf(row));
    return unsided[slot.pairIndex] ?? unsided[unsided.length - 1];
  }
  return previous[rowIndex] ?? previous[previous.length - 1];
}

/** Where a row sits among its exercise's rows: which set number, for matching a ghost. */
export function slotOf(
  rows: readonly Pick<WorkoutSet, "setType" | "side">[],
  index: number,
): { side?: Side; pairIndex: number } {
  const row = rows[index]!;
  const before = rows.slice(0, index).filter((other) => other.setType !== "warmup");
  const pairIndex = row.side
    ? before.filter((other) => other.side === row.side).length
    : before.filter((other) => !other.side).length;
  return { side: row.side, pairIndex };
}

/**
 * True when the rest timer should start after this set: it is not the first side of a pair whose other
 * side is still to do. One tap completes one side; the rest starts after the second.
 */
export function pairIsDone(
  set: Pick<WorkoutSet, "id" | "side" | "pairId" | "workoutExerciseId">,
  rows: readonly Pick<WorkoutSet, "id" | "side" | "pairId" | "workoutExerciseId" | "isCompleted">[],
): boolean {
  if (!set.side || !set.pairId) return true;
  const partner = rows.find(
    (row) =>
      row.id !== set.id &&
      row.workoutExerciseId === set.workoutExerciseId &&
      row.pairId === set.pairId,
  );
  return !partner || partner.isCompleted;
}
