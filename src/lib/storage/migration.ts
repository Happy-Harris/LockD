import { migratePersisted, PERSIST_KEY, type PersistedSlice } from "./persisted";
import { type LockdRepository, type RepoMeta, ROW_COLLECTIONS } from "./repository";

/**
 * One-time move of the log from `localStorage['lockd-v1']` into the `lockd` database
 * (docs/consolidation/PLAN.md § 4). It reads the old key and never writes or removes it: a
 * later, separate change deletes it after enough successful boots.
 *
 * The order is the safety story:
 *  1. already migrated? load from the database and stop;
 *  2. no old payload? seed a fresh log;
 *  3. an old payload that will not parse? **do nothing at all** (no seed, no delete, no write);
 *  4. keep the raw string in `safetyBackups` before any log row is written;
 *  5. write every collection in one transaction;
 *  6. read it back and compare a checksum with the source; on a mismatch, empty the new tables and
 *     keep running from `localStorage`;
 *  7. only then record `meta.migratedFrom`, so a crash at any earlier point re-runs safely.
 */

export interface MigrationDeps {
  repo: LockdRepository;
  /** Only ever read from. */
  storage: Pick<Storage, "getItem">;
  /** A fresh, seeded log: the defaults for a new install and for anything an old payload lacks. */
  freshData: () => PersistedSlice;
  now?: () => Date;
  /** `navigator.locks`; when missing, the runner is not serialised across tabs. */
  locks?: Pick<LockManager, "request"> | null;
}

export type MigrationResult =
  | { status: "already-migrated"; data: PersistedSlice; meta: RepoMeta }
  | { status: "fresh"; data: PersistedSlice }
  | { status: "migrated"; data: PersistedSlice; from: string; checksum: string }
  /** The old payload is not readable. Nothing was touched; offer the raw string for download. */
  | { status: "corrupt"; raw: string; reason: string }
  /** The copy did not match. The new tables were emptied; keep running from `localStorage`. */
  | { status: "verify-failed"; data: PersistedSlice; expected: string; actual: string };

export const MIGRATION_LOCK = "lockd-migrate";

/** Collections an old payload may lack, filled from fresh data, as zustand's merge does today. */
export function withFreshDefaults(migrated: PersistedSlice, fresh: PersistedSlice): PersistedSlice {
  const out = { ...fresh } as Record<string, unknown>;
  for (const [key, value] of Object.entries(migrated)) if (value !== undefined) out[key] = value;
  return out as unknown as PersistedSlice;
}

/** FNV-1a, 32-bit. Not a security hash: it detects a copy that lost or changed a value. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * `v1:` counts of every collection, then a hash over what a lifter would notice missing: for sets,
 * `(id, weightG, reps, durationSeconds, distanceM, isCompleted)`; for workouts,
 * `(id, status, localDate)`. Order-insensitive.
 */
export function checksumOf(slice: PersistedSlice): string {
  const counts = ROW_COLLECTIONS.map((name) => `${name}=${(slice[name] as unknown[]).length}`).join(
    ",",
  );
  const sets = [...slice.workoutSets]
    .sort(byId)
    .map((s) => [s.id, s.weightG, s.reps, s.durationSeconds, s.distanceM, s.isCompleted].join("|"));
  const workouts = [...slice.workouts]
    .sort(byId)
    .map((w) => [w.id, w.status, w.localDate].join("|"));
  return `v1:${counts}:${fnv1a(sets.join("\n"))}:${fnv1a(workouts.join("\n"))}`;
}

function sessionsIn(slice: PersistedSlice): number {
  return slice.workouts.filter((w) => w.status === "completed" || w.status === "active").length;
}

function parseEnvelope(raw: string): { state: Record<string, unknown>; version: number } | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "The stored log is not valid JSON.";
  }
  const envelope = parsed as { state?: unknown; version?: unknown } | null;
  if (!envelope || typeof envelope !== "object") return "The stored log is not an object.";
  if (!envelope.state || typeof envelope.state !== "object" || Array.isArray(envelope.state)) {
    return "The stored log has no state.";
  }
  const version = typeof envelope.version === "number" ? envelope.version : 0;
  return { state: envelope.state as Record<string, unknown>, version };
}

async function migrateOnce(deps: MigrationDeps): Promise<MigrationResult> {
  const { repo, storage, freshData } = deps;
  const stamp = (deps.now?.() ?? new Date()).toISOString();

  const meta = await repo.meta();
  if (meta.migratedFrom) return { status: "already-migrated", data: await repo.load(), meta };

  const raw = storage.getItem(PERSIST_KEY);
  if (raw === null) {
    const data = freshData();
    await repo.replaceAll(data);
    await repo.setMeta({ migratedFrom: "fresh", migratedAt: stamp });
    return { status: "fresh", data };
  }

  const envelope = parseEnvelope(raw);
  if (typeof envelope === "string") return { status: "corrupt", raw, reason: envelope };

  const data = withFreshDefaults(migratePersisted(envelope.state, envelope.version), freshData());
  const expected = checksumOf(data);

  await repo.rawSafetyCopy("pre-migration", raw, sessionsIn(data), stamp);
  await repo.replaceAll(data);

  const actual = checksumOf(await repo.load());
  if (actual !== expected) {
    await repo.replaceAll({ ...freshData(), exercises: [], plates: [], bars: [] });
    return { status: "verify-failed", data, expected, actual };
  }

  const from = `localStorage:${PERSIST_KEY}@v${envelope.version}`;
  await repo.setMeta({ migratedFrom: from, migratedAt: stamp, sourceChecksum: expected });
  return { status: "migrated", data, from, checksum: expected };
}

/** Runs the migration under a cross-tab lock, so two tabs cannot both migrate. */
export function runMigration(deps: MigrationDeps): Promise<MigrationResult> {
  const locks =
    deps.locks === undefined
      ? typeof navigator !== "undefined"
        ? navigator.locks
        : null
      : deps.locks;
  if (!locks) return migrateOnce(deps);
  // A promise returned from the callback is flattened by the lock manager at runtime.
  return locks.request(MIGRATION_LOCK, () =>
    migrateOnce(deps),
  ) as unknown as Promise<MigrationResult>;
}
