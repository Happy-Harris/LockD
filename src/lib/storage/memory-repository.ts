import type { LockdBackup } from "@/domain/types";
import { defaultSettings } from "@/lib/gym/settings";
import type { SafetyBackup, SafetyReason } from "./db";
import type { PersistedSlice } from "./persisted";
import {
  type ChangeSet,
  type KvKey,
  type LockdRepository,
  type PutRows,
  type RepoMeta,
  type RowCollection,
  KV_KEYS,
  ROW_COLLECTIONS,
  keyOf,
} from "./repository";

/** In-memory repository for tests, and the reference the Dexie one is checked against. */
export class MemoryRepository implements LockdRepository {
  private rows = new Map<RowCollection, Map<string, unknown>>(
    ROW_COLLECTIONS.map((name) => [name, new Map()]),
  );
  private kv = new Map<KvKey, unknown>();
  private metaRows: Partial<RepoMeta> = {};
  readonly safety: SafetyBackup[] = [];

  async load(): Promise<PersistedSlice> {
    const slice: Record<string, unknown> = {};
    for (const name of ROW_COLLECTIONS) slice[name] = [...this.rows.get(name)!.values()];
    slice.settings = this.kv.get("settings") ?? defaultSettings();
    slice.restTimer = this.kv.get("restTimer") ?? null;
    slice.labLast = this.kv.get("labLast") ?? null;
    return slice as unknown as PersistedSlice;
  }

  async apply(changes: ChangeSet): Promise<void> {
    // Validate every key first, so a bad row leaves the store untouched.
    const puts: Array<[RowCollection, string, unknown]> = [];
    for (const name of ROW_COLLECTIONS) {
      for (const row of changes.put?.[name] ?? []) puts.push([name, keyOf(name, row), row]);
    }
    for (const [name, key, row] of puts) this.rows.get(name)!.set(key, row);
    for (const name of ROW_COLLECTIONS) {
      for (const key of changes.remove?.[name] ?? []) this.rows.get(name)!.delete(key);
    }
    for (const key of KV_KEYS)
      if (changes.kv && key in changes.kv) this.kv.set(key, changes.kv[key]);
  }

  async replaceAll(data: PersistedSlice): Promise<void> {
    const put: Record<string, unknown[]> = {};
    for (const name of ROW_COLLECTIONS) {
      for (const row of data[name] as readonly unknown[]) keyOf(name, row); // validate first
      put[name] = [...(data[name] as readonly unknown[])];
    }
    for (const name of ROW_COLLECTIONS) this.rows.get(name)!.clear();
    this.kv.clear();
    await this.apply({
      put: put as PutRows,
      kv: { settings: data.settings, restTimer: data.restTimer, labLast: data.labLast },
    });
  }

  async importBatch(rows: PutRows): Promise<void> {
    await this.apply({ put: rows });
  }

  async safetyBackup(reason: SafetyReason, backup: LockdBackup): Promise<SafetyBackup> {
    const row: SafetyBackup = {
      id: `${backup.exportedAt}-${reason}`,
      createdAt: backup.exportedAt,
      reason,
      sessions: backup.workouts.filter((w) => w.status === "completed" || w.status === "active")
        .length,
      json: JSON.stringify(backup),
    };
    this.safety.push(row);
    return row;
  }

  async rawSafetyCopy(
    reason: SafetyReason,
    raw: string,
    sessions: number,
    createdAt: string,
  ): Promise<SafetyBackup> {
    const row: SafetyBackup = {
      id: `${createdAt}-${reason}`,
      createdAt,
      reason,
      sessions,
      json: raw,
      format: "raw-localstorage",
    };
    this.safety.push(row);
    return row;
  }

  async meta(): Promise<RepoMeta> {
    return { schemaVersion: 2, ...this.metaRows };
  }

  async setMeta(patch: Partial<RepoMeta>): Promise<void> {
    this.metaRows = { ...this.metaRows, ...patch };
  }
}
