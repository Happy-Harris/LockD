import Dexie, { type Table } from "dexie";
import type { LockdBackup } from "@/domain/types";

/**
 * Safety backups: a full `lockd-backup` copy of the log, taken before anything overwrites or
 * merges it (signing in, and later restore/replace and the storage migration). Each copy is a
 * normal backup file, so "Download" in Settings gives the lifter something the existing
 * importer restores.
 *
 * Lives in the IndexedDB database `lockd`. Version 1 has only this table; the durable-storage
 * PR adds the log tables as version 2 (see docs/consolidation/PLAN.md § 4). Never rename the
 * database or the table: both are live identifiers.
 */
export type SafetyReason = "before-cloud-sign-in";

export interface SafetyBackup {
  id: string;
  createdAt: string;
  reason: SafetyReason;
  /** Completed + in-progress sessions in the copy, for the list in Settings. */
  sessions: number;
  /** The backup file contents (`lockd-backup` JSON). */
  json: string;
}

/** Oldest copies beyond this are pruned so repeated sign-ins can't fill the device. */
export const SAFETY_BACKUPS_KEPT = 5;

export class LockdDatabase extends Dexie {
  safetyBackups!: Table<SafetyBackup, string>;

  constructor(name = "lockd") {
    super(name);
    this.version(1).stores({ safetyBackups: "id, createdAt, reason" });
  }
}

let instance: LockdDatabase | null = null;

export function getLockdDb(): LockdDatabase {
  if (!instance) instance = new LockdDatabase();
  return instance;
}

/** Tests point the module at a dedicated database. */
export function setLockdDb(db: LockdDatabase | null) {
  instance = db;
}

export async function takeSafetyBackup(reason: SafetyReason, backup: LockdBackup): Promise<SafetyBackup> {
  const db = getLockdDb();
  const row: SafetyBackup = {
    id: `${backup.exportedAt}-${reason}`,
    createdAt: backup.exportedAt,
    reason,
    sessions: backup.workouts.filter((w) => w.status === "completed" || w.status === "active").length,
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
