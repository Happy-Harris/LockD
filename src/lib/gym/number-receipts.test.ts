import { describe, expect, it } from "vitest";
import type { WorkoutSet } from "@/domain/types";
import type { SessionSlice } from "./analytics";
import { detectPrsForWorkout, e1rmSeries } from "./analytics";
import { e1rmReceipt, latestE1rmReceipt } from "./number-receipts";

function slice(index: number, date: string, sets: Array<Partial<WorkoutSet>>, lift = "bench"): SessionSlice {
  const workoutId = `w-${index}`;
  return {
    workout: {
      id: workoutId,
      name: "s",
      status: "completed",
      localDate: date,
      startedAt: `${date}T12:00:00.000Z`,
      tzOffsetMinutes: 0,
      pausedSeconds: 0,
      createdAt: "",
      updatedAt: "",
    },
    exercises: [
      {
        id: `b-${index}`,
        workoutId,
        exerciseId: lift,
        order: 0,
        exerciseNameSnapshot: lift,
        primaryMuscleGroupSnapshot: "chest",
        secondaryMuscleGroupsSnapshot: [],
        equipmentSnapshot: "barbell",
        trackingTypeSnapshot: "weight_reps",
        restSeconds: 120,
      },
    ],
    sets: sets.map((over, order) => ({
      id: `s-${index}-${order}`,
      workoutId,
      workoutExerciseId: `b-${index}`,
      order,
      setType: "working",
      isCompleted: true,
      ...over,
    })),
  };
}

const slices = [
  slice(0, "2026-09-01", [{ weightG: 100_000, reps: 5 }]),
  slice(1, "2026-09-04", [{ weightG: 60_000, reps: 5, setType: "warmup" }, { weightG: 102_500, reps: 5 }]),
  slice(2, "2026-09-06", [{ weightG: 50_000, reps: 5 }], "squat"),
  slice(3, "2026-09-08", [{ weightG: 90_000, reps: 5 }, { weightG: 70_000, reps: 20 }]),
];

describe("the receipt behind an e1RM, a record and a trend (Opp 4)", () => {
  it("a record's receipt names the best it beat, the same one detectPrsForWorkout compared with", () => {
    const [pr] = detectPrsForWorkout("w-1", slices, "epley");
    const receipt = e1rmReceipt("bench", "w-1", slices, "epley")!;
    expect(receipt.provenance.best?.value).toBe(pr!.value);
    expect(receipt.previous).toEqual({ date: "2026-09-01", workoutId: "w-0", valueG: 116_667, weightG: 100_000, reps: 5 });
    expect(receipt.provenance.excluded.map((row) => row.reason)).toEqual(["warmup"]);
  });

  it("a first session has nothing before it", () => {
    expect(e1rmReceipt("bench", "w-0", slices, "epley")!.previous).toBeUndefined();
  });

  it("the trend is the lift's own sessions, oldest first, matching the chart", () => {
    const receipt = e1rmReceipt("bench", "w-3", slices, "epley")!;
    expect(receipt.trend.map((point) => point.workoutId)).toEqual(["w-0", "w-1", "w-3"]);
    expect(receipt.trend.map((point) => point.valueG)).toEqual(
      e1rmSeries("bench", slices, "epley").map((point) => point.value),
    );
    expect(receipt.provenance.excluded.map((row) => row.reason)).toEqual(["too_many_reps"]);
  });

  it("the latest receipt is the last session with an estimate, and none for a lift not on file", () => {
    expect(latestE1rmReceipt("bench", slices, "epley")?.workoutId).toBe("w-3");
    expect(latestE1rmReceipt("deadlift", slices, "epley")).toBeNull();
    expect(e1rmReceipt("squat", "w-0", slices, "epley")).toBeNull();
  });
});
