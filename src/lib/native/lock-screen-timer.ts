import { registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { TimerState } from "@/domain/types";
import { isNativePlatform } from "./platform";

/**
 * The lock-screen rest timer (Opp 6, native half; `docs/design/lock-screen-rest-timer.md`).
 *
 * The web store stays the one owner of the timer. This module only mirrors `restTimer` to the phone: an iOS Live
 * Activity or an Android ongoing notification counting down to `endsAt` (the `LockScreenTimer` plugin, native code
 * not written here), plus one local notification at `endsAt` so the alert fires with the app suspended (the official
 * local-notifications plugin). Native code never counts down and never edits the timer: its plus, minus and stop
 * buttons come back as events and go through the store. On the web every call is a no-op.
 */

/** Seconds a lock-screen button adds or removes. The in-app buttons and the Media Session use the same step. */
export const LOCK_SCREEN_STEP_SECONDS = 15;
/** How long "Rest done" stays on the lock screen before it clears itself. */
export const LOCK_SCREEN_DONE_LINGER_SECONDS = 60;
/** The one scheduled end-of-rest notification. A fixed id means a new timer replaces the old alert. */
export const REST_END_NOTIFICATION_ID = 4201;

export interface LockScreenTimerPayload {
  workoutId?: string;
  setId?: string;
  startedAt: string;
  endsAt: string;
  /** `endsAt` as epoch milliseconds, for native code that has no ISO parser on old phones. */
  endsAtMs: number;
  durationSeconds: number;
  isRunning: boolean;
  /** Whole seconds left when paused; the phone shows this instead of counting down. */
  remainingSeconds: number;
  label?: string;
}

export type LockScreenAction = "plus" | "minus" | "stop";

/** What the native `LockScreenTimer` plugin implements. */
export interface LockScreenTimerPlugin {
  show(timer: LockScreenTimerPayload): Promise<void>;
  update(timer: LockScreenTimerPayload): Promise<void>;
  clear(): Promise<void>;
  addListener(
    event: "action",
    listener: (event: { action: LockScreenAction }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/** The lock-screen surface, and the alert, as the sync logic sees them. Faked in tests. */
export interface LockScreenBridge {
  show(timer: LockScreenTimerPayload): Promise<void>;
  update(timer: LockScreenTimerPayload): Promise<void>;
  clear(): Promise<void>;
  scheduleEnd(endsAtMs: number, label: string | undefined): Promise<void>;
  cancelEnd(): Promise<void>;
  onAction(listener: (action: LockScreenAction) => void): () => void;
}

export function payloadFor(timer: TimerState, nowMs: number): LockScreenTimerPayload {
  const remainingMs = Math.max(0, Date.parse(timer.endsAt) - nowMs);
  return {
    ...(timer.workoutId ? { workoutId: timer.workoutId } : {}),
    ...(timer.setId ? { setId: timer.setId } : {}),
    startedAt: timer.startedAt,
    endsAt: timer.endsAt,
    endsAtMs: Date.parse(timer.endsAt),
    durationSeconds: timer.durationSeconds,
    isRunning: timer.isRunning,
    // A paused timer keeps its remainder in `durationSeconds`.
    remainingSeconds: timer.isRunning ? Math.ceil(remainingMs / 1000) : timer.durationSeconds,
    ...(timer.label ? { label: timer.label } : {}),
  };
}

/**
 * Keeps the phone in step with the store's timer. `sync` is called on every change and every tick, so it only
 * talks to the phone when something the phone shows has changed. A failed native call is dropped: the in-app timer
 * is the source of truth and a missing lock-screen tile must never get in the way of logging.
 */
export function createLockScreenSync(bridge: LockScreenBridge) {
  let shown = false;
  let signature = "";
  let scheduledFor: number | null = null;

  const swallow = (work: Promise<void>) => work.catch(() => undefined);

  return {
    sync(timer: TimerState | null, options: { notify: boolean; nowMs: number }): void {
      const { notify, nowMs } = options;
      if (!timer) return void this.clear();
      const endsAtMs = Date.parse(timer.endsAt);
      if (timer.isRunning && nowMs > endsAtMs + LOCK_SCREEN_DONE_LINGER_SECONDS * 1000) return void this.clear();

      const payload = payloadFor(timer, nowMs);
      const next = [payload.endsAt, payload.isRunning, payload.label ?? "", payload.durationSeconds, endsAtMs <= nowMs].join("|");
      if (next !== signature) {
        signature = next;
        void swallow(shown ? bridge.update(payload) : bridge.show(payload));
        shown = true;
      }

      const wantAlert = notify && timer.isRunning && endsAtMs > nowMs;
      if (wantAlert && scheduledFor !== endsAtMs) {
        scheduledFor = endsAtMs;
        void swallow(bridge.scheduleEnd(endsAtMs, timer.label));
      } else if (!wantAlert && scheduledFor !== null && endsAtMs > nowMs) {
        scheduledFor = null;
        void swallow(bridge.cancelEnd());
      }
    },
    clear(): void {
      if (!shown && scheduledFor === null) return;
      if (shown) void swallow(bridge.clear());
      if (scheduledFor !== null) void swallow(bridge.cancelEnd());
      shown = false;
      signature = "";
      scheduledFor = null;
    },
    onAction: bridge.onAction,
  };
}

const nativePlugin = registerPlugin<LockScreenTimerPlugin>("LockScreenTimer", {
  web: {
    show: async () => undefined,
    update: async () => undefined,
    clear: async () => undefined,
    addListener: async () => ({ remove: async () => undefined }),
  } satisfies LockScreenTimerPlugin,
});

/** The real bridge. Every call is skipped on the web. */
export const nativeLockScreenBridge: LockScreenBridge = {
  async show(timer) {
    if (isNativePlatform()) await nativePlugin.show(timer);
  },
  async update(timer) {
    if (isNativePlatform()) await nativePlugin.update(timer);
  },
  async clear() {
    if (isNativePlatform()) await nativePlugin.clear();
  },
  async scheduleEnd(endsAtMs, label) {
    if (!isNativePlatform()) return;
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== "granted") return;
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_END_NOTIFICATION_ID,
          title: "Rest done",
          body: label ?? "Next set",
          schedule: { at: new Date(endsAtMs), allowWhileIdle: true },
        },
      ],
    });
  },
  async cancelEnd() {
    if (isNativePlatform()) await LocalNotifications.cancel({ notifications: [{ id: REST_END_NOTIFICATION_ID }] });
  },
  onAction(listener) {
    if (!isNativePlatform()) return () => undefined;
    let handle: { remove: () => Promise<void> } | null = null;
    let removed = false;
    void nativePlugin
      .addListener("action", (event) => listener(event.action))
      .then((added) => {
        if (removed) void added.remove();
        else handle = added;
      })
      .catch(() => undefined);
    return () => {
      removed = true;
      if (handle) void handle.remove();
    };
  },
};

export const lockScreenSync = createLockScreenSync(nativeLockScreenBridge);
