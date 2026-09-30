import { enabledHealthTypes, healthReadSince, healthSourceForPlatform, LockdHealth, type HealthType } from "./health";
import { useGym, type HealthImportSummary } from "@/lib/gym/store";

/**
 * Reads health context now: for the types the lifter switched on, everything since the last reading of each
 * (or the last 365 days the first time), applied as one batch. Read-only, never during a set, and a failure
 * changes nothing. Resolves with what was added, or null on the web or when no type is on.
 */
export async function readHealthNow(now: Date = new Date()): Promise<HealthImportSummary | null> {
  const source = healthSourceForPlatform();
  if (!source) return null;
  const state = useGym.getState();
  const types = enabledHealthTypes(state.settings.health);
  if (types.length === 0) return null;
  const since: Partial<Record<HealthType, string>> = {};
  for (const type of types) {
    since[type] = healthReadSince(type, source, state.measurements, state.healthSamples, now);
  }
  const reading = await LockdHealth.read({ types, since });
  return useGym.getState().importHealthReading(reading, source);
}

/** Asks the phone for read access to one type. True only when the lifter allowed it. */
export async function requestHealthAccess(type: HealthType): Promise<boolean> {
  if (!healthSourceForPlatform()) return false;
  const { granted } = await LockdHealth.requestAccess({ types: [type] });
  return granted.includes(type);
}
