import { beforeEach, describe, expect, it } from "vitest";
import { endsSuperset, relinkSuperset, supersetLabels } from "./superset";
import { useGym } from "./store";

const b = (id: string, order: number, supersetGroup?: string) => ({ id, order, supersetGroup });
let n = 0;
const fresh = () => `g${++n}`;

describe("supersets", () => {
  it("labels members A1, A2, B1 in workout order and leaves others unlabelled", () => {
    const blocks = [b("x", 0, "g"), b("y", 1), b("z", 2, "g"), b("p", 3, "h"), b("q", 4, "h")];
    const labels = supersetLabels(blocks);
    expect(labels.get("x")).toBe("A1");
    expect(labels.get("z")).toBe("A2");
    expect(labels.get("p")).toBe("B1");
    expect(labels.get("q")).toBe("B2");
    expect(labels.has("y")).toBe(false);
  });

  it("rests after the last member only", () => {
    const blocks = [b("x", 0, "g"), b("y", 1, "g"), b("z", 2)];
    expect(endsSuperset(blocks[0]!, blocks)).toBe(false);
    expect(endsSuperset(blocks[1]!, blocks)).toBe(true);
    expect(endsSuperset(blocks[2]!, blocks)).toBe(true);
  });

  it("links with the next block, joining an existing group", () => {
    const blocks = [b("x", 0), b("y", 1, "g"), b("z", 2, "g")];
    const changes = relinkSuperset(blocks, "x", true, fresh);
    expect(changes.get("x")).toBe("g");
    expect(changes.get("y")).toBe("g");
  });

  it("does nothing to link the last block, and never leaves a group of one", () => {
    expect(relinkSuperset([b("x", 0)], "x", true, fresh).size).toBe(0);
    const pair = [b("x", 0, "g"), b("y", 1, "g")];
    const changes = relinkSuperset(pair, "x", false, fresh);
    expect(changes.get("x")).toBeUndefined();
    expect(changes.get("y")).toBeUndefined();
    expect(changes.size).toBe(2);
  });

  it("splits a group of three and keeps both halves valid", () => {
    const trio = [b("x", 0, "g"), b("y", 1, "g"), b("z", 2, "g")];
    const changes = relinkSuperset(trio, "y", false, fresh);
    expect(changes.get("z")).toBeUndefined();
    expect(changes.has("x")).toBe(false);
  });
});

describe("the store and the rest timer", () => {
  beforeEach(() => useGym.getState().resetAll());

  it("skips the rest between partners and starts it after the last one", () => {
    const state = useGym.getState();
    state.updateSettings({ restTimerAutoStart: true });
    const id = state.startEmptyWorkout("Test");
    const [first, second] = useGym
      .getState()
      .exercises.filter((e) => e.trackingType === "weight_reps");
    useGym.getState().addExerciseToWorkout(id, first!.id);
    useGym.getState().addExerciseToWorkout(id, second!.id);
    const blocks = () =>
      useGym
        .getState()
        .workoutExercises.filter((row) => row.workoutId === id)
        .sort((a, c) => a.order - c.order);
    useGym.getState().setSuperset(blocks()[0]!.id, true);
    expect(blocks()[0]!.supersetGroup).toBeTruthy();
    expect(blocks()[0]!.supersetGroup).toBe(blocks()[1]!.supersetGroup);

    const setOf = (blockId: string) =>
      useGym.getState().workoutSets.find((row) => row.workoutExerciseId === blockId)!;
    useGym.getState().completeSet(setOf(blocks()[0]!.id).id);
    expect(useGym.getState().restTimer).toBeNull();
    useGym.getState().completeSet(setOf(blocks()[1]!.id).id);
    expect(useGym.getState().restTimer).not.toBeNull();
  });
});
