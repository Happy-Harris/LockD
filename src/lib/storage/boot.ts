import { freshData, useGym } from "@/lib/gym/store";
import { getStorageMode, setStorageMode, useStorageStatus, type StorageNotice } from "./backend";
import { getLockdDb } from "./db";
import { DexieRepository } from "./dexie-repository";
import { runMigration, withFreshDefaults } from "./migration";
import { migratePersisted, persistedSlice, PERSIST_KEY, type PersistedSlice } from "./persisted";
import { diffSlices, type LockdRepository } from "./repository";

/**
 * Starts durable storage (docs/consolidation/PLAN.md § 4): decides where the log lives, loads it
 * into the store, and from then on writes only what changed.
 *
 * The web path is the `lockd` database. `localStorage` stays the fallback for one release: no
 * IndexedDB, or a migration whose copy did not verify. In every path the old `lockd-v1` key is
 * left exactly as it was, and an unreadable log is never overwritten.
 */

export interface BootResult {
  mode: "dexie" | "local" | "frozen";
  notice?: StorageNotice;
  /**
   * Milliseconds from starting to open the database until the whole log was read and ready to
   * hand to the store. Deliberately stops before the store is set: setting it renders the screen,
   * and that work belongs to the screen, not to storage.
   */
  readMs?: number;
}

interface BootDeps {
  repo?: LockdRepository;
  now?: () => Date;
  hasIndexedDb?: () => boolean;
}

/** Above this many removed rows, a change is stored with `replaceAll` instead of row deletes. */
const REPLACE_ABOVE_REMOVALS = 500;

let stopWriter: (() => void) | null = null;
let activeRepo: LockdRepository | null = null;
let pendingWrites: Promise<void> = Promise.resolve();

/**
 * Resolves when every write handed to the database so far has finished (used by tests, reloads
 * and the erase). A change made this tick is picked up first, because the writer flushes in a
 * microtask.
 */
export async function flushWrites(): Promise<void> {
  let seen: Promise<void>;
  do {
    await Promise.resolve();
    seen = pendingWrites;
    await seen;
  } while (seen !== pendingWrites);
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function report(notice: StorageNotice | null) {
  useStorageStatus.getState().setNotice(notice);
}

/**
 * Subscribes to the store and writes each change to the repository. Changes made in the same
 * tick share one write; writes are chained so they reach the database in order. A failed write is
 * retried with the next change, because the baseline only advances once a write succeeds.
 */
function startWriter(repo: LockdRepository) {
  stopWriter?.();
  activeRepo = repo;
  let saved = persistedSlice(useGym.getState());
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const next = persistedSlice(useGym.getState());
    const changes = diffSlices(saved, next);
    if (!changes) return;
    const from = saved;
    saved = next;
    // Deleting thousands of rows one key at a time is slow in IndexedDB (seconds for a 5-year
    // log), while clearing and rewriting is not. A change that big (delete everything, restore,
    // taking the cloud copy) is stored as a replace, in one transaction either way.
    const removed = Object.values(changes.remove ?? {}).reduce((n, keys) => n + keys.length, 0);
    pendingWrites = pendingWrites
      .then(() => (removed > REPLACE_ABOVE_REMOVALS ? repo.replaceAll(next) : repo.apply(changes)))
      .then(() => {
        if (useStorageStatus.getState().notice?.kind === "write-failed") report(null);
      })
      .catch((error: unknown) => {
        saved = from; // the next change re-sends this one too
        report({
          kind: "write-failed",
          message: error instanceof Error ? error.message : String(error),
        });
      });
  };

  const unsubscribe = useGym.subscribe(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  });
  stopWriter = () => {
    unsubscribe();
    stopWriter = null;
  };
}

function loadIntoStore(data: PersistedSlice) {
  // The mode is set first, so `persist` (which sees this change) writes nothing to localStorage.
  useGym.setState({ ...data, hydrated: true });
}

