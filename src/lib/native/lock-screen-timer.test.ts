import { describe, expect, it } from "vitest";
import type { TimerState } from "@/domain/types";
import {
  createLockScreenSync,
  LOCK_SCREEN_DONE_LINGER_SECONDS,
  payloadFor,
  type LockScreenAction,
  type LockScreenBridge,
} from "./lock-screen-timer";

function fakeBridge() {
  const calls: string[] = [];
  const listeners = new Set<(action: LockScreenAction) => void>();
  const bridge: LockScreenBridge = {
    show: async (t) => void calls.push(`show ${t.remainingSeconds}`),
    update: async (t) => void calls.push(`update ${t.remainingSeconds}${t.isRunning ? "" : " paused"}`),
    clear: async () => void calls.push("clear"),
    scheduleEnd: async (at) => void calls.push(`schedule ${new Date(at).toISOString().slice(11, 19)}`),
    cancelEnd: async () => void calls.push("cancel"),
    onAction: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { bridge, calls, press: (action: LockScreenAction) => listeners.forEach((l) => l(action)) };
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

  it("passes the lock screen's buttons through", () => {
    const { bridge, press } = fakeBridge();
    const seen: string[] = [];
    const off = createLockScreenSync(bridge).onAction((a) => seen.push(a));
    press("plus");
    press("stop");
    off();
    press("minus");
    expect(seen).toEqual(["plus", "stop"]);
  });
});
