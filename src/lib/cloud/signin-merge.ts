import type { CloudGym } from "./types";

/**
 * What to do with this device's log and the cloud vault when someone signs in.
 *
 * The rule is: never lose either side. Only take the cloud copy outright when this device
 * has nothing of its own; only push this device outright when the cloud vault has nothing;
 * otherwise merge. Any change to the local log is preceded by a safety backup.
 *
 * "Something of its own" means sessions (completed or in progress), programs, measurements,
 * custom exercises or routines. Settings and onboarding alone don't count, which is why an
 * onboarded-but-empty cloud vault can no longer overwrite a device full of sessions.
 */
export type SignInPlan = "nothing" | "push-local" | "use-remote" | "merge";

export interface MergeSummary {
  /** Sessions (completed or in progress) this device added to the cloud copy. */
  sessionsFromThisDevice: number;
}

const COLLECTIONS = [
  "exercises", "templates", "templateExercises", "workouts", "workoutExercises", "workoutSets",
  "measurements", "plates", "bars", "programs", "programWeeks", "programSessions",
  "programExercises", "eraNames", "machineSetups", "lessons", "namedPrs", "clips",
] as const;

/** Vaults written by older builds may lack newer collections; treat a missing one as empty. */
export function normalizeCloudGym(payload: Partial<CloudGym> & Pick<CloudGym, "settings">): CloudGym {
  const out = { ...payload, labLast: payload.labLast ?? null } as CloudGym;
  for (const key of COLLECTIONS) (out as Record<string, unknown>)[key] = payload[key] ?? [];
  return out;
}

function sessions(gym: CloudGym): number {
  return gym.workouts.filter((row) => row.status === "completed" || row.status === "active").length;
}

function hasSessions(gym: CloudGym): boolean {
  return sessions(gym) > 0;
}

function hasOwnContent(gym: CloudGym, opts: { countRoutines: boolean }): boolean {
  return (
    hasSessions(gym) ||
    gym.programs.length > 0 ||
    gym.measurements.length > 0 ||
    gym.exercises.some((row) => row.isCustom) ||
    (opts.countRoutines && gym.templates.length > 0)
  );
}

export function planSignInSync(local: CloudGym, remote: CloudGym | null): SignInPlan {
  const localOnboarded = Boolean(local.settings.onboardingCompletedAt);
  // Routines count on the cloud side (they were made there); on this device a fresh install
  // carries starter routines, which must not force a merge that duplicates them.
  const remoteContent = remote ? hasOwnContent(remote, { countRoutines: true }) : false;
  const localContent = hasOwnContent(local, { countRoutines: false });

  if (!remoteContent) return localContent || localOnboarded ? "push-local" : "nothing";
  if (!localContent) return "use-remote";
  return "merge";
}

function unionBy<T>(remote: T[], local: T[], key: (row: T) => string): { rows: T[]; added: T[] } {
  const seen = new Set(remote.map(key));
  const added = local.filter((row) => !seen.has(key(row)));
  return { rows: [...remote, ...added], added };
}

/** Union of both logs. The cloud row wins when both sides have the same id; nothing is dropped. */
export function mergeCloudGym(local: CloudGym, remote: CloudGym): { merged: CloudGym; summary: MergeSummary } {
  const byId = <T extends { id: string }>(r: T[], l: T[]) => unionBy(r, l, (row) => row.id).rows;
  const workouts = unionBy(remote.workouts, local.workouts, (row) => row.id);
  const merged: CloudGym = {
    exercises: byId(remote.exercises, local.exercises),
    templates: byId(remote.templates, local.templates),
    templateExercises: byId(remote.templateExercises, local.templateExercises),
    workouts: workouts.rows,
    workoutExercises: byId(remote.workoutExercises, local.workoutExercises),
    workoutSets: byId(remote.workoutSets, local.workoutSets),
    measurements: byId(remote.measurements, local.measurements),
    plates: byId(remote.plates, local.plates),
    bars: byId(remote.bars, local.bars),
    settings: {
      ...local.settings,
      ...remote.settings,
      onboardingCompletedAt: remote.settings.onboardingCompletedAt ?? local.settings.onboardingCompletedAt,
    },
    labLast: remote.labLast ?? local.labLast,
    programs: byId(remote.programs, local.programs),
    programWeeks: byId(remote.programWeeks, local.programWeeks),
    programSessions: byId(remote.programSessions, local.programSessions),
    programExercises: byId(remote.programExercises, local.programExercises),
    eraNames: unionBy(remote.eraNames, local.eraNames, (row) => row.startDate).rows,
    machineSetups: unionBy(remote.machineSetups, local.machineSetups, (row) => row.exerciseId).rows,
    lessons: byId(remote.lessons, local.lessons),
    namedPrs: byId(remote.namedPrs, local.namedPrs),
    clips: byId(remote.clips, local.clips),
  };
  const sessionsFromThisDevice = workouts.added.filter(
    (row) => row.status === "completed" || row.status === "active",
  ).length;
  return { merged, summary: { sessionsFromThisDevice } };
}

/**
 * Orchestrates sign-in: safety backup first (a failed backup aborts before anything changes),
 * then replace or merge, then push the result so the cloud copy matches this device.
 */
export async function applyRemoteVault(opts: {
  local: CloudGym;
  remote: CloudGym | null;
  takeBackup: (local: CloudGym) => Promise<void>;
  apply: (gym: CloudGym) => void;
  push: (gym: CloudGym) => Promise<void>;
}): Promise<{ plan: SignInPlan; summary?: MergeSummary }> {
  const plan = planSignInSync(opts.local, opts.remote);
  if (plan === "nothing") return { plan };
  if (plan === "push-local") {
    await opts.push(opts.local);
    return { plan };
  }
  await opts.takeBackup(opts.local);
  if (plan === "use-remote") {
    opts.apply(opts.remote!);
    return { plan };
  }
  const { merged, summary } = mergeCloudGym(opts.local, opts.remote!);
  opts.apply(merged);
  await opts.push(merged);
  return { plan, summary };
}
