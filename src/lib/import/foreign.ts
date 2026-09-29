import type { ImportAnalysis } from "./engine";

/** Shared by the readers for another app's backup file (plan PR 7d). */

export type ForeignReadResult =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      analysis: ImportAnalysis;
      /** What was not imported, one plain line each. */
      notes: string[];
    };

export const MAX_TEXT_BYTES = 64 * 1024 * 1024;

/** Each value of a list when it is exactly this one, so an unknown string is never cast into a union. */
export const oneOf = <T extends string>(
  list: readonly T[],
  value: string | undefined,
): T | undefined => list.find((entry) => entry === value);

/** A whole, non-negative number, or undefined when the source's value cannot be one. */
export function whole(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * The wall-clock time a session started, `YYYY-MM-DD HH:mm:ss`, from its instant and the raw
 * `getTimezoneOffset()` of where it was logged (positive west). Independent of this device's zone.
 */
export function wallClock(startedAt: string, tzRaw: number): string {
  const local = new Date(Date.parse(startedAt) - tzRaw * 60_000);
  return `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
}

export function describePath(path: PropertyKey[]): string {
  return path.reduce<string>((out, part) => {
    if (typeof part === "number") return `${out}[${part}]`;
    return out ? `${out}.${String(part)}` : String(part);
  }, "");
}

/** Text or already-parsed JSON into a value, or a refusal. */
export function parseJsonInput(
  input: unknown,
): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  if (typeof input !== "string") return { ok: true, value: input };
  if (input.length > MAX_TEXT_BYTES) {
    return { ok: false, errors: ["That file is too large to be a backup."] };
  }
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch {
    return { ok: false, errors: ["That file is not valid JSON, so it can’t be a backup."] };
  }
}

/** The first few reasons a file was refused, with where in the file each one is. */
export function refusalFrom(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): {
  ok: false;
  errors: string[];
} {
  const shown = issues.slice(0, 8).map((issue) => `${describePath(issue.path)}: ${issue.message}`);
  const more = issues.length - shown.length;
  return { ok: false, errors: more > 0 ? [...shown, `…and ${more} more problems.`] : shown };
}
