import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LockdRepository } from "./repository";

const KEY = "lockd-v1";
const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/persist", name), "utf8");

/** A fresh copy of the app's modules on top of an in-memory `localStorage` and its own database. */
async function setup(raw: string | null, wrap?: (repo: LockdRepository) => LockdRepository) {
  vi.resetModules();
  const data = new Map<string, string>(raw === null ? [] : [[KEY, raw]]);
  const writes: string[] = [];
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: (key: string) => void data.delete(key),
  });
  const { useGym } = await import("@/lib/gym/store");
  const boot = await import("./boot");
  const backend = await import("./backend");
  const dbModule = await import("./db");
  const { DexieRepository } = await import("./dexie-repository");
  const { persistedSlice } = await import("./persisted");
  const db = new dbModule.LockdDatabase(`lockd-boot-${Math.random()}`);
  dbModule.setLockdDb(db);
  const dexie = new DexieRepository(db);
  const repo = wrap ? wrap(dexie) : dexie;
  return { data, writes, useGym, boot, backend, db, dexie, repo, persistedSlice, dbModule };
}

type Env = Awaited<ReturnType<typeof setup>>;

/** A second page load: new modules, same `localStorage`, same database. */
async function reload(env: Env) {
  vi.resetModules();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => env.data.get(key) ?? null,
    setItem: (key: string, value: string) => void env.data.set(key, value),
    removeItem: (key: string) => void env.data.delete(key),
  });
  const { useGym } = await import("@/lib/gym/store");
  const boot = await import("./boot");
  const { DexieRepository } = await import("./dexie-repository");
  const { persistedSlice } = await import("./persisted");
  const backend = await import("./backend");
  return { useGym, boot, repo: new DexieRepository(env.db), persistedSlice, backend };
}

afterEach(() => vi.unstubAllGlobals());

describe("first boot", () => {
  it("moves the sample log into the database and never writes localStorage again", async () => {
    const raw = fixture("persist-v3-demo.json");
    const env = await setup(raw);
    const result = await env.boot.bootStorage({ repo: env.repo });
    expect(result).toMatchObject({ mode: "dexie" });
    expect(result.readMs).toBeGreaterThanOrEqual(0);
    expect(env.useGym.getState().hydrated).toBe(true);
    expect(env.useGym.getState().workouts).toHaveLength(137);

    env.useGym.getState().updateSettings({ themeMode: "light" });
    const id = env.useGym.getState().startEmptyWorkout("Boot test");
    await env.boot.flushWrites();

    expect(env.writes).toEqual([]); // not a single localStorage write
    expect(env.data.get(KEY)).toBe(raw); // byte-identical
    expect((await env.dexie.load()).workouts.some((w) => w.id === id)).toBe(true);
    expect((await env.dexie.load()).settings.themeMode).toBe("light");
  });

  it("sets up a fresh install with no old payload", async () => {
    const env = await setup(null);
    expect((await env.boot.bootStorage({ repo: env.repo })).mode).toBe("dexie");
    expect(env.useGym.getState().exercises.length).toBeGreaterThan(0);
    expect((await env.dexie.meta()).migratedFrom).toBe("fresh");
  });

  it("shares one boot between callers, as React strict mode makes two", async () => {
    const env = await setup(fixture("persist-v3-imperial-custom.json"));
    const [a, b] = await Promise.all([
      env.boot.bootStorage({ repo: env.repo }),
      env.boot.bootStorage({ repo: env.repo }),
    ]);
    expect(a).toBe(b);
    expect(await env.db.safetyBackups.count()).toBe(1);
  });
});

