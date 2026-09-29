import { beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION, type LockdBackup } from "@/domain/types";
import oldBackup from "@/test/fixtures/backup/lockd-backup-v3-before-type-union.json";
import { useGym } from "@/lib/gym/store";
import { applyBackup, restoreMessage, type RestoreDeps } from "./apply";
import { parseBackup } from "./schema";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const base = () => clone(oldBackup) as unknown as LockdBackup;

const fail = (input: unknown) => {
  const result = parseBackup(input);
  if (result.ok) throw new Error("expected the backup to be refused");
  return result.errors;
};

describe("parseBackup accepts what Lock’d itself writes", () => {
  it("takes a backup written before the newer optional fields existed, unchanged", () => {
    const result = parseBackup(JSON.stringify(oldBackup));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.workouts).toEqual(base().workouts);
    expect(result.backup.workoutSets).toEqual(base().workoutSets);
    expect(result.backup.workouts[0]!.tzOffsetMinutes).toBe(300); // the sign is never touched
    expect(result.summary).toMatchObject({ sessions: 1, sets: 1 });
    // Collections the old file lacked come back empty, not missing.
    expect(result.backup.programs).toEqual([]);
    expect(result.backup.clips).toEqual([]);
  });

  it("round-trips a real export of the whole sample log (137 sessions)", () => {
    const store = useGym.getState();
    store.resetAll();
    store.completeOnboarding({ loadDemo: true, unitSystem: "metric" });
    const exported = useGym.getState().exportBackup();
    expect(exported.workouts.length).toBeGreaterThan(100);

    const result = parseBackup(JSON.stringify(exported));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.workouts).toEqual(exported.workouts);
    expect(result.backup.workoutSets).toEqual(exported.workoutSets);
    expect(result.backup.exercises).toEqual(exported.exercises);
    expect(result.backup.settings).toEqual(exported.settings);
    expect(result.backup.programs).toEqual(exported.programs);
    expect(result.backup.eraNames).toEqual(exported.eraNames);
  });

  it("drops keys it does not know instead of carrying them into the log", () => {
    const file = base() as unknown as Record<string, unknown>;
    file.surprise = { evil: true };
    (file.workouts as Array<Record<string, unknown>>)[0]!.extra = "x";
    const result = parseBackup(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup).not.toHaveProperty("surprise");
    expect(result.backup.workouts[0]).not.toHaveProperty("extra");
  });

  it("is not tricked by prototype-pollution keys", () => {
    const text = JSON.stringify(oldBackup).replace(
      '"format":',
      '"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"format":',
    );
    const result = parseBackup(text);
    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (result.ok) expect(result.backup).not.toHaveProperty("polluted");
  });

  it("warns, without refusing, when a session uses an exercise the list does not have", () => {
    const result = parseBackup(base());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The fixture's exercise list is empty and its session uses Bench Press.
    expect(result.warnings.join(" ")).toMatch(/1 exercises used in sessions/);
  });
});

