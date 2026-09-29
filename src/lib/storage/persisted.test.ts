import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/gym/settings";
import { migratePersisted, PERSIST_KEY, PERSIST_VERSION, persistedSlice } from "./persisted";

const dir = path.resolve(__dirname, "../../test/fixtures/persist");
const read = (name: string) => fs.readFileSync(path.join(dir, name), "utf8");
const payload = (name: string) =>
  JSON.parse(read(name)) as { state: Record<string, unknown>; version: number };

const COLLECTIONS = [
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
const PERSISTED_KEYS = [...COLLECTIONS, "settings", "restTimer", "labLast"].sort();
const V3 = [
  "persist-v3-demo.json",
  "persist-v3-active-workout.json",
  "persist-v3-imperial-custom.json",
];

describe("the on-disk identifiers are live and do not change", () => {
  it("keeps the key, the version and the field list", () => {
    expect(PERSIST_KEY).toBe("lockd-v1");
    expect(PERSIST_VERSION).toBe(3);
    const slice = persistedSlice(payload("persist-v3-imperial-custom.json").state as never);
    expect(Object.keys(slice).sort()).toEqual(PERSISTED_KEYS);
  });
});

describe("migratePersisted", () => {
  it.each(V3)("leaves a current-version payload exactly as it is: %s", (name) => {
    const { state, version } = payload(name);
    expect(migratePersisted(state, version)).toEqual(state);
  });

  it("does not mutate what it is given", () => {
    const fixture = payload("persist-v1.json");
    const before = JSON.stringify(fixture.state);
    migratePersisted(fixture.state, fixture.version);
    expect(JSON.stringify(fixture.state)).toBe(before);
  });

  it.each(["persist-v2.json", "persist-v1.json"])(
    "backfills what an older payload lacks and keeps its rows: %s",
    (name) => {
      const { state, version } = payload(name);
      const migrated = migratePersisted(state, version) as unknown as Record<string, unknown>;
      const original = payload("persist-v3-imperial-custom.json").state;
      for (const key of [
        "programs",
        "programWeeks",
        "programSessions",
        "programExercises",
        "eraNames",
        "machineSetups",
        "lessons",
        "namedPrs",
        "clips",
      ]) {
        expect(Array.isArray(migrated[key]), key).toBe(true);
      }
      // Every row the old payload had is still there, untouched.
      for (const key of [
        "exercises",
        "templates",
        "workouts",
        "workoutExercises",
        "workoutSets",
        "measurements",
      ]) {
        expect(migrated[key], key).toEqual(original[key]);
      }
      // Every current setting exists, and the ones the old payload had keep their values.
      const settings = migrated.settings as Record<string, unknown>;
      for (const key of Object.keys(defaultSettings())) expect(settings, key).toHaveProperty(key);
      const oldSettings = (state.settings ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(oldSettings))
        expect(settings[key], key).toEqual(value);
    },
  );

  it("fills a well-formed but empty state with defaults for the collections it backfills", () => {
    const { state, version } = payload("persist-empty-state.json");
    const migrated = migratePersisted(state, version) as unknown as Record<string, unknown>;
    expect(migrated.programs).toEqual([]);
    expect(migrated.clips).toEqual([]);
    expect(migrated.settings).toEqual(defaultSettings());
  });

  it("does NOT backfill the core collections; the store's merge supplies them today", () => {
    // Characterisation, pinned so the Dexie migration does not assume otherwise: zustand merges the
    // migrated slice over the store's fresh data, which is why a missing `exercises` is harmless
    // now. The migration runner (plan PR 5) must merge over fresh data the same way.
    const migrated = migratePersisted({}, 3) as unknown as Record<string, unknown>;
    expect(migrated.exercises).toBeUndefined();
    expect(migrated.workouts).toBeUndefined();
  });

  it("the corrupt fixture is not valid JSON, so nothing can migrate it", () => {
    expect(() => JSON.parse(read("persist-corrupt.txt"))).toThrow();
  });
});

/** A minimal in-memory `localStorage`, so the real store can read and write it under Node. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

async function freshStore(storage: ReturnType<typeof fakeStorage>) {
  vi.resetModules();
  vi.stubGlobal("localStorage", storage);
  return (await import("@/lib/gym/store")).useGym;
}

describe("the real store still reads and writes the same format", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it.each(V3)("loads %s and writes it back unchanged", async (name) => {
    const raw = read(name);
    const storage = fakeStorage({ [PERSIST_KEY]: raw });
    const useGym = await freshStore(storage);
    await useGym.persist.rehydrate();
    const state = useGym.getState();
    expect(state.hydrated).toBe(true);

    const fixture = JSON.parse(raw) as { state: Record<string, unknown> };
    for (const key of COLLECTIONS)
      expect(state[key as keyof typeof state], key).toEqual(fixture.state[key]);
    expect(state.settings).toEqual(fixture.state.settings);
    expect(state.restTimer).toEqual(fixture.state.restTimer);

    useGym.setState({}); // any change makes persist write
    const written = JSON.parse(storage.data.get(PERSIST_KEY)!);
    expect(written.version).toBe(PERSIST_VERSION);
    expect(written.state).toEqual(fixture.state);
  });

  it("resumes the active workout with the same rest-timer end", async () => {
    const raw = read("persist-v3-active-workout.json");
    const useGym = await freshStore(fakeStorage({ [PERSIST_KEY]: raw }));
    await useGym.persist.rehydrate();
    const fixture = JSON.parse(raw) as {
      state: { restTimer: { endsAt: string; isRunning: boolean } };
    };
    const state = useGym.getState();
    expect(state.restTimer?.endsAt).toBe(fixture.state.restTimer.endsAt);
    expect(state.restTimer?.isRunning).toBe(true);
    const active = state.workouts.filter((workout) => workout.status === "active");
    expect(active).toHaveLength(1);
    expect(state.resumeActiveWorkoutId()).toBe(active[0]!.id);
    const sets = state.workoutSets.filter((set) => set.workoutId === active[0]!.id);
    expect(sets.filter((set) => set.isCompleted)).toHaveLength(sets.length / 2);
  });

  it.each(["persist-v2.json", "persist-v1.json"])(
    "upgrades %s on load and writes the current version",
    async (name) => {
      const storage = fakeStorage({ [PERSIST_KEY]: read(name) });
      const useGym = await freshStore(storage);
      await useGym.persist.rehydrate();
      const state = useGym.getState();
      expect(state.workouts).toHaveLength(2);
      expect(Array.isArray(state.programs)).toBe(true);
      expect(state.settings.goalLiftIds.length).toBeGreaterThan(0);
      useGym.setState({});
      const written = JSON.parse(storage.data.get(PERSIST_KEY)!);
      expect(written.version).toBe(PERSIST_VERSION);
      expect(Object.keys(written.state).sort()).toEqual(PERSISTED_KEYS);
    },
  );

  it("BUG: a corrupt payload is not loaded, and the next write replaces it", async () => {
    // Characterisation of today's behaviour (plan PR 5 fixes it): parsing fails, persist swallows
    // the error, `hydrated` never turns true on its own, and the store carries on with fresh
    // defaults. The raw string survives only until the first change is written, so a guest who
    // taps "Start empty" destroys a payload that could have been recovered.
    const raw = read("persist-corrupt.txt");
    const storage = fakeStorage({ [PERSIST_KEY]: raw });
    const useGym = await freshStore(storage);
    await useGym.persist.rehydrate();
    const state = useGym.getState();
    expect(state.hydrated).toBe(false);
    expect(state.workouts).toEqual([]);
    expect(storage.data.get(PERSIST_KEY)).toBe(raw);
    useGym.setState({});
    expect(storage.data.get(PERSIST_KEY)).not.toBe(raw); // BUG: the only copy is gone.
  });
});
