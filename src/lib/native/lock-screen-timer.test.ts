import { describe, expect, it, vi } from "vitest";
import type { TimerState } from "@/domain/types";
import {
  createLockScreenSync,
  LOCK_SCREEN_DONE_LINGER_SECONDS,
  payloadFor,
  applyLockScreenAction,
  type LockScreenBridge,
} from "./lock-screen-timer";

function fakeBridge() {
  const calls: string[] = [];
  const bridge: LockScreenBridge = {
    show: async (t) => void calls.push(`show ${t.remainingSeconds}`),
    update: async (t) => void calls.push(`update ${t.remainingSeconds}${t.isRunning ? "" : " paused"}`),
    clear: async () => void calls.push("clear"),
    scheduleEnd: async (at) => void calls.push(`schedule ${new Date(at).toISOString().slice(11, 19)}`),
    cancelEnd: async () => void calls.push("cancel"),
    inbox: { pending: async () => [], acknowledge: async () => undefined, onWake: () => () => undefined },
  };
  return { bridge, calls };
}

const START = Date.parse("2026-09-30T12:00:00Z");
const timer = (over: Partial<TimerState> = {}): TimerState => ({
  workoutId: "w1",
  setId: "s1",
  startedAt: "2026-09-30T12:00:00.000Z",
  endsAt: "2026-09-30T12:02:00.000Z",
  durationSeconds: 120,
  isRunning: true,
  label: "Bench Press",
  ...over,
});

describe("lock-screen payload", () => {
  it("carries the store's timestamps, and counts whole seconds up", () => {
    expect(payloadFor(timer(), START + 500)).toMatchObject({
      endsAt: "2026-09-30T12:02:00.000Z",
      endsAtMs: Date.parse("2026-09-30T12:02:00.000Z"),
      remainingSeconds: 120,
      isRunning: true,
      label: "Bench Press",
    });
    expect(payloadFor(timer(), START + 60_500).remainingSeconds).toBe(60);
  });

  it("a paused timer shows the remainder the store kept, not a countdown", () => {
    expect(payloadFor(timer({ isRunning: false, durationSeconds: 45 }), START + 70_000).remainingSeconds).toBe(45);
  });
});

describe("lock-screen sync", () => {
  it("shows once, schedules the end alert once, and stays quiet while the phone counts", () => {
    const { bridge, calls } = fakeBridge();
    const sync = createLockScreenSync(bridge);
    for (let tick = 0; tick < 5; tick += 1) sync.sync(timer(), { notify: true, nowMs: START + tick * 200 });
    expect(calls).toEqual(["show 120", "schedule 12:02:00"]);
  });

  it("does not schedule the alert when notifications are off", () => {
    const { bridge, calls } = fakeBridge();
    createLockScreenSync(bridge).sync(timer(), { notify: false, nowMs: START });
    expect(calls).toEqual(["show 120"]);
  });

  it("plus or minus (a new end time) updates the tile and replaces the alert", () => {
    const { bridge, calls } = fakeBridge();
    const sync = createLockScreenSync(bridge);
    sync.sync(timer(), { notify: true, nowMs: START });
    sync.sync(timer({ endsAt: "2026-09-30T12:02:15.000Z", durationSeconds: 135 }), { notify: true, nowMs: START + 200 });
    expect(calls).toEqual(["show 120", "schedule 12:02:00", "update 135", "schedule 12:02:15"]);
  });

  it("pause cancels the alert and shows the kept remainder; resume is a new timer", () => {
    const { bridge, calls } = fakeBridge();
    const sync = createLockScreenSync(bridge);
    sync.sync(timer(), { notify: true, nowMs: START });
    sync.sync(timer({ isRunning: false, durationSeconds: 90 }), { notify: true, nowMs: START + 30_000 });
    expect(calls).toEqual(["show 120", "schedule 12:02:00", "update 90 paused", "cancel"]);
  });

  it("marks rest done once at the end, keeps the alert it already scheduled, and clears after the linger", () => {
    const { bridge, calls } = fakeBridge();
    const sync = createLockScreenSync(bridge);
    const opts = (nowMs: number) => ({ notify: true, nowMs });
    sync.sync(timer(), opts(START));
    sync.sync(timer(), opts(START + 120_000));
    sync.sync(timer(), opts(START + 121_000));
    expect(calls).toEqual(["show 120", "schedule 12:02:00", "update 0"]);
    sync.sync(timer(), opts(START + 120_000 + (LOCK_SCREEN_DONE_LINGER_SECONDS + 1) * 1000));
    expect(calls.slice(3)).toEqual(["clear", "cancel"]);
    sync.sync(timer(), opts(START + 400_000));
    expect(calls).toHaveLength(5);
  });

  it("clears the tile and the alert when the timer goes away (stop, or the workout ends)", () => {
    const { bridge, calls } = fakeBridge();
    const sync = createLockScreenSync(bridge);
    sync.sync(timer(), { notify: true, nowMs: START });
    sync.sync(null, { notify: true, nowMs: START + 5_000 });
    sync.sync(null, { notify: true, nowMs: START + 6_000 });
    expect(calls).toEqual(["show 120", "schedule 12:02:00", "clear", "cancel"]);
  });

  it("does nothing when no timer was ever shown", () => {
    const { bridge, calls } = fakeBridge();
    createLockScreenSync(bridge).sync(null, { notify: true, nowMs: START });
    expect(calls).toEqual([]);
  });

  it("a failing native call never throws into the app", async () => {
    const { bridge } = fakeBridge();
    const failing: LockScreenBridge = { ...bridge, show: () => Promise.reject(new Error("no plugin")), scheduleEnd: () => Promise.reject(new Error("denied")) };
    const sync = createLockScreenSync(failing);
    expect(() => sync.sync(timer(), { notify: true, nowMs: START })).not.toThrow();
    await Promise.resolve();
  });

});

describe("a queued lock-screen button", () => {
  const deps = (over: Record<string, unknown> = {}) => ({
    restTimer: timer(),
    adjustRestTimer: vi.fn(),
    stopRestTimer: vi.fn(),
    ...over,
  });
  const tapAfterStart = START + 5_000;

  it("adds and removes a step, as of when it was tapped", () => {
    const d = deps();
    expect(applyLockScreenAction({ action: "plus" }, tapAfterStart, d)).toEqual({ applied: true });
    expect(d.adjustRestTimer).toHaveBeenCalledWith(15, tapAfterStart);
    expect(applyLockScreenAction({ action: "minus" }, tapAfterStart, d)).toEqual({ applied: true });
    expect(d.adjustRestTimer).toHaveBeenLastCalledWith(-15, tapAfterStart);
  });

  it("stops the timer", () => {
    const d = deps();
    expect(applyLockScreenAction({ action: "stop" }, tapAfterStart, d)).toEqual({ applied: true });
    expect(d.stopRestTimer).toHaveBeenCalled();
  });

  it("does not apply a tap with no timer, one from before the current timer, or one it cannot read", () => {
    const none = deps({ restTimer: null });
    expect(applyLockScreenAction({ action: "stop" }, tapAfterStart, none)).toEqual({ applied: false, reason: "no-timer" });
    const old = deps();
    expect(applyLockScreenAction({ action: "plus" }, START - 1, old)).toEqual({ applied: false, reason: "superseded" });
    expect(old.adjustRestTimer).not.toHaveBeenCalled();
    for (const bad of [null, {}, { action: "explode" }, "plus"]) {
      expect(applyLockScreenAction(bad, tapAfterStart, deps())).toEqual({ applied: false, reason: "invalid" });
    }
  });
});
