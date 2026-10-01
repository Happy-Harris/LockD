import { describe, expect, it, vi } from "vitest";
import {
  createIntentDrain,
  createSeenIds,
  QUEUED_TAP_MAX_AGE_MS,
  type IntentInbox,
  type IntentOutcome,
  type PendingIntent,
} from "./pending-intents";

function inboxOf(items: PendingIntent[]) {
  const queue = [...items];
  const acknowledge = vi.fn(async (ids: string[]) => {
    for (const id of ids) {
      const at = queue.findIndex((item) => item.id === id);
      if (at >= 0) queue.splice(at, 1);
    }
  });
  const inbox: IntentInbox = { pending: async () => [...queue], acknowledge, onWake: () => () => undefined };
  return { inbox, queue, acknowledge };
}

const item = (id: string, receivedAtMs: number): PendingIntent => ({ id, receivedAtMs, payload: { id } });
const memory = () => createSeenIds("k", undefined);

describe("the intent drain", () => {
  it("applies queued taps in the order they were tapped and then acknowledges them", async () => {
    const { inbox, acknowledge, queue } = inboxOf([item("b", 200), item("a", 100)]);
    const order: string[] = [];
    await createIntentDrain({
      inbox,
      seen: memory(), now: () => 1_000,
      handle: (intent) => {
        order.push(intent.id);
        return { applied: true };
      },
    }).drain();
    expect(order).toEqual(["a", "b"]);
    expect(acknowledge).toHaveBeenCalledWith(["a", "b"]);
    expect(queue).toEqual([]);
  });

  it("reports every outcome, so a tap that did not apply is visible and never silent", async () => {
    const { inbox } = inboxOf([item("a", 1), item("b", 2)]);
    const seen: Array<[string, IntentOutcome]> = [];
    await createIntentDrain({
      inbox,
      seen: memory(), now: () => 1_000,
      handle: (intent) => (intent.id === "a" ? { applied: true } : { applied: false, reason: "stale" }),
      onOutcome: (intent, outcome) => seen.push([intent.id, outcome]),
    }).drain();
    expect(seen).toEqual([
      ["a", { applied: true }],
      ["b", { applied: false, reason: "stale" }],
    ]);
  });

  it("does not apply an item twice when the app died after applying it but before acknowledging it", async () => {
    const storage = new Map<string, string>();
    const backing = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) };
    const handle = vi.fn((): IntentOutcome => ({ applied: true }));
    const first = inboxOf([item("a", 1)]);
    first.acknowledge.mockRejectedValueOnce(new Error("died"));
    await createIntentDrain({ inbox: first.inbox, seen: createSeenIds("ring", backing), now: () => 1_000, handle }).drain();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(first.queue).toHaveLength(1);
    // A new run reads the same ring and the same queue.
    await createIntentDrain({ inbox: first.inbox, seen: createSeenIds("ring", backing), now: () => 1_000, handle }).drain();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(first.queue).toEqual([]);
  });

  it("keeps an item queued when handling it throws, and retries it on the next drain", async () => {
    const { inbox, queue } = inboxOf([item("a", 1)]);
    let calls = 0;
    const drain = createIntentDrain({
      inbox,
      seen: memory(),
      now: () => 1_000,
      handle: () => {
        calls += 1;
        if (calls === 1) throw new Error("store not ready");
        return { applied: true };
      },
    });
    await drain.drain();
    expect(queue).toHaveLength(1);
    await drain.drain();
    expect(queue).toEqual([]);
  });

  it("does not apply a tap that is too old, and says so", async () => {
    const { inbox, queue } = inboxOf([item("old", 1_000)]);
    const handle = vi.fn((): IntentOutcome => ({ applied: true }));
    const seen: Array<[string, IntentOutcome]> = [];
    await createIntentDrain({
      inbox,
      seen: memory(),
      handle,
      now: () => 1_000 + QUEUED_TAP_MAX_AGE_MS + 1,
      onOutcome: (intent, outcome) => seen.push([intent.id, outcome]),
    }).drain();
    expect(handle).not.toHaveBeenCalled();
    expect(seen).toEqual([["old", { applied: false, reason: "expired" }]]);
    expect(queue).toEqual([]);
  });

  it("does not interleave two drains that start together", async () => {
    const { inbox } = inboxOf([item("a", 1)]);
    const handle = vi.fn((): IntentOutcome => ({ applied: true }));
    const drain = createIntentDrain({ inbox, seen: memory(), now: () => 1_000, handle });
    await Promise.all([drain.drain(), drain.drain()]);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("survives an inbox that fails to read", async () => {
    const inbox: IntentInbox = {
      pending: async () => {
        throw new Error("bridge down");
      },
      acknowledge: async () => undefined,
      onWake: () => () => undefined,
    };
    await expect(createIntentDrain({ inbox, seen: memory(), now: () => 1_000, handle: () => ({ applied: true }) }).drain()).resolves.toBeUndefined();
  });
});

describe("the handled-id ring", () => {
  it("remembers ids across instances and keeps only the most recent", () => {
    const storage = new Map<string, string>();
    const backing = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) };
    const ring = createSeenIds("ring", backing);
    for (let i = 0; i < 130; i += 1) ring.add(`id${i}`);
    const again = createSeenIds("ring", backing);
    expect(again.has("id129")).toBe(true);
    expect(again.has("id0")).toBe(false);
  });

  it("works with no storage and with storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const ring = createSeenIds("ring", throwing);
    ring.add("a");
    expect(ring.has("a")).toBe(true);
    expect(createSeenIds("ring", undefined).has("a")).toBe(false);
  });
});
