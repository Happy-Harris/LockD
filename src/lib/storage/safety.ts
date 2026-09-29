import type { LockdBackup } from "@/domain/types";
import { getLockdDb, LockdDatabase, setLockdDb, type SafetyBackup, type SafetyReason } from "./db";

export { getLockdDb, LockdDatabase, setLockdDb };
export type { SafetyBackup, SafetyReason };

/**
 * Safety backups: a full `lockd-backup` copy of the log, taken before anything overwrites or
 * merges it (signing in, restore, and the storage migration). Each copy is a normal backup file,
 * so "Download" in Settings gives the lifter something the existing importer restores. The
 * migration also keeps the raw `localStorage` string (`format: "raw-localstorage"`).
 *
 * The database and its schema live in `db.ts`.
 */

/** Oldest copies beyond this are pruned so repeated sign-ins can't fill the device. */
export const SAFETY_BACKUPS_KEPT = 5;

export async function takeSafetyBackup(
  reason: SafetyReason,
  backup: LockdBackup,
  db: LockdDatabase = getLockdDb(),
): Promise<SafetyBackup> {
  const row: SafetyBackup = {
    id: `${backup.exportedAt}-${reason}`,
    createdAt: backup.exportedAt,
    reason,
    sessions: backup.workouts.filter((w) => w.status === "completed" || w.status === "active")
      .length,
    json: JSON.stringify(backup),
  };
  await db.transaction("rw", db.safetyBackups, async () => {
    await db.safetyBackups.put(row);
    const all = await db.safetyBackups.orderBy("createdAt").reverse().primaryKeys();
    const stale = all.slice(SAFETY_BACKUPS_KEPT);
    if (stale.length) await db.safetyBackups.bulkDelete(stale);
  });
  return row;
}

export async function listSafetyBackups(): Promise<SafetyBackup[]> {
  return getLockdDb().safetyBackups.orderBy("createdAt").reverse().toArray();
}
