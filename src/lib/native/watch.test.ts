import { describe, expect, it, vi } from "vitest";
import type { TimerState, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import type { PersonalRecord } from "@/lib/gym/analytics";
import {
  applyWatchIntent,
  buildWatchSnapshot,
  createWatchSync,
  currentSetOf,
  parseWatchIntent,
  recordLine,
  type WatchBridge,
  type WatchSnapshot,
} from "./watch";

const workout = { id: "w1", name: "Push", status: "active" } as Workout;
const block = (id: string, order: number, name: string) =>
  ({ id, workoutId: "w1", exerciseId: `e-${id}`, order, exerciseNameSnapshot: name }) as WorkoutExercise;
const row = (id: string, ex: string, order: number, extra: Partial<WorkoutSet> = {}) =>
  ({ id, workoutId: "w1", workoutExerciseId: ex, order, setType: "working", isCompleted: false, ...extra }) as WorkoutSet;

const exercises = [block("x1", 0, "Bench Press"), block("x2", 1, "Row")];
const base = () => [
  row("a", "x1", 0, { setType: "warmup", weightG: 40000, reps: 8, isCompleted: true }),
  row("b", "x1", 1, { weightG: 80000, reps: 5 }),
  row("c", "x1", 2, { weightG: 80000, reps: 5 }),
  row("d", "x2", 0, { weightG: 60000, reps: 10 }),
];

const timer = (over: Partial<TimerState> = {}): TimerState => ({
  startedAt: "2026-01-01T10:00:00.000Z",
  endsAt: "2026-01-01T10:01:30.000Z",
  durationSeconds: 90,
  isRunning: true,
  ...over,
});

const input = (sets: WorkoutSet[], over: Record<string, unknown> = {}) => ({
  workout,
  exercises,
  sets,
  restTimer: null,
  unit: "kg" as const,
  vibrate: true,
  nowMs: Date.parse("2026-01-01T10:00:30.000Z"),
  ghosts: new Map(),
  targets: new Map(),
  ...over,
});

describe("watch snapshot", () => {
  it("shows the first set not done, counting working sets from 1", () => {
    const snap = buildWatchSnapshot(input(base()))!;
    expect(snap.exerciseName).toBe("Bench Press");
    expect(snap.set).toMatchObject({ setId: "b", setNumber: 1, setCount: 2, weightG: 80000, reps: 5 });
  });

  it("moves to the next lift and then to an empty set when all are done", () => {
    const sets = base().map((s) => (s.id === "d" ? s : { ...s, isCompleted: true }));
    expect(buildWatchSnapshot(input(sets))!.exerciseName).toBe("Row");
    const done = sets.map((s) => ({ ...s, isCompleted: true }));
    expect(buildWatchSnapshot(input(done))!.set).toBeNull();
  });

  it("returns null when the workout is not active", () => {
    expect(buildWatchSnapshot(input(base(), { workout: { ...workout, status: "completed" } }))).toBeNull();
  });

  it("shows previous values only when there is a previous session, and never for a warm-up", () => {
    expect(buildWatchSnapshot(input(base()))!.set!.previous).toBeUndefined();
    const ghosts = new Map([["x1", [{ weightG: 77500, reps: 5 }, { weightG: 77500, reps: 4 }]]]);
    expect(buildWatchSnapshot(input(base(), { ghosts }))!.set!.previous).toEqual({ weightG: 77500, reps: 5 });
    const warm = base().map((s) => (s.id === "a" ? { ...s, isCompleted: false } : s));
    expect(buildWatchSnapshot(input(warm, { ghosts }))!.set).toMatchObject({ setNumber: 0, setType: "warmup" });
    expect(buildWatchSnapshot(input(warm, { ghosts }))!.set!.previous).toBeUndefined();
  });

  it("counts a left and right pair as one set and matches each side to its prior side", () => {
    const sets = [
      row("l1", "x1", 0, { pairId: "p1", side: "left", weightG: 20000, reps: 10 }),
      row("r1", "x1", 1, { pairId: "p1", side: "right", weightG: 20000, reps: 10 }),
      row("l2", "x1", 2, { pairId: "p2", side: "left", weightG: 20000, reps: 10 }),
      row("r2", "x1", 3, { pairId: "p2", side: "right", weightG: 20000, reps: 10 }),
    ];
    const ghosts = new Map([["x1", [
      { side: "left" as const, weightG: 17500, reps: 9 },
      { side: "right" as const, weightG: 17500, reps: 8 },
    ]]]);
    const snap = buildWatchSnapshot(input(sets, { ghosts }))!;
    expect(snap.set).toMatchObject({ setId: "l1", side: "left", setNumber: 1, setCount: 2 });
    expect(snap.set!.previous).toEqual({ weightG: 17500, reps: 9 });
    const after = sets.map((s) => (s.id === "l1" ? { ...s, isCompleted: true } : s));
    expect(buildWatchSnapshot(input(after, { ghosts }))!.set).toMatchObject({ setId: "r1", side: "right", setNumber: 1 });
    expect(buildWatchSnapshot(input(after, { ghosts }))!.set!.previous).toEqual({ weightG: 17500, reps: 8 });
  });

  it("carries the engine's target only when it made one", () => {
    expect(buildWatchSnapshot(input(base()))!.nextTarget).toBeUndefined();
    const targets = new Map([["x1", { weightG: 82500, reps: 5, why: "Hit every rep at 80 kg twice." }]]);
    expect(buildWatchSnapshot(input(base(), { targets }))!.nextTarget).toMatchObject({ weightG: 82500 });
    const empty = new Map([["x1", { why: "Nothing to go on." }]]);
    expect(buildWatchSnapshot(input(base(), { targets: empty }))!.nextTarget).toBeUndefined();
  });

  it("reports rest from its end time, and the set length while paused", () => {
    expect(buildWatchSnapshot(input(base(), { restTimer: timer() }))!.rest).toMatchObject({
      isRunning: true,
      remainingSeconds: 60,
    });
    expect(buildWatchSnapshot(input(base(), { restTimer: timer({ isRunning: false, durationSeconds: 75 }) }))!.rest).toMatchObject({
      isRunning: false,
      remainingSeconds: 75,
    });
  });

  it("words a record with the lift and the value only", () => {
    const record = { exerciseName: "Bench Press", value: 102500 } as PersonalRecord;
    expect(recordLine(record, "kg")).toBe("Bench Press 102.5 kg");
  });
});

describe("watch intents", () => {
  it("drops anything that is not a well formed intent", () => {
    for (const bad of [null, "x", {}, { type: "completeSet" }, { type: "completeSet", setId: "" }, { type: "adjustRest", deltaSeconds: 0 }, { type: "adjustRest", deltaSeconds: 1.5 }, { type: "adjustRest", deltaSeconds: 600 }, { type: "nope" }]) {
      expect(parseWatchIntent(bad)).toBeNull();
    }
    expect(parseWatchIntent({ type: "adjustRest", deltaSeconds: -15 })).toEqual({ type: "adjustRest", deltaSeconds: -15 });
    expect(parseWatchIntent({ type: "stopRest" })).toEqual({ type: "stopRest" });
  });

  const deps = (sets = base(), over: Record<string, unknown> = {}) => ({
    workout,
    exercises,
    sets,
    restTimer: timer(),
    completeSet: vi.fn(() => []),
    adjustRestTimer: vi.fn(),
    stopRestTimer: vi.fn(),
    ...over,
  });

  it("completes the set the watch was shown", () => {
    const d = deps();
    expect(applyWatchIntent({ type: "completeSet", setId: "b" }, d)).toEqual({ applied: true, records: [] });
    expect(d.completeSet).toHaveBeenCalledWith("b");
  });

  it("drops a tap on a set that is no longer the current one", () => {
    const d = deps();
    expect(applyWatchIntent({ type: "completeSet", setId: "c" }, d)).toEqual({ applied: false, reason: "stale" });
    expect(applyWatchIntent({ type: "completeSet", setId: "zzz" }, d)).toEqual({ applied: false, reason: "stale" });
    expect(d.completeSet).not.toHaveBeenCalled();
  });

  it("does nothing without an active workout", () => {
    const d = deps(base(), { workout: undefined });
    expect(applyWatchIntent({ type: "completeSet", setId: "b" }, d)).toEqual({ applied: false, reason: "no-workout" });
  });

  it("adjusts and stops rest only while a timer exists", () => {
    const d = deps();
    expect(applyWatchIntent({ type: "adjustRest", deltaSeconds: 15 }, d).applied).toBe(true);
    expect(d.adjustRestTimer).toHaveBeenCalledWith(15);
    expect(applyWatchIntent({ type: "stopRest" }, d).applied).toBe(true);
    expect(d.stopRestTimer).toHaveBeenCalled();
    const none = deps(base(), { restTimer: null });
    expect(applyWatchIntent({ type: "stopRest" }, none)).toEqual({ applied: false, reason: "no-timer" });
    expect(none.stopRestTimer).not.toHaveBeenCalled();
  });

  it("finds no current set when everything is done", () => {
    expect(currentSetOf(workout, exercises, base().map((s) => ({ ...s, isCompleted: true })))).toBeNull();
  });
});

describe("watch sync", () => {
  const bridge = () => {
    const b = { send: vi.fn(async () => undefined), clear: vi.fn(async () => undefined), onIntent: vi.fn(() => () => undefined) };
    return b satisfies WatchBridge;
  };
  const snap = (over: Partial<WatchSnapshot> = {}) => ({ ...buildWatchSnapshot(input(base(), { restTimer: timer() }))!, ...over });

  it("sends once for an unchanged screen, ignoring the countdown", () => {
    const b = bridge();
    const sync = createWatchSync(b);
    sync.sync(snap());
    const ticked = snap();
    ticked.rest = { ...ticked.rest!, remainingSeconds: 10 };
    sync.sync(ticked);
    expect(b.send).toHaveBeenCalledTimes(1);
    sync.sync(snap({ vibrate: false }));
    expect(b.send).toHaveBeenCalledTimes(2);
  });

  it("clears once, and only after something was sent", () => {
    const b = bridge();
    const sync = createWatchSync(b);
    sync.clear();
    expect(b.clear).not.toHaveBeenCalled();
    sync.sync(snap());
    sync.sync(null);
    sync.sync(null);
    expect(b.clear).toHaveBeenCalledTimes(1);
  });

  it("resends the last screen on request", () => {
    const b = bridge();
    const sync = createWatchSync(b);
    sync.resend();
    expect(b.send).not.toHaveBeenCalled();
    sync.sync(snap());
    sync.resend();
    expect(b.send).toHaveBeenCalledTimes(2);
  });

  it("never throws when the watch is unreachable", async () => {
    const b = { ...bridge(), send: vi.fn(async () => { throw new Error("unreachable"); }) };
    const sync = createWatchSync(b);
    expect(() => sync.sync(snap())).not.toThrow();
    await Promise.resolve();
  });
});
