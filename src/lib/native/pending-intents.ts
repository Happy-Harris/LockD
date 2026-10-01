/**
 * The durable inbox for taps that arrive while the web layer is not running (the watch, the lock-screen timer).
 *
 * The phone's web store is the only writer of the log and the timer. Native code only keeps a persisted queue of
 * what was tapped and when. When the web layer is running again it pulls the queue, applies each item through the
 * store, and only then acknowledges it, so a tap is never dropped because nothing was listening. An item is
 * acknowledged after it is applied, and a persisted ring of handled ids stops an item that was applied but not yet
 * acknowledged (the app died in between) from being applied twice.
 */

export interface PendingIntent {
  id: string;
  /** When the tap happened, epoch ms. Applied work is stamped with this, not with the time the queue was read. */
  receivedAtMs: number;
  payload: unknown;
}

export interface IntentInbox {
  pending(): Promise<PendingIntent[]>;
  acknowledge(ids: string[]): Promise<void>;
  /** The native side says the queue grew. A hint only: the queue is the truth, and a missed hint loses nothing. */
  onWake(listener: () => void): () => void;
}

export type IntentOutcome = { applied: true } | { applied: false; reason: string };

export interface SeenIds {
  has(id: string): boolean;
  add(id: string): void;
}

const SEEN_LIMIT = 100;

/** A queued tap older than this is not applied: a lifter who tapped it that long ago has moved on. It is reported, not hidden. */
export const QUEUED_TAP_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** A ring of the last handled ids, kept in `localStorage` when there is one and in memory otherwise. */
export function createSeenIds(key: string, storage: Pick<Storage, "getItem" | "setItem"> | undefined): SeenIds {
  let ids: string[] = [];
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) ids = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    ids = [];
  }
  return {
    has: (id) => ids.includes(id),
    add(id) {
      if (ids.includes(id)) return;
      ids = [...ids, id].slice(-SEEN_LIMIT);
      try {
        storage?.setItem(key, JSON.stringify(ids));
      } catch {
        // Memory still holds the ring for this run.
      }
    },
  };
}

export interface IntentDrainOptions {
  inbox: IntentInbox;
  /** Applies one item through the store. Must not throw for a stale or invalid tap: return why it was not applied. */
  handle: (intent: PendingIntent) => IntentOutcome;
  seen: SeenIds;
  /** Epoch ms now; injectable for tests. */
  now?: () => number;
  /** Called once per item after it is handled, in tap order. */
  onOutcome?: (intent: PendingIntent, outcome: IntentOutcome) => void;
}

export function createIntentDrain(options: IntentDrainOptions) {
  const { inbox, handle, seen, onOutcome } = options;
  const now = options.now ?? Date.now;
  let running: Promise<void> = Promise.resolve();

  async function once(): Promise<void> {
    let items: PendingIntent[];
    try {
      items = [...(await inbox.pending())].sort((a, b) => a.receivedAtMs - b.receivedAtMs);
    } catch {
      return;
    }
    if (items.length === 0) return;
    const done: string[] = [];
    for (const item of items) {
      if (!seen.has(item.id)) {
        let outcome: IntentOutcome;
        try {
          outcome =
            now() - item.receivedAtMs > QUEUED_TAP_MAX_AGE_MS ? { applied: false, reason: "expired" } : handle(item);
        } catch {
          // Not applied and not remembered: it stays queued and the next drain tries it again.
          continue;
        }
        seen.add(item.id);
        onOutcome?.(item, outcome);
      }
      done.push(item.id);
    }
    if (done.length > 0) await inbox.acknowledge(done).catch(() => undefined);
  }

  return {
    /** Reads and applies what is queued. Calls queue up behind each other, so two wake-ups never interleave. */
    drain(): Promise<void> {
      running = running.then(once, once);
      return running;
    },
    /** Drains now, on every native hint, and again whenever the page comes back to the front. */
    start(): () => void {
      void this.drain();
      const off = inbox.onWake(() => void this.drain());
      const onShow = () => {
        if (typeof document === "undefined" || document.visibilityState === "visible") void this.drain();
      };
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onShow);
      if (typeof window !== "undefined") window.addEventListener("focus", onShow);
      return () => {
        off();
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onShow);
        if (typeof window !== "undefined") window.removeEventListener("focus", onShow);
      };
    },
  };
}

/** What a native plugin with a durable inbox implements. Both `LockScreenTimer` and `LockdWatch` do. */
export interface InboxPlugin {
  pendingActions(): Promise<{ items: PendingIntent[] }>;
  acknowledgeActions(options: { ids: string[] }): Promise<void>;
  addListener(event: "pending", listener: () => void): Promise<{ remove: () => Promise<void> }>;
}

/** Wraps a plugin as an inbox. With `enabled()` false (the web) it is permanently empty. */
export function inboxFromPlugin(plugin: InboxPlugin, enabled: () => boolean): IntentInbox {
  return {
    async pending() {
      if (!enabled()) return [];
      const { items } = await plugin.pendingActions();
      return items.filter(
        (item) => typeof item.id === "string" && item.id !== "" && Number.isFinite(item.receivedAtMs),
      );
    },
    async acknowledge(ids) {
      if (enabled() && ids.length > 0) await plugin.acknowledgeActions({ ids });
    },
    onWake(listener) {
      if (!enabled()) return () => undefined;
      let handle: { remove: () => Promise<void> } | null = null;
      let removed = false;
      void plugin
        .addListener("pending", listener)
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
}
