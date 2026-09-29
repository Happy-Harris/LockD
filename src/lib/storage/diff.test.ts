import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockdDatabase } from "./db";
import { DexieRepository } from "./dexie-repository";
import { MemoryRepository } from "./memory-repository";
import { migratePersisted, persistedSlice, PERSIST_KEY, type PersistedSlice } from "./persisted";
import { diffSlices, keyOf, ROW_COLLECTIONS, type LockdRepository } from "./repository";

const raw = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/persist", name), "utf8");
const slice = (name: string) =>
  migratePersisted((JSON.parse(raw(name)) as { state: unknown }).state, 3) as PersistedSlice;

function canonical(s: PersistedSlice): Record<string, unknown> & { workouts: unknown[] } {
  const out: Record<string, unknown> = {};
  for (const name of ROW_COLLECTIONS) {
    out[name] = [...(s[name] as readonly unknown[])].sort((a, b) =>
      keyOf(name, a).localeCompare(keyOf(name, b)),
    );
  }
  return {
    ...out,
    workouts: out.workouts as unknown[],
    settings: s.settings,
    restTimer: s.restTimer,
    labLast: s.labLast,
  };
}

describe("diffSlices compares by reference", () => {
  const base = slice("persist-v3-imperial-custom.json");

  it("returns null when nothing changed, even for a copied array of the same rows", () => {
    expect(diffSlices(base, base)).toBeNull();
    expect(diffSlices(base, { ...base, workoutSets: [...base.workoutSets] })).toBeNull();
  });

  it("writes only the edited row", () => {
    const edited = { ...base.workoutSets[2]!, reps: 42 };
    const next = { ...base, workoutSets: base.workoutSets.map((s, i) => (i === 2 ? edited : s)) };
    const diff = diffSlices(base, next)!;
    expect(diff.put).toEqual({ workoutSets: [edited] });
    expect(diff.remove).toBeUndefined();
    expect(diff.kv).toBeUndefined();
  });

  it("finds added rows, removed rows and changed documents", () => {
    const added = { ...base.workoutSets[0]!, id: "brand-new" };
    const removed = base.workoutSets[1]!;
    const settings = { ...base.settings, themeMode: "light" as const };
    const next = {
      ...base,
      settings,
      workoutSets: [...base.workoutSets.filter((s) => s.id !== removed.id), added],
    };
    const diff = diffSlices(base, next)!;
    expect(diff.put).toEqual({ workoutSets: [added] });
    expect(diff.remove).toEqual({ workoutSets: [removed.id] });
    expect(diff.kv).toEqual({ settings });
  });
});

/** The property the switch-over relies on: store changes, diffed and applied, reproduce the store. */
describe.each([
  ["MemoryRepository", () => new MemoryRepository()],
  ["DexieRepository", () => new DexieRepository(new LockdDatabase(`lockd-diff-${Math.random()}`))],
] as Array<[string, () => LockdRepository]>)(
  "applying the diffs of real store actions to %s reproduces the store",
  (_name, make) => {
    beforeEach(() => vi.resetModules());
    afterEach(() => vi.unstubAllGlobals());

    it("through a whole session: start, log sets, edit, delete, finish, and an import", async () => {
      const data = new Map([[PERSIST_KEY, raw("persist-v3-imperial-custom.json")]]);
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      });
      const { useGym } = await import("@/lib/gym/store");
      (await import("./backend")).setStorageMode("local"); // load the fixture through the old path
      await useGym.persist.rehydrate();

      const repo = make();
      let mirrored = persistedSlice(useGym.getState());
      await repo.replaceAll(mirrored);

      const step = async (label: string) => {
        const next = persistedSlice(useGym.getState());
        const diff = diffSlices(mirrored, next);
        expect(diff, `${label}: expected a change`).not.toBeNull();
        await repo.apply(diff!);
        mirrored = next;
        expect(canonical(await repo.load()), label).toEqual(canonical(next));
      };

      const g = () => useGym.getState();
      const templateId = g().templates[0]?.id;
      const workoutId = templateId
        ? g().startFromTemplate(templateId)
        : g().startEmptyWorkout("Diff");
      await step("start a workout");
      const sets = g().workoutSets.filter((s) => s.workoutId === workoutId);
      g().updateSet(sets[0]!.id, { weightG: 100_000, reps: 5 });
      await step("edit a set");
      g().completeSet(sets[0]!.id);
      await step("complete a set (also starts the rest timer)");
      g().deleteSet(sets[1]!.id);
      await step("delete a set");
      g().addSet(g().workoutExercises.find((e) => e.workoutId === workoutId)!.id);
      await step("add a set");
      g().finishWorkout(workoutId, "done");
      await step("finish the workout (stops the timer)");
      g().updateSettings({ themeMode: "light" });
      await step("change a setting");
      g().importStrongCsv(
        'Date,Workout Name,Exercise Name,Set Order,Weight (lb),Reps,Set Type\n2026-03-01,Import,"Bench Press",1,200,5,Normal',
      );
      await step("import a workout");
    });
  },
);
