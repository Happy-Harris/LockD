import type { Exercise } from "@/domain/types";
import type { ImportAnalysis, ParsedWorkout } from "./engine";
import { exerciseMatcher, exerciseNameKey } from "./engine";
import { findExerciseCandidates, type ExerciseCandidate } from "./batch";

/**
 * The pure parts of the import wizard: what each step shows, worked out from the analysis and the
 * log as it is now. Nothing here writes anything; the wizard applies a batch only on the last step.
 */

export interface SessionRow {
  key: string;
  workout: ParsedWorkout;
  /** A session with these exact contents is already in the log. */
  alreadyHere: boolean;
}

/** Every session in the file, in date order, marked when it is already in the log. */
export function sessionRows(
  analysis: ImportAnalysis,
  existingFingerprints: ReadonlySet<string>,
): SessionRow[] {
  return analysis.workouts.map((workout) => ({
    key: workout.key,
    workout,
    alreadyHere: existingFingerprints.has(workout.fingerprint),
  }));
}

/** The keys a person starts with: every session that is not already here. */
export function defaultSelection(rows: readonly SessionRow[]): Set<string> {
  return new Set(rows.filter((row) => !row.alreadyHere).map((row) => row.key));
}

/**
 * The exercise names the chosen sessions (and routines) use, once each, in the order they first
 * appear, exactly as the file wrote them.
 */
export function exerciseNames(analysis: ImportAnalysis, selected: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    const key = exerciseNameKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  for (const workout of analysis.workouts) {
    if (!selected.has(workout.key)) continue;
    for (const exercise of workout.exercises) add(exercise.name);
  }
  for (const template of analysis.templates ?? []) {
    if (!selected.has(template.key)) continue;
    for (const exercise of template.exercises) add(exercise.name);
  }
  return out;
}

export interface ResolveStep {
  /** Names that exactly match an exercise already here. Merged without asking. */
  matched: string[];
  /** Names that are close to one already here. A person decides each. */
  candidates: ExerciseCandidate[];
  /** Names with no match at all. They become new exercises. */
  fresh: string[];
}

/** What the Resolve step shows: which names match, which might, and which are new. */
export function resolveStep(names: readonly string[], existing: readonly Exercise[]): ResolveStep {
  const matchExisting = exerciseMatcher(existing);
  const matched = names.filter((name) => matchExisting(name));
  const unmatched = names.filter((name) => !matchExisting(name));
  const candidates = findExerciseCandidates(unmatched, existing);
  const suggested = new Set(candidates.map((candidate) => exerciseNameKey(candidate.name)));
  const fresh = unmatched.filter((name) => !suggested.has(exerciseNameKey(name)));
  return { matched, candidates, fresh };
}

/** The confirmed "same exercise" choices as the batch wants them, keyed by normalised name. */
export function nameOverridesFrom(confirmed: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, exerciseId] of confirmed) out.set(exerciseNameKey(name), exerciseId);
  return out;
}
