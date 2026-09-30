import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { LockdDatabase } from "./db";
import { ROW_COLLECTIONS } from "./repository";

describe("the lockd database, version 2", () => {
  it("opens a version-1 database, keeps its safety backups, and adds the log tables", async () => {
    const name = `lockd-upgrade-${Math.random()}`;
    // A database exactly as version 1 (the sign-in safety copies only) left it on a device.
    const v1 = new Dexie(name);
    v1.version(1).stores({ safetyBackups: "id, createdAt, reason" });
    await v1.table("safetyBackups").put({
      id: "2026-09-01T10:00:00.000Z-before-cloud-sign-in",
      createdAt: "2026-09-01T10:00:00.000Z",
      reason: "before-cloud-sign-in",
      sessions: 3,
      json: '{"format":"lockd-backup"}',
    });
    v1.close();

    const db = new LockdDatabase(name);
    await db.open();
    expect(db.verno).toBe(4);
    const kept = await db.safetyBackups.toArray();
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ sessions: 3, reason: "before-cloud-sign-in" });
    for (const table of [...ROW_COLLECTIONS, "kv", "meta", "device", "safetyBackups"]) {
      expect(
        db.tables.map((t) => t.name),
        table,
      ).toContain(table);
    }
    // Existing rows still have no `format`, which means a normal lockd-backup copy.
    expect(kept[0]!.format).toBeUndefined();
    db.close();
  });

  it("keys the natural-key collections the way the plan says", async () => {
    const db = new LockdDatabase(`lockd-keys-${Math.random()}`);
    expect(db.eraNames.schema.primKey.keyPath).toBe("startDate");
    expect(db.machineSetups.schema.primKey.keyPath).toBe("exerciseId");
    expect(db.workouts.schema.idxByName.importFingerprint).toBeDefined();
    // Version 3 dropped the indexes on the two biggest tables: they made bulk writes 5x slower.
    expect(db.workoutSets.schema.indexes).toEqual([]);
    expect(db.workoutExercises.schema.indexes).toEqual([]);
    db.close();
  });

  it("upgrades a version-2 database, keeping its rows, and drops the two indexes", async () => {
    const name = `lockd-v2-${Math.random()}`;
    // The shape version 2 shipped with: the indexes on workoutSets and workoutExercises.
    const v2 = new Dexie(name);
    v2.version(1).stores({ safetyBackups: "id, createdAt, reason" });
    v2.version(2).stores({
      workoutSets: "id, workoutId, workoutExerciseId",
      workoutExercises: "id, workoutId, exerciseId, [exerciseId+workoutId]",
      workouts: "id, status, localDate, startedAt, templateId, programId, importFingerprint",
      exercises: "id, name",
      templates: "id",
      templateExercises: "id, templateId, exerciseId",
      measurements: "id, [metric+recordedAt]",
      plates: "id",
      bars: "id",
      programs: "id",
      programWeeks: "id, programId",
      programSessions: "id, programId",
      programExercises: "id, programSessionId",
      eraNames: "startDate",
      machineSetups: "exerciseId",
      lessons: "id, exerciseId",
      namedPrs: "id, exerciseId",
      clips: "id, setId",
      kv: "key",
      meta: "key",
      device: "key",
    });
    await v2.table("workoutSets").bulkPut([
      { id: "s1", workoutId: "w1", workoutExerciseId: "we1", reps: 5 },
      { id: "s2", workoutId: "w1", workoutExerciseId: "we1", reps: 6 },
    ]);
    await v2.table("workoutExercises").put({ id: "we1", workoutId: "w1", exerciseId: "e1" });
    await v2.table("meta").put({ key: "migratedFrom", value: "fresh" });
    v2.close();

    const db = new LockdDatabase(name);
    await db.open();
    expect(db.verno).toBe(4);
    expect(await db.workoutSets.count()).toBe(2);
    expect((await db.workoutSets.get("s2"))?.reps).toBe(6);
    expect(await db.workoutExercises.count()).toBe(1);
    expect((await db.meta.get("migratedFrom"))?.value).toBe("fresh");
    expect(db.workoutSets.schema.indexes).toEqual([]);
    // Version 4 added the health readings table; a database that never read health data has it empty.
    expect(await db.healthSamples.count()).toBe(0);
    db.close();
  });

  it("upgrades a version-3 database, keeping its rows, and adds an empty healthSamples table", async () => {
    const name = `lockd-v3-${Math.random()}`;
    const v3 = new Dexie(name);
    v3.version(1).stores({ safetyBackups: "id, createdAt, reason" });
    v3.version(3).stores({
      workouts: "id, status, localDate, startedAt, templateId, programId, importFingerprint",
      measurements: "id, [metric+recordedAt]",
      workoutSets: "id",
      workoutExercises: "id",
      kv: "key",
      meta: "key",
      device: "key",
    });
    await v3.table("measurements").put({ id: "m1", metric: "bodyweight", value: 82_000 });
    v3.close();

    const db = new LockdDatabase(name);
    await db.open();
    expect(db.verno).toBe(4);
    expect((await db.measurements.get("m1"))?.value).toBe(82_000);
    expect(await db.healthSamples.count()).toBe(0);
    await db.healthSamples.put({
      id: "h1",
      kind: "sleep",
      value: 27_000,
      startAt: "2026-09-29T22:30:00.000Z",
      endAt: "2026-09-30T06:00:00.000Z",
      localDate: "2026-09-30",
      source: "apple_health",
      sourceId: "night:2026-09-30",
      createdAt: "2026-09-30T07:00:00.000Z",
    });
    expect(await db.healthSamples.count()).toBe(1);
    db.close();
  });
});
