import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStrongImport, exportSetsCsv, parseCsv } from "./csv";
import { applyProgramLoad, exportProgramFile, importProgramFile, installPack, PROGRAM_PACKS } from "./programs";
import { seedExercises } from "./seed";
import { useGym } from "./store";

const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock("@/domain/ids", () => ({ uuid: () => `fixture-${++ids.next}` }));

const clock = new Date(2026, 8, 28, 12);
const library = seedExercises(clock.toISOString());
beforeEach(() => {
  ids.next = 0;
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  useGym.getState().resetAll();
  useGym.getState().completeOnboarding({ loadDemo: false, unitSystem: "metric" });
});
afterEach(() => vi.useRealTimers());

const csv = [
  'Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps,Set Type',
  '2026-02-03,Test,"Bench Press",1,100,5,Normal',
  '2026-02-03,Test,"Bench Press",2,105,3,Failure',
].join("\n");
const euro = [
  'Date;Workout Name;Exercise Name;Set Order;Gewicht (kg);Reps;Set Type',
  '03.02.2026;Euro;Kniebeuge;1;110,0;5;Normal',
  '03.02.2026;Euro;Kniebeuge;2;110,0;3;Normal',
].join("\n");

describe("workflow characterisation — present behaviour, including import defects", () => {
  it("pins CSV parser, Strong import and exported set columns", () => {
    const parsed = buildStrongImport(csv, library, "kg");
    expect({
      preview: parsed.preview,
      workout: parsed.workouts.map((w) => ({ name: w.name, date: w.localDate })),
      sets: parsed.workoutSets.map((s) => ({ type: s.setType, weight: s.weightG, reps: s.reps })),
      export: exportSetsCsv({ workouts: parsed.workouts, exercises: parsed.workoutExercises,
        sets: parsed.workoutSets, unit: "kg", formatWeight: (grams) => String(grams / 1000) }),
    }).toMatchSnapshot();
    expect(parseCsv('"a,b","c""d"\n')).toEqual([["a,b", 'c"d']]);
  });

  it("BUG: current European Strong CSV parsing corrupts weights, repetitions and dates", () => {
    const parsed = buildStrongImport(euro, library, "kg");
    expect({ preview: parsed.preview, dates: parsed.workouts.map((w) => w.localDate),
      sets: parsed.workoutSets.map((s) => ({ weightG: s.weightG, reps: s.reps })) }).toMatchSnapshot();
    expect(parsed.workoutSets.some((set) => set.weightG === undefined)).toBe(true);
  });

  it("pins program install, JSON export/import, load suggestions and pointer", () => {
    const installed = installPack(PROGRAM_PACKS[0]!, clock.toISOString());
    const file = exportProgramFile(installed, library);
    const imported = importProgramFile(file, clock.toISOString(), library);
    expect({
      identity: { format: file.format, version: file.version },
      counts: [installed.weeks.length, installed.sessions.length, installed.exercises.length],
      roundTrip: [imported.weeks.length, imported.sessions.length, imported.exercises.length],
      normal: applyProgramLoad({ rule: { kind: "linear", incrementG: 2500 }, weekNumber: 3,
        isDeload: false, previousWeightG: 100_000, previousReps: 6, baseSets: 4 }),
      suggestion: applyProgramLoad({ rule: { kind: "linear", incrementG: 2500 }, weekNumber: 3,
        isDeload: false, previousWeightG: 100_000, baseSets: 4,
        suggestion: { suggestedWeightG: 101_000, suggestedReps: 8 } as never }),
      deload: applyProgramLoad({ rule: { kind: "linear", incrementG: 2500 }, weekNumber: 8,
        isDeload: true, previousWeightG: 101_500, baseSets: 4 }),
    }).toMatchSnapshot();
  });

  it("pins template start, set completion, finish, discard and backup merge", () => {
    const gym = useGym.getState();
    const programId = gym.installProgramPack(PROGRAM_PACKS[0]!.id)!;
    const programWorkoutId = useGym.getState().startFromProgramSession(programId);
    const programSets = useGym.getState().workoutSets.filter((s) => s.workoutId === programWorkoutId);
    expect(programSets.length).toBeGreaterThan(0);
    const programSnapshot = programSets.slice(0, 6).map((s) => ({ setType: s.setType, weight: s.weightG, reps: s.reps }));
    const programPrs = useGym.getState().finishWorkout(programWorkoutId);
    expect(useGym.getState().programs.find((p) => p.id === programId)?.currentSessionOrder).toBe(1);

    const templateId = useGym.getState().templates[0]!.id;
    const templateWorkoutId = useGym.getState().startFromTemplate(templateId);
    const first = useGym.getState().workoutSets.find((s) => s.workoutId === templateWorkoutId)!;
    useGym.getState().updateSet(first.id, { weightG: 100_000, reps: 6 });
    const firstPrs = useGym.getState().completeSet(first.id);
    const completed = useGym.getState().workoutSets.find((s) => s.id === first.id)!;
    const finishPrs = useGym.getState().finishWorkout(templateWorkoutId, "Fixture session");
    const backup = useGym.getState().exportBackup();
    const before = useGym.getState().workouts.length;
    useGym.getState().importBackup(backup, "merge");
    const afterMerge = useGym.getState().workouts.length;
    const discardId = useGym.getState().startEmptyWorkout("Discard fixture");
    useGym.getState().discardWorkout(discardId);
    expect(useGym.getState().workouts.some((w) => w.id === discardId)).toBe(false);
    useGym.getState().resetAll();
    useGym.getState().importBackup(backup, "replace");
    expect({ programSnapshot, programPrs: programPrs.length, completed: {
      type: completed.setType, weight: completed.weightG, reps: completed.reps,
      at: completed.completedAt }, firstPrs: firstPrs.length, finishPrs: finishPrs.length,
      backupFormat: backup.format, counts: [before, afterMerge, useGym.getState().workouts.length],
    }).toMatchSnapshot();
  });
});
