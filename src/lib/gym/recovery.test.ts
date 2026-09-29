import { describe, expect, it } from "vitest";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { sliceSessions } from "./analytics";
import { lastTrainedLabel, muscleLastTrained } from "./recovery";

const workout = (id: string, localDate: string): Workout => ({
  id,
  name: id,
  status: "completed",
  startedAt: `${localDate}T10:00:00.000Z`,
  localDate,
  tzOffsetMinutes: 0,
  pausedSeconds: 0,
  createdAt: "",
  updatedAt: "",
});
const block = (
  id: string,
  workoutId: string,
  primary: WorkoutExercise["primaryMuscleGroupSnapshot"],
  secondary: WorkoutExercise["secondaryMuscleGroupsSnapshot"] = [],
): WorkoutExercise => ({
  id,
  workoutId,
  exerciseId: `e-${id}`,
  order: 0,
  exerciseNameSnapshot: id,
  primaryMuscleGroupSnapshot: primary,
  secondaryMuscleGroupsSnapshot: secondary,
  equipmentSnapshot: "barbell",
  trackingTypeSnapshot: "weight_reps",
  restSeconds: 90,
});
const set = (
  id: string,
  workoutId: string,
  workoutExerciseId: string,
  over: Partial<WorkoutSet> = {},
): WorkoutSet => ({
  id,
  workoutId,
  workoutExerciseId,
  order: 0,
  setType: "working",
  isCompleted: true,
  ...over,
});

const REF = new Date(2026, 8, 29, 9, 0, 0); // local time, 29 Sep 2026

describe("when each muscle was last trained", () => {
  const slices = sliceSessions(
    [workout("w1", "2026-09-29"), workout("w2", "2026-09-26"), workout("w3", "2026-09-01")],
    [
      block("b1", "w1", "chest", ["triceps"]),
      block("b2", "w2", "quads"),
      block("b3", "w3", "back"),
    ],
    [set("s1", "w1", "b1"), set("s2", "w2", "b2"), set("s3", "w3", "b3")],
  );
  const byMuscle = (rows: ReturnType<typeof muscleLastTrained>) =>
    new Map(rows.map((row) => [row.muscle, row]));

  it("counts whole calendar days, and credits secondary muscles too", () => {
    const rows = byMuscle(muscleLastTrained(slices, REF));
    expect(rows.get("chest")).toMatchObject({ lastDate: "2026-09-29", daysAgo: 0 });
    expect(rows.get("triceps")).toMatchObject({ daysAgo: 0 });
    expect(rows.get("quads")).toMatchObject({ lastDate: "2026-09-26", daysAgo: 3 });
    expect(rows.get("back")).toMatchObject({ daysAgo: 28 });
  });

  it("says nothing was logged, never that a muscle is fresh or rested", () => {
    const rows = byMuscle(muscleLastTrained(slices, REF));
    expect(rows.get("hamstrings")).toEqual({ muscle: "hamstrings", daysAgo: null });
    expect(lastTrainedLabel(null)).toBe("No sets logged");
    for (const row of rows.values()) {
      expect(JSON.stringify(row)).not.toMatch(/fresh|ready|recover/i);
    }
  });

  it("does not count warm-ups or unfinished sets", () => {
    const only = sliceSessions(
      [workout("w1", "2026-09-29")],
      [block("b1", "w1", "chest")],
      [set("s1", "w1", "b1", { setType: "warmup" }), set("s2", "w1", "b1", { isCompleted: false })],
    );
    expect(byMuscle(muscleLastTrained(only, REF)).get("chest")?.daysAgo).toBeNull();
  });

  it("never returns a negative count for a session dated after today", () => {
    const future = sliceSessions(
      [workout("w1", "2026-10-05")],
      [block("b1", "w1", "chest")],
      [set("s1", "w1", "b1")],
    );
    expect(byMuscle(muscleLastTrained(future, REF)).get("chest")?.daysAgo).toBe(0);
  });

  it("words it in plain days", () => {
    expect([0, 1, 2, 30].map(lastTrainedLabel)).toEqual([
      "Today",
      "Yesterday",
      "2 days ago",
      "30 days ago",
    ]);
  });
});
