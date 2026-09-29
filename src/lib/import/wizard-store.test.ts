import { beforeEach, describe, expect, it } from "vitest";
import { useGym } from "@/lib/gym/store";
import { analyseStrongCsv, STRONG_PROFILE } from "./strong";

const CSV = [
  "Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps",
  "2026-03-01 10:00:00,One,Zercher Squat,1,100,5",
  "2026-03-08 10:00:00,Two,Zercher Squat,1,105,5",
].join("\n");

beforeEach(() => {
  useGym.getState().resetAll();
  useGym.getState().completeOnboarding({ loadDemo: false, unitSystem: "metric" });
});

const prepared = (
  over: Partial<Parameters<ReturnType<typeof useGym.getState>["importPrepared"]>[0]> = {},
) => {
  const analysis = analyseStrongCsv(CSV);
  return {
    analysis,
    source: STRONG_PROFILE,
    fileName: "a.csv",
    selectedKeys: new Set(analysis.workouts.map((w) => w.key)),
    allowDuplicates: false,
    nameOverrides: new Map<string, string>(),
    ...over,
  };
};

describe("the wizard's last step", () => {
  it("imports only the sessions that were ticked", () => {
    const analysis = analyseStrongCsv(CSV);
    const summary = useGym
      .getState()
      .importPrepared(prepared({ selectedKeys: new Set([analysis.workouts[1]!.key]) }));
    expect(summary.workouts).toBe(1);
    expect(useGym.getState().workouts.map((w) => w.name)).toEqual(["Two"]);
  });

  it("skips what is already here unless told to add a second copy", () => {
    useGym.getState().importPrepared(prepared());
    expect(useGym.getState().importPrepared(prepared()).workouts).toBe(0);
    expect(useGym.getState().workouts).toHaveLength(2);
    expect(useGym.getState().importPrepared(prepared({ allowDuplicates: true })).workouts).toBe(2);
    expect(useGym.getState().workouts).toHaveLength(4);
  });

  it("changes nothing when nothing is selected", () => {
    const before = useGym.getState().exercises;
    useGym.getState().importPrepared(prepared({ selectedKeys: new Set() }));
    expect(useGym.getState().exercises).toBe(before);
    expect(useGym.getState().workouts).toHaveLength(0);
  });
});

describe("classifying after an import", () => {
  it("fills the exercise and its sessions, once, and only what is still unmapped", () => {
    useGym.getState().importPrepared(prepared());
    const zercher = useGym.getState().exercises.find((e) => e.name === "Zercher Squat")!;
    expect(zercher.primaryMuscleGroup).toBe("unmapped");
    const item = {
      exerciseId: zercher.id,
      primaryMuscleGroup: "quads",
      equipment: "barbell",
      movementPattern: "squat",
    } as const;
    expect(useGym.getState().classifyExercises([item])).toBe(1);
    const state = useGym.getState();
    expect(state.exercises.find((e) => e.id === zercher.id)).toMatchObject({
      primaryMuscleGroup: "quads",
      equipment: "barbell",
    });
    expect(
      state.workoutExercises
        .filter((b) => b.exerciseId === zercher.id)
        .map((b) => b.primaryMuscleGroupSnapshot),
    ).toEqual(["quads", "quads"]);
    // a second classification of the same exercise changes nothing
    expect(useGym.getState().classifyExercises([{ ...item, primaryMuscleGroup: "chest" }])).toBe(0);
    expect(useGym.getState().exercises.find((e) => e.id === zercher.id)?.primaryMuscleGroup).toBe(
      "quads",
    );
  });
});
