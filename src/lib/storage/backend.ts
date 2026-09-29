import { create } from "zustand";
import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Which backend the store's `persist` middleware writes to right now.
 *
 *  - `pending`: boot has not decided yet; nothing is read or written.
 *  - `dexie`:   the log lives in the `lockd` database, written by the change subscriber. `persist`
 *               reads and writes nothing, and the old `localStorage['lockd-v1']` key is left exactly
 *               as it was.
 *  - `local`:   the fallback for one release (no IndexedDB, or a migration that did not verify):
 *               `persist` reads and writes `localStorage` as it always did.
 *  - `frozen`:  `localStorage` holds something unreadable and there is no database to move it to.
 *               Nothing is written, so the unreadable string survives for recovery.
 */
export type StorageMode = "pending" | "dexie" | "local" | "frozen";

let mode: StorageMode = "pending";

export function getStorageMode(): StorageMode {
  return mode;
}

export function setStorageMode(next: StorageMode) {
  mode = next;
}

function local(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked (private mode, disabled site data)
  }
}

/**
 * The storage handed to zustand's `persist`. It obeys the current mode.
 *
 * It implements `PersistStorage` rather than the string-based `StateStorage` on purpose: with
 * `createJSONStorage`, `persist` serialises the whole log on **every** store update before the
 * backend is even asked, which would cost a full `JSON.stringify` per set even when nothing is
 * written. Here the value arrives as an object, and only `local` mode ever serialises it.
 */
export const switchableStorage: PersistStorage<unknown> = {
  getItem: (name) => {
    if (mode !== "local") return null;
    const raw = local()?.getItem(name) ?? null;
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as StorageValue<unknown>;
    } catch {
      return null; // boot checks readability first and never selects `local` for an unreadable log
    }
  },
  setItem: (name, value) => {
    if (mode === "local") local()?.setItem(name, JSON.stringify(value));
  },
  removeItem: (name) => {
    if (mode === "local") local()?.removeItem(name);
  },
};

/** Something the lifter should be told about how storage started or is going. */
export type StorageNotice =
  | { kind: "unreadable-log"; rawCopyKept: boolean }
  | { kind: "move-not-verified" }
  | { kind: "write-failed"; message: string };

interface StorageStatus {
  notice: StorageNotice | null;
  setNotice: (notice: StorageNotice | null) => void;
}

export const useStorageStatus = create<StorageStatus>((set) => ({
  notice: null,
  setNotice: (notice) => set({ notice }),
}));
