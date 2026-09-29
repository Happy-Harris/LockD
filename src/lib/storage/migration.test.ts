import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freshData } from "@/lib/gym/store";
import { LockdDatabase, type SafetyBackup } from "./db";
import { DexieRepository } from "./dexie-repository";
import { checksumOf, MIGRATION_LOCK, runMigration, withFreshDefaults } from "./migration";
import { MemoryRepository } from "./memory-repository";
import { migratePersisted, PERSIST_KEY, type PersistedSlice } from "./persisted";
import { keyOf, ROW_COLLECTIONS, type LockdRepository } from "./repository";

const FIXTURES = [
  "persist-v3-demo.json",
  "persist-v3-active-workout.json",
  "persist-v3-imperial-custom.json",
  "persist-v2.json",
  "persist-v1.json",
  "persist-empty-state.json",
];
const read = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/persist", name), "utf8");

/** A `localStorage` that can only be read: any other access throws, so a write cannot go unnoticed. */
function readOnlyStorage(raw: string | null) {
  return new Proxy({ getItem: (key: string) => (key === PERSIST_KEY ? raw : null) } as object, {
    get(target, prop) {
      if (prop === "getItem") return (target as { getItem: (k: string) => string | null }).getItem;
      throw new Error(`The migration touched storage.${String(prop)}`);
    },
  }) as Pick<Storage, "getItem">;
}

/** Same-tab mutex standing in for `navigator.locks`. */
function fakeLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const seen: string[] = [];
  return {
    seen,
    request: ((name: string, callback: () => unknown) => {
      seen.push(name);
      const run = tail.then(() => callback());
      tail = run.catch(() => undefined);
      return run;
    }) as unknown as LockManager["request"],
  };
}

function canonical(slice: PersistedSlice) {
  const out: Record<string, unknown> = {};
  for (const name of ROW_COLLECTIONS) {
    out[name] = [...(slice[name] as readonly unknown[])].sort((a, b) =>
      keyOf(name, a).localeCompare(keyOf(name, b)),
    );
  }
  return { ...out, settings: slice.settings, restTimer: slice.restTimer, labLast: slice.labLast };
}

const fresh = freshData();
const NOW = new Date("2026-09-29T12:00:00.000Z");

type Kit = { repo: LockdRepository; copies: () => Promise<SafetyBackup[]> };
const kinds: Array<[string, () => Kit]> = [
  [
    "MemoryRepository",
    () => {
      const repo = new MemoryRepository();
      return { repo, copies: async () => repo.safety };
    },
  ],
  [
    "DexieRepository",
    () => {
      const db = new LockdDatabase(`lockd-mig-${Math.random()}`);
      return { repo: new DexieRepository(db), copies: () => db.safetyBackups.toArray() };
    },
  ],
];

describe("checksumOf", () => {
  const data = withFreshDefaults(
    migratePersisted(JSON.parse(read("persist-v3-imperial-custom.json")).state, 3),
    fresh,
  );

  it("ignores row order", () => {
    expect(checksumOf({ ...data, workoutSets: [...data.workoutSets].reverse() })).toBe(
      checksumOf(data),
    );
  });

  it("notices a changed rep, a changed load, a missing set and a changed workout status", () => {
    const base = checksumOf(data);
    const set = data.workoutSets[0]!;
    const withSet = (patch: object) => ({
      ...data,
      workoutSets: [{ ...set, ...patch }, ...data.workoutSets.slice(1)],
    });
    expect(checksumOf(withSet({ reps: (set.reps ?? 0) + 1 }))).not.toBe(base);
    expect(checksumOf(withSet({ weightG: (set.weightG ?? 0) + 1 }))).not.toBe(base);
    expect(checksumOf(withSet({ isCompleted: !set.isCompleted }))).not.toBe(base);
    expect(checksumOf({ ...data, workoutSets: data.workoutSets.slice(1) })).not.toBe(base);
    const w = data.workouts[0]!;
    expect(
      checksumOf({
        ...data,
        workouts: [{ ...w, localDate: "1999-01-01" }, ...data.workouts.slice(1)],
      }),
    ).not.toBe(base);
  });
});

