import { beforeEach, describe, expect, it } from "vitest";
import { exportProgramFile, installPack, PROGRAM_PACKS } from "./programs";
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

describe("importing a program with an exercise the library does not have (current behaviour)", () => {
  it("keeps the row, but only the file's id; the name it was called is not stored anywhere", () => {
    const { file } = fileWithUnknownExercise();
    const programId = useGym.getState().importProgram(file);
    const rows = useGym.getState().programExercises;
    const kept = rows.find((row) => row.exerciseId === "custom-zercher-pin-squat");
    expect(kept).toBeDefined();
    expect(JSON.stringify(useGym.getState().programExercises)).not.toContain("Zercher Pin Squat");
    expect(useGym.getState().programs.some((program) => program.id === programId)).toBe(true);
  });

  it("starting that session silently leaves the exercise out", () => {
    const { file } = fileWithUnknownExercise();
    const programId = useGym.getState().importProgram(file);
    const session = useGym
      .getState()
      .programSessions.filter((row) => row.programId === programId)
      .sort((a, b) => a.order - b.order)[0]!;
    const rows = useGym
      .getState()
      .programExercises.filter((row) => row.programSessionId === session.id);
    const workoutId = useGym.getState().startFromProgramSession(programId, session.id);
    const started = useGym.getState().workoutExercises.filter((row) => row.workoutId === workoutId);
    expect(rows.length).toBeGreaterThan(1);
    expect(started).toHaveLength(rows.length - 1);
  });
});