describe("the writer", () => {
  it("writes each tick's changes once, and only the changed rows", async () => {
    const applied: unknown[] = [];
    const env = await setup(fixture("persist-v3-active-workout.json"), (repo) =>
      Object.assign(Object.create(repo), {
        apply: async (changes: Parameters<LockdRepository["apply"]>[0]) => {
          applied.push(changes);
          return repo.apply(changes);
        },
      }),
    );
    await env.boot.bootStorage({ repo: env.repo });
    applied.length = 0;
    const g = env.useGym.getState;
    const set = g().workoutSets.find((s) => !s.isCompleted)!;
    for (let i = 0; i < 10; i += 1) g().updateSet(set.id, { reps: i + 1 });
    await env.boot.flushWrites();
    expect(applied).toHaveLength(1);
    const changes = applied[0] as { put: { workoutSets: unknown[] } };
    expect(Object.keys(changes.put)).toEqual(["workoutSets"]);
    expect(changes.put.workoutSets).toHaveLength(1);
    expect((await env.dexie.load()).workoutSets.find((s) => s.id === set.id)?.reps).toBe(10);
  });

  it("keeps the log across a reload, including an active workout and its timer", async () => {
    const env = await setup(fixture("persist-v3-active-workout.json"));
    await env.boot.bootStorage({ repo: env.repo });
    const before = env.useGym.getState();
    const target = before.workoutSets.find((s) => !s.isCompleted)!;
    before.updateSet(target.id, { weightG: 77_000, reps: 7 });
    before.completeSet(target.id);
    await env.boot.flushWrites();
    const expected = env.persistedSlice(env.useGym.getState());

    const next = await reload(env);
    expect((await next.boot.bootStorage({ repo: next.repo })).mode).toBe("dexie");
    const after = next.persistedSlice(next.useGym.getState());
    expect(after.workoutSets.find((s) => s.id === target.id)).toMatchObject({
      weightG: 77_000,
      reps: 7,
      isCompleted: true,
    });
    expect(after.restTimer).toEqual(expected.restTimer);
    expect(after.workouts).toHaveLength(expected.workouts.length);
    expect(next.useGym.getState().resumeActiveWorkoutId()).toBe(before.resumeActiveWorkoutId());
  });

  it("reports a failed write, retries it with the next change, and clears the notice", async () => {
    let failures = 0; // armed after boot: the library top-up at boot also writes
    const env = await setup(fixture("persist-v3-imperial-custom.json"), (repo) =>
      Object.assign(Object.create(repo), {
        apply: async (changes: Parameters<LockdRepository["apply"]>[0]) => {
          if (failures-- > 0) throw new Error("QuotaExceededError");
          return repo.apply(changes);
        },
      }),
    );
    await env.boot.bootStorage({ repo: env.repo });
    failures = 1;
    const g = env.useGym.getState;
    const first = g().startEmptyWorkout("First");
    await env.boot.flushWrites();
    const status = (await import("./backend")).useStorageStatus;
    expect(status.getState().notice).toMatchObject({
      kind: "write-failed",
      message: "QuotaExceededError",
    });

    const second = g().startEmptyWorkout("Second");
    await env.boot.flushWrites();
    expect(status.getState().notice).toBeNull();
    const ids = (await env.dexie.load()).workouts.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining([first, second]));
  });
});

