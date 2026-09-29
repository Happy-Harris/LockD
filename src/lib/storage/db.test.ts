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
    expect(db.verno).toBe(2);
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
    expect(db.workoutSets.schema.idxByName.workoutId).toBeDefined();
    expect(db.workouts.schema.idxByName.importFingerprint).toBeDefined();
    expect(db.workoutExercises.schema.idxByName["[exerciseId+workoutId]"]).toBeDefined();
    db.close();
  });
});
