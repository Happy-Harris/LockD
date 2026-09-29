import { beforeEach, describe, expect, it } from "vitest";
import { hardSetCount } from "@/domain/volume";
import { buildSlots, pairIsDone, priorForSlot, slotOf } from "./pairs";
import { useGym } from "./store";

describe("buildSlots", () => {
  it("gives a bilateral exercise one row per set", () => {
    const slots = buildSlots(3, false, false);
    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => !slot.side && !slot.pairId)).toBe(true);
  });

  it("gives a unilateral exercise a left and a right row per set, sharing a pairId", () => {
    const slots = buildSlots(2, false, true);
    expect(slots.map((slot) => slot.side)).toEqual(["left", "right", "left", "right"]);
    expect(slots[0]!.pairId).toBe(slots[1]!.pairId);
    expect(slots[0]!.pairId).not.toBe(slots[2]!.pairId);
    expect(slots.map((slot) => slot.pairIndex)).toEqual([0, 0, 1, 1]);
  });

  it("keeps a warm-up as one bilateral row that takes one of the sets", () => {
    const slots = buildSlots(3, true, true);
    expect(slots[0]).toMatchObject({ isWarmup: true, pairIndex: -1 });
    expect(slots[0]!.side).toBeUndefined();
    expect(slots.filter((slot) => slot.side === "left")).toHaveLength(2);
    expect(slots).toHaveLength(5);
  });
});

describe("priorForSlot", () => {
  const sided = [
    { side: "left" as const, weightG: 30 },
    { side: "right" as const, weightG: 28 },
    { side: "left" as const, weightG: 32 },
    { side: "right" as const, weightG: 29 },
  ];

  it("matches the same set number on the same side", () => {
    expect(priorForSlot(sided, { side: "right", pairIndex: 1 }, 3)?.weightG).toBe(29);
    expect(priorForSlot(sided, { side: "left", pairIndex: 0 }, 0)?.weightG).toBe(30);
  });

  it("falls back to the last set on that side when this session has more sets", () => {
    expect(priorForSlot(sided, { side: "left", pairIndex: 5 }, 10)?.weightG).toBe(32);
  });

  it("gives both sides the same-numbered set when the last session had no sides", () => {
    const bilateral = [{ weightG: 20 }, { weightG: 22 }];
    expect(priorForSlot(bilateral, { side: "left", pairIndex: 1 }, 2)?.weightG).toBe(22);
    expect(priorForSlot(bilateral, { side: "right", pairIndex: 1 }, 3)?.weightG).toBe(22);
  });

  it("keeps a bilateral row on its position, unchanged from before", () => {
    const prev = [{ weightG: 1 }, { weightG: 2 }];
    expect(priorForSlot(prev, { pairIndex: 0 }, 1)?.weightG).toBe(2);
    expect(priorForSlot(prev, { pairIndex: 0 }, 9)?.weightG).toBe(2);
    expect(priorForSlot([], { pairIndex: 0 }, 0)).toBeUndefined();
  });
});

describe("slotOf", () => {
  it("numbers working sets per side and skips warm-ups", () => {
    const rows = [
      { setType: "warmup" as const },
      { setType: "working" as const, side: "left" as const },
      { setType: "working" as const, side: "right" as const },
      { setType: "working" as const, side: "left" as const },
      { setType: "working" as const, side: "right" as const },
    ];
    expect(slotOf(rows, 3)).toEqual({ side: "left", pairIndex: 1 });
    expect(slotOf(rows, 4)).toEqual({ side: "right", pairIndex: 1 });
    expect(slotOf(rows, 2)).toEqual({ side: "right", pairIndex: 0 });
  });
});

