import type { ClipMeta } from "@/domain/types";

/**
 * How long "Undo" is offered after a set is deleted. A deleted set's clip is kept at least this long (plus
 * `CLIP_PURGE_GRACE_MS`), so Undo always finds it (plan I-34).
 */
export const UNDO_WINDOW_MS = 10_000;
export const CLIP_PURGE_GRACE_MS = 1_000;

/** The clips attached to any of these sets. */
export function clipIdsForSets(clips: readonly ClipMeta[], setIds: readonly string[]): string[] {
  const wanted = new Set(setIds);
  return clips.filter((clip) => wanted.has(clip.setId)).map((clip) => clip.id);
}

/** The clip metadata left after removing these clips. */
export function withoutClips(clips: readonly ClipMeta[], clipIds: readonly string[]): ClipMeta[] {
  const gone = new Set(clipIds);
  return clips.filter((clip) => !gone.has(clip.id));
}
