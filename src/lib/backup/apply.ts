import type { LockdBackup } from "@/domain/types";

/**
 * Applies a checked backup to the log (plan PR 7). A safety copy of the current log is taken
 * first, and if it cannot be taken nothing is changed: a restore that cannot be undone is never
 * started.
 */
export type RestoreMode = "merge" | "replace";

export interface RestoreDeps {
  /** The current log as a backup (the store's `exportBackup`). */
  current: () => LockdBackup;
  /** Puts the backup into the store (`importBackup`). */
  apply: (backup: LockdBackup, mode: RestoreMode) => void;
  /** Keeps a copy of a backup where Settings lists it (`takeSafetyBackup("before-restore", …)`). */
  safetyCopy: (backup: LockdBackup) => Promise<unknown>;
  /** Sessions in the store right now, to say what changed. */
  sessions: () => number;
}

export type RestoreResult =
  | { ok: true; mode: RestoreMode; before: number; after: number; added: number }
  | { ok: false; error: string };

const sessionsIn = (backup: LockdBackup) =>
  backup.workouts.filter((w) => w.status === "completed" || w.status === "active").length;

export async function applyBackup(
  backup: LockdBackup,
  mode: RestoreMode,
  deps: RestoreDeps,
): Promise<RestoreResult> {
  try {
    await deps.safetyCopy(deps.current());
  } catch {
    return {
      ok: false,
      error: "Couldn’t save a safety copy of your current log first, so nothing was changed.",
    };
  }
  const before = deps.sessions();
  try {
    deps.apply(backup, mode);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The backup couldn’t be applied.",
    };
  }
  const after = deps.sessions();
  return {
    ok: true,
    mode,
    before,
    after,
    added: mode === "merge" ? after - before : sessionsIn(backup),
  };
}

/** One line for the toast after a restore. */
export function restoreMessage(result: Extract<RestoreResult, { ok: true }>): string {
  if (result.mode === "replace") {
    return `Replaced your log with the backup: ${result.after} session${result.after === 1 ? "" : "s"}.`;
  }
  if (result.added === 0) return "Nothing new: every session in the backup is already in your log.";
  return `Added ${result.added} session${result.added === 1 ? "" : "s"} from the backup.`;
}
