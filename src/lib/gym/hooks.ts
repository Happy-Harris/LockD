import { useMemo } from "react";
import {
  calendarHeat,
  computeRecords,
  muscleSetMap,
  previousSetsForExercise,
  sliceSessions,
  streakDays,
  weeklySeries,
} from "./analytics";
import { autopsyBoard } from "./autopsy";
import { buildChronicle } from "./chronicle";
import { buildLiftDna } from "./dna";
import { buildIntelligence } from "./intelligence";
import { lensDef, verdictFraming } from "./lenses";
import { loggedEntriesOf } from "./entries";
import { buildMoments } from "./moments";
import { nextProgramSession } from "./programs";
import { easierWeekCall, progressBoard } from "./progression";
import { milestoneQueue } from "./queue";
import { useGym } from "./store";
import { trainingFlags } from "@/domain/analytics/trainingFlags";
import { weeklyVerdict } from "@/domain/analytics/weeklyVerdict";
import { addDays, localDateOf, startOfTrainingWeek } from "@/domain/time";
import { weightUnitFor } from "@/domain/units";

export function useSlices() {
  const workouts = useGym((s) => s.workouts);
  const workoutExercises = useGym((s) => s.workoutExercises);
  const workoutSets = useGym((s) => s.workoutSets);
  return useMemo(
    () => sliceSessions(workouts, workoutExercises, workoutSets),
    [workouts, workoutExercises, workoutSets],
  );
}

export function useGymDerived() {
  const settings = useGym((s) => s.settings);
  const slices = useSlices();
  const templates = useGym((s) => s.templates);
  const templateExercises = useGym((s) => s.templateExercises);
  const measurements = useGym((s) => s.measurements);
  const exercises = useGym((s) => s.exercises);
  const programs = useGym((s) => s.programs);
  const programWeeks = useGym((s) => s.programWeeks);
  const programSessions = useGym((s) => s.programSessions);
  const programExercises = useGym((s) => s.programExercises);
  const eraNames = useGym((s) => s.eraNames);

  return useMemo(() => {
    const records = computeRecords(slices, settings.oneRepMaxFormula, settings.excludeWarmupsFromAnalytics);
    const entries = loggedEntriesOf(slices);
    const analyticsOptions = {
      formula: settings.oneRepMaxFormula,
      includeWarmups: !settings.excludeWarmupsFromAnalytics,
      secondaryCredit: settings.secondaryMuscleCredit,
    };
    const verdictLens = verdictFraming(settings.goalLens);
    const now = new Date();
    const verdict = weeklyVerdict(
      entries,
      analyticsOptions,
      settings.weekStartDay,
      now,
      settings.goalLiftIds,
      verdictLens,
    );
    const flags = trainingFlags(
      entries,
      analyticsOptions,
      settings.weekStartDay,
      now,
      settings.goalLiftIds,
      verdictLens,
    );
    const heat = calendarHeat(slices, 84);
    const weeks = weeklySeries(slices, settings.weekStartDay);
    const weekStart = startOfTrainingWeek(new Date(), settings.weekStartDay);
    const weekEnd = addDays(weekStart, 6);
    const muscles = muscleSetMap(
      slices,
      localDateOf(weekStart),
      localDateOf(weekEnd),
      settings.secondaryMuscleCredit,
    );
    const streak = streakDays(slices);
    const lastCompleted = [...slices].reverse()[0];
    const nextTemplate = (() => {
      const ordered = templates.filter((row) => !row.isArchived).sort((a, b) => a.order - b.order);
      if (ordered.length === 0) return undefined;
      const lastId = lastCompleted?.workout.templateId;
      if (!lastId) return ordered[0];
      const index = ordered.findIndex((row) => row.id === lastId);
      return ordered[(index + 1) % ordered.length];
    })();

    const lens = lensDef(settings.goalLens);
    const trackedIds = (
      lens.skillIds.length ? lens.skillIds : settings.goalLiftIds.length ? settings.goalLiftIds : records.slice(0, 3).map((row) => row.exerciseId)
    ).filter((id, index, list) => list.indexOf(id) === index);

    const board = progressBoard(
      trackedIds.map((id) => {
        const exercise = exercises.find((row) => row.id === id);
        const templateRow = templateExercises.find((row) => row.exerciseId === id);
        return {
          exerciseId: id,
          exerciseName: exercise?.name ?? "Lift",
          trackingType: exercise?.trackingType ?? "weight_reps",
          incrementG: exercise?.incrementG ?? settings.quickIncrementG,
          targetRepMin: templateRow?.targetRepMin,
          targetRepMax: templateRow?.targetRepMax,
          targetSets: templateRow?.targetSets,
        };
      }),
      slices,
      settings.oneRepMaxFormula,
      settings.excludeWarmupsFromAnalytics,
    );
    const easier = easierWeekCall(board);
    const chronicle = buildChronicle(slices, settings.oneRepMaxFormula, settings.goalLiftIds, eraNames);
    const moments = buildMoments(slices, records, chronicle.eras, measurements);
    const intelligence = buildIntelligence({
      slices,
      formula: settings.oneRepMaxFormula,
      goalIds: settings.goalLiftIds,
      measurements,
      calls: board,
      weekStartDay: settings.weekStartDay,
    });
    const dna = trackedIds
      .map((id) => {
        const exercise = exercises.find((row) => row.id === id);
        if (!exercise) return null;
        return buildLiftDna(exercise, slices, settings.oneRepMaxFormula, settings.excludeWarmupsFromAnalytics);
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    const autopsies = autopsyBoard(board, slices, settings.oneRepMaxFormula, settings.excludeWarmupsFromAnalytics);
    const queue = milestoneQueue({
      exercises,
      slices,
      formula: settings.oneRepMaxFormula,
      excludeWarmups: settings.excludeWarmupsFromAnalytics,
      incrementG: settings.quickIncrementG,
      unit: weightUnitFor(settings.unitSystem),
      goalIds: trackedIds,
    });
    const activeProgram = programs.find((row) => row.isActive) ?? programs.find((row) => row.id === settings.activeProgramId);
    const nextProgram = activeProgram
      ? nextProgramSession(
          activeProgram,
          programSessions.filter((row) => row.programId === activeProgram.id),
        )
      : undefined;
    const activeWeek = activeProgram
      ? programWeeks.find((row) => row.programId === activeProgram.id && row.weekNumber === activeProgram.currentWeek)
      : undefined;

    return {
      slices,
      records,
      verdict,
      verdictLens,
      flags,
      heat,
      weeks,
      muscles,
      streak,
      lastCompleted,
      nextTemplate,
      templates,
      templateExercises,
      measurements,
      exercises,
      settings,
      lens,
      board,
      easier,
      chronicle,
      moments,
      intelligence,
      dna,
      autopsies,
      queue,
      programs,
      programWeeks,
      programSessions,
      programExercises,
      eraNames,
      activeProgram,
      nextProgram,
      activeWeek,
    };
  }, [
    slices,
    settings,
    templates,
    templateExercises,
    measurements,
    exercises,
    programs,
    programWeeks,
    programSessions,
    programExercises,
    eraNames,
  ]);
}

export function usePreviousSets(exerciseId: string, beforeIso?: string) {
  const slices = useSlices();
  return useMemo(
    () => previousSetsForExercise(exerciseId, slices, beforeIso),
    [exerciseId, slices, beforeIso],
  );
}