describe("parseBackup refuses what it cannot trust", () => {
  it("says what is wrong with a file that is not a backup", () => {
    expect(fail("not json {")[0]).toMatch(/not valid JSON/);
    expect(fail("[1,2]")[0]).toMatch(/not a Lock’d backup/);
    expect(fail('{"format":"other"}')[0]).toMatch(/not a Lock’d backup/);
    expect(fail(null)[0]).toMatch(/not a Lock’d backup/);
  });

  it("refuses a backup from a newer version of the app, and says so", () => {
    const file = { ...base(), version: BACKUP_VERSION + 1 };
    expect(fail(file)[0]).toMatch(/newer version of Lock’d/);
  });

  it("refuses wrong types and out-of-range values, and points at where", () => {
    const file = base();
    (file.workoutSets[0] as unknown as Record<string, unknown>).reps = "five";
    (file.workoutSets[0] as unknown as Record<string, unknown>).weightG = -5;
    const errors = fail(file);
    expect(errors.some((e) => e.startsWith("workoutSets[0].reps"))).toBe(true);
    expect(errors.some((e) => e.startsWith("workoutSets[0].weightG"))).toBe(true);
  });

  it.each([
    ["a fractional gram", { weightG: 100_000.5 }],
    ["NaN as text becomes a string, not a number", { weightG: "NaN" }],
    ["a load past 1,000 tonnes", { weightG: 2_000_000_000 }],
    ["a negative rep count", { reps: -1 }],
    ["an unknown set type", { setType: "superset" }],
    ["a set with no completed flag", { isCompleted: undefined }],
  ])("refuses %s", (_label, patch) => {
    const file = base();
    Object.assign(file.workoutSets[0]!, patch);
    expect(parseBackup(file).ok).toBe(false);
  });

  it("refuses infinite numbers (JSON.parse cannot make them, but a caller could)", () => {
    const file = base();
    (file.workoutSets[0] as unknown as Record<string, unknown>).weightG = Number.POSITIVE_INFINITY;
    expect(parseBackup(file).ok).toBe(false);
  });

  it("refuses over-long text and impossible dates", () => {
    const longName = base();
    longName.workouts[0]!.name = "x".repeat(201);
    expect(parseBackup(longName).ok).toBe(false);
    const badDate = base();
    badDate.workouts[0]!.localDate = "30/08/2026";
    expect(fail(badDate).some((e) => e.startsWith("workouts[0].localDate"))).toBe(true);
    const notADate = base();
    notADate.workouts[0]!.startedAt = "yesterday";
    expect(parseBackup(notADate).ok).toBe(false);
  });

  it("refuses a time-zone offset that is not whole minutes within a day", () => {
    const file = base();
    file.workouts[0]!.tzOffsetMinutes = 300.5;
    expect(parseBackup(file).ok).toBe(false);
    file.workouts[0]!.tzOffsetMinutes = 5000;
    expect(parseBackup(file).ok).toBe(false);
  });

  it("refuses rows that point at rows that are not in the file, and counts them", () => {
    const file = base();
    file.workoutSets.push({ ...file.workoutSets[0]!, id: "orphan-1", workoutId: "nope" });
    file.workoutSets.push({ ...file.workoutSets[0]!, id: "orphan-2", workoutExerciseId: "nope" });
    file.workoutExercises.push({
      ...file.workoutExercises[0]!,
      id: "orphan-block",
      workoutId: "nope",
    });
    const errors = fail(file);
    expect(errors.join(" ")).toMatch(
      /2 sets belong to a session or exercise that is not in the file/,
    );
    expect(errors.join(" ")).toMatch(
      /1 exercises in sessions belong to a session that is not in the file/,
    );
  });

  it("refuses duplicate ids", () => {
    const file = base();
    file.workoutSets.push({ ...file.workoutSets[0]! });
    expect(fail(file).join(" ")).toMatch(/1 sets share an id with another set/);
  });

  it("reports the first few problems and how many more there are", () => {
    const file = base();
    file.workoutSets = Array.from({ length: 30 }, (_, i) => ({
      ...file.workoutSets[0]!,
      id: `s${i}`,
      reps: -1,
    }));
    const errors = fail(file);
    expect(errors).toHaveLength(9);
    expect(errors.at(-1)).toMatch(/and \d+ more problems/);
  });

  it("refuses a backup with a missing required collection", () => {
    const file = base() as unknown as Record<string, unknown>;
    delete file.workouts;
    expect(fail(file).some((e) => e.startsWith("workouts"))).toBe(true);
  });

  it("uses the same format constant the exporter writes", () => {
    expect(base().format).toBe(BACKUP_FORMAT);
  });
});

describe("applyBackup", () => {
  let deps: RestoreDeps;
  let calls: string[];
  let sessions: number;
  beforeEach(() => {
    calls = [];
    sessions = 3;
    deps = {
      current: () => {
        calls.push("current");
        return base();
      },
      safetyCopy: vi.fn(async () => {
        calls.push("safety");
      }),
      apply: vi.fn((_backup: LockdBackup, mode) => {
        calls.push(`apply:${mode}`);
        sessions = mode === "replace" ? 1 : sessions + 1;
      }),
      sessions: () => sessions,
    };
  });

  it("takes the safety copy before changing anything", async () => {
    const result = await applyBackup(base(), "merge", deps);
    expect(calls).toEqual(["current", "safety", "apply:merge"]);
    expect(result).toMatchObject({ ok: true, before: 3, after: 4, added: 1 });
  });

  it("changes nothing when the safety copy cannot be taken", async () => {
    deps.safetyCopy = vi.fn(async () => {
      throw new Error("quota");
    });
    const result = await applyBackup(base(), "replace", deps);
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/safety copy.*nothing was changed/),
    });
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it("reports an apply failure instead of throwing", async () => {
    deps.apply = vi.fn(() => {
      throw new Error("Not a Lock’d backup file.");
    });
    expect(await applyBackup(base(), "merge", deps)).toEqual({
      ok: false,
      error: "Not a Lock’d backup file.",
    });
  });

  it("says in words what a restore did", async () => {
    const merged = await applyBackup(base(), "merge", deps);
    if (merged.ok) expect(restoreMessage(merged)).toBe("Added 1 session from the backup.");
    sessions = 3;
    const same = { ...deps, apply: vi.fn(), sessions: () => 3 };
    const nothing = await applyBackup(base(), "merge", same);
    if (nothing.ok) expect(restoreMessage(nothing)).toMatch(/Nothing new/);
    const replaced = await applyBackup(base(), "replace", deps);
    if (replaced.ok)
      expect(restoreMessage(replaced)).toBe("Replaced your log with the backup: 1 session.");
  });
});