describe("pairIsDone", () => {
  const rows = [
    { id: "l", workoutExerciseId: "x", side: "left" as const, pairId: "p", isCompleted: true },
    { id: "r", workoutExerciseId: "x", side: "right" as const, pairId: "p", isCompleted: false },
    { id: "b", workoutExerciseId: "x", isCompleted: true },
  ];
  it("waits for the second side, and never waits on a bilateral set", () => {
    expect(pairIsDone(rows[0]!, rows)).toBe(false);
    expect(pairIsDone(rows[2]!, rows)).toBe(true);
    expect(pairIsDone(rows[1]!, [rows[0]!, { ...rows[1]!, isCompleted: true }])).toBe(true);
  });
});

describe("logging a unilateral exercise in the store", () => {
  beforeEach(() => useGym.getState().resetAll());

  const start = () => {
    const state = useGym.getState();
    state.updateSettings({ restTimerAutoStart: true });
    const exercise = useGym.getState().exercises.find((row) => row.trackingType === "weight_reps")!;
    state.updateExercise(exercise.id, { unilateral: true });
    const id = useGym.getState().startEmptyWorkout("Test");
    useGym.getState().addExerciseToWorkout(id, exercise.id);
    const block = useGym.getState().workoutExercises.find((row) => row.workoutId === id)!;
    const rows = () =>
      useGym
        .getState()
        .workoutSets.filter((row) => row.workoutExerciseId === block.id)
        .sort((a, b) => a.order - b.order);
    return { id, block, rows };
  };

  it("snapshots the flag and starts with left and right rows sharing a pairId", () => {
    const { block, rows } = start();
    expect(block.unilateralSnapshot).toBe(true);
    expect(rows().map((row) => row.side)).toEqual([
      "left",
      "right",
      "left",
      "right",
      "left",
      "right",
    ]);
    expect(rows()[0]!.pairId).toBe(rows()[1]!.pairId);
    expect(rows().map((row) => row.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("adds a left and a right row together, and a warm-up stays one row", () => {
    const { block, rows } = start();
    useGym.getState().addSet(block.id);
    expect(rows()).toHaveLength(8);
    expect(
      rows()
        .slice(-2)
        .map((row) => row.side),
    ).toEqual(["left", "right"]);
    useGym.getState().addSet(block.id, "warmup");
    expect(rows()).toHaveLength(9);
    expect(rows()[8]!.side).toBeUndefined();
  });

  it("starts the rest only after the second side, and counts the pair as one set", () => {
    const { rows } = start();
    const [left, right] = rows();
    useGym.getState().completeSet(left!.id);
    expect(useGym.getState().restTimer).toBeNull();
    useGym.getState().completeSet(right!.id);
    expect(useGym.getState().restTimer).not.toBeNull();
    expect(hardSetCount(rows())).toBe(1);
  });

  it("leaves a bilateral exercise exactly as before", () => {
    const state = useGym.getState();
    const exercise = state.exercises.find(
      (row) => row.trackingType === "weight_reps" && !row.unilateral,
    )!;
    const id = state.startEmptyWorkout("Bilateral");
    useGym.getState().addExerciseToWorkout(id, exercise.id);
    const sets = useGym.getState().workoutSets.filter((row) => row.workoutId === id);
    expect(sets).toHaveLength(3);
    expect(sets.every((row) => !row.side && !row.pairId)).toBe(true);
    expect(
      useGym.getState().workoutExercises.find((row) => row.workoutId === id)!.unilateralSnapshot,
    ).toBeUndefined();
  });

  it("saves a routine with its set count, not its row count, and starts it with the same rows", () => {
    const { id, block } = start();
    const templateId = useGym.getState().saveTemplateFromWorkout(id, "Rows");
    const saved = useGym.getState().templateExercises.find((row) => row.templateId === templateId)!;
    expect(saved.targetSets).toBe(3);
    const again = useGym.getState().startFromTemplate(templateId);
    const rows = useGym.getState().workoutSets.filter((row) => row.workoutId === again);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.side)).toEqual([
      "left",
      "right",
      "left",
      "right",
      "left",
      "right",
    ]);
    expect(block.unilateralSnapshot).toBe(true);
  });
});
