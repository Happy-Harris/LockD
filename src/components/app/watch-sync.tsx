import { useEffect, useMemo, useRef, useState } from "react";
import { weightUnitFor } from "@/domain/units";
import { findGhostSlice, ghostSetsForExercise } from "@/lib/gym/ghost";
import { useSlices } from "@/lib/gym/hooks";
import { barbellSnap } from "@/lib/gym/loads";
import { progressExercise } from "@/lib/gym/progression";
import { useGym } from "@/lib/gym/store";
import { isNativePlatform } from "@/lib/native/platform";
import {
  applyWatchIntent,
  buildWatchSnapshot,
  currentSetOf,
  recordLine,
  watchIsSupported,
  watchSync,
  type WatchSnapshot,
} from "@/lib/native/watch";

const RECORD_LINE_MS = 8000;

/**
 * Keeps the Apple Watch in step with the active workout (native iOS only) and applies what the watch sends back
 * through the store's own actions. It renders nothing and every failure is swallowed: the watch is a convenience
 * and can never get in the way of logging on the phone.
 */
export function WatchSync() {
  const enabled = isNativePlatform() && watchIsSupported();
  const workouts = useGym((s) => s.workouts);
  const exercisesOfWorkout = useGym((s) => s.workoutExercises);
  const sets = useGym((s) => s.workoutSets);
  const restTimer = useGym((s) => s.restTimer);
  const settings = useGym((s) => s.settings);
  const catalog = useGym((s) => s.exercises);
  const templateExercises = useGym((s) => s.templateExercises);
  const bars = useGym((s) => s.bars);
  const plates = useGym((s) => s.plates);
  const slices = useSlices();
  const [record, setRecord] = useState<string | undefined>();
  const recordTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const workout = workouts.find((row) => row.status === "active");
  const unit = weightUnitFor(settings.unitSystem);

  const current = useMemo(
    () => (workout ? currentSetOf(workout, exercisesOfWorkout, sets) : null),
    [workout, exercisesOfWorkout, sets],
  );
  const currentExerciseId = current?.exercise.id;

  const ghostSlice = useMemo(
    () =>
      workout && enabled
        ? findGhostSlice(slices, {
            beatWorkoutId: workout.beatWorkoutId,
            templateId: workout.templateId,
            name: workout.name,
            beforeIso: workout.startedAt,
          })
        : undefined,
    [workout, slices, enabled],
  );

  // Depends on finished sessions and on which lift is current, not on the set being typed.
  const target = useMemo(() => {
    if (!enabled || !workout || !current) return undefined;
    const row = current.exercise;
    const prescription = templateExercises.find(
      (item) => item.templateId === workout.templateId && item.exerciseId === row.exerciseId,
    );
    const entry = catalog.find((item) => item.id === row.exerciseId);
    const call = progressExercise({
      exerciseId: row.exerciseId,
      exerciseName: row.exerciseNameSnapshot,
      trackingType: row.trackingTypeSnapshot,
      incrementG: entry?.incrementG ?? settings.quickIncrementG,
      targetRepMin: prescription?.targetRepMin,
      targetRepMax: prescription?.targetRepMax,
      targetSets: prescription?.targetSets,
      slices,
      formula: settings.oneRepMaxFormula,
      excludeWarmups: settings.excludeWarmupsFromAnalytics,
      snap: entry ? barbellSnap(entry, bars, plates, settings) : undefined,
    });
    if (!call.why || (call.suggestedWeightG === undefined && call.suggestedReps === undefined)) return undefined;
    return { weightG: call.suggestedWeightG, reps: call.suggestedReps, why: call.why };
    // `current` changes with every tap; the lift it names is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, workout, currentExerciseId, templateExercises, catalog, bars, plates, settings, slices]);

  const snapshot: WatchSnapshot | null = useMemo(() => {
    if (!enabled || !workout) return null;
    const ghosts = new Map(
      exercisesOfWorkout
        .filter((row) => row.workoutId === workout.id)
        .map((row) => [row.id, ghostSetsForExercise(ghostSlice, row.exerciseId)] as const),
    );
    return buildWatchSnapshot({
      workout,
      exercises: exercisesOfWorkout,
      sets,
      restTimer,
      unit,
      vibrate: settings.restTimerVibrate !== false,
      nowMs: Date.now(),
      ghosts,
      targets: new Map(currentExerciseId ? [[currentExerciseId, target]] : []),
      record,
    });
  }, [enabled, workout, exercisesOfWorkout, sets, restTimer, unit, settings.restTimerVibrate, ghostSlice, currentExerciseId, target, record]);

  useEffect(() => {
    if (!enabled) return;
    watchSync.sync(snapshot);
  }, [enabled, snapshot]);

  useEffect(() => {
    if (!enabled) return;
    const stop = watchSync.onIntent((raw) => {
      const state = useGym.getState();
      const result = applyWatchIntent(raw, {
        workout: state.workouts.find((row) => row.status === "active"),
        exercises: state.workoutExercises,
        sets: state.workoutSets,
        restTimer: state.restTimer,
        completeSet: state.completeSet,
        adjustRestTimer: state.adjustRestTimer,
        stopRestTimer: state.stopRestTimer,
      });
      if (!result.applied && result.reason === "stale") watchSync.resend();
      if (result.applied && result.records[0]) {
        clearTimeout(recordTimer.current);
        setRecord(recordLine(result.records[0], weightUnitFor(state.settings.unitSystem)));
        recordTimer.current = setTimeout(() => setRecord(undefined), RECORD_LINE_MS);
      }
    });
    return () => {
      stop();
      clearTimeout(recordTimer.current);
    };
  }, [enabled]);

  return null;
}
