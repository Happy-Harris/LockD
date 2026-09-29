import type { Table } from "dexie";
import type { LockdBackup } from "@/domain/types";
import { defaultSettings } from "@/lib/gym/settings";
import { getLockdDb, type LockdDatabase, type SafetyBackup, type SafetyReason } from "./db";
import type { PersistedSlice } from "./persisted";
import {
  type ChangeSet,
  type KvKey,
  type LockdRepository,
  type PutRows,
  type RepoMeta,
  type RowCollection,
  IMPORT_BATCH_SIZE,
  KV_KEYS,
  ROW_COLLECTIONS,
  keyOf,
} from "./repository";
import { takeSafetyBackup } from "./safety";

const SCHEMA_VERSION = 2;

/** The web repository: the log lives in the IndexedDB database `lockd`. */
export class DexieRepository implements LockdRepository {
  constructor(private readonly db: LockdDatabase = getLockdDb()) {}

  private table(name: RowCollection): Table<unknown, string> {
    return this.db[name] as unknown as Table<unknown, string>;
  }

  private get rowTables(): Table<unknown, string>[] {
    return ROW_COLLECTIONS.map((name) => this.table(name));
  }

  async load(): Promise<PersistedSlice> {
    const slice: Record<string, unknown> = {};
    await this.db.transaction("r", [...this.rowTables, this.db.kv], async () => {
      for (const name of ROW_COLLECTIONS) slice[name] = await this.table(name).toArray();
      const rows = await this.db.kv.toArray();
      const byKey = new Map(rows.map((row) => [row.key, row.value]));
      slice.settings = byKey.get("settings") ?? defaultSettings();
      slice.restTimer = byKey.get("restTimer") ?? null;
      slice.labLast = byKey.get("labLast") ?? null;
    });
    return slice as unknown as PersistedSlice;
  }

  async apply(changes: ChangeSet): Promise<void> {
    // Validate every key before opening the transaction, so a bad row stores nothing.
    const puts = new Map<RowCollection, unknown[]>();
    for (const name of ROW_COLLECTIONS) {
      const rows = changes.put?.[name];
      if (!rows?.length) continue;
      for (const row of rows) keyOf(name, row);
      puts.set(name, [...rows]);
    }
    const removes = new Map<RowCollection, string[]>();
    for (const name of ROW_COLLECTIONS) {
      const keys = changes.remove?.[name];
      if (keys?.length) removes.set(name, [...keys]);
    }
    const kvKeys = KV_KEYS.filter((key) => changes.kv && key in changes.kv);
    const touched: Table<unknown, string>[] = [...new Set([...puts.keys(), ...removes.keys()])].map(
      (name) => this.table(name),
    );
    if (kvKeys.length) touched.push(this.db.kv as unknown as Table<unknown, string>);
    if (!touched.length) return;

    await this.db.transaction("rw", touched, async () => {
      for (const [name, rows] of puts) await this.table(name).bulkPut(rows);
      for (const [name, keys] of removes) await this.table(name).bulkDelete(keys);
      for (const key of kvKeys) await this.db.kv.put({ key, value: changes.kv![key] });
    });
  }

  async replaceAll(data: PersistedSlice): Promise<void> {
    for (const name of ROW_COLLECTIONS) {
      for (const row of data[name] as readonly unknown[]) keyOf(name, row);
    }
    await this.db.transaction("rw", [...this.rowTables, this.db.kv], async () => {
      for (const name of ROW_COLLECTIONS) {
        await this.table(name).clear();
        await this.putInBatches(name, data[name] as readonly unknown[]);
      }
      await this.db.kv.clear();
      await this.db.kv.bulkPut(KV_KEYS.map((key: KvKey) => ({ key, value: data[key] })));
    });
  }

  async importBatch(rows: PutRows): Promise<void> {
    const names = ROW_COLLECTIONS.filter((name) => rows[name]?.length);
    for (const name of names) for (const row of rows[name]!) keyOf(name, row);
    if (!names.length) return;
    await this.db.transaction(
      "rw",
      names.map((name) => this.table(name)),
      async () => {
        for (const name of names) await this.putInBatches(name, rows[name]!);
      },
    );
  }

  private async putInBatches(name: RowCollection, rows: readonly unknown[]) {
    for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
      await this.table(name).bulkPut(rows.slice(i, i + IMPORT_BATCH_SIZE) as unknown[]);
    }
  }

  safetyBackup(reason: SafetyReason, backup: LockdBackup): Promise<SafetyBackup> {
    return takeSafetyBackup(reason, backup, this.db);
  }

  async meta(): Promise<RepoMeta> {
    const rows = await this.db.meta.toArray();
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    const meta: RepoMeta = {
      schemaVersion: (byKey.get("schemaVersion") as number) ?? SCHEMA_VERSION,
    };
    for (const key of ["migratedFrom", "migratedAt", "sourceChecksum"] as const) {
      if (byKey.has(key)) meta[key] = byKey.get(key) as string;
    }
    return meta;
  }

  async setMeta(patch: Partial<RepoMeta>): Promise<void> {
    const rows = Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({ key, value }));
    if (rows.length) await this.db.meta.bulkPut(rows);
  }
}