/** The old path: `persist` reads and writes `localStorage`, unless what is there is unreadable. */
async function bootLocal(notice?: StorageNotice): Promise<BootResult> {
  const storage = localStorageOrNull();
  const raw = storage?.getItem(PERSIST_KEY) ?? null;
  let readable = true;
  if (raw !== null) {
    try {
      JSON.parse(raw);
    } catch {
      readable = false;
    }
  }
  if (!readable) {
    // No database to move it to, so keep it as it is: writing would replace the only copy.
    setStorageMode("frozen");
    const frozen: StorageNotice = { kind: "unreadable-log", rawCopyKept: false };
    report(frozen);
    useGym.getState().setHydrated(true);
    return { mode: "frozen", notice: frozen };
  }
  setStorageMode("local");
  await useGym.persist.rehydrate();
  if (!useGym.getState().hydrated) useGym.getState().setHydrated(true);
  if (notice) report(notice);
  return { mode: "local", notice };
}

let booting: Promise<BootResult> | null = null;

/** Boots durable storage. Runs once per page load: later calls (React strict mode) share the result. */
export function bootStorage(deps: BootDeps = {}): Promise<BootResult> {
  booting ??= doBoot(deps);
  return booting;
}

/** Tests boot several times in one process. */
export function resetBootForTests() {
  stopWriter?.();
  booting = null;
  activeRepo = null;
  pendingWrites = Promise.resolve();
}

async function doBoot(deps: BootDeps): Promise<BootResult> {
  const startedAt = performance.now();
  const hasIdb = deps.hasIndexedDb?.() ?? typeof indexedDB !== "undefined";
  if (!hasIdb) return bootLocal();

  const now = deps.now ?? (() => new Date());
  let repo: LockdRepository;
  try {
    repo = deps.repo ?? new DexieRepository();
    const result = await runMigration({
      repo,
      storage: { getItem: (key) => localStorageOrNull()?.getItem(key) ?? null },
      freshData,
      now,
    });

    if (result.status === "corrupt") {
      // Keep the unreadable string where the lifter can download it, then start a new log. The
      // `localStorage` key is not touched either.
      const stamp = now().toISOString();
      await repo.rawSafetyCopy("pre-migration", result.raw, 0, stamp);
      const data = freshData();
      await repo.replaceAll(data);
      await repo.setMeta({ migratedFrom: `unreadable:${PERSIST_KEY}`, migratedAt: stamp });
      setStorageMode("dexie");
      loadIntoStore(data);
      startWriter(repo);
      const notice: StorageNotice = { kind: "unreadable-log", rawCopyKept: true };
      report(notice);
      return { mode: "dexie", notice };
    }

    if (result.status === "verify-failed") {
      return await bootLocal({ kind: "move-not-verified" });
    }

    const readMs = Math.round(performance.now() - startedAt);
    setStorageMode("dexie");
    loadIntoStore(result.data);
    startWriter(repo);
    return { mode: "dexie", readMs };
  } catch (error) {
    // IndexedDB refused to open or write (blocked, quota, private mode): carry on as before.
    console.error("Durable storage unavailable, using the local fallback.", error);
    stopWriter?.();
    return bootLocal({ kind: "move-not-verified" });
  }
}

/**
 * "Delete local cache" must delete every copy on this device, not only the live log: the old
 * `localStorage` key and the safety copies (which are full copies of the log) go too. Run after
 * `resetAll`, whose change the writer stores.
 */
export async function eraseAllOnDevice(): Promise<void> {
  try {
    localStorageOrNull()?.removeItem(PERSIST_KEY);
  } catch {
    // ignore: a blocked storage has nothing to remove
  }
  if (getStorageMode() === "dexie") {
    await flushWrites();
    await getLockdDb().safetyBackups.clear();
  }
}

/**
 * Restores the log from the copy taken before the move (a `raw-localstorage` safety copy):
 * takes a fresh safety copy of the current log first, then replaces the log with the old one.
 */
export async function restoreRawCopy(raw: string): Promise<void> {
  const envelope = JSON.parse(raw) as { state: Record<string, unknown>; version: number };
  const restored = withFreshDefaults(
    migratePersisted(envelope.state, envelope.version),
    freshData(),
  );
  const repo = activeRepo;
  if (repo && getStorageMode() === "dexie") {
    await repo.safetyBackup("before-restore", useGym.getState().exportBackup());
  }
  useGym.setState({ ...restored, hydrated: true });
  await flushWrites();
}
