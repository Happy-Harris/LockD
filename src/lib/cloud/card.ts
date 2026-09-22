import { computeRecords, sliceSessions, streakDays } from "@/lib/gym/analytics";
import { buildChronicle } from "@/lib/gym/chronicle";
import { buildIntelligence } from "@/lib/gym/intelligence";
import { buildMoments } from "@/lib/gym/moments";
import { progressBoard } from "@/lib/gym/progression";
import { defaultSettings } from "@/lib/gym/store";
import type { CloudGym, LockerCard } from "./types";

export function buildLockerCard(
  payload: CloudGym,
  profile: { handle: string; displayName: string; bio: string },
): LockerCard {
  const settings = { ...defaultSettings(), ...payload.settings };
  const slices = sliceSessions(payload.workouts, payload.workoutExercises, payload.workoutSets);
  const records = computeRecords(slices, settings.oneRepMaxFormula, settings.excludeWarmupsFromAnalytics);
  const chronicle = buildChronicle(slices, settings.oneRepMaxFormula, settings.goalLiftIds, payload.eraNames ?? []);
  const moments = buildMoments(slices, records, chronicle.eras, payload.measurements);
  const tracked = (settings.goalLiftIds.length ? settings.goalLiftIds : records.slice(0, 3).map((row) => row.exerciseId)).slice(0, 3);
  const board = progressBoard(
    tracked.map((id) => {
      const exercise = payload.exercises.find((row) => row.id === id);
      return {
        exerciseId: id,
        exerciseName: exercise?.name ?? "Lift",
        trackingType: exercise?.trackingType ?? "weight_reps",
        incrementG: exercise?.incrementG ?? settings.quickIncrementG,
      };
    }),
    slices,
    settings.oneRepMaxFormula,
    settings.excludeWarmupsFromAnalytics,
  );
  const intelligence = buildIntelligence({
    slices,
    formula: settings.oneRepMaxFormula,
    goalIds: settings.goalLiftIds,
    measurements: payload.measurements,
    calls: board,
    weekStartDay: settings.weekStartDay,
  });
  const featured = moments
    .filter((row) => row.kind === "first" || row.kind === "milestone" || row.kind === "pr")
    .slice(0, 6);

  return {
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    lens: settings.goalLens,
    era: chronicle.current?.name,
    streak: streakDays(slices),
    sessions: slices.length,
    relative: intelligence.relative.slice(0, 3).map((row) => ({ name: row.name, ratio: row.ratio })),
    moments: featured.map((row) => ({
      id: row.id,
      title: row.title,
      kicker: row.kicker,
      date: row.date,
      detail: row.detail,
      valueLabel: row.valueLabel,
      eraName: row.eraName,
    })),
  };
}
