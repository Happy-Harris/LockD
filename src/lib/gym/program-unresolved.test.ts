import { beforeEach, describe, expect, it } from "vitest";
import { parseBackup } from "@/lib/backup/schema";
import { exportProgramFile, installPack, PROGRAM_PACKS, unresolvedProgramRows } from "./programs";
import { seedExercises } from "./seed";
import { useGym } from "./store";

/**
 * A program file that names an exercise this library does not have (a custom lift on the sender's phone, or a
 * name spelled differently). Plan I-33: it used to vanish without a word. This file pins what happens.
 */
const library = seedExercises("2026-09-28T12:00:00.000Z");

/** A shared program whose first exercise is one this library has never heard of. */
function fileWithUnknownExercise() {
  const file = exportProgramFile(
    installPack(PROGRAM_PACKS[0]!, "2026-09-28T12:00:00.000Z"),
    library,
  );
  const first = file.sessions[0]!.exercises[0]!;
  file.sessions[0]!.exercises[0] = {
    ...first,
    exerciseId: "custom-zercher-pin-squat",
    exerciseName: "Zercher Pin Squat",
  };
  return { file, session: file.sessions[0]!, unknownName: "Zercher Pin Squat" };
}

beforeEach(() => useGym.getState().resetAll());

function startedCount(programId: string) {
  const state = useGym.getState();
  const session = state.programSessions
    .filter((row) => row.programId === programId)
    .sort((a, b) => a.order - b.order)[0]!;
  const rows = state.programExercises.filter((row) => row.programSessionId === session.id);
  const workoutId = state.startFromProgramSession(programId, session.id);
  const started = useGym.getState().workoutExercises.filter((row) => row.workoutId === workoutId);
  return { rows, started, session };
}

describe("importing a program with an exercise the library does not have", () => {
  it("keeps the row, the name the file gave it, and flags it as unresolved", () => {
    const { file, unknownName } = fileWithUnknownExercise();
    const programId = useGym.getState().importProgram(file);
    const state = useGym.getState();
    const kept = state.programExercises.find(
      (row) => row.exerciseId === "custom-zercher-pin-squat",
    );
    expect(kept?.unresolvedName).toBe(unknownName);
    const rows = state.programExercises.filter((row) =>
      state.programSessions.some((s) => s.programId === programId && s.id === row.programSessionId),
    );
    expect(unresolvedProgramRows(rows, state.exercises).map((row) => row.name)).toEqual([
      unknownName,
    ]);
  });

  it("starting that session still skips it, and the skipped name is reported by the same helper", () => {
    const { file, unknownName } = fileWithUnknownExercise();
    const programId = useGym.getState().importProgram(file);
    const { rows, started } = startedCount(programId);
    expect(rows.length).toBeGreaterThan(1);
    expect(started).toHaveLength(rows.length - 1);
    expect(unresolvedProgramRows(rows, useGym.getState().exercises).map((row) => row.name)).toEqual(
      [unknownName],
    );
  });

  it("exports the name back out, not the file's private id", () => {
    const { file, unknownName } = fileWithUnknownExercise();
    const programId = useGym.getState().importProgram(file);
    const out = useGym.getState().exportProgram(programId)!;
    const names = out.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseName));
    expect(names).toContain(unknownName);
  });

  it("resolves by name once the exercise has been added to the library", () => {
    const { file, unknownName } = fileWithUnknownExercise();
    const programId = useGym.getState().importProgram(file);
    const { id, createdAt, updatedAt, isArchived, isCustom, ...shape } = library[0]!;
    void [id, createdAt, updatedAt, isArchived, isCustom];
    useGym.getState().addCustomExercise({ ...shape, name: unknownName });
    const { rows, started } = startedCount(programId);
    expect(started).toHaveLength(rows.length);
    expect(unresolvedProgramRows(rows, useGym.getState().exercises)).toEqual([]);
  });

  it("a row whose id is in the library is never flagged", () => {
    const programId = useGym.getState().installProgramPack(PROGRAM_PACKS[0]!.id);
    const state = useGym.getState();
    const rows = state.programExercises.filter((row) =>
      state.programSessions.some((s) => s.programId === programId && s.id === row.programSessionId),
    );
    expect(unresolvedProgramRows(rows, state.exercises)).toEqual([]);
    expect(rows.every((row) => row.unresolvedName === undefined)).toBe(true);
  });
});

describe("the unresolved name survives a backup", () => {
  it("exports, validates and restores unresolvedName", () => {
    const { file, unknownName } = fileWithUnknownExercise();
    useGym.getState().importProgram(file);
    const backup = JSON.parse(JSON.stringify(useGym.getState().exportBackup()));
    const parsed = parseBackup(backup);
    expect(parsed.ok).toBe(true);
    useGym.getState().resetAll();
    useGym.getState().importBackup(backup, "replace");
    const kept = useGym
      .getState()
      .programExercises.find((row) => row.exerciseId === "custom-zercher-pin-squat");
    expect(kept?.unresolvedName).toBe(unknownName);
  });
});