describe("the exercise library top-up", () => {
  const count = (exercises: Array<{ isCustom: boolean }>) =>
    exercises.filter((e) => !e.isCustom).length;

  it("gives an existing install the exercises added since it was made, once, and touches nothing else", async () => {
    // A log from before the library had versions: 66 seeded exercises, one of the lifter's own.
    const raw = fixture("persist-v3-imperial-custom.json");
    const env = await setup(raw);
    const before = JSON.parse(raw).state.exercises as Array<{
      id: string;
      isCustom: boolean;
      name: string;
    }>;
    expect(count(before)).toBe(66);

    await env.boot.bootStorage({ repo: env.repo });
    const stored = await env.dexie.load();
    expect(count(stored.exercises)).toBe(93);
    expect(env.useGym.getState().exercises).toHaveLength(94); // 93 seeded + the lifter's own
    // Every exercise that was there is still there, unchanged.
    for (const row of before) {
      expect(stored.exercises.find((e) => e.id === row.id)).toMatchObject(row);
    }
    expect((await env.dexie.meta()).seedLibraryVersion).toBe(3);
    expect(env.data.get(KEY)).toBe(raw); // the old payload is byte-identical

    // A second page load adds nothing, and the store agrees with the database.
    const next = await reload(env);
    await next.boot.bootStorage({ repo: next.repo });
    expect((await next.repo.load()).exercises).toHaveLength(94);
    expect(next.useGym.getState().exercises).toHaveLength(94);
  });

  it("does not bring back an exercise removed after the top-up", async () => {
    const env = await setup(fixture("persist-v3-imperial-custom.json"));
    await env.boot.bootStorage({ repo: env.repo });
    env.useGym.setState({
      exercises: env.useGym.getState().exercises.filter((e) => e.id !== "seed-rack-pull"),
    });
    await env.boot.flushWrites();
    const next = await reload(env);
    await next.boot.bootStorage({ repo: next.repo });
    expect(next.useGym.getState().exercises.some((e) => e.id === "seed-rack-pull")).toBe(false);
  });

  it("starts a fresh install with the whole library and records that it is current", async () => {
    const env = await setup(null);
    await env.boot.bootStorage({ repo: env.repo });
    expect(env.useGym.getState().exercises).toHaveLength(93);
    expect((await env.dexie.load()).exercises).toHaveLength(93);
    expect((await env.dexie.meta()).seedLibraryVersion).toBe(3);
  });

  it("still opens the app when the top-up cannot be stored, and tries again next time", async () => {
    let failing = true;
    const env = await setup(fixture("persist-v3-demo.json"), (repo) =>
      Object.assign(Object.create(repo), {
        apply: async (changes: Parameters<LockdRepository["apply"]>[0]) => {
          if (failing && changes.put?.exercises) throw new Error("QuotaExceededError");
          return repo.apply(changes);
        },
      }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await env.boot.bootStorage({ repo: env.repo });
    error.mockRestore();
    expect(result.mode).toBe("dexie");
    expect(env.useGym.getState().hydrated).toBe(true);
    expect(env.useGym.getState().exercises).toHaveLength(66); // as it was
    expect((await env.dexie.meta()).seedLibraryVersion).toBeUndefined();

    failing = false;
    const next = await reload(env);
    await next.boot.bootStorage({ repo: next.repo });
    expect(next.useGym.getState().exercises).toHaveLength(93);
    expect((await next.repo.meta()).seedLibraryVersion).toBe(3);
  });
});

describe("fallbacks keep the guest working", () => {
  it("uses localStorage as before when there is no IndexedDB", async () => {
    const raw = fixture("persist-v3-imperial-custom.json");
    const env = await setup(raw);
    const result = await env.boot.bootStorage({ repo: env.repo, hasIndexedDb: () => false });
    expect(result.mode).toBe("local");
    expect(env.useGym.getState().workouts).toHaveLength(2);
    env.useGym.getState().startEmptyWorkout("Old path");
    expect(env.writes).toContain(KEY);
    expect(JSON.parse(env.data.get(KEY)!).state.workouts).toHaveLength(3);
  });

  it("keeps running from localStorage when the copy does not verify, and says so", async () => {
    const raw = fixture("persist-v3-imperial-custom.json");
    const env = await setup(raw, (repo) =>
      Object.assign(Object.create(repo), {
        load: async () => {
          const slice = await repo.load();
          return { ...slice, workoutSets: slice.workoutSets.slice(1) };
        },
      }),
    );
    const result = await env.boot.bootStorage({ repo: env.repo });
    expect(result).toEqual({ mode: "local", notice: { kind: "move-not-verified" } });
    expect(env.useGym.getState().workouts).toHaveLength(2);
    expect(env.data.get(KEY)).toBe(raw);
    expect((await env.dexie.meta()).migratedFrom).toBeUndefined();
  });

  it("falls back when the database fails to open or answer", async () => {
    const env = await setup(fixture("persist-v3-imperial-custom.json"), (repo) =>
      Object.assign(Object.create(repo), {
        meta: async () => Promise.reject(new Error("blocked")),
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await env.boot.bootStorage({ repo: env.repo });
    expect(result.mode).toBe("local");
    expect(env.useGym.getState().workouts).toHaveLength(2);
  });
});

describe("a log that cannot be read is never overwritten", () => {
  it("keeps the raw string, starts a new log in the database, and says so", async () => {
    const raw = fixture("persist-corrupt.txt");
    const env = await setup(raw);
    const result = await env.boot.bootStorage({ repo: env.repo });
    expect(result).toEqual({
      mode: "dexie",
      notice: { kind: "unreadable-log", rawCopyKept: true },
    });

    env.useGym.getState().startEmptyWorkout("After the failure");
    await env.boot.flushWrites();
    expect(env.data.get(KEY)).toBe(raw); // the unreadable string is still there
    expect(env.writes).toEqual([]);
    const copies = await env.db.safetyBackups.toArray();
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ format: "raw-localstorage", json: raw });
    expect((await env.dexie.load()).workouts).toHaveLength(1);

    // The next boot has no notice: the new log is the log, and the raw copy stays downloadable.
    const next = await reload(env);
    next.backend.useStorageStatus.getState().setNotice(null);
    expect((await next.boot.bootStorage({ repo: next.repo })).notice).toBeUndefined();
    expect(next.useGym.getState().workouts).toHaveLength(1);
    expect(await env.db.safetyBackups.count()).toBe(1);
  });

  it("freezes writes when there is no database to keep a copy in", async () => {
    const raw = fixture("persist-corrupt.txt");
    const env = await setup(raw);
    const result = await env.boot.bootStorage({ repo: env.repo, hasIndexedDb: () => false });
    expect(result).toEqual({
      mode: "frozen",
      notice: { kind: "unreadable-log", rawCopyKept: false },
    });
    env.useGym.getState().startEmptyWorkout("Nowhere to save");
    expect(env.writes).toEqual([]);
    expect(env.data.get(KEY)).toBe(raw);
  });
});

describe("a very large removal", () => {
  it("is stored quickly, as a replace, and the database matches the store", async () => {
    const env = await setup(fixture("persist-v3-demo.json"));
    await env.boot.bootStorage({ repo: env.repo });
    const replaced = vi.spyOn(env.dexie, "replaceAll");
    const applied = vi.spyOn(env.dexie, "apply");
    env.useGym.getState().resetAll();
    const started = performance.now();
    await env.boot.flushWrites();
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(replaced).toHaveBeenCalledTimes(1);
    expect(applied).not.toHaveBeenCalled();
    const loaded = await env.dexie.load();
    expect(loaded.workoutSets).toEqual([]);
    expect(loaded.exercises.length).toBe(env.useGym.getState().exercises.length);
  });

  it("stores a small removal as row deletes", async () => {
    const env = await setup(fixture("persist-v3-demo.json"));
    await env.boot.bootStorage({ repo: env.repo });
    const replaced = vi.spyOn(env.dexie, "replaceAll");
    const set = env.useGym.getState().workoutSets[0]!;
    env.useGym.getState().deleteSet(set.id);
    await env.boot.flushWrites();
    expect(replaced).not.toHaveBeenCalled();
    expect((await env.dexie.load()).workoutSets.some((s) => s.id === set.id)).toBe(false);
  });
});

describe("delete local cache and restore", () => {
  it("deletes the live log, the old key and every safety copy", async () => {
    const env = await setup(fixture("persist-v3-demo.json"));
    await env.boot.bootStorage({ repo: env.repo });
    expect(await env.db.safetyBackups.count()).toBe(1);

    env.useGym.getState().resetAll();
    await env.boot.eraseAllOnDevice();
    await env.boot.flushWrites();

    expect(env.data.has(KEY)).toBe(false);
    expect(await env.db.safetyBackups.count()).toBe(0);
    const loaded = await env.dexie.load();
    expect(loaded.workouts).toEqual([]);
    expect(loaded.workoutSets).toEqual([]);
  });

  it("restores the copy taken before the move, after taking a copy of the current log", async () => {
    const env = await setup(fixture("persist-v3-imperial-custom.json"));
    await env.boot.bootStorage({ repo: env.repo });
    const moved = env.useGym.getState().workouts.length;
    const raw = (await env.db.safetyBackups.toArray())[0]!.json;
    env.useGym.getState().startEmptyWorkout("Added after the move");
    await env.boot.flushWrites();
    expect(env.useGym.getState().workouts).toHaveLength(moved + 1);

    await env.boot.restoreRawCopy(raw);

    expect(env.useGym.getState().workouts).toHaveLength(moved);
    expect((await env.dexie.load()).workouts).toHaveLength(moved);
    const copies = await env.db.safetyBackups.toArray();
    const before = copies.find((c) => c.reason === "before-restore")!;
    expect(JSON.parse(before.json).workouts).toHaveLength(moved + 1);
  });
});
