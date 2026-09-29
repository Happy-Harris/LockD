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
    expect(db.verno).toBe(3);
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
    expect(db.verno).toBe(3);
    expect(await db.workoutSets.count()).toBe(2);
    expect((await db.workoutSets.get("s2"))?.reps).toBe(6);
    expect(await db.workoutExercises.count()).toBe(1);
    expect((await db.meta.get("migratedFrom"))?.value).toBe("fresh");
    expect(db.workoutSets.schema.indexes).toEqual([]);
    db.close();
  });
});
