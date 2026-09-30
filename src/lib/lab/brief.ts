import { formatWeightWithUnit, weightUnitFor, type WeightUnit } from "@/domain/units";
import { sliceSessions } from "@/lib/gym/analytics";
import { autopsyBoard } from "@/lib/gym/autopsy";
import { buildChronicle } from "@/lib/gym/chronicle";
import { buildLiftDna } from "@/lib/gym/dna";
import { buildIntelligence } from "@/lib/gym/intelligence";
import { barbellSnap } from "@/lib/gym/loads";
import { easierWeekCall, progressBoard } from "@/lib/gym/progression";
import { milestoneQueue } from "@/lib/gym/queue";
import { defaultSettings } from "@/lib/gym/store";
import type { CloudGym, LabHistoryNote } from "@/lib/cloud/types";

export function formatSetLine(
  set: {
    setType: string;
    weightG?: number;
    reps?: number;
    rpe?: number;
    isCompleted: boolean;
  },
  unit: WeightUnit,
): string | null {
  if (!set.isCompleted || set.setType === "warmup") return null;
  const load = set.weightG ? formatWeightWithUnit(set.weightG, unit) : "BW";
  const rpe = set.rpe != null ? ` @${set.rpe}` : "";
  return `${load} x ${set.reps ?? "—"}r${rpe}`;
}

export function buildLabBrief(
  data: CloudGym,
  question: string | undefined,
  prior: LabHistoryNote[],
): string {
  const settings = { ...defaultSettings(), ...data.settings };
  const unit = weightUnitFor(settings.unitSystem);
  const slices = sliceSessions(data.workouts, data.workoutExercises, data.workoutSets);
  // The lifter's own goal lifts; the lens never swaps them for its own (I-19).
  const trackedIds = settings.goalLiftIds.filter((id, index, list) => list.indexOf(id) === index);
  const board = progressBoard(
    trackedIds.map((id) => {
      const exercise = data.exercises.find((row) => row.id === id);
      const templateRow = data.templateExercises.find((row) => row.exerciseId === id);
      return {
        exerciseId: id,
        exerciseName: exercise?.name ?? "Lift",
        trackingType: exercise?.trackingType ?? "weight_reps",
        incrementG: exercise?.incrementG ?? settings.quickIncrementG,
        targetRepMin: templateRow?.targetRepMin,
        targetRepMax: templateRow?.targetRepMax,
        targetSets: templateRow?.targetSets,
        snap: barbellSnap(exercise, data.bars ?? [], data.plates ?? [], settings),
      };
    }),
    slices,
    settings.oneRepMaxFormula,
    settings.excludeWarmupsFromAnalytics,
  );
  const easier = easierWeekCall(board);
  const chronicle = buildChronicle(slices, settings.oneRepMaxFormula, settings.goalLiftIds, data.eraNames ?? []);
  const intelligence = buildIntelligence({
    slices,
    formula: settings.oneRepMaxFormula,
    goalIds: settings.goalLiftIds,
    measurements: data.measurements,
    calls: board,
    weekStartDay: settings.weekStartDay,
  });
  const dna = trackedIds
    .map((id) => {
      const exercise = data.exercises.find((row) => row.id === id);
      if (!exercise) return null;
      return buildLiftDna(exercise, slices, settings.oneRepMaxFormula, settings.excludeWarmupsFromAnalytics);
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const autopsies = autopsyBoard(board, slices, settings.oneRepMaxFormula, settings.excludeWarmupsFromAnalytics);
  const queue = milestoneQueue({
    exercises: data.exercises,
    slices,
    formula: settings.oneRepMaxFormula,
    excludeWarmups: settings.excludeWarmupsFromAnalytics,
    incrementG: settings.quickIncrementG,
    unit,
    goalIds: trackedIds,
  });

  const lastSessions = slices.slice(-10).map((slice) => {
    const lifts = slice.exercises
      .map((exercise) => {
        const sets = slice.sets
          .filter((set) => set.workoutExerciseId === exercise.id)
          .sort((a, b) => a.order - b.order)
          .map((set) => formatSetLine(set, unit))
          .filter((line): line is string => Boolean(line));
        return sets.length ? `${exercise.exerciseNameSnapshot}: ${sets.join(", ")}` : null;
      })
      .filter(Boolean)
      .join(" | ");
    return `${slice.workout.localDate} ${slice.workout.name}${slice.workout.programWeek ? ` W${slice.workout.programWeek}` : ""} — ${lifts}`;
  });

  const priorBlock = prior
    .slice(0, 3)
    .map((note) => `Q: ${note.question || "(open read)"}\nA: ${note.answer}`)
    .join("\n---\n");

  const parts = [
    `Lock’d training brief. Lens: ${settings.goalLens}. Formula: ${settings.oneRepMaxFormula}. Units: ${unit}.`,
    `Sessions on file: ${slices.length}. Current era: ${chronicle.current?.name ?? "none"} (${chronicle.current?.startDate ?? "—"}).`,
    `Eras: ${chronicle.eras.map((era) => `${era.name} ${era.startDate}–${era.endDate} n=${era.sessions}`).join(" · ")}`,
    intelligence.hitRateLifts
      ? `Progression hit-rate: ${Math.round(intelligence.hitRate * 100)}% across ${intelligence.hitRateLifts} tracked lifts (prior ${Math.round(intelligence.hitRatePrior * 100)}%).`
      : "Progression hit-rate: not known, no tracked lift has sessions on file.",
    easier.needed ? `Easier week call: ${easier.why}` : "No easier-week call.",
    "DNA: " + dna.map((row) => `${row.name} personality=${row.personality} range=${row.strongestRange ?? "n/a"} rest=${row.learnedRestSeconds ?? "n/a"}s`).join(" | "),
    "Autopsy: " +
      autopsies
        .map((row) => `${row.name}: ${row.headline} [${row.findings.map((f) => `${f.title}: ${f.evidence}`).join("; ")}]`)
        .join(" || "),
    "Queue: " + queue.map((row) => `${row.name} ${row.how}`).join(" | "),
    board
      .map(
        (call) =>
          `${call.exerciseName}: ${call.action} — ${call.why}${call.cites.length ? ` (read from sessions on ${call.cites.map((cite) => cite.date).join(", ")})` : ""}`,
      )
      .join(" | "),
    intelligence.insights.join(" | "),
    intelligence.volumeResponse,
    intelligence.restNote,
    intelligence.rpeDrift?.note ?? "",
    intelligence.relative.map((row) => `${row.name} ${formatWeightWithUnit(row.e1rmG, unit)} / BW = ${row.ratio.toFixed(2)}`).join("; "),
    "Last sessions:",
    ...lastSessions,
    priorBlock ? `Prior Lab notes:\n${priorBlock}` : "",
    question?.trim() ? `Lifter question: ${question.trim()}` : "Lifter question: open read of the log. Write the note.",
  ];

  return parts.filter(Boolean).join("\n").slice(0, 14000);
}
