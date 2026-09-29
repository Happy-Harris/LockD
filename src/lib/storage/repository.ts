import type { LockdBackup } from "@/domain/types";
import type { PersistedSlice } from "./persisted";
import type { SafetyBackup, SafetyReason } from "./db";

/**
 * The seam between the in-memory log (Zustand, which the engines read synchronously) and durable
 * storage. Zustand stays the working set; a repository only loads it once at boot and stores
 * what changed. Implementations: Dexie (web), in-memory (tests), SQLite (Capacitor, later).
 * See docs/consolidation/PLAN.md § 4.
 */

/** Collections stored one row each. */
export const ROW_COLLECTIONS = [
  "exercises",
  "templates",
  "templateExercises",
  "workouts",
  "workoutExercises",
  "workoutSets",
  "measurements",
  "plates",
  "bars",
  "programs",
  "programWeeks",
  "programSessions",
  "programExercises",
  "eraNames",
  "machineSetups",
  "lessons",
  "namedPrs",
  "clips",
] as const;
export type RowCollection = (typeof ROW_COLLECTIONS)[number];

/** Documents stored under one key each. */
export const KV_KEYS = ["settings", "restTimer", "labLast"] as const;
export type KvKey = (typeof KV_KEYS)[number];

export type RowOf<C extends RowCollection> = PersistedSlice[C][number];

/** A row's primary key. Two collections are keyed by a natural key, not an id. */
export function keyOf(collection: RowCollection, row: unknown): string {
  const record = row as Record<string, unknown>;
  const field =
    collection === "eraNames" ? "startDate" : collection === "machineSetups" ? "exerciseId" : "id";
  const key = record?.[field];
  if (typeof key !== "string" || key === "") {
    throw new Error(`A ${collection} row has no ${field}.`);
  }
  return key;
}

export type PutRows = { [C in RowCollection]?: readonly RowOf<C>[] };
export type RemoveKeys = { [C in RowCollection]?: readonly string[] };

/** What changed between two states of the log. Applied in one transaction, or not at all. */
export interface ChangeSet {
  put?: PutRows;
  remove?: RemoveKeys;
  kv?: { [K in KvKey]?: PersistedSlice[K] };
}

export interface RepoMeta {
  schemaVersion: number;
  /** Where the log came from, for example `fresh` or `localStorage:lockd-v1@v3`. Unset until then. */
  migratedFrom?: string;
  migratedAt?: string;
  /** Checksum of the source at migration time, to verify the copy. */
  sourceChecksum?: string;
}

export interface LockdRepository {
  /** The whole log. Empty collections when nothing has been stored; settings default when unset. */
  load(): Promise<PersistedSlice>;
  /** Stores a change set in one transaction. If any part is invalid, nothing is stored. */
  apply(changes: ChangeSet): Promise<void>;
  /** Replaces everything in one transaction (restore, sign-in taking the cloud copy). */
  replaceAll(data: PersistedSlice): Promise<void>;
  /** Adds rows in bulk, in batches inside one transaction (an import of years of history). */
  importBatch(rows: PutRows): Promise<void>;
  safetyBackup(reason: SafetyReason, backup: LockdBackup): Promise<SafetyBackup>;
  meta(): Promise<RepoMeta>;
  setMeta(patch: Partial<RepoMeta>): Promise<void>;
}

/** Rows written per `bulkPut`, so a huge import doesn't build one giant request. */
export const IMPORT_BATCH_SIZE = 1000;

/**
 * Compares two states of the log **by reference**, collection by collection. Zustand updates are
 * immutable, so an unchanged row keeps its identity and only edited rows are written. Returns
 * null when nothing changed.
 */
export function diffSlices(prev: PersistedSlice, next: PersistedSlice): ChangeSet | null {
  const put: Record<string, unknown[]> = {};
  const remove: Record<string, string[]> = {};
  const kv: Record<string, unknown> = {};

  for (const collection of ROW_COLLECTIONS) {
    const before = prev[collection] as readonly unknown[];
    const after = next[collection] as readonly unknown[];
    if (before === after) continue;
    const previous = new Map(before.map((row) => [keyOf(collection, row), row]));
    const seen = new Set<string>();
    for (const row of after) {
      const key = keyOf(collection, row);
      seen.add(key);
      if (previous.get(key) !== row) (put[collection] ??= []).push(row);
    }
    for (const key of previous.keys()) if (!seen.has(key)) (remove[collection] ??= []).push(key);
  }
  for (const key of KV_KEYS) if (prev[key] !== next[key]) kv[key] = next[key];

  const changes: ChangeSet = {};
  if (Object.keys(put).length) changes.put = put as PutRows;
  if (Object.keys(remove).length) changes.remove = remove as RemoveKeys;
  if (Object.keys(kv).length) changes.kv = kv as ChangeSet["kv"];
  return changes.put || changes.remove || changes.kv ? changes : null;
}