describe.each(kinds)("runMigration on %s", (_name, makeKit) => {
  const make = () => makeKit().repo;
  it.each(FIXTURES)(
    "copies %s row for row, verifies it, and records where it came from",
    async (name) => {
      const raw = read(name);
      const repo = make();
      const result = await runMigration({
        repo,
        storage: readOnlyStorage(raw),
        freshData: () => fresh,
        now: () => NOW,
        locks: null,
      });
      expect(result.status).toBe("migrated");
      if (result.status !== "migrated") return;

      const state = JSON.parse(raw) as { state: unknown; version: number };
      const expected = withFreshDefaults(migratePersisted(state.state, state.version), fresh);
      expect(canonical(await repo.load())).toEqual(canonical(expected));
      expect(result.from).toBe(`localStorage:lockd-v1@v${state.version}`);
      expect(result.checksum).toBe(checksumOf(expected));
      expect(await repo.meta()).toMatchObject({
        migratedFrom: result.from,
        migratedAt: NOW.toISOString(),
        sourceChecksum: result.checksum,
      });
    },
  );

  it("keeps the raw string byte for byte in the safety copies, before writing the log", async () => {
    const raw = read("persist-v3-active-workout.json");
    const { repo, copies } = makeKit();
    await runMigration({
      repo,
      storage: readOnlyStorage(raw),
      freshData: () => fresh,
      now: () => NOW,
      locks: null,
    });
    const kept = await copies();
    expect(kept).toHaveLength(1);
    expect(kept[0]!.json).toBe(raw);
    expect(kept[0]!.format).toBe("raw-localstorage");
    expect(kept[0]!.reason).toBe("pre-migration");
  });

  it("boots from the database the second time and does not migrate again", async () => {
    const raw = read("persist-v3-imperial-custom.json");
    const { repo, copies } = makeKit();
    const deps = {
      repo,
      storage: readOnlyStorage(raw),
      freshData: () => fresh,
      now: () => NOW,
      locks: null,
    };
    const first = await runMigration(deps);
    const second = await runMigration(deps);
    expect(second.status).toBe("already-migrated");
    if (first.status !== "migrated" || second.status !== "already-migrated") return;
    expect(canonical(second.data)).toEqual(canonical(first.data));
    expect(second.meta.migratedFrom).toBe(first.from);
    expect(await copies()).toHaveLength(1);
  });

  it("sets up a fresh install when there is no old payload", async () => {
    const repo = make();
    const result = await runMigration({
      repo,
      storage: readOnlyStorage(null),
      freshData: () => fresh,
      now: () => NOW,
      locks: null,
    });
    expect(result.status).toBe("fresh");
    expect(canonical(await repo.load())).toEqual(canonical(fresh));
    expect((await repo.meta()).migratedFrom).toBe("fresh");
  });

  it.each([
    ["truncated JSON", read("persist-corrupt.txt")],
    ["not JSON at all", "<html>oops</html>"],
    ["an array", "[1,2,3]"],
    ["no state", '{"version":3}'],
    ["state is a string", '{"state":"x","version":3}'],
  ])("leaves a corrupt payload completely alone: %s", async (_label, raw) => {
    const { repo, copies } = makeKit();
    const result = await runMigration({
      repo,
      storage: readOnlyStorage(raw),
      freshData: () => fresh,
      now: () => NOW,
      locks: null,
    });
    expect(result.status).toBe("corrupt");
    if (result.status === "corrupt") expect(result.raw).toBe(raw);
    // Nothing seeded, nothing recorded, so the next boot sees the same thing and can offer recovery.
    const loaded = await repo.load();
    for (const name of ROW_COLLECTIONS) expect(loaded[name], name).toEqual([]);
    expect((await repo.meta()).migratedFrom).toBeUndefined();
    expect(await copies()).toHaveLength(0);
  });

  it("fills collections an old payload lacks from fresh data, as the store's merge does", async () => {
    const repo = make();
    await runMigration({
      repo,
      storage: readOnlyStorage(read("persist-empty-state.json")),
      freshData: () => fresh,
      now: () => NOW,
      locks: null,
    });
    const loaded = await repo.load();
    expect(loaded.exercises.length).toBe(fresh.exercises.length);
    expect(loaded.plates.length).toBe(fresh.plates.length);
    expect(loaded.workouts).toEqual([]);
  });

  it("empties the new tables and reports it when the copy does not match, then succeeds later", async () => {
    const raw = read("persist-v3-imperial-custom.json");
    const inner = make();
    let lossy = true;
    const repo: LockdRepository = Object.assign(Object.create(inner), {
      load: async () => {
        const slice = await inner.load();
        return lossy ? { ...slice, workoutSets: slice.workoutSets.slice(1) } : slice;
      },
    });
    const deps = {
      repo,
      storage: readOnlyStorage(raw),
      freshData: () => fresh,
      now: () => NOW,
      locks: null,
    };
    const failed = await runMigration(deps);
    expect(failed.status).toBe("verify-failed");
    if (failed.status === "verify-failed") {
      expect(failed.expected).not.toBe(failed.actual);
      expect(failed.data.workoutSets.length).toBeGreaterThan(0);
    }
    lossy = false;
    const afterFail = await inner.load();
    expect(afterFail.workoutSets).toEqual([]);
    expect(afterFail.exercises).toEqual([]);
    expect((await inner.meta()).migratedFrom).toBeUndefined();

    const retry = await runMigration(deps);
    expect(retry.status).toBe("migrated");
  });

  it("recovers from a crash before the meta was written by simply running again", async () => {
    const raw = read("persist-v3-imperial-custom.json");
    const inner = make();
    let crash = true;
    const repo: LockdRepository = Object.assign(Object.create(inner), {
      setMeta: async (patch: object) => {
        if (crash) throw new Error("tab closed");
        return inner.setMeta(patch);
      },
    });
    const deps = {
      repo,
      storage: readOnlyStorage(raw),
      freshData: () => fresh,
      now: () => NOW,
      locks: null,
    };
    await expect(runMigration(deps)).rejects.toThrow("tab closed");
    expect((await inner.meta()).migratedFrom).toBeUndefined();
    crash = false;
    const result = await runMigration(deps);
    expect(result.status).toBe("migrated");
    const state = JSON.parse(raw) as { state: unknown; version: number };
    expect(canonical(await inner.load())).toEqual(
      canonical(withFreshDefaults(migratePersisted(state.state, state.version), fresh)),
    );
  });

  it("two tabs starting together migrate once, under the lock", async () => {
    const raw = read("persist-v3-imperial-custom.json");
    const { repo, copies } = makeKit();
    const locks = fakeLocks();
    const deps = {
      repo,
      storage: readOnlyStorage(raw),
      freshData: () => fresh,
      now: () => NOW,
      locks,
    };
    const [a, b] = await Promise.all([runMigration(deps), runMigration(deps)]);
    expect([a.status, b.status].sort()).toEqual(["already-migrated", "migrated"]);
    expect(locks.seen).toEqual([MIGRATION_LOCK, MIGRATION_LOCK]);
    expect(await copies()).toHaveLength(1);
  });
});
