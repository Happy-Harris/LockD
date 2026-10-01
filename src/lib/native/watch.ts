import { inboxFromPlugin, type InboxPlugin, type IntentInbox } from "./pending-intents";
import { registerPlugin } from "@capacitor/core";
import type { TimerState, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { formatWeight, type WeightUnit } from "@/domain/units";
import { setCountKey } from "@/domain/volume";
import type { PersonalRecord } from "@/lib/gym/analytics";
import type { GhostSet } from "@/lib/gym/ghost";
import { priorForSlot, slotOf } from "@/lib/gym/pairs";
import { platform } from "./platform";

/**
 * The watch companion (Opp 7, `docs/design/watch-companion.md`): the TypeScript side.
 *
 * The phone owns the log. The watch gets a small snapshot of the active workout and sends back intents, and the
 * phone applies every intent through the same store actions the screen uses, so each rule (rest after a pair,
 * warm-up rest, record detection) runs in one place. The watch holds no log, runs no engine and logs nothing while
 * the phone is out of reach. Version 1 is complete set and rest only: no editing weight or reps on the wrist, no
 * starting a workout, no complication, no heart rate. The native SwiftUI watch app and the phone-side module are not
 * written here; on the web every call is a no-op.
 */

export const WATCH_PROTOCOL_VERSION = 1;
/** Seconds the watch's plus and minus add or remove. The phone's own buttons use the same step. */
export const WATCH_REST_STEP_SECONDS = 15;

export interface WatchSetLine {
  setId: string;
  /** Working sets count from 1; a left and right pair is one set. 0 for a warm-up. */
  setNumber: number;
  setCount: number;
  setType: WorkoutSet["setType"];
  side?: "left" | "right";
  /** What is planned or typed, in grams and whole reps. Formatted on the watch by the rule in `formatWeight`. */
  weightG?: number;
  reps?: number;
  /** The same slot last time. Missing means there is no previous session to show. */
  previous?: { weightG?: number; reps?: number };
}

export interface WatchRestLine {
  endsAt: string;
  isRunning: boolean;
  remainingSeconds: number;
  label?: string;
}

export interface WatchSnapshot {
  version: typeof WATCH_PROTOCOL_VERSION;
  workoutId: string;
  workoutName: string;
  exerciseName: string;
  /** Null when every set is done. */
  set: WatchSetLine | null;
  /** Shown only when the progression engine made a call for this lift; never a guess. */
  nextTarget?: { weightG?: number; reps?: number; why: string };
  unit: WeightUnit;
  rest: WatchRestLine | null;
  /** The phone's "Vibrate when rest ends" setting; the watch follows it. */
  vibrate: boolean;
  /**
   * The same numbers as words, written by the phone with `formatWeight` so the watch never formats a weight itself and
   * the two can never disagree. Each is absent when its numbers are missing; the watch then shows the gap as a gap.
   */
  display?: { load?: string; previous?: string; target?: string };
  /** A short line for a moment after a record; names the lift and the value only. */
  record?: string;
  /**
   * What the phone did with the watch's recent taps, by the id the watch gave each one. The watch shows a tap as
   * waiting until the phone says here that it was applied, and says plainly when it was not. Newest last.
   */
  acks?: WatchAck[];
}

export interface WatchAck {
  id: string;
  result: "applied" | "dropped";
  /** Why a dropped tap was not applied: `stale`, `no-workout`, `no-timer`, `superseded` or `invalid`. */
  reason?: string;
}

export const WATCH_ACK_LIMIT = 10;

export type WatchIntent =
  | { type: "completeSet"; setId: string }
  | { type: "adjustRest"; deltaSeconds: number }
  | { type: "stopRest" };

/** What the native `LockdWatch` plugin implements. Taps arrive through its durable inbox, never as a bare event. */
export interface LockdWatchPlugin extends InboxPlugin {
  send(snapshot: WatchSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface WatchBridge {
  send(snapshot: WatchSnapshot): Promise<void>;
  clear(): Promise<void>;
  inbox: IntentInbox;
}

export interface WatchSnapshotInput {
  workout: Workout;
  exercises: readonly WorkoutExercise[];
  sets: readonly WorkoutSet[];
  restTimer: TimerState | null;
  unit: WeightUnit;
  vibrate: boolean;
  nowMs: number;
  /** The previous session's working sets for each exercise in the workout, keyed by workout exercise id. */
  ghosts: ReadonlyMap<string, readonly GhostSet[]>;
  /** The progression engine's call for each exercise in the workout, keyed by workout exercise id. */
  targets: ReadonlyMap<string, { weightG?: number; reps?: number; why: string } | undefined>;
  record?: string;
  acks?: readonly WatchAck[];
}

/** "80 kg × 5", "80 kg" or "5 reps"; undefined when neither number is there. Never a zero for a missing one. */
export function loadText(weightG: number | undefined, reps: number | undefined, unit: WeightUnit): string | undefined {
  if (weightG !== undefined && reps !== undefined) return `${formatWeight(weightG, unit)} ${unit} × ${reps}`;
  if (weightG !== undefined) return `${formatWeight(weightG, unit)} ${unit}`;
  if (reps !== undefined) return `${reps} reps`;
  return undefined;
}

/** The set the watch shows: the first set not done, in workout order. Warm-ups count. */
export function currentSetOf(
  workout: Pick<Workout, "id">,
  exercises: readonly WorkoutExercise[],
  sets: readonly WorkoutSet[],
): { exercise: WorkoutExercise; rows: WorkoutSet[]; index: number } | null {
  const blocks = exercises
    .filter((row) => row.workoutId === workout.id)
    .sort((a, b) => a.order - b.order);
  for (const exercise of blocks) {
    const rows = sets
      .filter((set) => set.workoutExerciseId === exercise.id)
      .sort((a, b) => a.order - b.order);
    const index = rows.findIndex((set) => !set.isCompleted);
    if (index >= 0) return { exercise, rows, index };
  }
  return null;
}

function previousFor(rows: readonly WorkoutSet[], ghosts: readonly GhostSet[], index: number): GhostSet | undefined {
  const row = rows[index]!;
  if (row.setType === "warmup") return undefined;
  if (row.side) return priorForSlot(ghosts, slotOf(rows, index), index);
  const ghostIndex = rows.slice(0, index + 1).filter((other) => other.setType !== "warmup").length - 1;
  return ghosts[Math.max(0, ghostIndex)];
}

/** The watch's view of the active workout. Pure; nothing here is stored. Null when nothing is being logged. */
export function buildWatchSnapshot(input: WatchSnapshotInput): WatchSnapshot | null {
  const { workout, exercises, sets, restTimer, unit, nowMs } = input;
  if (workout.status !== "active") return null;
  const current = currentSetOf(workout, exercises, sets);
  const rest = restTimer && restTimer.isRunning === false
    ? { endsAt: restTimer.endsAt, isRunning: false, remainingSeconds: restTimer.durationSeconds }
    : restTimer
      ? {
          endsAt: restTimer.endsAt,
          isRunning: true,
          remainingSeconds: Math.max(0, Math.ceil((Date.parse(restTimer.endsAt) - nowMs) / 1000)),
        }
      : null;
  const restLine: WatchRestLine | null = rest
    ? { ...rest, ...(restTimer?.label ? { label: restTimer.label } : {}) }
    : null;

  if (!current) {
    const last = exercises
      .filter((row) => row.workoutId === workout.id)
      .sort((a, b) => b.order - a.order)[0];
    return {
      version: WATCH_PROTOCOL_VERSION,
      workoutId: workout.id,
      workoutName: workout.name,
      exerciseName: last?.exerciseNameSnapshot ?? workout.name,
      set: null,
      unit,
      rest: restLine,
      vibrate: input.vibrate,
      ...(input.record ? { record: input.record } : {}),
      ...(input.acks?.length ? { acks: [...input.acks] } : {}),
    };
  }

  const { exercise, rows, index } = current;
  const row = rows[index]!;
  const working = rows.filter((set) => set.setType !== "warmup");
  const workingNumber =
    row.setType === "warmup"
      ? 0
      : row.side
        ? slotOf(rows, index).pairIndex + 1
        : rows.slice(0, index + 1).filter((set) => set.setType !== "warmup" && !set.side).length;
  const previous = previousFor(rows, input.ghosts.get(exercise.id) ?? [], index);
  const target = input.targets.get(exercise.id);
  const display = {
    ...(loadText(row.weightG, row.reps, unit) ? { load: loadText(row.weightG, row.reps, unit) } : {}),
    ...(previous && loadText(previous.weightG, previous.reps, unit)
      ? { previous: loadText(previous.weightG, previous.reps, unit) }
      : {}),
    ...(target && loadText(target.weightG, target.reps, unit) ? { target: loadText(target.weightG, target.reps, unit) } : {}),
  };
  return {
    version: WATCH_PROTOCOL_VERSION,
    workoutId: workout.id,
    workoutName: workout.name,
    exerciseName: exercise.exerciseNameSnapshot,
    set: {
      setId: row.id,
      setNumber: workingNumber,
      setCount: new Set(working.map(setCountKey)).size,
      setType: row.setType,
      ...(row.side ? { side: row.side } : {}),
      ...(row.weightG !== undefined ? { weightG: row.weightG } : {}),
      ...(row.reps !== undefined ? { reps: row.reps } : {}),
      ...(previous && (previous.weightG !== undefined || previous.reps !== undefined)
        ? { previous: { weightG: previous.weightG, reps: previous.reps } }
        : {}),
    },
    ...(target && (target.weightG !== undefined || target.reps !== undefined)
      ? { nextTarget: { weightG: target.weightG, reps: target.reps, why: target.why } }
      : {}),
    unit,
    rest: restLine,
    vibrate: input.vibrate,
    ...(Object.keys(display).length ? { display } : {}),
    ...(input.record ? { record: input.record } : {}),
    ...(input.acks?.length ? { acks: [...input.acks] } : {}),
  };
}

/** "Bench Press 102.5 kg" for a record. Names the lift and the value only. */
export function recordLine(record: PersonalRecord, unit: WeightUnit): string {
  return `${record.exerciseName} ${formatWeight(record.value, unit)} ${unit}`;
}

/** Reads an intent off the wire. Anything else is dropped; the watch is not trusted to be well formed. */
export function parseWatchIntent(raw: unknown): WatchIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (item.type === "completeSet") {
    return typeof item.setId === "string" && item.setId !== "" ? { type: "completeSet", setId: item.setId } : null;
  }
  if (item.type === "adjustRest") {
    const delta = item.deltaSeconds;
    return typeof delta === "number" && Number.isInteger(delta) && delta !== 0 && Math.abs(delta) <= 60
      ? { type: "adjustRest", deltaSeconds: delta }
      : null;
  }
  if (item.type === "stopRest") return { type: "stopRest" };
  return null;
}

export type IntentResult =
  | { applied: true; records: PersonalRecord[] }
  | { applied: false; reason: "invalid" | "no-workout" | "stale" | "no-timer" | "superseded" };

export interface IntentDeps {
  workout: Workout | undefined;
  exercises: readonly WorkoutExercise[];
  sets: readonly WorkoutSet[];
  restTimer: TimerState | null;
  completeSet: (setId: string, atMs?: number) => PersonalRecord[];
  adjustRestTimer: (deltaSeconds: number, atMs?: number) => void;
  stopRestTimer: () => void;
  /** When the tap happened, if it waited in the inbox. Work is stamped with this, not with the time it was applied. */
  atMs?: number;
}

/**
 * Applies one intent through the store's own actions. A complete-set tap carries the set the watch was shown and
 * lands only if that is still the current set, so a stale tap cannot log the wrong one; it is dropped and the
 * watch is sent a fresh snapshot.
 */
export function applyWatchIntent(raw: unknown, deps: IntentDeps): IntentResult {
  const intent = parseWatchIntent(raw);
  if (!intent) return { applied: false, reason: "invalid" };
  if (intent.type === "completeSet") {
    if (!deps.workout || deps.workout.status !== "active") return { applied: false, reason: "no-workout" };
    const current = currentSetOf(deps.workout, deps.exercises, deps.sets);
    if (!current || current.rows[current.index]!.id !== intent.setId) return { applied: false, reason: "stale" };
    return { applied: true, records: deps.completeSet(intent.setId, deps.atMs) };
  }
  if (!deps.restTimer) return { applied: false, reason: "no-timer" };
  // A tap made before the current timer started belongs to an earlier timer and must not change this one.
  if (deps.atMs !== undefined && deps.atMs < Date.parse(deps.restTimer.startedAt)) {
    return { applied: false, reason: "superseded" };
  }
  if (intent.type === "adjustRest") deps.adjustRestTimer(intent.deltaSeconds, deps.atMs);
  else deps.stopRestTimer();
  return { applied: true, records: [] };
}

/** The phone to watch sender. It talks to the watch only when something the watch shows has changed. */
export function createWatchSync(bridge: WatchBridge) {
  let signature: string | null = null;
  let last: WatchSnapshot | null = null;
  const swallow = (work: Promise<void>) => work.catch(() => undefined);
  return {
    sync(snapshot: WatchSnapshot | null): void {
      if (!snapshot) return void this.clear();
      // The countdown is drawn on the watch from `endsAt`, so its remaining seconds are not part of the signature.
      const { rest, ...rest2 } = snapshot;
      const next = JSON.stringify([rest2, rest ? [rest.endsAt, rest.isRunning, rest.label ?? ""] : null]);
      if (next === signature) return;
      signature = next;
      last = snapshot;
      void swallow(bridge.send(snapshot));
    },
    /** Sends the last snapshot again, for a watch that acted on a screen the phone has moved past. */
    resend(): void {
      if (last) void swallow(bridge.send(last));
    },
    clear(): void {
      if (signature === null) return;
      signature = null;
      last = null;
      void swallow(bridge.clear());
    },
    inbox: bridge.inbox,
  };
}

const nativePlugin = registerPlugin<LockdWatchPlugin>("LockdWatch", {
  web: {
    send: async () => undefined,
    clear: async () => undefined,
    pendingActions: async () => ({ items: [] }),
    acknowledgeActions: async () => undefined,
    addListener: async () => ({ remove: async () => undefined }),
  } satisfies LockdWatchPlugin,
});

/** Apple Watch first; Wear OS starts after the Apple Watch app has been in use (owner's answer 7). */
export const watchIsSupported = (): boolean => platform() === "ios";

export const nativeWatchBridge: WatchBridge = {
  async send(snapshot) {
    if (watchIsSupported()) await nativePlugin.send(snapshot);
  },
  async clear() {
    if (watchIsSupported()) await nativePlugin.clear();
  },
  inbox: inboxFromPlugin(nativePlugin, watchIsSupported),
};

export const watchSync = createWatchSync(nativeWatchBridge);
