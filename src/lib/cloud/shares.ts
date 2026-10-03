import { formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import { hardSetCount } from "@/domain/volume";
import type { PersonalRecord, SessionSlice } from "@/lib/gym/analytics";
import type { ProgramFile } from "@/domain/types";
import type { TrainingMoment } from "@/lib/gym/moments";
import type { YearReceipt } from "@/lib/gym/wrapped";
import type { LifetimeReceipt } from "@/lib/receipt/web-receipt";
import type { ShareLifetimePayload, ShareMomentPayload, ShareProgramPayload, ShareReceiptPayload, ShareWrappedPayload } from "./types";

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

/**
 * Opp 9: the lifetime receipt as a share. Rebuilt field by field so nothing beyond what the receipt shows (an era's
 * internal fields aside) can ride along into a public payload.
 */
export function lifetimeShare(receipt: LifetimeReceipt, unit: WeightUnit): ShareLifetimePayload {
  return {
    kind: "lifetime",
    athlete: "Lifter",
    unit,
    receipt: {
      firstDate: receipt.firstDate,
      lastDate: receipt.lastDate,
      sessions: receipt.sessions,
      hardSets: receipt.hardSets,
      lifts: receipt.lifts,
      years: receipt.years.map(({ year, sessions }) => ({ year, sessions })),
      busiestYears: { years: [...receipt.busiestYears.years], sessions: receipt.busiestYears.sessions },
      longestGap: receipt.longestGap ? { ...receipt.longestGap } : undefined,
      chronicle: {
        ...receipt.chronicle,
        eras: receipt.chronicle.eras.map(({ id, name, startDate, endDate, sessions, hardSets, tone, autoName }) => ({
          id,
          name,
          startDate,
          endDate,
          sessions,
          hardSets,
          tone,
          autoName,
        })),
      },
      topLifts: receipt.topLifts.map(({ name, sessions, e1rmG, weightG, reps, date }) => ({
        name,
        sessions,
        e1rmG,
        weightG,
        reps,
        date,
      })),
      formula: receipt.formula,
    },
  };
}
