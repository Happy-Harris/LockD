import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION, type LockdBackup } from "@/domain/types";
import { defaultSettings } from "@/lib/gym/store";
import { LockdDatabase, SAFETY_BACKUPS_KEPT, listSafetyBackups, setLockdDb, takeSafetyBackup } from "./safety";

function backup(exportedAt: string, sessions: number): LockdBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    exercises: [],
    templates: [],
    templateExercises: [],
    workouts: Array.from({ length: sessions }, (_, i) => ({
      id: `w${i}`,
      name: "Session",
      status: "completed" as const,
      startedAt: exportedAt,
      localDate: exportedAt.slice(0, 10),
      tzOffsetMinutes: 0,
      pausedSeconds: 0,
      createdAt: exportedAt,
      updatedAt: exportedAt,
    })),
    workoutExercises: [],
    workoutSets: [],
    measurements: [],
    plates: [],
    bars: [],
    settings: defaultSettings(),
  };
}

describe("safety backups", () => {
  let db: LockdDatabase;
  beforeEach(() => {
    db = new LockdDatabase(`lockd-test-${Math.random()}`);
    setLockdDb(db);
  });
  afterEach(async () => {
    setLockdDb(null);
    await db.delete();
  });

  it("stores a restorable lockd-backup copy", async () => {
    const row = await takeSafetyBackup("before-cloud-sign-in", backup("2026-09-28T10:00:00.000Z", 137));
    expect(row.sessions).toBe(137);
    const [stored] = await listSafetyBackups();
    const parsed = JSON.parse(stored!.json) as LockdBackup;
    expect(parsed.format).toBe("lockd-backup");
    expect(parsed.workouts).toHaveLength(137);
  });

  it(`keeps the newest ${SAFETY_BACKUPS_KEPT}, newest first`, async () => {
    for (let day = 1; day <= SAFETY_BACKUPS_KEPT + 2; day += 1) {
      await takeSafetyBackup("before-cloud-sign-in", backup(`2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`, day));
    }
    const rows = await listSafetyBackups();
    expect(rows).toHaveLength(SAFETY_BACKUPS_KEPT);
    expect(rows[0]!.sessions).toBe(SAFETY_BACKUPS_KEPT + 2);
    expect(rows.at(-1)!.sessions).toBe(3);
  });
});
