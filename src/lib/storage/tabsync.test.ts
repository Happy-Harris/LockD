import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migratePersisted, type PersistedSlice } from "./persisted";
import { applyChangeSet, diffSlices, keyOf, ROW_COLLECTIONS } from "./repository";

const raw = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/persist", name), "utf8");
const slice = (name: string): PersistedSlice => {
  const migrated = migratePersisted((JSON.parse(raw(name)) as { state: unknown }).state, 3);
  return { ...migrated, healthSamples: migrated.healthSamples ?? [] };
};

function canonical(s: PersistedSlice) {
  const out: Record<string, unknown> = {};
  for (const name of ROW_COLLECTIONS) {
    out[name] = [...(s[name] as readonly unknown[])].sort((a, b) =>
      keyOf(name, a).localeCompare(keyOf(name, b)),
    );
  }
  return { ...out, settings: s.settings, restTimer: s.restTimer, labLast: s.labLast };
}

describe("applyChangeSet is the row-level inverse of diffSlices", () => {
  const base = slice("persist-v3-imperial-custom.json");

  it("turns the old state into the new one, and leaves untouched collections alone", () => {
    const edited = { ...base.workoutSets[0]!, reps: 99 };
    const added = { ...base.workoutSets[1]!, id: "added-elsewhere" };
    const removed = base.workoutSets[2]!;
    const next: PersistedSlice = {
      ...base,
      workoutSets: [edited, ...base.workoutSets.slice(1).filter((s) => s.id !== removed.id), added],
      settings: { ...base.settings, themeMode: "light" },
      restTimer: null,
    };
    const changes = diffSlices(base, next)!;
    const applied = applyChangeSet(base, changes);
    expect(canonical(applied)).toEqual(canonical(next));
    expect(applied.workouts).toBe(base.workouts); // untouched: same array
    expect(applied.exercises).toBe(base.exercises);
  });

  it("does nothing for an empty change set", () => {
    expect(applyChangeSet(base, {})).toEqual(base);
  });
});

/** One open tab: its own copy of the app's modules, on the shared database and localStorage. */
async function openTab(shared: { db: unknown; data: Map<string, string> }) {
  vi.resetModules();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => shared.data.get(key) ?? null,
    setItem: (key: string, value: string) => void shared.data.set(key, value),
    removeItem: (key: string) => void shared.data.delete(key),
  });
  const { useGym } = await import("@/lib/gym/store");
  const boot = await import("./boot");
  const dbModule = await import("./db");
  const { DexieRepository } = await import("./dexie-repository");
  const db = (shared.db ??= new dbModule.LockdDatabase(
    `lockd-tabs-${Math.random()}`,
  )) as InstanceType<typeof dbModule.LockdDatabase>;
  const repo = new DexieRepository(db);
  const applied = vi.spyOn(repo, "apply");
  const replaced = vi.spyOn(repo, "replaceAll");
  await boot.bootStorage({ repo });
  return { useGym, boot, repo, applied, replaced, db };
}

type Tab = Awaited<ReturnType<typeof openTab>>;

async function until(condition: () => boolean, what: string) {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

/** Lets in-flight messages and writes settle, so "nothing happened" can be asserted. */
async function settle(...tabs: Tab[]) {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    for (const tab of tabs) await tab.boot.flushWrites();
  }
}

async function twoTabs() {
  const shared = {
    db: undefined as unknown,
    data: new Map([["lockd-v1", raw("persist-v3-imperial-custom.json")]]),
  };
  const a = await openTab(shared);
  const b = await openTab(shared);
  a.applied.mockClear();
  b.applied.mockClear();
  return { a, b };
}

afterEach(() => vi.unstubAllGlobals());

describe("two tabs of the app", () => {
  it("a change in one tab appears in the other, and is not written back", async () => {
    const { a, b } = await twoTabs();
    const before = b.useGym.getState().workouts.length;
    const id = a.useGym.getState().startEmptyWorkout("From tab A");
    await until(
      () => b.useGym.getState().workouts.some((w) => w.id === id),
      "tab B sees the workout",
    );

    expect(b.useGym.getState().workouts).toHaveLength(before + 1);
    await settle(a, b);
    expect(a.applied).toHaveBeenCalledTimes(1); // A wrote it once
    expect(b.applied).not.toHaveBeenCalled(); // B did not echo it
    expect((await a.repo.load()).workouts.filter((w) => w.id === id)).toHaveLength(1);
  });

  it("works in both directions without looping", async () => {
    const { a, b } = await twoTabs();
    const fromA = a.useGym.getState().startEmptyWorkout("A");
    await until(
      () => b.useGym.getState().workouts.some((w) => w.id === fromA),
      "B sees A's workout",
    );
    b.useGym.getState().updateWorkout(fromA, { notes: "edited in B" });
    await until(
      () => a.useGym.getState().workouts.find((w) => w.id === fromA)?.notes === "edited in B",
      "A sees B's edit",
    );
    await settle(a, b);
    expect(a.applied).toHaveBeenCalledTimes(1);
    expect(b.applied).toHaveBeenCalledTimes(1);
  });

  it("keeps two edits to different rows made at the same time", async () => {
    const { a, b } = await twoTabs();
    const [first, second] = a.useGym.getState().workoutSets;
    a.useGym.getState().updateSet(first!.id, { reps: 41 });
    b.useGym.getState().updateSet(second!.id, { reps: 42 });
    await until(
      () =>
        a.useGym.getState().workoutSets.find((s) => s.id === second!.id)?.reps === 42 &&
        b.useGym.getState().workoutSets.find((s) => s.id === first!.id)?.reps === 41,
      "each tab sees the other's edit",
    );
    await settle(a, b);
    const stored = await a.repo.load();
    expect(stored.workoutSets.find((s) => s.id === first!.id)?.reps).toBe(41);
    expect(stored.workoutSets.find((s) => s.id === second!.id)?.reps).toBe(42);
  });

  it("shares the rest timer and settings, which are documents, not rows", async () => {
    const { a, b } = await twoTabs();
    a.useGym.getState().startRestTimer(90, undefined, undefined, "Bench");
    a.useGym.getState().updateSettings({ themeMode: "light" });
    await until(
      () =>
        b.useGym.getState().restTimer?.label === "Bench" &&
        b.useGym.getState().settings.themeMode === "light",
      "B sees the timer and setting",
    );
    a.useGym.getState().stopRestTimer();
    await until(() => b.useGym.getState().restTimer === null, "B sees the timer stop");
  });

  it("reloads the whole log in the other tab after a replace (delete everything)", async () => {
    const shared = {
      db: undefined as unknown,
      data: new Map([["lockd-v1", raw("persist-v3-demo.json")]]),
    };
    const a = await openTab(shared);
    const b = await openTab(shared);
    expect(b.useGym.getState().workouts).toHaveLength(137);
    a.useGym.getState().resetAll();
    await until(() => b.useGym.getState().workouts.length === 0, "B empties");
    expect(b.useGym.getState().workoutSets).toEqual([]);
    expect(a.replaced).toHaveBeenCalled();
    await settle(a, b);
    expect(b.replaced).not.toHaveBeenCalled(); // B adopted it, and did not write it back
  });
});
