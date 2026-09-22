import { formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import { hardSetCount } from "@/domain/volume";
import type { PersonalRecord, SessionSlice } from "@/lib/gym/analytics";
import type { ProgramFile } from "@/domain/types";
import type { TrainingMoment } from "@/lib/gym/moments";
import type { YearReceipt } from "@/lib/gym/wrapped";
import type { ShareMomentPayload, ShareProgramPayload, ShareReceiptPayload, ShareWrappedPayload } from "./types";

export function momentShare(moment: TrainingMoment, unit: WeightUnit): ShareMomentPayload {
  return { kind: "moment", athlete: "Lifter", unit, moment };
}

export function receiptShare(
  slice: SessionSlice,
  prs: PersonalRecord[],
  unit: WeightUnit,
  duration: number,
  tonnage: number,
  eraName?: string,
): ShareReceiptPayload {
  return {
    kind: "receipt",
    athlete: "Lifter",
    workoutName: slice.workout.name,
    date: slice.workout.localDate,
    durationSec: duration,
    hardSets: hardSetCount(slice.sets),
    tonnageLabel: formatWeightWithUnit(tonnage, unit),
    eraName,
    notes: slice.workout.notes,
    prs: prs.map((row) => row.exerciseName),
    lines: slice.exercises.map((exercise) => {
      const sets = slice.sets
        .filter((set) => set.workoutExerciseId === exercise.id && set.isCompleted)
        .sort((a, b) => a.order - b.order);
      return {
        name: exercise.exerciseNameSnapshot,
        pr: prs.some((row) => row.exerciseId === exercise.exerciseId),
        sets:
          sets
            .map((set) =>
              set.weightG ? `${formatWeightWithUnit(set.weightG, unit)} × ${set.reps ?? "—"}` : `${set.reps ?? "—"} reps`,
            )
            .join("  ·  ") || "No completed sets",
      };
    }),
  };
}

export function wrappedShare(receipt: YearReceipt, unit: WeightUnit): ShareWrappedPayload {
  return { kind: "wrapped", athlete: "Lifter", unit, receipt };
}

export function programShare(file: ProgramFile): ShareProgramPayload {
  return { kind: "program", athlete: "Lifter", file };
}
