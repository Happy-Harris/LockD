import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION, type LockdBackup, type WorkoutSet } from "@/domain/types";
import { defaultSettings } from "@/lib/gym/settings";
import { LockdDatabase } from "./db";
import { DexieRepository } from "./dexie-repository";
import { MemoryRepository } from "./memory-repository";
import type { PersistedSlice } from "./persisted";
import { migratePersisted } from "./persisted";
import { keyOf, ROW_COLLECTIONS, type LockdRepository } from "./repository";

// The old-format fixtures predate `healthSamples`; the migration runner adds it empty (`withFreshDefaults`).
const fixture = (name: string): PersistedSlice => {
  const migrated = migratePersisted(
    (
      JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/persist", name), "utf8"),
      ) as { state: unknown }
    ).state,
    3,
  );
  return { ...migrated, healthSamples: migrated.healthSamples ?? [] };
};

/** Row order is not part of the contract, so compare each collection sorted by key. */
function canonical(slice: PersistedSlice): Record<string, unknown> & { workouts: unknown[] } {
  const out: Record<string, unknown> = {};
  for (const name of ROW_COLLECTIONS) {
    out[name] = [...(slice[name] as readonly unknown[])].sort((a, b) =>
      keyOf(name, a).localeCompare(keyOf(name, b)),
    );
  }
  return {
    ...out,
    workouts: out.workouts as unknown[],
    settings: slice.settings,
    restTimer: slice.restTimer,
    labLast: slice.labLast,
  };
}

function emptyBackup(): LockdBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-09-29T10:00:00.000Z",
    exercises: [],
    templates: [],
    templateExercises: [],
    workouts: [],
    workoutExercises: [],
    workoutSets: [],
    measurements: [],
    plates: [],
    bars: [],
    settings: defaultSettings(),
  };
}

const implementations: Array<[string, () => LockdRepository]> = [
  ["MemoryRepository", () => new MemoryRepository()],
  ["DexieRepository", () => new DexieRepository(new LockdDatabase(`lockd-test-${Math.random()}`))],
];

describe.each(implementations)("%s behaves as a LockdRepository", (_name, make) => {
  let repo: LockdRepository;
  beforeEach(() => {
    repo = make();
  });
  afterEach(() => undefined);

  it("loads an empty log with default settings when nothing was stored", async () => {
    const loaded = await repo.load();
    for (const name of ROW_COLLECTIONS) expect(loaded[name], name).toEqual([]);
    expect(loaded.settings).toEqual(defaultSettings());
    expect(loaded.restTimer).toBeNull();
    expect(loaded.labLast).toBeNull();
  });

  it.each(["persist-v3-imperial-custom.json", "persist-v3-active-workout.json"])(
    "replaceAll then load returns every row and document unchanged: %s",
    async (name) => {
      const data = fixture(name);
      await repo.replaceAll(data);
      expect(canonical(await repo.load())).toEqual(canonical(data));
    },
  );

  it("round-trips the 5-year sample log (137 sessions, 2,560 sets)", async () => {
    const data = fixture("persist-v3-demo.json");
    await repo.replaceAll(data);
    const loaded = await repo.load();
    expect(loaded.workoutSets).toHaveLength(data.workoutSets.length);
    expect(canonical(loaded)).toEqual(canonical(data));
  });

  it("replaceAll drops what the new data does not have", async () => {
    await repo.replaceAll(fixture("persist-v3-imperial-custom.json"));
    await repo.replaceAll(fixture("persist-v3-active-workout.json"));
    expect(canonical(await repo.load())).toEqual(
      canonical(fixture("persist-v3-active-workout.json")),
    );
  });

  it("apply stores puts, removals and documents in one go", async () => {
    const data = fixture("persist-v3-imperial-custom.json");
    await repo.replaceAll(data);
    const edited: WorkoutSet = { ...data.workoutSets[0]!, reps: 99 };
    const removed = data.workoutSets[1]!;
    await repo.apply({
      put: { workoutSets: [edited] },
      remove: { workoutSets: [removed.id] },
      kv: { settings: { ...data.settings, unitSystem: "metric" } },
    });
    const loaded = await repo.load();
    expect(loaded.workoutSets.find((row) => row.id === edited.id)?.reps).toBe(99);
    expect(loaded.workoutSets.some((row) => row.id === removed.id)).toBe(false);
    expect(loaded.workoutSets).toHaveLength(data.workoutSets.length - 1);
    expect(loaded.settings.unitSystem).toBe("metric");
    expect(canonical(loaded).workouts).toEqual(canonical(data).workouts);
  });

  it("apply stores nothing at all when one row is invalid", async () => {
    const data = fixture("persist-v3-imperial-custom.json");
    await repo.replaceAll(data);
    const before = canonical(await repo.load());
    await expect(
      repo.apply({
        put: {
          workoutSets: [{ ...data.workoutSets[0]!, reps: 77 }],
          exercises: [{ name: "no id" } as never],
        },
      }),
    ).rejects.toThrow(/no id/);
    expect(canonical(await repo.load())).toEqual(before);
  });

  it("replaceAll with an invalid row keeps the old log", async () => {
    const data = fixture("persist-v3-imperial-custom.json");
    await repo.replaceAll(data);
    const before = canonical(await repo.load());
    await expect(
      repo.replaceAll({
        ...fixture("persist-v3-active-workout.json"),
        lessons: [{ text: "x" } as never],
      }),
    ).rejects.toThrow(/no id/);
    expect(canonical(await repo.load())).toEqual(before);
  });

  it("importBatch adds thousands of rows and leaves the rest alone", async () => {
    const data = fixture("persist-v3-imperial-custom.json");
    await repo.replaceAll(data);
    const template = data.workoutSets[0]!;
    const many = Array.from({ length: 5_500 }, (_, i) => ({ ...template, id: `import-${i}` }));
    await repo.importBatch({ workoutSets: many });
    const loaded = await repo.load();
    expect(loaded.workoutSets).toHaveLength(data.workoutSets.length + 5_500);
    expect(canonical(loaded).workouts).toEqual(canonical(data).workouts);
  });

  it("keeps meta, and starts with the schema version only", async () => {
    expect((await repo.meta()).migratedFrom).toBeUndefined();
    await repo.setMeta({
      migratedFrom: "localStorage:lockd-v1@v3",
      migratedAt: "2026-09-29T10:00:00.000Z",
    });
    await repo.setMeta({ sourceChecksum: "abc" });
    expect(await repo.meta()).toMatchObject({
      migratedFrom: "localStorage:lockd-v1@v3",
      migratedAt: "2026-09-29T10:00:00.000Z",
      sourceChecksum: "abc",
    });
  });

  it("takes a safety backup that Settings can list", async () => {
    const row = await repo.safetyBackup("before-restore", emptyBackup());
    expect(row.reason).toBe("before-restore");
    expect(JSON.parse(row.json).format).toBe(BACKUP_FORMAT);
  });
});
