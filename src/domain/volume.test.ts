import { describe, expect, it } from "vitest";
import {
  attributeVolumeByMuscle,
  isoWeekKey,
  monthKey,
  setVolumeG,
  totalsForGroups,
  type ExerciseSetGroup,
} from "./volume";
import type { TrackingType, WorkoutSet } from "./types";

let counter = 0;
const set = (partial: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: partial.id ?? `set-${(counter += 1)}`,
  workoutId: "w",
  workoutExerciseId: "we",
  order: 0,
  setType: "working",
  isCompleted: true,
  ...partial,
});

const group = (
  trackingType: TrackingType,
  sets: WorkoutSet[],
  primary: ExerciseSetGroup["exercise"]["primaryMuscleGroupSnapshot"] = "chest",
  secondary: ExerciseSetGroup["exercise"]["secondaryMuscleGroupsSnapshot"] = [],
): ExerciseSetGroup => ({
  exercise: {
    exerciseId: "ex",
    exerciseNameSnapshot: "Bench Press",
    trackingTypeSnapshot: trackingType,
    primaryMuscleGroupSnapshot: primary,
    secondaryMuscleGroupsSnapshot: secondary,
  },
  sets,
});

describe("setVolumeG", () => {
  it("multiplies weight by reps for weight/rep work", () => {
    expect(setVolumeG(set({ weightG: 100_000, reps: 5 }), "weight_reps")).toBe(500_000);
  });

  it("excludes warm-ups by default and includes them on request", () => {
    const warmup = set({ setType: "warmup", weightG: 60_000, reps: 5 });
    expect(setVolumeG(warmup, "weight_reps")).toBe(0);
    expect(setVolumeG(warmup, "weight_reps", { includeWarmups: true })).toBe(300_000);
  });

  it("excludes incomplete sets", () => {
    expect(setVolumeG(set({ weightG: 100_000, reps: 5, isCompleted: false }), "weight_reps")).toBe(
      0,
    );
  });

  it.each<[TrackingType]>([
    ["reps_only"],
    ["duration"],
    ["distance_duration"],
    ["assisted_weight"],
  ])("assigns no external tonnage to %s work", (trackingType) => {
    expect(setVolumeG(set({ weightG: 40_000, reps: 10 }), trackingType)).toBe(0);
  });
});

describe("totalsForGroups", () => {
  it("counts each set exactly once even if a group repeats it", () => {
    const shared = set({ id: "shared", weightG: 100_000, reps: 5 });
    const totals = totalsForGroups([
      group("weight_reps", [shared]),
      group("weight_reps", [shared]),
    ]);
    expect(totals.volumeG).toBe(500_000);
    expect(totals.completedSets).toBe(1);
  });

  it("separates bodyweight, assisted, duration and distance work from tonnage", () => {
    const totals = totalsForGroups([
      group("weight_reps", [set({ weightG: 100_000, reps: 5 })]),
      group("reps_only", [set({ reps: 12 })]),
      group("assisted_weight", [set({ weightG: 20_000, reps: 8 })]),
      group("duration", [set({ durationSeconds: 60 })]),
      group("distance_duration", [set({ distanceM: 2_000, durationSeconds: 600 })]),
    ]);

    expect(totals.volumeG).toBe(500_000);
    expect(totals.repsOnlySets).toBe(1);
    expect(totals.assistedSets).toBe(1);
    expect(totals.durationSeconds).toBe(660);
    expect(totals.distanceM).toBe(2_000);
    expect(totals.completedSets).toBe(5);
  });
});

describe("muscle attribution", () => {
  it("gives the primary muscle full credit and secondaries the configured fraction", () => {
    const groups = [
      group("weight_reps", [set({ weightG: 100_000, reps: 10 })], "chest", [
        "triceps",
        "shoulders",
      ]),
    ];
    const attribution = attributeVolumeByMuscle(groups);
    const byMuscle = Object.fromEntries(
      attribution.map((row) => [row.muscle, row.attributedVolumeG]),
    );

    expect(byMuscle.chest).toBe(1_000_000);
    expect(byMuscle.triceps).toBe(500_000);
    expect(byMuscle.shoulders).toBe(500_000);
  });

  it("honours a custom secondary credit and clamps it to 0–1", () => {
    const groups = [
      group("weight_reps", [set({ weightG: 100_000, reps: 10 })], "chest", ["triceps"]),
    ];
    expect(attributeVolumeByMuscle(groups, { secondaryCredit: 0.25 })[1]?.attributedVolumeG).toBe(
      250_000,
    );
    expect(attributeVolumeByMuscle(groups, { secondaryCredit: 5 })[1]?.attributedVolumeG).toBe(
      1_000_000,
    );
    expect(attributeVolumeByMuscle(groups, { secondaryCredit: -2 })[1]?.attributedVolumeG).toBe(0);
  });

  it("never double-credits a muscle listed as both primary and secondary", () => {
    const groups = [
      group("weight_reps", [set({ weightG: 100_000, reps: 10 })], "chest", ["chest"]),
    ];
    const attribution = attributeVolumeByMuscle(groups);
    expect(attribution).toHaveLength(1);
    expect(attribution[0]?.attributedVolumeG).toBe(1_000_000);
  });

  it("keeps missing mappings visible in an Unmapped row", () => {
    const attribution = attributeVolumeByMuscle([
      group("weight_reps", [set({ weightG: 100_000, reps: 5 })], "unmapped"),
    ]);

    expect(attribution).toEqual([
      { muscle: "unmapped", attributedVolumeG: 500_000, attributedSets: 1 },
    ]);
  });
});

describe("period keys", () => {
  it("computes ISO week numbers with Monday starts", () => {
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe("2026-W01");
    expect(isoWeekKey(new Date(2026, 8, 16))).toBe("2026-W38");
    // 2027-01-03 is a Sunday belonging to ISO week 53 of 2026.
    expect(isoWeekKey(new Date(2027, 0, 3))).toBe("2026-W53");
  });

  it("computes month keys", () => {
    expect(monthKey(new Date(2026, 8, 16))).toBe("2026-09");
  });
});
